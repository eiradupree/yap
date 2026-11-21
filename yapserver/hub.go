package main

import (
	"sync"
)

// Hub tracks live websocket connections per user and fans events out to them.
type Hub struct {
	mu    sync.Mutex
	conns map[int64]map[*client]struct{}
}

type client struct {
	send chan []byte
}

func NewHub() *Hub {
	return &Hub{conns: make(map[int64]map[*client]struct{})}
}

// add registers a connection, or returns nil if the user already has max.
func (h *Hub) add(userID int64, max int) *client {
	c := &client{send: make(chan []byte, 64)}
	h.mu.Lock()
	defer h.mu.Unlock()
	if len(h.conns[userID]) >= max {
		return nil
	}
	if h.conns[userID] == nil {
		h.conns[userID] = make(map[*client]struct{})
	}
	h.conns[userID][c] = struct{}{}
	return c
}

func (h *Hub) remove(userID int64, c *client) {
	h.mu.Lock()
	defer h.mu.Unlock()
	delete(h.conns[userID], c)
	if len(h.conns[userID]) == 0 {
		delete(h.conns, userID)
	}
}

// SendTo delivers payload to every connection of the given users. A client
// whose buffer is full is skipped rather than blocking everyone else; it will
// catch up by refetching when it reconnects.
func (h *Hub) SendTo(userIDs []int64, payload []byte) {
	h.mu.Lock()
	defer h.mu.Unlock()
	for _, id := range userIDs {
		for c := range h.conns[id] {
			select {
			case c.send <- payload:
			default:
			}
		}
	}
}

// SendAll delivers payload to every connected user.
func (h *Hub) SendAll(payload []byte) {
	h.mu.Lock()
	defer h.mu.Unlock()
	for _, set := range h.conns {
		for c := range set {
			select {
			case c.send <- payload:
			default:
			}
		}
	}
}
