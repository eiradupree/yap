package main

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/cookiejar"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/coder/websocket"
)

type testClient struct {
	t    *testing.T
	base string
	http *http.Client
}

func newTestServer(t *testing.T) *httptest.Server {
	t.Helper()
	store, err := OpenStore(filepath.Join(t.TempDir(), "test.db"))
	if err != nil {
		t.Fatal(err)
	}
	ts := httptest.NewServer(NewServer(store, Config{}))
	t.Cleanup(func() { ts.Close(); store.Close() })
	return ts
}

func newClient(t *testing.T, ts *httptest.Server) *testClient {
	jar, _ := cookiejar.New(nil)
	return &testClient{t: t, base: ts.URL, http: &http.Client{Jar: jar}}
}

func (c *testClient) do(method, path string, body any, out any) int {
	c.t.Helper()
	var r *bytes.Reader
	if body != nil {
		b, _ := json.Marshal(body)
		r = bytes.NewReader(b)
	} else {
		r = bytes.NewReader(nil)
	}
	req, _ := http.NewRequest(method, c.base+path, r)
	if method != http.MethodGet {
		req.Header.Set("Content-Type", "application/json")
	}
	res, err := c.http.Do(req)
	if err != nil {
		c.t.Fatal(err)
	}
	defer res.Body.Close()
	if out != nil {
		json.NewDecoder(res.Body).Decode(out)
	}
	return res.StatusCode
}

func (c *testClient) register(name string) User {
	c.t.Helper()
	var u User
	if code := c.do("POST", "/api/register", credentials{Username: name, Password: "correct-horse"}, &u); code != http.StatusCreated {
		c.t.Fatalf("register %s: status %d", name, code)
	}
	return u
}

func generalID(t *testing.T, c *testClient) int64 {
	var chans []Channel
	c.do("GET", "/api/channels", nil, &chans)
	for _, ch := range chans {
		if ch.Name == "general" {
			return ch.ID
		}
	}
	t.Fatal("no #general")
	return 0
}

func TestRegisterLoginLogout(t *testing.T) {
	ts := newTestServer(t)
	a := newClient(t, ts)
	a.register("alice")

	if code := newClient(t, ts).do("POST", "/api/register", credentials{Username: "ALICE", Password: "correct-horse"}, nil); code != http.StatusConflict {
		t.Errorf("duplicate username (case-insensitive): got %d, want 409", code)
	}
	if code := newClient(t, ts).do("POST", "/api/register", credentials{Username: "bob", Password: "short"}, nil); code != http.StatusBadRequest {
		t.Errorf("short password: got %d, want 400", code)
	}
	if code := newClient(t, ts).do("POST", "/api/register", credentials{Username: "<script>", Password: "correct-horse"}, nil); code != http.StatusBadRequest {
		t.Errorf("bad username: got %d, want 400", code)
	}

	b := newClient(t, ts)
	if code := b.do("POST", "/api/login", credentials{Username: "alice", Password: "wrong-password"}, nil); code != http.StatusUnauthorized {
		t.Errorf("wrong password: got %d, want 401", code)
	}
	if code := b.do("POST", "/api/login", credentials{Username: "nobody", Password: "whatever-pw"}, nil); code != http.StatusUnauthorized {
		t.Errorf("unknown user: got %d, want 401", code)
	}
	if code := b.do("POST", "/api/login", credentials{Username: "alice", Password: "correct-horse"}, nil); code != http.StatusOK {
		t.Fatalf("login: got %d", code)
	}
	var me User
	if code := b.do("GET", "/api/me", nil, &me); code != http.StatusOK || me.Username != "alice" {
		t.Fatalf("me: %d %+v", code, me)
	}
	b.do("POST", "/api/logout", struct{}{}, nil)
	if code := b.do("GET", "/api/me", nil, nil); code != http.StatusUnauthorized {
		t.Errorf("after logout: got %d, want 401", code)
	}
	// Logging out one session leaves the other alone.
	if code := a.do("GET", "/api/me", nil, nil); code != http.StatusOK {
		t.Errorf("other session: got %d, want 200", code)
	}
}

func TestUnauthenticated(t *testing.T) {
	ts := newTestServer(t)
	c := newClient(t, ts)
	for _, path := range []string{"/api/me", "/api/channels", "/api/channels/1/messages"} {
		if code := c.do("GET", path, nil, nil); code != http.StatusUnauthorized {
			t.Errorf("GET %s: got %d, want 401", path, code)
		}
	}
	if code := c.do("POST", "/api/channels/1/messages", map[string]string{"body": "hi"}, nil); code != http.StatusUnauthorized {
		t.Errorf("post without login: got %d, want 401", code)
	}
}

func TestChannelMembership(t *testing.T) {
	ts := newTestServer(t)
	a, b := newClient(t, ts), newClient(t, ts)
	a.register("alice")
	b.register("bob")

	var ch Channel
	if code := a.do("POST", "/api/channels", map[string]string{"name": "#Secret-Plans"}, &ch); code != http.StatusCreated {
		t.Fatalf("create: %d", code)
	}
	if ch.Name != "secret-plans" {
		t.Errorf("name not normalized: %q", ch.Name)
	}
	if code := b.do("POST", "/api/channels", map[string]string{"name": "secret-plans"}, nil); code != http.StatusConflict {
		t.Errorf("duplicate channel: got %d, want 409", code)
	}

	path := fmt.Sprintf("/api/channels/%d/messages", ch.ID)
	if code := a.do("POST", path, map[string]string{"body": "hello"}, nil); code != http.StatusCreated {
		t.Fatalf("member post: %d", code)
	}
	// Bob isn't a member: no reading, no posting.
	if code := b.do("GET", path, nil, nil); code != http.StatusForbidden {
		t.Errorf("non-member read: got %d, want 403", code)
	}
	if code := b.do("POST", path, map[string]string{"body": "sneaky"}, nil); code != http.StatusForbidden {
		t.Errorf("non-member post: got %d, want 403", code)
	}

	b.do("POST", fmt.Sprintf("/api/channels/%d/join", ch.ID), struct{}{}, nil)
	var msgs []Message
	if code := b.do("GET", path, nil, &msgs); code != http.StatusOK || len(msgs) != 1 || msgs[0].Body != "hello" || msgs[0].Username != "alice" {
		t.Fatalf("after join: %d %+v", code, msgs)
	}

	b.do("POST", fmt.Sprintf("/api/channels/%d/leave", ch.ID), struct{}{}, nil)
	if code := b.do("GET", path, nil, nil); code != http.StatusForbidden {
		t.Errorf("after leave: got %d, want 403", code)
	}

	if code := a.do("GET", "/api/channels/9999/messages", nil, nil); code != http.StatusNotFound {
		t.Errorf("missing channel: got %d, want 404", code)
	}
	if code := a.do("POST", "/api/channels/9999/join", struct{}{}, nil); code != http.StatusNotFound {
		t.Errorf("join missing channel: got %d, want 404", code)
	}
}

func TestMessageHistoryPaging(t *testing.T) {
	ts := newTestServer(t)
	a := newClient(t, ts)
	a.register("alice")
	path := fmt.Sprintf("/api/channels/%d/messages", generalID(t, a))
	for i := range 5 {
		a.do("POST", path, map[string]string{"body": fmt.Sprint(i)}, nil)
	}
	var page []Message
	a.do("GET", path+"?limit=2", nil, &page)
	if len(page) != 2 || page[0].Body != "3" || page[1].Body != "4" {
		t.Fatalf("newest page: %+v", page)
	}
	var older []Message
	a.do("GET", fmt.Sprintf("%s?limit=2&before=%d", path, page[0].ID), nil, &older)
	if len(older) != 2 || older[0].Body != "1" || older[1].Body != "2" {
		t.Fatalf("older page: %+v", older)
	}

	if code := a.do("POST", path, map[string]string{"body": "   "}, nil); code != http.StatusBadRequest {
		t.Errorf("blank message: got %d, want 400", code)
	}
	if code := a.do("POST", path, map[string]string{"body": strings.Repeat("x", 4001)}, nil); code != http.StatusBadRequest {
		t.Errorf("long message: got %d, want 400", code)
	}
}

func TestCrossSiteRequestsRefused(t *testing.T) {
	ts := newTestServer(t)
	a := newClient(t, ts)
	a.register("alice")
	path := fmt.Sprintf("%s/api/channels/%d/messages", ts.URL, generalID(t, a))

	req, _ := http.NewRequest("POST", path, strings.NewReader(`{"body":"x"}`))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Origin", "https://evil.example")
	res, _ := a.http.Do(req)
	res.Body.Close()
	if res.StatusCode != http.StatusForbidden {
		t.Errorf("foreign origin: got %d, want 403", res.StatusCode)
	}

	// A plain HTML form post can't set a JSON content type.
	req, _ = http.NewRequest("POST", path, strings.NewReader(`body=x`))
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	res, _ = a.http.Do(req)
	res.Body.Close()
	if res.StatusCode != http.StatusUnsupportedMediaType {
		t.Errorf("form post: got %d, want 415", res.StatusCode)
	}
}

func TestLiveDelivery(t *testing.T) {
	ts := newTestServer(t)
	a, b := newClient(t, ts), newClient(t, ts)
	a.register("alice")
	b.register("bob")

	var private Channel
	a.do("POST", "/api/channels", map[string]string{"name": "private"}, &private)

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	wsURL := "ws" + strings.TrimPrefix(ts.URL, "http") + "/api/ws"
	conn, _, err := websocket.Dial(ctx, wsURL, &websocket.DialOptions{HTTPClient: b.http})
	if err != nil {
		t.Fatal(err)
	}
	defer conn.CloseNow()
	time.Sleep(50 * time.Millisecond) // let the server register the connection

	// Bob isn't in #private, so he must not receive this...
	a.do("POST", fmt.Sprintf("/api/channels/%d/messages", private.ID), map[string]string{"body": "secret"}, nil)
	// ...but he is in #general.
	a.do("POST", fmt.Sprintf("/api/channels/%d/messages", generalID(t, a)), map[string]string{"body": "hi bob"}, nil)

	_, data, err := conn.Read(ctx)
	if err != nil {
		t.Fatal(err)
	}
	var ev event
	json.Unmarshal(data, &ev)
	if ev.Type != "message" || ev.Message.Body != "hi bob" {
		t.Fatalf("first event bob got: %s", data)
	}

	if _, _, err := websocket.Dial(ctx, wsURL, nil); err == nil {
		t.Error("websocket without session should be refused")
	}
}

func TestInviteCode(t *testing.T) {
	store, err := OpenStore(filepath.Join(t.TempDir(), "test.db"))
	if err != nil {
		t.Fatal(err)
	}
	ts := httptest.NewServer(NewServer(store, Config{InviteCode: "let-me-in"}))
	t.Cleanup(func() { ts.Close(); store.Close() })

	c := newClient(t, ts)
	var cfg map[string]string
	c.do("GET", "/api/config", nil, &cfg)
	if cfg["signup"] != "invite" {
		t.Errorf("config signup = %q, want invite", cfg["signup"])
	}
	if code := c.do("POST", "/api/register", credentials{Username: "alice", Password: "correct-horse"}, nil); code != http.StatusForbidden {
		t.Errorf("no invite: got %d, want 403", code)
	}
	if code := c.do("POST", "/api/register", credentials{Username: "alice", Password: "correct-horse", Invite: "wrong"}, nil); code != http.StatusForbidden {
		t.Errorf("wrong invite: got %d, want 403", code)
	}
	if code := c.do("POST", "/api/register", credentials{Username: "alice", Password: "correct-horse", Invite: "let-me-in"}, nil); code != http.StatusCreated {
		t.Errorf("right invite: got %d, want 201", code)
	}
}

func TestLoginRateLimit(t *testing.T) {
	ts := newTestServer(t)
	c := newClient(t, ts)
	limited := false
	for range 15 {
		if c.do("POST", "/api/login", credentials{Username: "alice", Password: "guess-guess"}, nil) == http.StatusTooManyRequests {
			limited = true
			break
		}
	}
	if !limited {
		t.Error("15 rapid login attempts were never rate limited")
	}
}

func TestPostRateLimit(t *testing.T) {
	ts := newTestServer(t)
	a := newClient(t, ts)
	a.register("alice")
	path := fmt.Sprintf("/api/channels/%d/messages", generalID(t, a))
	limited := false
	for range 40 {
		if a.do("POST", path, map[string]string{"body": "spam"}, nil) == http.StatusTooManyRequests {
			limited = true
			break
		}
	}
	if !limited {
		t.Error("40 rapid posts were never rate limited")
	}
}

func TestClientIP(t *testing.T) {
	r := httptest.NewRequest("GET", "/", nil)
	r.RemoteAddr = "10.0.0.5:1234"
	r.Header.Set("X-Forwarded-For", "1.1.1.1, 203.0.113.7")
	if got := clientIP(r, false); got != "10.0.0.5" {
		t.Errorf("direct: got %s", got)
	}
	if got := clientIP(r, true); got != "203.0.113.7" {
		t.Errorf("behind proxy: got %s, want the proxy-appended last entry", got)
	}
}

func TestWebsocketConnectionCap(t *testing.T) {
	ts := newTestServer(t)
	a := newClient(t, ts)
	a.register("alice")
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	wsURL := "ws" + strings.TrimPrefix(ts.URL, "http") + "/api/ws"
	for i := range maxConnsPerUser {
		conn, _, err := websocket.Dial(ctx, wsURL, &websocket.DialOptions{HTTPClient: a.http})
		if err != nil {
			t.Fatalf("conn %d: %v", i, err)
		}
		defer conn.CloseNow()
	}
	if _, _, err := websocket.Dial(ctx, wsURL, &websocket.DialOptions{HTTPClient: a.http}); err == nil {
		t.Error("connection past the cap was accepted")
	}
}
