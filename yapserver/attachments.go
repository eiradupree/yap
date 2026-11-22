package main

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"io"
	"mime"
	"net/http"
	"net/url"
	"path"
	"strconv"
	"strings"
	"time"
	"unicode"
	"unicode/utf8"
)

const (
	maxUploadBytes        = 10 << 20 // per file
	maxAttachments        = 10       // per message
	maxFileName           = 200      // characters
	pendingUploadLifetime = 24 * time.Hour
	// uploadHeader must be set on uploads. Cross-site forms can't set headers,
	// so like the JSON requirement elsewhere it forces a CORS preflight.
	uploadHeader = "X-Yap-Upload"
)

// inlineTypes are the only file types served for display in the page. They
// are decided by sniffing the bytes, never by the name or what the client says.
var inlineTypes = map[string]bool{
	"image/png":  true,
	"image/jpeg": true,
	"image/gif":  true,
	"image/webp": true,
}

// Attachment is a file uploaded to a message. Its data is fetched separately
// from URL.
type Attachment struct {
	ID          int64  `json:"id"`
	Name        string `json:"name"`
	ContentType string `json:"content_type"`
	Size        int64  `json:"size"`
	URL         string `json:"url"`
}

func (a *Attachment) setURL() {
	a.URL = fmt.Sprintf("/api/files/%d/%s", a.ID, url.PathEscape(a.Name))
}

// CreateUpload stores a file that isn't attached to a message yet. It becomes
// visible to others once PostMessage attaches it.
func (s *Store) CreateUpload(ctx context.Context, userID int64, name, contentType string, data []byte) (Attachment, error) {
	a := Attachment{Name: name, ContentType: contentType, Size: int64(len(data))}
	res, err := s.db.ExecContext(ctx, `
		INSERT INTO attachments (uploader_id, name, content_type, size, data, created_at)
		VALUES (?, ?, ?, ?, ?, ?)`, userID, name, contentType, a.Size, data, now())
	if err != nil {
		return Attachment{}, err
	}
	a.ID, _ = res.LastInsertId()
	a.setURL()
	return a, nil
}

// File returns an attachment's data if the user can see it: they uploaded it,
// or it's on a message in a channel they're in.
func (s *Store) File(ctx context.Context, userID, id int64) (Attachment, []byte, error) {
	var a Attachment
	var data []byte
	var uploader int64
	var channelID sql.NullInt64
	err := s.db.QueryRowContext(ctx, `
		SELECT a.id, a.name, a.content_type, a.size, a.data, a.uploader_id, m.channel_id
		FROM attachments a LEFT JOIN messages m ON m.id = a.message_id WHERE a.id = ?`, id).
		Scan(&a.ID, &a.Name, &a.ContentType, &a.Size, &data, &uploader, &channelID)
	if errors.Is(err, sql.ErrNoRows) {
		return Attachment{}, nil, errNotFound
	} else if err != nil {
		return Attachment{}, nil, err
	}
	if !channelID.Valid {
		if uploader != userID {
			return Attachment{}, nil, errNotFound
		}
	} else if err := s.requireMember(ctx, userID, channelID.Int64); err != nil {
		// Don't reveal that a file exists in a channel the user isn't in.
		return Attachment{}, nil, errNotFound
	}
	a.setURL()
	return a, data, nil
}

// DeleteUpload removes a file the user uploaded but hasn't sent.
func (s *Store) DeleteUpload(ctx context.Context, userID, id int64) error {
	res, err := s.db.ExecContext(ctx,
		`DELETE FROM attachments WHERE id = ? AND uploader_id = ? AND message_id IS NULL`, id, userID)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return errNotFound
	}
	return nil
}

// DeleteAbandonedUploads removes files that were uploaded but never sent.
func (s *Store) DeleteAbandonedUploads(ctx context.Context) error {
	_, err := s.db.ExecContext(ctx,
		`DELETE FROM attachments WHERE message_id IS NULL AND created_at < ?`,
		time.Now().Add(-pendingUploadLifetime).UnixMilli())
	return err
}

// handleUpload takes the raw file as the request body, with its name in the
// "name" query parameter. The returned ID goes in a message's attachment_ids.
func (s *Server) handleUpload(w http.ResponseWriter, r *http.Request, u User) {
	if !s.uploadLimit.allow(strconv.FormatInt(u.ID, 10)) {
		writeError(w, http.StatusTooManyRequests, "you're uploading too quickly")
		return
	}
	data, err := io.ReadAll(r.Body)
	var tooBig *http.MaxBytesError
	if errors.As(err, &tooBig) {
		writeError(w, http.StatusRequestEntityTooLarge, "files can be up to 10 MB")
		return
	} else if err != nil {
		writeError(w, http.StatusBadRequest, "upload failed")
		return
	}
	if len(data) == 0 {
		writeError(w, http.StatusBadRequest, "that file is empty")
		return
	}
	name := cleanFileName(r.URL.Query().Get("name"))
	a, err := s.store.CreateUpload(r.Context(), u.ID, name, fileType(name, data), data)
	if err != nil {
		s.internal(w, "upload", err)
		return
	}
	writeJSON(w, http.StatusCreated, a)
}

func (s *Server) handleDeleteUpload(w http.ResponseWriter, r *http.Request, u User) {
	id, ok := pathIDOf(w, r, "upload")
	if !ok {
		return
	}
	if err := s.store.DeleteUpload(r.Context(), u.ID, id); errors.Is(err, errNotFound) {
		writeError(w, http.StatusNotFound, "upload not found")
		return
	} else if err != nil {
		s.internal(w, "delete upload", err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// handleFile serves an attachment. Images are shown inline; everything else
// is a download, so an uploaded HTML or SVG file can never run in the page.
func (s *Server) handleFile(w http.ResponseWriter, r *http.Request, u User) {
	id, ok := pathIDOf(w, r, "file")
	if !ok {
		return
	}
	a, data, err := s.store.File(r.Context(), u.ID, id)
	if errors.Is(err, errNotFound) {
		writeError(w, http.StatusNotFound, "file not found")
		return
	} else if err != nil {
		s.internal(w, "get file", err)
		return
	}
	h := w.Header()
	disposition := "attachment"
	if inlineTypes[a.ContentType] {
		h.Set("Content-Type", a.ContentType)
		disposition = "inline"
	} else {
		h.Set("Content-Type", "application/octet-stream")
	}
	h.Set("Content-Disposition", mime.FormatMediaType(disposition, map[string]string{"filename": a.Name}))
	h.Set("Content-Security-Policy", "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox")
	h.Set("Cache-Control", "private, max-age=31536000, immutable") // files never change
	h.Set("Content-Length", strconv.Itoa(len(data)))
	w.WriteHeader(http.StatusOK)
	if r.Method != http.MethodHead {
		w.Write(data)
	}
}

// fileType is the sniffed type for images and otherwise a guess from the
// name, which is only used to label the file.
func fileType(name string, data []byte) string {
	sniffed, _, _ := mime.ParseMediaType(http.DetectContentType(data))
	if inlineTypes[sniffed] {
		return sniffed
	}
	if t, _, err := mime.ParseMediaType(mime.TypeByExtension(path.Ext(name))); err == nil && t != "" && !inlineTypes[t] {
		return t
	}
	return "application/octet-stream"
}

// cleanFileName keeps a file's base name, minus control characters and
// anything that could act as a path, and caps its length.
func cleanFileName(name string) string {
	name = strings.ReplaceAll(name, "\\", "/")
	name = name[strings.LastIndex(name, "/")+1:]
	name = strings.Map(func(r rune) rune {
		if unicode.IsControl(r) || r == utf8.RuneError || unicode.Is(unicode.Bidi_Control, r) {
			return -1
		}
		return r
	}, name)
	name = strings.TrimSpace(name)
	if utf8.RuneCountInString(name) > maxFileName {
		ext := path.Ext(name)
		if utf8.RuneCountInString(ext) > 20 {
			ext = ""
		}
		runes := []rune(strings.TrimSuffix(name, ext))
		name = string(runes[:maxFileName-utf8.RuneCountInString(ext)]) + ext
	}
	if name == "" || name == "." || name == ".." {
		name = "file"
	}
	return name
}
