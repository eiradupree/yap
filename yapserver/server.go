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
}

type Server struct {
	store *Store
	hub   *Hub
	cfg   Config
	mux   *http.ServeMux

	authLimit    *limiter // login and register attempts per IP
	postLimit    *limiter // messages per user
	channelLimit *limiter // channel creations per user
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
		writeJSON(w, http.StatusOK, map[string]string{"signup": signup})
	})

	s.mux.HandleFunc("POST /api/register", s.handleRegister)
	s.mux.HandleFunc("POST /api/login", s.handleLogin)
	s.mux.HandleFunc("POST /api/logout", s.handleLogout)
	s.mux.HandleFunc("GET /api/me", s.auth(s.handleMe))
	s.mux.HandleFunc("GET /api/channels", s.auth(s.handleListChannels))
	s.mux.HandleFunc("POST /api/channels", s.auth(s.handleCreateChannel))
	s.mux.HandleFunc("POST /api/channels/{id}/join", s.auth(s.handleJoin))
	s.mux.HandleFunc("POST /api/channels/{id}/leave", s.auth(s.handleLeave))
	s.mux.HandleFunc("GET /api/channels/{id}/messages", s.auth(s.handleListMessages))
	s.mux.HandleFunc("POST /api/channels/{id}/messages", s.auth(s.handlePostMessage))
	s.mux.HandleFunc("GET /api/ws", s.auth(s.handleWS))
	s.mux.HandleFunc("GET /api/ping", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, http.StatusOK, map[string]string{"status": "ok", "app": "yap"})
	})
	return s
}

func (s *Server) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("X-Content-Type-Options", "nosniff")
	w.Header().Set("X-Frame-Options", "DENY")
	w.Header().Set("Referrer-Policy", "same-origin")
	w.Header().Set("Content-Security-Policy",
		"default-src 'self'; connect-src 'self' ws: wss:; img-src 'self' data:; frame-ancestors 'none'")
	if s.cfg.SecureCookies {
		// Served over HTTPS: tell browsers never to use plain HTTP for this site.
		w.Header().Set("Strict-Transport-Security", "max-age=31536000")
	}
	if r.Method != http.MethodGet && r.Method != http.MethodHead {
		if !sameOrigin(r) {
			writeError(w, http.StatusForbidden, "cross-origin request refused")
			return
		}
		// Requiring JSON forces a CORS preflight for any cross-site form post.
		if ct, _, _ := mime.ParseMediaType(r.Header.Get("Content-Type")); ct != "application/json" {
			writeError(w, http.StatusUnsupportedMediaType, "expected application/json")
			return
		}
		r.Body = http.MaxBytesReader(w, r.Body, maxBodyBytes)
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
		next(w, r, u)
	}
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
	if len(c.Password) < minPassword || len(c.Password) > maxPassword {
		writeError(w, http.StatusBadRequest, "password must be 8-72 characters")
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
	} else if err != nil {
		s.internal(w, "check password", err)
		return
	}
	s.startSession(w, r, u, http.StatusOK)
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
		if err := s.store.DeleteSession(r.Context(), c.Value); err != nil {
			s.internal(w, "delete session", err)
			return
		}
	}
	http.SetCookie(w, &http.Cookie{Name: cookieName, Value: "", Path: "/", MaxAge: -1, HttpOnly: true})
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) handleMe(w http.ResponseWriter, r *http.Request, u User) {
	writeJSON(w, http.StatusOK, u)
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
		Body string `json:"body"`
	}
	if !readJSON(w, r, &req) {
		return
	}
	body := strings.TrimSpace(req.Body)
	if body == "" || utf8.RuneCountInString(body) > maxMessageLen {
		writeError(w, http.StatusBadRequest, "message must be 1-4000 characters")
		return
	}
	msg, err := s.store.PostMessage(r.Context(), u, id, body)
	if err != nil {
		s.storeError(w, "post message", err)
		return
	}
	s.broadcastChannel(r.Context(), id, event{Type: "message", Message: &msg})
	writeJSON(w, http.StatusCreated, msg)
}

type event struct {
	Type    string   `json:"type"`
	Message *Message `json:"message,omitempty"`
	Channel *Channel `json:"channel,omitempty"`
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
	c := s.hub.add(u.ID, maxConnsPerUser)
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
	id, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
	if err != nil || id <= 0 {
		writeError(w, http.StatusNotFound, "channel not found")
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
