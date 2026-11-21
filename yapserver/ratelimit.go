package main

import (
	"net"
	"net/http"
	"strings"
	"sync"
	"time"
)

// limiter is a token bucket per key (an IP address or user ID). Each key
// starts with burst tokens and regains one every interval.
type limiter struct {
	mu       sync.Mutex
	interval time.Duration
	burst    float64
	buckets  map[string]*bucket
	lastGC   time.Time
}

type bucket struct {
	tokens float64
	last   time.Time
}

func newLimiter(interval time.Duration, burst int) *limiter {
	return &limiter{interval: interval, burst: float64(burst), buckets: make(map[string]*bucket), lastGC: time.Now()}
}

func (l *limiter) allow(key string) bool {
	l.mu.Lock()
	defer l.mu.Unlock()
	now := time.Now()
	l.gc(now)
	b, ok := l.buckets[key]
	if !ok {
		b = &bucket{tokens: l.burst, last: now}
		l.buckets[key] = b
	}
	b.tokens = min(l.burst, b.tokens+float64(now.Sub(b.last))/float64(l.interval))
	b.last = now
	if b.tokens < 1 {
		return false
	}
	b.tokens--
	return true
}

// gc drops buckets that have refilled completely, so idle keys don't pile up.
func (l *limiter) gc(now time.Time) {
	if now.Sub(l.lastGC) < time.Minute {
		return
	}
	l.lastGC = now
	full := time.Duration(l.burst) * l.interval
	for k, b := range l.buckets {
		if now.Sub(b.last) > full {
			delete(l.buckets, k)
		}
	}
}

// clientIP returns the caller's address. Behind a reverse proxy, the proxy
// appends the real client address as the last X-Forwarded-For entry; earlier
// entries come from the client and can't be trusted.
func clientIP(r *http.Request, behindProxy bool) string {
	if behindProxy {
		if xff := r.Header.Get("X-Forwarded-For"); xff != "" {
			parts := strings.Split(xff, ",")
			if ip := strings.TrimSpace(parts[len(parts)-1]); ip != "" {
				return ip
			}
		}
	}
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return r.RemoteAddr
	}
	return host
}
