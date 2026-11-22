package main

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"strconv"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/coder/websocket"
)

// fakeLiveKit stands in for LiveKit's room API.
type fakeLiveKit struct {
	mu           sync.Mutex
	rooms        map[string][]map[string]string // room -> participants
	removed      []string                       // "room/identity"
	badAuthCalls int
	cfg          LiveKitConfig
}

func newFakeLiveKit(t *testing.T) (*fakeLiveKit, *httptest.Server) {
	f := &fakeLiveKit{rooms: map[string][]map[string]string{}}
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var claims liveKitClaims
		token := strings.TrimPrefix(r.Header.Get("Authorization"), "Bearer ")
		if verifyJWT(token, "test-secret", "test-key", time.Now(), &claims) != nil {
			f.mu.Lock()
			f.badAuthCalls++
			f.mu.Unlock()
			w.WriteHeader(http.StatusUnauthorized)
			return
		}
		var req map[string]string
		json.NewDecoder(r.Body).Decode(&req)
		f.mu.Lock()
		defer f.mu.Unlock()
		switch strings.TrimPrefix(r.URL.Path, "/twirp/livekit.RoomService/") {
		case "ListRooms":
			if !claims.Video.RoomList {
				w.WriteHeader(http.StatusForbidden)
				return
			}
			rooms := []map[string]string{}
			for name := range f.rooms {
				rooms = append(rooms, map[string]string{"name": name})
			}
			json.NewEncoder(w).Encode(map[string]any{"rooms": rooms})
		case "ListParticipants":
			if !claims.Video.RoomAdmin || claims.Video.Room != req["room"] {
				w.WriteHeader(http.StatusForbidden)
				return
			}
			json.NewEncoder(w).Encode(map[string]any{"participants": f.rooms[req["room"]]})
		case "RemoveParticipant":
			if !claims.Video.RoomAdmin || claims.Video.Room != req["room"] {
				w.WriteHeader(http.StatusForbidden)
				return
			}
			f.removed = append(f.removed, req["room"]+"/"+req["identity"])
			w.Write([]byte("{}"))
		default:
			w.WriteHeader(http.StatusNotFound)
		}
	}))
	t.Cleanup(ts.Close)
	f.cfg = LiveKitConfig{URL: "wss://media.example.com", APIURL: ts.URL, APIKey: "test-key", APISecret: "test-secret"}
	return f, ts
}

func (f *fakeLiveKit) removals() []string {
	f.mu.Lock()
	defer f.mu.Unlock()
	return append([]string(nil), f.removed...)
}

// sendWebhook posts a LiveKit event signed the way LiveKit signs them.
func sendWebhook(t *testing.T, ts *httptest.Server, secret string, ev any) int {
	t.Helper()
	body, _ := json.Marshal(ev)
	sum := sha256.Sum256(body)
	token, _ := signJWT(secret, map[string]any{
		"iss": "test-key", "exp": time.Now().Add(time.Minute).Unix(),
		"sha256": base64.StdEncoding.EncodeToString(sum[:]),
	})
	req, _ := http.NewRequest("POST", ts.URL+"/api/livekit/webhook", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/webhook+json")
	req.Header.Set("Authorization", token)
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	res.Body.Close()
	return res.StatusCode
}

func participantEvent(kind string, channelID int64, u User) map[string]any {
	return map[string]any{
		"event":       kind,
		"room":        map[string]string{"name": callRoom(channelID)},
		"participant": map[string]string{"identity": strconv.FormatInt(u.ID, 10), "name": u.Username},
	}
}

func TestJWTRoundTrip(t *testing.T) {
	cfg := LiveKitConfig{APIKey: "k", APISecret: "s"}
	tok, err := cfg.token("42", "alice", videoGrant{Room: "channel-1", RoomJoin: true}, time.Minute)
	if err != nil {
		t.Fatal(err)
	}
	var claims liveKitClaims
	if err := verifyJWT(tok, "s", "k", time.Now(), &claims); err != nil {
		t.Fatal(err)
	}
	if claims.Sub != "42" || claims.Name != "alice" || claims.Video.Room != "channel-1" || !claims.Video.RoomJoin {
		t.Errorf("claims: %+v", claims)
	}
	if verifyJWT(tok, "wrong", "k", time.Now(), &claims) == nil {
		t.Error("accepted a token signed with another secret")
	}
	if verifyJWT(tok, "s", "other-key", time.Now(), &claims) == nil {
		t.Error("accepted a token from another issuer")
	}
	if verifyJWT(tok, "s", "k", time.Now().Add(time.Hour), &claims) == nil {
		t.Error("accepted an expired token")
	}
	parts := strings.Split(tok, ".")
	none := base64.RawURLEncoding.EncodeToString([]byte(`{"alg":"none"}`)) + "." + parts[1] + "."
	if verifyJWT(none, "s", "k", time.Now(), &claims) == nil {
		t.Error(`accepted alg "none"`)
	}
}

func TestCallsOffWithoutLiveKit(t *testing.T) {
	ts := newTestServer(t)
	a := newClient(t, ts)
	a.register("alice")
	var cfg map[string]any
	a.do("GET", "/api/config", nil, &cfg)
	if cfg["calls"] != false {
		t.Errorf("config calls = %v, want false", cfg["calls"])
	}
	if code := a.do("POST", fmt.Sprintf("/api/channels/%d/call", generalID(t, a)), struct{}{}, nil); code == http.StatusOK {
		t.Error("call token issued with calls off")
	}
}

func TestCallTokens(t *testing.T) {
	lk, _ := newFakeLiveKit(t)
	ts := newServerWith(t, Config{LiveKit: lk.cfg})
	a, b := newClient(t, ts), newClient(t, ts)
	alice := a.register("alice")
	b.register("bob")

	var cfg map[string]any
	a.do("GET", "/api/config", nil, &cfg)
	if cfg["calls"] != true {
		t.Errorf("config calls = %v, want true", cfg["calls"])
	}
	res, _ := http.Get(ts.URL + "/")
	res.Body.Close()
	if csp := res.Header.Get("Content-Security-Policy"); !strings.Contains(csp, "wss://media.example.com") || !strings.Contains(csp, "https://media.example.com") {
		t.Errorf("CSP doesn't allow the LiveKit server: %s", csp)
	}

	var ch Channel
	a.do("POST", "/api/channels", map[string]string{"name": "standup"}, &ch)
	path := fmt.Sprintf("/api/channels/%d/call", ch.ID)
	if code := b.do("POST", path, struct{}{}, nil); code != http.StatusForbidden {
		t.Errorf("non-member call token: got %d, want 403", code)
	}
	if code := newClient(t, ts).do("POST", path, struct{}{}, nil); code != http.StatusUnauthorized {
		t.Errorf("signed-out call token: got %d, want 401", code)
	}

	var got struct {
		URL   string `json:"url"`
		Token string `json:"token"`
		Room  string `json:"room"`
	}
	if code := a.do("POST", path, struct{}{}, &got); code != http.StatusOK {
		t.Fatalf("member call token: %d", code)
	}
	var claims liveKitClaims
	if err := verifyJWT(got.Token, "test-secret", "test-key", time.Now(), &claims); err != nil {
		t.Fatal(err)
	}
	if got.URL != "wss://media.example.com" || got.Room != callRoom(ch.ID) || claims.Video.Room != callRoom(ch.ID) ||
		claims.Sub != strconv.FormatInt(alice.ID, 10) || claims.Name != "alice" || !claims.Video.RoomJoin ||
		claims.Video.RoomAdmin || claims.Video.CanPublishData == nil || *claims.Video.CanPublishData {
		t.Errorf("token: %+v claims %+v", got, claims)
	}
	if claims.Exp-time.Now().Unix() > int64(callTokenTTL/time.Second)+5 {
		t.Errorf("token lives too long: exp %d", claims.Exp)
	}
}

func TestCallWebhooks(t *testing.T) {
	lk, _ := newFakeLiveKit(t)
	ts := newServerWith(t, Config{LiveKit: lk.cfg})
	a, b, c := newClient(t, ts), newClient(t, ts), newClient(t, ts)
	alice := a.register("alice")
	b.register("bob")
	c.register("carol")
	var ch Channel
	a.do("POST", "/api/channels", map[string]string{"name": "standup"}, &ch)
	b.do("POST", fmt.Sprintf("/api/channels/%d/join", ch.ID), struct{}{}, nil)
	bobWS, carolWS := dialWS(t, ts, b), dialWS(t, ts, c)

	if code := sendWebhook(t, ts, "wrong-secret", participantEvent("participant_joined", ch.ID, alice)); code != http.StatusUnauthorized {
		t.Errorf("forged webhook: got %d, want 401", code)
	}
	// A valid signature over a different body must fail too.
	body, _ := json.Marshal(participantEvent("participant_joined", ch.ID, alice))
	tok, _ := signJWT("test-secret", map[string]any{"iss": "test-key", "exp": time.Now().Add(time.Minute).Unix(), "sha256": "AAAA"})
	req, _ := http.NewRequest("POST", ts.URL+"/api/livekit/webhook", bytes.NewReader(body))
	req.Header.Set("Authorization", tok)
	res, _ := http.DefaultClient.Do(req)
	io.Copy(io.Discard, res.Body)
	res.Body.Close()
	if res.StatusCode != http.StatusUnauthorized {
		t.Errorf("webhook with wrong body hash: got %d, want 401", res.StatusCode)
	}

	if code := sendWebhook(t, ts, "test-secret", participantEvent("participant_joined", ch.ID, alice)); code != http.StatusOK {
		t.Fatalf("webhook: %d", code)
	}
	var ev struct {
		Type string   `json:"type"`
		Call callInfo `json:"call"`
	}
	raw := readEventRaw(t, bobWS)
	json.Unmarshal(raw, &ev)
	if ev.Type != "call_update" || ev.Call.ChannelID != ch.ID || len(ev.Call.Participants) != 1 || ev.Call.Participants[0].Username != "alice" {
		t.Errorf("bob got: %s", raw)
	}

	var calls []callInfo
	b.do("GET", "/api/calls", nil, &calls)
	if len(calls) != 1 || calls[0].ChannelID != ch.ID {
		t.Errorf("bob's calls: %+v", calls)
	}
	c.do("GET", "/api/calls", nil, &calls)
	if len(calls) != 0 {
		t.Errorf("carol isn't in the channel but sees: %+v", calls)
	}

	sendWebhook(t, ts, "test-secret", participantEvent("participant_left", ch.ID, alice))
	json.Unmarshal(readEventRaw(t, bobWS), &ev)
	if ev.Type != "call_update" || len(ev.Call.Participants) != 0 {
		t.Errorf("after leave: %+v", ev)
	}

	// Carol isn't a member, so she gets nothing; the next thing she sees is a
	// #general message.
	a.do("POST", fmt.Sprintf("/api/channels/%d/messages", generalID(t, a)), map[string]string{"body": "hi"}, nil)
	if raw := readEventRaw(t, carolWS); !strings.Contains(string(raw), `"type":"message"`) {
		t.Errorf("carol got a call event for a channel she isn't in: %s", raw)
	}
}

func TestRemovedFromCalls(t *testing.T) {
	lk, _ := newFakeLiveKit(t)
	ts := newServerWith(t, Config{LiveKit: lk.cfg, Admins: []string{"root"}})
	root, b := newClient(t, ts), newClient(t, ts)
	root.register("root")
	bob := b.register("bob")
	var ch Channel
	root.do("POST", "/api/channels", map[string]string{"name": "standup"}, &ch)
	b.do("POST", fmt.Sprintf("/api/channels/%d/join", ch.ID), struct{}{}, nil)
	general := generalID(t, b)
	sendWebhook(t, ts, "test-secret", participantEvent("participant_joined", ch.ID, bob))
	sendWebhook(t, ts, "test-secret", participantEvent("participant_joined", general, bob))

	waitFor := func(want string) {
		t.Helper()
		for range 50 {
			for _, r := range lk.removals() {
				if r == want {
					return
				}
			}
			time.Sleep(20 * time.Millisecond)
		}
		t.Errorf("never removed %s; removals: %v", want, lk.removals())
	}

	// Leaving a channel hangs up that channel's call only.
	b.do("POST", fmt.Sprintf("/api/channels/%d/leave", ch.ID), struct{}{}, nil)
	waitFor(callRoom(ch.ID) + "/" + strconv.FormatInt(bob.ID, 10))
	if len(lk.removals()) != 1 {
		t.Errorf("leave removed too much: %v", lk.removals())
	}
	// A ban hangs up every call.
	root.do("POST", fmt.Sprintf("/api/admin/users/%d/ban", bob.ID), struct{}{}, nil)
	waitFor(callRoom(general) + "/" + strconv.FormatInt(bob.ID, 10))
}

func TestSyncCallsFromLiveKit(t *testing.T) {
	lk, _ := newFakeLiveKit(t)
	store, err := OpenStore(t.TempDir() + "/sync.db")
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()
	s := NewServer(store, Config{LiveKit: lk.cfg})
	lk.mu.Lock()
	lk.rooms[callRoom(1)] = []map[string]string{{"identity": "7", "name": "alice", "joinedAt": "100"}}
	lk.rooms["someone-elses-room"] = []map[string]string{{"identity": "x"}}
	lk.mu.Unlock()
	s.presence.set(2, map[int64]callParticipant{9: {UserID: 9}}) // a call that ended while we weren't looking

	if err := s.syncCalls(t.Context()); err != nil {
		t.Fatal(err)
	}
	if got := s.presence.list(1); len(got) != 1 || got[0].UserID != 7 || got[0].Username != "alice" {
		t.Errorf("channel 1: %+v", got)
	}
	if got := s.presence.list(2); len(got) != 0 {
		t.Errorf("ended call still listed: %+v", got)
	}
	if lk.badAuthCalls != 0 {
		t.Errorf("%d API calls were refused", lk.badAuthCalls)
	}
}

func readEventRaw(t *testing.T, conn *websocket.Conn) []byte {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	_, data, err := conn.Read(ctx)
	if err != nil {
		t.Fatal(err)
	}
	return data
}
