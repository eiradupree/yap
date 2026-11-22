package main

// Voice and video calls, using a self-hosted LiveKit media server.
//
// Each channel has one call room ("channel-<id>"). Yap's server decides who
// may join: it gives channel members a short-lived LiveKit access token, and
// the browser then connects to LiveKit directly for audio and video. LiveKit
// reports joins and leaves back through a signed webhook, which Yap turns into
// "call_update" events so everyone in the channel sees who's on the call.
//
// The tokens and webhooks are plain HS256 JWTs, so this uses only the standard
// library rather than LiveKit's Go SDK.

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"
)

// LiveKitConfig connects Yap to a LiveKit server. Calls are off unless URL,
// APIKey and APISecret are all set.
type LiveKitConfig struct {
	// URL is what browsers connect to, e.g. wss://yap-livekit.fly.dev.
	URL string
	// APIURL is how this server reaches LiveKit's API. Defaults to URL with
	// https instead of wss.
	APIURL    string
	APIKey    string
	APISecret string
}

func (c LiveKitConfig) enabled() bool {
	return c.URL != "" && c.APIKey != "" && c.APISecret != ""
}

func (c LiveKitConfig) apiURL() string {
	if c.APIURL != "" {
		return strings.TrimRight(c.APIURL, "/")
	}
	u := strings.TrimRight(c.URL, "/")
	u = strings.Replace(u, "wss://", "https://", 1)
	return strings.Replace(u, "ws://", "http://", 1)
}

// origins returns the URL's origin for the page's Content-Security-Policy.
func (c LiveKitConfig) origins() []string {
	u, err := url.Parse(c.URL)
	if err != nil || u.Host == "" {
		return nil
	}
	httpScheme := "https"
	if u.Scheme == "ws" {
		httpScheme = "http"
	}
	return []string{u.Scheme + "://" + u.Host, httpScheme + "://" + u.Host}
}

const (
	callTokenTTL    = time.Hour
	callRoomPrefix  = "channel-"
	maxWebhookBytes = 1 << 20
)

func callRoom(channelID int64) string { return callRoomPrefix + strconv.FormatInt(channelID, 10) }

func roomChannel(room string) (int64, bool) {
	if !strings.HasPrefix(room, callRoomPrefix) {
		return 0, false
	}
	id, err := strconv.ParseInt(strings.TrimPrefix(room, callRoomPrefix), 10, 64)
	return id, err == nil && id > 0
}

// ---- JWTs ----

var jwtHeader = base64.RawURLEncoding.EncodeToString([]byte(`{"alg":"HS256","typ":"JWT"}`))

func signJWT(secret string, claims any) (string, error) {
	body, err := json.Marshal(claims)
	if err != nil {
		return "", err
	}
	unsigned := jwtHeader + "." + base64.RawURLEncoding.EncodeToString(body)
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write([]byte(unsigned))
	return unsigned + "." + base64.RawURLEncoding.EncodeToString(mac.Sum(nil)), nil
}

var errBadToken = errors.New("invalid token")

// verifyJWT checks an HS256 token's signature, issuer and times, and decodes
// its claims into out.
func verifyJWT(token, secret, issuer string, now time.Time, out any) error {
	parts := strings.Split(token, ".")
	if len(parts) != 3 {
		return errBadToken
	}
	var header struct {
		Alg string `json:"alg"`
	}
	hb, err := base64.RawURLEncoding.DecodeString(parts[0])
	if err != nil || json.Unmarshal(hb, &header) != nil || header.Alg != "HS256" {
		return errBadToken
	}
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write([]byte(parts[0] + "." + parts[1]))
	sig, err := base64.RawURLEncoding.DecodeString(parts[2])
	if err != nil || !hmac.Equal(sig, mac.Sum(nil)) {
		return errBadToken
	}
	cb, err := base64.RawURLEncoding.DecodeString(parts[1])
	if err != nil {
		return errBadToken
	}
	var std struct {
		Iss string `json:"iss"`
		Exp int64  `json:"exp"`
		Nbf int64  `json:"nbf"`
	}
	if json.Unmarshal(cb, &std) != nil || std.Iss != issuer {
		return errBadToken
	}
	const leeway = 60
	if std.Exp != 0 && now.Unix() > std.Exp+leeway || std.Nbf != 0 && now.Unix() < std.Nbf-leeway {
		return errBadToken
	}
	return json.Unmarshal(cb, out)
}

type videoGrant struct {
	Room           string `json:"room,omitempty"`
	RoomJoin       bool   `json:"roomJoin,omitempty"`
	RoomAdmin      bool   `json:"roomAdmin,omitempty"`
	RoomList       bool   `json:"roomList,omitempty"`
	CanPublish     *bool  `json:"canPublish,omitempty"`
	CanSubscribe   *bool  `json:"canSubscribe,omitempty"`
	CanPublishData *bool  `json:"canPublishData,omitempty"`
}

type liveKitClaims struct {
	Iss   string     `json:"iss"`
	Sub   string     `json:"sub,omitempty"`
	Name  string     `json:"name,omitempty"`
	Nbf   int64      `json:"nbf"`
	Exp   int64      `json:"exp"`
	Video videoGrant `json:"video"`
}

func (c LiveKitConfig) token(identity, name string, grant videoGrant, ttl time.Duration) (string, error) {
	now := time.Now()
	return signJWT(c.APISecret, liveKitClaims{
		Iss: c.APIKey, Sub: identity, Name: name,
		Nbf: now.Unix() - 5, Exp: now.Add(ttl).Unix(), Video: grant,
	})
}

// ---- who is in each call ----

type callParticipant struct {
	UserID   int64  `json:"user_id"`
	Username string `json:"username"`
	since    time.Time
}

type callInfo struct {
	ChannelID    int64             `json:"channel_id"`
	Participants []callParticipant `json:"participants"`
}

type callPresence struct {
	mu    sync.Mutex
	rooms map[int64]map[int64]callParticipant // channel -> user -> participant
}

// set replaces a channel's participants and reports whether anything changed.
func (p *callPresence) set(channelID int64, people map[int64]callParticipant) bool {
	p.mu.Lock()
	defer p.mu.Unlock()
	old := p.rooms[channelID]
	same := len(old) == len(people)
	for id := range people {
		if _, ok := old[id]; !ok {
			same = false
		}
	}
	if len(people) == 0 {
		delete(p.rooms, channelID)
	} else {
		p.rooms[channelID] = people
	}
	return !same
}

func (p *callPresence) update(channelID int64, fn func(map[int64]callParticipant)) {
	p.mu.Lock()
	defer p.mu.Unlock()
	people := p.rooms[channelID]
	if people == nil {
		people = map[int64]callParticipant{}
	}
	fn(people)
	if len(people) == 0 {
		delete(p.rooms, channelID)
	} else {
		p.rooms[channelID] = people
	}
}

func (p *callPresence) list(channelID int64) []callParticipant {
	p.mu.Lock()
	defer p.mu.Unlock()
	list := []callParticipant{}
	for _, cp := range p.rooms[channelID] {
		list = append(list, cp)
	}
	sort.Slice(list, func(i, j int) bool {
		if !list[i].since.Equal(list[j].since) {
			return list[i].since.Before(list[j].since)
		}
		return list[i].UserID < list[j].UserID
	})
	return list
}

func (p *callPresence) channelsWith(userID int64) []int64 {
	p.mu.Lock()
	defer p.mu.Unlock()
	var ids []int64
	for ch, people := range p.rooms {
		if _, ok := people[userID]; ok {
			ids = append(ids, ch)
		}
	}
	return ids
}

// ---- routes ----

func (s *Server) registerCalls() {
	s.presence = &callPresence{rooms: map[int64]map[int64]callParticipant{}}
	s.callLimit = newLimiter(3*time.Second, 10)
	if !s.cfg.LiveKit.enabled() {
		return
	}
	s.mux.HandleFunc("GET /api/calls", s.auth(s.handleListCalls))
	s.mux.HandleFunc("POST /api/channels/{id}/call", s.auth(s.handleCallToken))
	// LiveKit posts here; it's authenticated by the webhook's signature, not
	// a session, and is exempt from the JSON and same-origin checks.
	s.mux.HandleFunc("POST /api/livekit/webhook", s.handleLiveKitWebhook)
	go s.reconcileCalls()
}

func (s *Server) handleListCalls(w http.ResponseWriter, r *http.Request, u User) {
	chans, err := s.store.ListChannels(r.Context(), u.ID)
	if err != nil {
		s.internal(w, "list calls", err)
		return
	}
	list := []callInfo{}
	for _, ch := range chans {
		if !ch.Joined {
			continue
		}
		if people := s.presence.list(ch.ID); len(people) > 0 {
			list = append(list, callInfo{ChannelID: ch.ID, Participants: people})
		}
	}
	writeJSON(w, http.StatusOK, list)
}

// handleCallToken lets a channel member join the channel's call.
func (s *Server) handleCallToken(w http.ResponseWriter, r *http.Request, u User) {
	id, ok := pathID(w, r)
	if !ok || !readJSON(w, r, &struct{}{}) {
		return
	}
	if !s.callLimit.allow(strconv.FormatInt(u.ID, 10)) {
		writeError(w, http.StatusTooManyRequests, "you're joining calls too quickly")
		return
	}
	if err := s.store.requireMember(r.Context(), u.ID, id); err != nil {
		s.storeError(w, "call token", err)
		return
	}
	yes, no := true, false
	token, err := s.cfg.LiveKit.token(strconv.FormatInt(u.ID, 10), u.Username, videoGrant{
		Room: callRoom(id), RoomJoin: true,
		CanPublish: &yes, CanSubscribe: &yes, CanPublishData: &no,
	}, callTokenTTL)
	if err != nil {
		s.internal(w, "sign call token", err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"url": s.cfg.LiveKit.URL, "token": token, "room": callRoom(id), "channel_id": id,
	})
}

type liveKitEvent struct {
	Event string `json:"event"`
	Room  *struct {
		Name string `json:"name"`
	} `json:"room"`
	Participant *struct {
		Identity string `json:"identity"`
		Name     string `json:"name"`
	} `json:"participant"`
}

func (s *Server) handleLiveKitWebhook(w http.ResponseWriter, r *http.Request) {
	body, err := io.ReadAll(io.LimitReader(r.Body, maxWebhookBytes))
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	var claims struct {
		SHA256 string `json:"sha256"`
	}
	token := strings.TrimPrefix(r.Header.Get("Authorization"), "Bearer ")
	if err := verifyJWT(token, s.cfg.LiveKit.APISecret, s.cfg.LiveKit.APIKey, time.Now(), &claims); err != nil {
		writeError(w, http.StatusUnauthorized, "invalid signature")
		return
	}
	sum := sha256.Sum256(body)
	if subtle.ConstantTimeCompare([]byte(claims.SHA256), []byte(base64.StdEncoding.EncodeToString(sum[:]))) != 1 {
		writeError(w, http.StatusUnauthorized, "invalid signature")
		return
	}
	var ev liveKitEvent
	if json.Unmarshal(body, &ev) != nil || ev.Room == nil {
		w.WriteHeader(http.StatusOK) // not an event we track
		return
	}
	channelID, ok := roomChannel(ev.Room.Name)
	if !ok {
		w.WriteHeader(http.StatusOK)
		return
	}
	switch ev.Event {
	case "participant_joined", "participant_left":
		if ev.Participant == nil {
			break
		}
		userID, err := strconv.ParseInt(ev.Participant.Identity, 10, 64)
		if err != nil {
			break
		}
		s.presence.update(channelID, func(people map[int64]callParticipant) {
			if ev.Event == "participant_joined" {
				people[userID] = callParticipant{UserID: userID, Username: ev.Participant.Name, since: time.Now()}
			} else {
				delete(people, userID)
			}
		})
		s.announceCall(channelID)
	case "room_finished":
		s.presence.set(channelID, nil)
		s.announceCall(channelID)
	}
	w.WriteHeader(http.StatusOK)
}

// announceCall tells a channel's members who is on its call now.
func (s *Server) announceCall(channelID int64) {
	members, err := s.store.ChannelMemberIDs(context.Background(), channelID)
	if err != nil {
		log.Printf("announce call: member lookup: %v", err)
		return
	}
	info := callInfo{ChannelID: channelID, Participants: s.presence.list(channelID)}
	payload, _ := json.Marshal(struct {
		Type string    `json:"type"`
		Call *callInfo `json:"call"`
	}{"call_update", &info})
	s.hub.SendTo(members, payload)
}

// ---- LiveKit's room API ----

// roomAPI calls one of LiveKit's RoomService methods (Twirp over JSON).
func (s *Server) roomAPI(ctx context.Context, method string, grant videoGrant, req, out any) error {
	token, err := s.cfg.LiveKit.token("yapserver", "", grant, time.Minute)
	if err != nil {
		return err
	}
	body, _ := json.Marshal(req)
	hreq, err := http.NewRequestWithContext(ctx, http.MethodPost,
		s.cfg.LiveKit.apiURL()+"/twirp/livekit.RoomService/"+method, bytes.NewReader(body))
	if err != nil {
		return err
	}
	hreq.Header.Set("Content-Type", "application/json")
	hreq.Header.Set("Authorization", "Bearer "+token)
	res, err := http.DefaultClient.Do(hreq)
	if err != nil {
		return err
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		io.Copy(io.Discard, io.LimitReader(res.Body, 4096))
		return fmt.Errorf("livekit %s: status %d", method, res.StatusCode)
	}
	if out == nil {
		return nil
	}
	return json.NewDecoder(io.LimitReader(res.Body, 8<<20)).Decode(out)
}

// removeFromCalls drops a user from calls right away: from one channel's
// call when they leave it, or from all calls (channelID 0) when they're
// banned or delete their account. Their token would otherwise keep working
// until they hang up.
func (s *Server) removeFromCalls(userID, channelID int64) {
	if !s.cfg.LiveKit.enabled() {
		return
	}
	channels := s.presence.channelsWith(userID)
	for _, ch := range channels {
		if channelID != 0 && ch != channelID {
			continue
		}
		go func(ch int64) {
			ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
			defer cancel()
			room := callRoom(ch)
			err := s.roomAPI(ctx, "RemoveParticipant", videoGrant{Room: room, RoomAdmin: true},
				map[string]string{"room": room, "identity": strconv.FormatInt(userID, 10)}, nil)
			if err != nil {
				log.Printf("remove user %d from call in channel %d: %v", userID, ch, err)
			}
		}(ch)
	}
}

// reconcileCalls rebuilds call presence from LiveKit at startup and every
// minute, in case this server restarted mid-call or missed a webhook.
func (s *Server) reconcileCalls() {
	for {
		ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
		if err := s.syncCalls(ctx); err != nil {
			log.Printf("sync calls: %v", err)
		}
		cancel()
		time.Sleep(time.Minute)
	}
}

func (s *Server) syncCalls(ctx context.Context) error {
	var rooms struct {
		Rooms []struct {
			Name string `json:"name"`
		} `json:"rooms"`
	}
	if err := s.roomAPI(ctx, "ListRooms", videoGrant{RoomList: true}, map[string]any{}, &rooms); err != nil {
		return err
	}
	live := map[int64]bool{}
	for _, room := range rooms.Rooms {
		ch, ok := roomChannel(room.Name)
		if !ok {
			continue
		}
		var parts struct {
			Participants []struct {
				Identity string `json:"identity"`
				Name     string `json:"name"`
				JoinedAt string `json:"joinedAt"`
			} `json:"participants"`
		}
		if err := s.roomAPI(ctx, "ListParticipants", videoGrant{Room: room.Name, RoomAdmin: true},
			map[string]string{"room": room.Name}, &parts); err != nil {
			return err
		}
		people := map[int64]callParticipant{}
		for _, p := range parts.Participants {
			id, err := strconv.ParseInt(p.Identity, 10, 64)
			if err != nil {
				continue
			}
			joined, _ := strconv.ParseInt(p.JoinedAt, 10, 64)
			people[id] = callParticipant{UserID: id, Username: p.Name, since: time.Unix(joined, 0)}
		}
		live[ch] = true
		if s.presence.set(ch, people) {
			s.announceCall(ch)
		}
	}
	// Calls LiveKit no longer has have ended.
	s.presence.mu.Lock()
	var ended []int64
	for ch := range s.presence.rooms {
		if !live[ch] {
			ended = append(ended, ch)
		}
	}
	s.presence.mu.Unlock()
	for _, ch := range ended {
		s.presence.set(ch, nil)
		s.announceCall(ch)
	}
	return nil
}
