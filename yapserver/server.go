package main

import (
	"context"
	"crypto/subtle"
	"embed"
	"encoding/json"
	"errors"
	"io/fs"
	"log"
	"mime"
	"net/http"
	"net/url"
	"regexp"
	"slices"
	"strconv"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/coder/websocket"
)

//go:embed web
var webFS embed.FS

const cookieName = "yap_session"

var (
	usernameRe    = regexp.MustCompile(`^[a-zA-Z0-9_.-]{3,32}$`)
	channelNameRe = regexp.MustCompile(`^[a-z0-9_-]{1,32}$`)
)

const (
	minPassword    = 8
	maxPassword    = 72 // bcrypt ignores bytes past 72
	maxMessageLen  = 4000
	maxBodyBytes   = 64 << 10
	defaultHistory = 50
	maxHistory     = 200
)

const maxConnsPerUser = 10

// Config holds the deployment settings that change server behavior.
type Config struct {
	// SecureCookies marks session cookies Secure. Turn on behind HTTPS.
	SecureCookies bool
	// BehindProxy trusts the last X-Forwarded-For entry as the client IP.
	BehindProxy bool
	// InviteCode, when set, is required to create an account.
	InviteCode string
	// Admins lists the usernames that can ban people and delete any message.
	Admins []string
	// LiveKit turns on voice and video calls.
	LiveKit LiveKitConfig
}

type Server struct {
	store  *Store
	hub    *Hub
	cfg    Config
	mux    *http.ServeMux
	admins map[string]bool // lowercased usernames
	csp    string

	presence  *callPresence // who is on each channel's call
	callLimit *limiter      // call joins per user

	authLimit    *limiter // login and register attempts per IP
	postLimit    *limiter // messages per user
	channelLimit *limiter // channel creations per user
	uploadLimit  *limiter // file uploads per user
	reactLimit   *limiter // reactions added or removed per user
}

func NewServer(store *Store, cfg Config) *Server {
	s := &Server{
		store:        store,
		hub:          NewHub(),
		cfg:          cfg,
		mux:          http.NewServeMux(),
		authLimit:    newLimiter(6*time.Second, 10),
		postLimit:    newLimiter(500*time.Millisecond, 20),
		channelLimit: newLimiter(30*time.Second, 5),
		uploadLimit:  newLimiter(3*time.Second, 10),
		reactLimit:   newLimiter(250*time.Millisecond, 30),
		admins:       map[string]bool{},
	}
	for _, name := range cfg.Admins {
		if name = strings.TrimSpace(name); name != "" {
			s.admins[strings.ToLower(name)] = true
		}
	}

	static, _ := fs.Sub(webFS, "web")
	files := http.FileServerFS(static)
	s.mux.Handle("GET /", http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Embedded files carry no modification time, so ask browsers to revalidate.
		w.Header().Set("Cache-Control", "no-cache")
		files.ServeHTTP(w, r)
	}))
	s.mux.HandleFunc("GET /api/config", func(w http.ResponseWriter, r *http.Request) {
		signup := "open"
		if s.cfg.InviteCode != "" {
			signup = "invite"
		}
		writeJSON(w, http.StatusOK, map[string]any{"signup": signup, "calls": s.cfg.LiveKit.enabled()})
	})

	s.mux.HandleFunc("POST /api/register", s.handleRegister)
	s.mux.HandleFunc("POST /api/login", s.handleLogin)
	s.mux.HandleFunc("POST /api/logout", s.handleLogout)
	s.mux.HandleFunc("GET /api/me", s.auth(s.handleMe))
	s.mux.HandleFunc("POST /api/me/password", s.auth(s.handleChangePassword))
	s.mux.HandleFunc("DELETE /api/me", s.auth(s.handleDeleteAccount))
	s.mux.HandleFunc("GET /api/channels", s.auth(s.handleListChannels))
	s.mux.HandleFunc("POST /api/channels", s.auth(s.handleCreateChannel))
	s.mux.HandleFunc("POST /api/channels/{id}/join", s.auth(s.handleJoin))
	s.mux.HandleFunc("POST /api/channels/{id}/leave", s.auth(s.handleLeave))
	s.mux.HandleFunc("GET /api/channels/{id}/messages", s.auth(s.handleListMessages))
	s.mux.HandleFunc("POST /api/channels/{id}/messages", s.auth(s.handlePostMessage))
	s.mux.HandleFunc("PATCH /api/messages/{id}", s.auth(s.handleEditMessage))
	s.mux.HandleFunc("DELETE /api/messages/{id}", s.auth(s.handleDeleteMessage))
	s.mux.HandleFunc("GET /api/messages/{id}/thread", s.auth(s.handleThread))
	s.mux.HandleFunc("POST /api/messages/{id}/reactions", s.auth(s.handleAddReaction))
	s.mux.HandleFunc("DELETE /api/messages/{id}/reactions", s.auth(s.handleRemoveReaction))
	s.mux.HandleFunc("POST /api/uploads", s.auth(s.handleUpload))
	s.mux.HandleFunc("DELETE /api/uploads/{id}", s.auth(s.handleDeleteUpload))
	s.mux.HandleFunc("GET /api/files/{id}/{name}", s.auth(s.handleFile))
	s.mux.HandleFunc("GET /api/admin/users", s.admin(s.handleListUsers))
	s.mux.HandleFunc("POST /api/admin/users/{id}/ban", s.admin(s.handleBan))
	s.mux.HandleFunc("POST /api/admin/users/{id}/unban", s.admin(s.handleUnban))
	s.mux.HandleFunc("GET /api/ws", s.auth(s.handleWS))
	s.mux.HandleFunc("GET /api/ping", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, http.StatusOK, map[string]string{"status": "ok", "app": "yap"})
	})
	s.registerCalls()
	// Pages may connect only to this server and, for calls, the LiveKit server.
	connect := append([]string{"'self'", "ws:", "wss:"}, cfg.LiveKit.origins()...)
	s.csp = "default-src 'self'; connect-src " + strings.Join(connect, " ") +
		"; img-src 'self' data:; media-src 'self' blob:; frame-ancestors 'none'"
	return s
}

func (s *Server) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("X-Content-Type-Options", "nosniff")
	w.Header().Set("X-Frame-Options", "DENY")
	w.Header().Set("Referrer-Policy", "same-origin")
	w.Header().Set("Content-Security-Policy", s.csp)
	if s.cfg.SecureCookies {
		// Served over HTTPS: tell browsers never to use plain HTTP for this site.
		w.Header().Set("Strict-Transport-Security", "max-age=31536000")
	}
	// LiveKit's webhook is signed instead (see livekit.go).
	if r.Method != http.MethodGet && r.Method != http.MethodHead && r.URL.Path != "/api/livekit/webhook" {
		if !sameOrigin(r) {
			writeError(w, http.StatusForbidden, "cross-origin request refused")
			return
		}
		ct, _, _ := mime.ParseMediaType(r.Header.Get("Content-Type"))
		if r.Method == http.MethodPost && r.URL.Path == "/api/uploads" {
			// Files are sent raw. The custom header forces a CORS preflight.
			if ct != "application/octet-stream" || r.Header.Get(uploadHeader) == "" {
				writeError(w, http.StatusUnsupportedMediaType, "expected application/octet-stream with "+uploadHeader)
				return
			}
			r.Body = http.MaxBytesReader(w, r.Body, maxUploadBytes)
		} else {
			// Requiring JSON forces a CORS preflight for any cross-site form post.
			if ct != "application/json" {
				writeError(w, http.StatusUnsupportedMediaType, "expected application/json")
				return
			}
			r.Body = http.MaxBytesReader(w, r.Body, maxBodyBytes)
		}
	}
	s.mux.ServeHTTP(w, r)
}

// sameOrigin rejects state-changing requests whose Origin is another site.
// Requests without an Origin header (curl, native clients) are allowed; they
// can't carry a browser's cookies without the user's own involvement.
func sameOrigin(r *http.Request) bool {
	origin := r.Header.Get("Origin")
	if origin == "" {
		return true
	}
	u, err := url.Parse(origin)
	return err == nil && strings.EqualFold(u.Host, r.Host)
}

func (s *Server) auth(next func(http.ResponseWriter, *http.Request, User)) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		c, err := r.Cookie(cookieName)
		if err != nil {
			writeError(w, http.StatusUnauthorized, "not logged in")
			return
		}
		u, err := s.store.SessionUser(r.Context(), c.Value)
		if errors.Is(err, errNotFound) {
			writeError(w, http.StatusUnauthorized, "not logged in")
			return
		} else if err != nil {
			s.internal(w, "session lookup", err)
			return
		}
		u.Admin = s.isAdmin(u.Username)
		next(w, r, u)
	}
}

// admin is auth plus a check that the user is an admin.
func (s *Server) admin(next func(http.ResponseWriter, *http.Request, User)) http.HandlerFunc {
	return s.auth(func(w http.ResponseWriter, r *http.Request, u User) {
		if !u.Admin {
			writeError(w, http.StatusForbidden, "admins only")
			return
		}
		next(w, r, u)
	})
}

func (s *Server) isAdmin(username string) bool {
	return s.admins[strings.ToLower(username)]
}

type credentials struct {
	Username string `json:"username"`
	Password string `json:"password"`
	Invite   string `json:"invite,omitempty"`
}

func (s *Server) allowAuthAttempt(w http.ResponseWriter, r *http.Request) bool {
	if !s.authLimit.allow(clientIP(r, s.cfg.BehindProxy)) {
		writeError(w, http.StatusTooManyRequests, "too many attempts, try again in a minute")
		return false
	}
	return true
}

func (s *Server) handleRegister(w http.ResponseWriter, r *http.Request) {
	if !s.allowAuthAttempt(w, r) {
		return
	}
	var c credentials
	if !readJSON(w, r, &c) {
		return
	}
	if s.cfg.InviteCode != "" && subtle.ConstantTimeCompare([]byte(c.Invite), []byte(s.cfg.InviteCode)) != 1 {
		writeError(w, http.StatusForbidden, "a valid invite code is required")
		return
	}
	if !usernameRe.MatchString(c.Username) {
		writeError(w, http.StatusBadRequest, "username must be 3-32 letters, digits, '.', '_' or '-'")
		return
	}
	if !validPassword(w, c.Password) {
		return
	}
	u, err := s.store.CreateUser(r.Context(), c.Username, c.Password)
	if errors.Is(err, errTaken) {
		writeError(w, http.StatusConflict, "username is taken")
		return
	} else if err != nil {
		s.internal(w, "create user", err)
		return
	}
	u.Admin = s.isAdmin(u.Username)
	s.startSession(w, r, u, http.StatusCreated)
}

func (s *Server) handleLogin(w http.ResponseWriter, r *http.Request) {
	if !s.allowAuthAttempt(w, r) {
		return
	}
	var c credentials
	if !readJSON(w, r, &c) {
		return
	}
	if len(c.Password) > maxPassword {
		writeError(w, http.StatusUnauthorized, errBadLogin.Error())
		return
	}
	u, err := s.store.CheckPassword(r.Context(), c.Username, c.Password)
	if errors.Is(err, errBadLogin) {
		writeError(w, http.StatusUnauthorized, errBadLogin.Error())
		return
	} else if errors.Is(err, errBanned) {
		writeError(w, http.StatusForbidden, errBanned.Error())
		return
	} else if err != nil {
		s.internal(w, "check password", err)
		return
	}
	u.Admin = s.isAdmin(u.Username)
	s.startSession(w, r, u, http.StatusOK)
}

func validPassword(w http.ResponseWriter, pw string) bool {
	if len(pw) < minPassword || len(pw) > maxPassword {
		writeError(w, http.StatusBadRequest, "password must be 8-72 characters")
		return false
	}
	return true
}

func (s *Server) startSession(w http.ResponseWriter, r *http.Request, u User, status int) {
	token, err := s.store.CreateSession(r.Context(), u.ID)
	if err != nil {
		s.internal(w, "create session", err)
		return
	}
	http.SetCookie(w, &http.Cookie{
		Name:     cookieName,
		Value:    token,
		Path:     "/",
		MaxAge:   int(sessionMaxAge.Seconds()),
		HttpOnly: true,
		Secure:   s.cfg.SecureCookies || r.TLS != nil,
		SameSite: http.SameSiteLaxMode,
	})
	writeJSON(w, status, u)
}

func (s *Server) handleLogout(w http.ResponseWriter, r *http.Request) {
	if c, err := r.Cookie(cookieName); err == nil {
		if u, err := s.store.SessionUser(r.Context(), c.Value); err == nil {
			s.hub.KickSession(u.ID, u.session)
		}
		if err := s.store.DeleteSession(r.Context(), c.Value); err != nil {
			s.internal(w, "delete session", err)
			return
		}
	}
	clearCookie(w)
	w.WriteHeader(http.StatusNoContent)
}

func clearCookie(w http.ResponseWriter) {
	http.SetCookie(w, &http.Cookie{Name: cookieName, Value: "", Path: "/", MaxAge: -1, HttpOnly: true})
}

func (s *Server) handleMe(w http.ResponseWriter, r *http.Request, u User) {
	writeJSON(w, http.StatusOK, u)
}

// checkCurrentPassword rate limits like a login, since it's a password guess.
func (s *Server) checkCurrentPassword(w http.ResponseWriter, r *http.Request, u User, pw string) bool {
	if !s.allowAuthAttempt(w, r) {
		return false
	}
	if len(pw) > maxPassword {
		writeError(w, http.StatusForbidden, "current password is wrong")
		return false
	}
	err := s.store.VerifyPassword(r.Context(), u.ID, pw)
	if errors.Is(err, errBadLogin) {
		writeError(w, http.StatusForbidden, "current password is wrong")
		return false
	} else if err != nil {
		s.internal(w, "verify password", err)
		return false
	}
	return true
}

func (s *Server) handleChangePassword(w http.ResponseWriter, r *http.Request, u User) {
	var req struct {
		Current string `json:"current_password"`
		New     string `json:"new_password"`
	}
	if !readJSON(w, r, &req) || !validPassword(w, req.New) || !s.checkCurrentPassword(w, r, u, req.Current) {
		return
	}
	if err := s.store.ChangePassword(r.Context(), u, req.New); err != nil {
		s.internal(w, "change password", err)
		return
	}
	// Other devices are signed out; this one stays signed in.
	s.hub.Kick(u.ID, u.session)
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) handleDeleteAccount(w http.ResponseWriter, r *http.Request, u User) {
	var req struct {
		Password string `json:"password"`
	}
	if !readJSON(w, r, &req) || !s.checkCurrentPassword(w, r, u, req.Password) {
		return
	}
	if err := s.store.DeleteUser(r.Context(), u.ID); err != nil {
		s.internal(w, "delete account", err)
		return
	}
	s.hub.Kick(u.ID, "")
	s.removeFromCalls(u.ID, 0)
	s.broadcastAll(event{Type: "user_removed", UserID: u.ID})
	clearCookie(w)
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) handleListChannels(w http.ResponseWriter, r *http.Request, u User) {
	chans, err := s.store.ListChannels(r.Context(), u.ID)
	if err != nil {
		s.internal(w, "list channels", err)
		return
	}
	writeJSON(w, http.StatusOK, chans)
}

func (s *Server) handleCreateChannel(w http.ResponseWriter, r *http.Request, u User) {
	if !s.channelLimit.allow(strconv.FormatInt(u.ID, 10)) {
		writeError(w, http.StatusTooManyRequests, "you're creating channels too quickly")
		return
	}
	var req struct {
		Name string `json:"name"`
	}
	if !readJSON(w, r, &req) {
		return
	}
	name := strings.ToLower(strings.TrimSpace(strings.TrimPrefix(req.Name, "#")))
	if !channelNameRe.MatchString(name) {
		writeError(w, http.StatusBadRequest, "channel name must be 1-32 lowercase letters, digits, '_' or '-'")
		return
	}
	ch, err := s.store.CreateChannel(r.Context(), u.ID, name)
	if errors.Is(err, errTaken) {
		writeError(w, http.StatusConflict, "a channel with that name already exists")
		return
	} else if err != nil {
		s.internal(w, "create channel", err)
		return
	}
	s.broadcastAll(event{Type: "channel_created", Channel: &Channel{ID: ch.ID, Name: ch.Name}})
	writeJSON(w, http.StatusCreated, ch)
}

func (s *Server) handleJoin(w http.ResponseWriter, r *http.Request, u User) {
	id, ok := pathID(w, r)
	if !ok {
		return
	}
	if err := s.store.JoinChannel(r.Context(), u.ID, id); err != nil {
		s.storeError(w, "join channel", err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) handleLeave(w http.ResponseWriter, r *http.Request, u User) {
	id, ok := pathID(w, r)
	if !ok {
		return
	}
	if err := s.store.LeaveChannel(r.Context(), u.ID, id); err != nil {
		s.internal(w, "leave channel", err)
		return
	}
	s.removeFromCalls(u.ID, id)
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) handleListMessages(w http.ResponseWriter, r *http.Request, u User) {
	id, ok := pathID(w, r)
	if !ok {
		return
	}
	before, _ := strconv.ParseInt(r.URL.Query().Get("before"), 10, 64)
	limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
	if limit <= 0 {
		limit = defaultHistory
	}
	limit = min(limit, maxHistory)
	msgs, err := s.store.Messages(r.Context(), u.ID, id, before, limit)
	if err != nil {
		s.storeError(w, "list messages", err)
		return
	}
	writeJSON(w, http.StatusOK, msgs)
}

func (s *Server) handlePostMessage(w http.ResponseWriter, r *http.Request, u User) {
	id, ok := pathID(w, r)
	if !ok {
		return
	}
	if !s.postLimit.allow(strconv.FormatInt(u.ID, 10)) {
		writeError(w, http.StatusTooManyRequests, "you're sending messages too quickly")
		return
	}
	var req struct {
		Body          string  `json:"body"`
		ParentID      int64   `json:"parent_id"`
		AttachmentIDs []int64 `json:"attachment_ids"`
	}
	if !readJSON(w, r, &req) {
		return
	}
	body := strings.TrimSpace(req.Body)
	if utf8.RuneCountInString(body) > maxMessageLen || body == "" && len(req.AttachmentIDs) == 0 {
		writeError(w, http.StatusBadRequest, "message must be 1-4000 characters")
		return
	}
	if len(req.AttachmentIDs) > maxAttachments {
		writeError(w, http.StatusBadRequest, "a message can have up to 10 attachments")
		return
	}
	slices.Sort(req.AttachmentIDs)
	if len(slices.Compact(req.AttachmentIDs)) != len(req.AttachmentIDs) {
		writeError(w, http.StatusBadRequest, "duplicate attachment")
		return
	}
	msg, err := s.store.PostMessage(r.Context(), u, id, NewMessage{
		Body: body, ParentID: req.ParentID, AttachmentIDs: req.AttachmentIDs,
	})
	if errors.Is(err, errBadParent) || errors.Is(err, errBadFile) {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	} else if err != nil {
		s.storeError(w, "post message", err)
		return
	}
	s.broadcastChannel(r.Context(), id, event{Type: "message", Message: &msg})
	writeJSON(w, http.StatusCreated, msg)
}

// messageBody trims and checks a message's text.
func messageBody(w http.ResponseWriter, r *http.Request) (string, bool) {
	var req struct {
		Body string `json:"body"`
	}
	if !readJSON(w, r, &req) {
		return "", false
	}
	body := strings.TrimSpace(req.Body)
	if body == "" || utf8.RuneCountInString(body) > maxMessageLen {
		writeError(w, http.StatusBadRequest, "message must be 1-4000 characters")
		return "", false
	}
	return body, true
}

func (s *Server) handleEditMessage(w http.ResponseWriter, r *http.Request, u User) {
	id, ok := pathIDOf(w, r, "message")
	if !ok {
		return
	}
	if !s.postLimit.allow(strconv.FormatInt(u.ID, 10)) {
		writeError(w, http.StatusTooManyRequests, "you're sending messages too quickly")
		return
	}
	body, ok := messageBody(w, r)
	if !ok {
		return
	}
	msg, err := s.store.EditMessage(r.Context(), u.ID, id, body)
	if err != nil {
		s.messageError(w, "edit message", err)
		return
	}
	s.broadcastChannel(r.Context(), msg.ChannelID, event{Type: "message_edited", Message: &msg})
	writeJSON(w, http.StatusOK, msg)
}

// Authors can delete their own messages; admins can delete anyone's.
func (s *Server) handleDeleteMessage(w http.ResponseWriter, r *http.Request, u User) {
	id, ok := pathIDOf(w, r, "message")
	if !ok {
		return
	}
	msg, err := s.store.GetMessage(r.Context(), id)
	if err == nil && msg.UserID != u.ID && !u.Admin {
		err = errForbidden
	}
	if err == nil {
		err = s.store.DeleteMessage(r.Context(), id)
	}
	if err != nil {
		s.messageError(w, "delete message", err)
		return
	}
	s.broadcastChannel(r.Context(), msg.ChannelID, event{
		Type: "message_deleted", Message: &Message{ID: msg.ID, ChannelID: msg.ChannelID, ParentID: msg.ParentID},
	})
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) handleThread(w http.ResponseWriter, r *http.Request, u User) {
	id, ok := pathIDOf(w, r, "message")
	if !ok {
		return
	}
	parent, replies, err := s.store.Thread(r.Context(), u.ID, id)
	if err != nil {
		s.messageError(w, "get thread", err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"parent": parent, "replies": replies})
}

func (s *Server) messageError(w http.ResponseWriter, op string, err error) {
	switch {
	case errors.Is(err, errNotFound):
		writeError(w, http.StatusNotFound, "message not found")
	case errors.Is(err, errForbidden):
		writeError(w, http.StatusForbidden, "that isn't your message")
	case errors.Is(err, errNotMember):
		writeError(w, http.StatusForbidden, "join the channel first")
	default:
		s.internal(w, op, err)
	}
}

func (s *Server) handleListUsers(w http.ResponseWriter, r *http.Request, _ User) {
	users, err := s.store.ListUsers(r.Context())
	if err != nil {
		s.internal(w, "list users", err)
		return
	}
	for i := range users {
		users[i].Admin = s.isAdmin(users[i].Username)
	}
	writeJSON(w, http.StatusOK, users)
}

func (s *Server) handleBan(w http.ResponseWriter, r *http.Request, admin User) {
	var req struct {
		DeleteMessages bool `json:"delete_messages"`
	}
	target, ok := s.banTarget(w, r, &req)
	if !ok {
		return
	}
	if target.ID == admin.ID || s.isAdmin(target.Username) {
		writeError(w, http.StatusBadRequest, "admins can't be banned")
		return
	}
	if err := s.store.SetBanned(r.Context(), target.ID, true, req.DeleteMessages); err != nil {
		s.userError(w, "ban user", err)
		return
	}
	s.hub.Kick(target.ID, "")
	s.removeFromCalls(target.ID, 0)
	if req.DeleteMessages {
		s.broadcastAll(event{Type: "user_removed", UserID: target.ID})
	}
	log.Printf("admin %d banned user %d (delete messages: %v)", admin.ID, target.ID, req.DeleteMessages)
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) handleUnban(w http.ResponseWriter, r *http.Request, admin User) {
	target, ok := s.banTarget(w, r, &struct{}{})
	if !ok {
		return
	}
	if err := s.store.SetBanned(r.Context(), target.ID, false, false); err != nil {
		s.userError(w, "unban user", err)
		return
	}
	log.Printf("admin %d unbanned user %d", admin.ID, target.ID)
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) banTarget(w http.ResponseWriter, r *http.Request, req any) (User, bool) {
	id, ok := pathIDOf(w, r, "user")
	if !ok || !readJSON(w, r, req) {
		return User{}, false
	}
	u, err := s.store.GetUser(r.Context(), id)
	if err != nil {
		s.userError(w, "find user", err)
		return User{}, false
	}
	return u, true
}

func (s *Server) userError(w http.ResponseWriter, op string, err error) {
	if errors.Is(err, errNotFound) {
		writeError(w, http.StatusNotFound, "user not found")
		return
	}
	s.internal(w, op, err)
}

type event struct {
	Type    string   `json:"type"`
	Message *Message `json:"message,omitempty"`
	Channel *Channel `json:"channel,omitempty"`
	UserID  int64    `json:"user_id,omitempty"` // user_removed: drop this user's messages
}

func (s *Server) broadcastChannel(ctx context.Context, channelID int64, e event) {
	ids, err := s.store.ChannelMemberIDs(ctx, channelID)
	if err != nil {
		log.Printf("broadcast: member lookup: %v", err)
		return
	}
	payload, _ := json.Marshal(e)
	s.hub.SendTo(ids, payload)
}

func (s *Server) broadcastAll(e event) {
	payload, _ := json.Marshal(e)
	s.hub.SendAll(payload)
}

func (s *Server) handleWS(w http.ResponseWriter, r *http.Request, u User) {
	// Accept rejects cross-origin handshakes by default.
	c := s.hub.add(u.ID, u.session, maxConnsPerUser)
	if c == nil {
		writeError(w, http.StatusTooManyRequests, "too many open connections")
		return
	}
	defer s.hub.remove(u.ID, c)
	conn, err := websocket.Accept(w, r, nil)
	if err != nil {
		return
	}
	defer conn.CloseNow()

	// The client never sends anything we act on; CloseRead handles pings and
	// cancels ctx when the connection drops.
	ctx := conn.CloseRead(r.Context())
	ping := time.NewTicker(30 * time.Second)
	defer ping.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-c.done:
			// Signed out, password changed or banned.
			conn.Close(websocket.StatusPolicyViolation, "session ended")
			return
		case payload := <-c.send:
			wctx, cancel := context.WithTimeout(ctx, 10*time.Second)
			err := conn.Write(wctx, websocket.MessageText, payload)
			cancel()
			if err != nil {
				return
			}
		case <-ping.C:
			pctx, cancel := context.WithTimeout(ctx, 10*time.Second)
			err := conn.Ping(pctx)
			cancel()
			if err != nil {
				return
			}
		}
	}
}

func pathID(w http.ResponseWriter, r *http.Request) (int64, bool) {
	return pathIDOf(w, r, "channel")
}

func pathIDOf(w http.ResponseWriter, r *http.Request, what string) (int64, bool) {
	id, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
	if err != nil || id <= 0 {
		writeError(w, http.StatusNotFound, what+" not found")
		return 0, false
	}
	return id, true
}

func (s *Server) storeError(w http.ResponseWriter, op string, err error) {
	switch {
	case errors.Is(err, errNotFound):
		writeError(w, http.StatusNotFound, "channel not found")
	case errors.Is(err, errNotMember):
		writeError(w, http.StatusForbidden, "join the channel first")
	default:
		s.internal(w, op, err)
	}
}

// internal logs the real error and sends the client a generic one.
func (s *Server) internal(w http.ResponseWriter, op string, err error) {
	log.Printf("%s: %v", op, err)
	writeError(w, http.StatusInternalServerError, "something went wrong")
}

func readJSON(w http.ResponseWriter, r *http.Request, v any) bool {
	dec := json.NewDecoder(r.Body)
	dec.DisallowUnknownFields()
	if err := dec.Decode(v); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return false
	}
	return true
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(v)
}

func writeError(w http.ResponseWriter, status int, msg string) {
	writeJSON(w, status, map[string]string{"error": msg})
}
