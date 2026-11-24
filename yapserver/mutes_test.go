package main

import (
	"fmt"
	"net/http"
	"testing"
)

func TestMutes(t *testing.T) {
	ts := newTestServer(t)
	a := newClient(t, ts)
	alice := a.register("alice")
	b := newClient(t, ts)
	bob := b.register("bob")
	general := generalID(t, a)

	aWS := dialWS(t, ts, a)
	bWS := dialWS(t, ts, b)

	// Alice mutes Bob. Only Alice's devices hear about it.
	if code := a.do("PUT", fmt.Sprintf("/api/me/muted-users/%d", bob.ID), struct{}{}, nil); code != http.StatusNoContent {
		t.Fatalf("mute bob: %d", code)
	}
	if ev := readEvent(t, aWS); ev.Type != "mutes_changed" {
		t.Errorf("alice's event: %+v", ev)
	}
	// Muting twice is fine.
	if code := a.do("PUT", fmt.Sprintf("/api/me/muted-users/%d", bob.ID), struct{}{}, nil); code != http.StatusNoContent {
		t.Errorf("mute bob again: %d", code)
	}
	readEvent(t, aWS)

	var muted []User
	a.do("GET", "/api/me/muted-users", nil, &muted)
	if len(muted) != 1 || muted[0].ID != bob.ID || muted[0].Username != "bob" {
		t.Errorf("alice's muted users: %+v", muted)
	}
	// Bob can't see Alice's mutes, and his own list is empty.
	b.do("GET", "/api/me/muted-users", nil, &muted)
	if len(muted) != 0 {
		t.Errorf("bob's muted users: %+v", muted)
	}

	// Bob's next event is his own message, not anything about the mute, and
	// Alice still gets his messages (the client collapses them).
	b.post(general, map[string]any{"body": "hello"})
	if ev := readEvent(t, bWS); ev.Type != "message" {
		t.Errorf("bob was told something: %+v", ev)
	}
	if ev := readEvent(t, aWS); ev.Type != "message" || ev.Message.UserID != bob.ID {
		t.Errorf("alice should still receive bob's message: %+v", ev)
	}

	// Mistakes.
	if code := a.do("PUT", fmt.Sprintf("/api/me/muted-users/%d", alice.ID), struct{}{}, nil); code != http.StatusBadRequest {
		t.Errorf("mute yourself: %d", code)
	}
	if code := a.do("PUT", "/api/me/muted-users/9999", struct{}{}, nil); code != http.StatusNotFound {
		t.Errorf("mute nobody: %d", code)
	}
	if code := a.do("PUT", "/api/me/muted-channels/9999", struct{}{}, nil); code != http.StatusNotFound {
		t.Errorf("mute no channel: %d", code)
	}
	if code := newClient(t, ts).do("PUT", fmt.Sprintf("/api/me/muted-users/%d", bob.ID), struct{}{}, nil); code != http.StatusUnauthorized {
		t.Errorf("mute while signed out: %d", code)
	}

	// Channels: muted shows only for the person who muted it.
	if code := a.do("PUT", fmt.Sprintf("/api/me/muted-channels/%d", general), struct{}{}, nil); code != http.StatusNoContent {
		t.Fatalf("mute #general: %d", code)
	}
	readEvent(t, aWS)
	mutedGeneral := func(c *testClient) bool {
		var chans []Channel
		c.do("GET", "/api/channels", nil, &chans)
		for _, ch := range chans {
			if ch.ID == general {
				return ch.Muted
			}
		}
		t.Fatal("no #general")
		return false
	}
	if !mutedGeneral(a) || mutedGeneral(b) {
		t.Errorf("muted #general: alice %v, bob %v", mutedGeneral(a), mutedGeneral(b))
	}

	// Unmuting.
	a.do("DELETE", fmt.Sprintf("/api/me/muted-channels/%d", general), struct{}{}, nil)
	if code := a.do("DELETE", fmt.Sprintf("/api/me/muted-users/%d", bob.ID), struct{}{}, nil); code != http.StatusNoContent {
		t.Errorf("unmute bob: %d", code)
	}
	a.do("GET", "/api/me/muted-users", nil, &muted)
	if len(muted) != 0 || mutedGeneral(a) {
		t.Errorf("after unmuting: users %+v, #general muted %v", muted, mutedGeneral(a))
	}

	// A deleted account drops out of the list.
	a.do("PUT", fmt.Sprintf("/api/me/muted-users/%d", bob.ID), struct{}{}, nil)
	b.do("DELETE", "/api/me", map[string]string{"password": "correct-horse"}, nil)
	a.do("GET", "/api/me/muted-users", nil, &muted)
	if len(muted) != 0 {
		t.Errorf("deleted account still muted: %+v", muted)
	}
}
