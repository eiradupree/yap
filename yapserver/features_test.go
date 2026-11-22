package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"testing"
)

// A 1x1 transparent GIF.
var tinyGIF = []byte("GIF89a\x01\x00\x01\x00\x80\x00\x00\x00\x00\x00\xff\xff\xff!\xf9\x04\x01\x00\x00\x00\x00,\x00\x00\x00\x00\x01\x00\x01\x00\x00\x02\x02D\x01\x00;")

func (c *testClient) upload(name string, data []byte, out *Attachment) int {
	c.t.Helper()
	req, _ := http.NewRequest("POST", c.base+"/api/uploads?name="+url.QueryEscape(name), bytes.NewReader(data))
	req.Header.Set("Content-Type", "application/octet-stream")
	req.Header.Set(uploadHeader, "1")
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

func (c *testClient) get(path string) (*http.Response, []byte) {
	c.t.Helper()
	res, err := c.http.Get(c.base + path)
	if err != nil {
		c.t.Fatal(err)
	}
	defer res.Body.Close()
	body, _ := io.ReadAll(res.Body)
	return res, body
}

func (c *testClient) post(channelID int64, body map[string]any) (Message, int) {
	c.t.Helper()
	var m Message
	code := c.do("POST", fmt.Sprintf("/api/channels/%d/messages", channelID), body, &m)
	return m, code
}

func TestAttachments(t *testing.T) {
	ts := newTestServer(t)
	a := newClient(t, ts)
	a.register("alice")
	b := newClient(t, ts)
	b.register("bob")
	general := generalID(t, a)

	var gif Attachment
	if code := a.upload("../../party.gif", tinyGIF, &gif); code != http.StatusCreated {
		t.Fatalf("upload: %d", code)
	}
	if gif.Name != "party.gif" || gif.ContentType != "image/gif" || gif.Size != int64(len(tinyGIF)) {
		t.Errorf("uploaded: %+v", gif)
	}
	// Before it's sent, only the uploader can see it.
	if res, _ := a.get(gif.URL); res.StatusCode != http.StatusOK {
		t.Errorf("uploader sees pending file: %d", res.StatusCode)
	}
	if res, _ := b.get(gif.URL); res.StatusCode != http.StatusNotFound {
		t.Errorf("others see pending file: %d, want 404", res.StatusCode)
	}
	// Nobody else can send it.
	if _, code := b.post(general, map[string]any{"attachment_ids": []int64{gif.ID}}); code != http.StatusBadRequest {
		t.Errorf("sending someone else's upload: %d, want 400", code)
	}

	m, code := a.post(general, map[string]any{"body": "", "attachment_ids": []int64{gif.ID}})
	if code != http.StatusCreated || len(m.Attachments) != 1 || m.Attachments[0].ID != gif.ID {
		t.Fatalf("post with only an attachment: %d %+v", code, m)
	}
	res, data := b.get(gif.URL)
	if res.StatusCode != http.StatusOK || !bytes.Equal(data, tinyGIF) || res.Header.Get("Content-Type") != "image/gif" ||
		!strings.HasPrefix(res.Header.Get("Content-Disposition"), "inline") {
		t.Errorf("member fetches gif: %d %q %q", res.StatusCode, res.Header.Get("Content-Type"), res.Header.Get("Content-Disposition"))
	}
	if _, code := a.post(general, map[string]any{"attachment_ids": []int64{gif.ID}}); code != http.StatusBadRequest {
		t.Errorf("reusing a sent attachment: %d, want 400", code)
	}
	var msgs []Message
	b.do("GET", fmt.Sprintf("/api/channels/%d/messages", general), nil, &msgs)
	if len(msgs) != 1 || len(msgs[0].Attachments) != 1 {
		t.Errorf("history includes attachments: %+v", msgs)
	}

	// Files in a channel are hidden from people who aren't in it.
	var secret Channel
	a.do("POST", "/api/channels", map[string]string{"name": "secret"}, &secret)
	var doc Attachment
	a.upload("notes.txt", []byte("hello"), &doc)
	a.post(secret.ID, map[string]any{"body": "notes", "attachment_ids": []int64{doc.ID}})
	if res, _ := b.get(doc.URL); res.StatusCode != http.StatusNotFound {
		t.Errorf("non-member fetches file: %d, want 404", res.StatusCode)
	}

	// HTML and SVG are downloads, never rendered in the page.
	for name, body := range map[string]string{
		"evil.html": "<html><script>alert(1)</script></html>",
		"evil.svg":  `<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>`,
		"fake.gif":  "<html><script>alert(1)</script></html>", // lies about being an image
	} {
		var f Attachment
		a.upload(name, []byte(body), &f)
		res, _ := a.get(f.URL)
		if res.Header.Get("Content-Type") != "application/octet-stream" ||
			!strings.HasPrefix(res.Header.Get("Content-Disposition"), "attachment") ||
			!strings.Contains(res.Header.Get("Content-Security-Policy"), "sandbox") {
			t.Errorf("%s served as %q, %q", name, res.Header.Get("Content-Type"), res.Header.Get("Content-Disposition"))
		}
	}

	// Uploads need the raw content type and the custom header.
	req, _ := http.NewRequest("POST", ts.URL+"/api/uploads?name=x.txt", strings.NewReader("hi"))
	req.Header.Set("Content-Type", "text/plain")
	if res, _ := a.http.Do(req); res.StatusCode != http.StatusUnsupportedMediaType {
		t.Errorf("form-style upload: %d, want 415", res.StatusCode)
	}
	if code := a.upload("big.bin", make([]byte, maxUploadBytes+1), nil); code != http.StatusRequestEntityTooLarge {
		t.Errorf("oversized upload: %d, want 413", code)
	}
	if _, code := a.post(general, map[string]any{"body": "  "}); code != http.StatusBadRequest {
		t.Errorf("empty message without attachments: %d, want 400", code)
	}

	// Unsent uploads can be discarded.
	var pending Attachment
	a.upload("oops.txt", []byte("oops"), &pending)
	if code := b.do("DELETE", fmt.Sprintf("/api/uploads/%d", pending.ID), struct{}{}, nil); code != http.StatusNotFound {
		t.Errorf("deleting someone else's upload: %d, want 404", code)
	}
	if code := a.do("DELETE", fmt.Sprintf("/api/uploads/%d", pending.ID), struct{}{}, nil); code != http.StatusNoContent {
		t.Errorf("deleting own upload: %d", code)
	}
}

func TestThreads(t *testing.T) {
	ts := newTestServer(t)
	a := newClient(t, ts)
	alice := a.register("alice")
	b := newClient(t, ts)
	b.register("bob")
	general := generalID(t, a)
	conn := dialWS(t, ts, a)

	root, _ := a.post(general, map[string]any{"body": "lunch?"})
	readEvent(t, conn)
	reply, code := b.post(general, map[string]any{"body": "yes", "parent_id": root.ID})
	if code != http.StatusCreated || reply.ParentID != root.ID || reply.ParentUserID != alice.ID {
		t.Fatalf("reply: %d %+v", code, reply)
	}
	if ev := readEvent(t, conn); ev.Type != "message" || ev.Message.ParentID != root.ID {
		t.Errorf("reply event: %+v", ev)
	}

	var msgs []Message
	a.do("GET", fmt.Sprintf("/api/channels/%d/messages", general), nil, &msgs)
	if len(msgs) != 1 || msgs[0].ID != root.ID || msgs[0].ReplyCount != 1 || msgs[0].LastReplyAt == 0 {
		t.Fatalf("channel shows only the thread start, with a count: %+v", msgs)
	}

	var thread struct {
		Parent  Message   `json:"parent"`
		Replies []Message `json:"replies"`
	}
	for _, id := range []int64{root.ID, reply.ID} { // either ID finds the thread
		thread.Replies = nil
		if code := a.do("GET", fmt.Sprintf("/api/messages/%d/thread", id), nil, &thread); code != http.StatusOK ||
			thread.Parent.ID != root.ID || len(thread.Replies) != 1 || thread.Replies[0].Body != "yes" {
			t.Errorf("thread via %d: %d %+v", id, code, thread)
		}
	}

	if _, code := a.post(general, map[string]any{"body": "nested", "parent_id": reply.ID}); code != http.StatusBadRequest {
		t.Errorf("reply to a reply: %d, want 400", code)
	}
	var other Channel
	a.do("POST", "/api/channels", map[string]string{"name": "other"}, &other)
	if _, code := a.post(other.ID, map[string]any{"body": "x", "parent_id": root.ID}); code != http.StatusBadRequest {
		t.Errorf("reply from another channel: %d, want 400", code)
	}
	if code := newClient(t, ts).do("GET", fmt.Sprintf("/api/messages/%d/thread", root.ID), nil, nil); code != http.StatusUnauthorized {
		t.Errorf("thread signed out: %d", code)
	}
	b.do("POST", fmt.Sprintf("/api/channels/%d/leave", general), struct{}{}, nil)
	if code := b.do("GET", fmt.Sprintf("/api/messages/%d/thread", root.ID), nil, nil); code != http.StatusForbidden {
		t.Errorf("thread after leaving: %d, want 403", code)
	}

	// Deleting the first message deletes its thread.
	a.do("DELETE", fmt.Sprintf("/api/messages/%d", root.ID), struct{}{}, nil)
	if code := a.do("GET", fmt.Sprintf("/api/messages/%d/thread", reply.ID), nil, nil); code != http.StatusNotFound {
		t.Errorf("reply after its thread was deleted: %d, want 404", code)
	}
}

func TestReactions(t *testing.T) {
	ts := newTestServer(t)
	a := newClient(t, ts)
	a.register("alice")
	b := newClient(t, ts)
	bob := b.register("bob")
	general := generalID(t, a)
	m, _ := a.post(general, map[string]any{"body": "shipped it"})
	conn := dialWS(t, ts, a)
	path := fmt.Sprintf("/api/messages/%d/reactions", m.ID)

	var got Message
	for range 2 { // adding twice is the same as once
		if code := b.do("POST", path, map[string]string{"emoji": "🎉"}, &got); code != http.StatusOK {
			t.Fatalf("react: %d", code)
		}
	}
	a.do("POST", path, map[string]string{"emoji": "🎉"}, nil)
	a.do("POST", path, map[string]string{"emoji": "👍🏽"}, &got)
	if len(got.Reactions) != 2 || got.Reactions[0].Emoji != "🎉" || len(got.Reactions[0].Users) != 2 ||
		got.Reactions[0].Users[0].ID != bob.ID || got.Reactions[1].Emoji != "👍🏽" {
		t.Fatalf("reactions: %+v", got.Reactions)
	}
	if ev := readEvent(t, conn); ev.Type != "reactions" || ev.Message.ID != m.ID || len(ev.Message.Reactions) != 1 {
		t.Errorf("reaction event: %+v", ev)
	}

	b.do("DELETE", path, map[string]string{"emoji": "🎉"}, &got)
	if len(got.Reactions[0].Users) != 1 {
		t.Errorf("after removing: %+v", got.Reactions)
	}
	var msgs []Message
	a.do("GET", fmt.Sprintf("/api/channels/%d/messages", general), nil, &msgs)
	if len(msgs[0].Reactions) != 2 {
		t.Errorf("history includes reactions: %+v", msgs[0].Reactions)
	}

	for _, bad := range []string{"", "lol", "<b>", "🎉 nice", strings.Repeat("🎉", 20), "1"} {
		if code := a.do("POST", path, map[string]string{"emoji": bad}, nil); code != http.StatusBadRequest {
			t.Errorf("emoji %q: %d, want 400", bad, code)
		}
	}
	b.do("POST", fmt.Sprintf("/api/channels/%d/leave", general), struct{}{}, nil)
	if code := b.do("POST", path, map[string]string{"emoji": "👍"}, nil); code != http.StatusForbidden {
		t.Errorf("react after leaving: %d, want 403", code)
	}
}

func TestValidEmoji(t *testing.T) {
	for _, ok := range []string{"👍", "❤️", "👍🏾", "🇺🇸", "👩‍💻", "👨‍👩‍👧", "1️⃣", "🏴󠁧󠁢󠁳󠁣󠁴󠁿", "✅", "☕"} {
		if !validEmoji(ok) {
			t.Errorf("rejected %q", ok)
		}
	}
	for _, bad := range []string{"a", "1", "#", "‍", "️", "hi👍", "👍\n"} {
		if validEmoji(bad) {
			t.Errorf("accepted %q", bad)
		}
	}
}

func TestCleanFileName(t *testing.T) {
	for in, want := range map[string]string{
		"photo.jpg":                       "photo.jpg",
		"../../etc/passwd":                "passwd",
		`C:\Users\me\cat.png`:             "cat.png",
		"bad\x00\nname.txt":               "badname.txt",
		"invoice\u202egnp.exe":            "invoicegnp.exe", // right-to-left override
		"":                                "file",
		"..":                              "file",
		strings.Repeat("a", 300) + ".pdf": strings.Repeat("a", 196) + ".pdf",
	} {
		if got := cleanFileName(in); got != want {
			t.Errorf("cleanFileName(%q) = %q, want %q", in, got, want)
		}
	}
}
