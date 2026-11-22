// Command yapserver is Yap's chat server: accounts, channels, message history
// and live updates over websockets, stored in a single SQLite file.
package main

import (
	"context"
	"errors"
	"flag"
	"log"
	"net/http"
	"os"
	"os/signal"
	"strconv"
	"strings"
	"syscall"
	"time"
)

func main() {
	defaultAddr := ":8080"
	if port := os.Getenv("PORT"); port != "" {
		defaultAddr = ":" + port
	}
	addr := flag.String("addr", defaultAddr, "address to listen on (default :$PORT or :8080)")
	dbPath := flag.String("db", envOr("YAP_DB", "yap.db"), "path to the SQLite database file (env YAP_DB)")
	secure := flag.Bool("secure-cookies", envBool("YAP_SECURE_COOKIES"), "mark session cookies Secure; set when serving over HTTPS (env YAP_SECURE_COOKIES)")
	behindProxy := flag.Bool("behind-proxy", envBool("YAP_BEHIND_PROXY"), "trust X-Forwarded-For from a reverse proxy for client IPs (env YAP_BEHIND_PROXY)")
	flag.Parse()
	// Read from the environment only, so it doesn't show up in process listings.
	invite := os.Getenv("YAP_INVITE_CODE")
	var admins []string
	if v := os.Getenv("YAP_ADMINS"); v != "" {
		admins = strings.Split(v, ",")
	}

	store, err := OpenStore(*dbPath)
	if err != nil {
		log.Fatalf("open database: %v", err)
	}
	defer store.Close()

	srv := &http.Server{
		Addr: *addr,
		Handler: NewServer(store, Config{SecureCookies: *secure, BehindProxy: *behindProxy, InviteCode: invite, Admins: admins,
			LiveKit: LiveKitConfig{
				URL:       os.Getenv("LIVEKIT_URL"),
				APIURL:    os.Getenv("LIVEKIT_API_URL"),
				APIKey:    os.Getenv("LIVEKIT_API_KEY"),
				APISecret: os.Getenv("LIVEKIT_API_SECRET"),
			}}),
		ReadHeaderTimeout: 10 * time.Second,
		IdleTimeout:       2 * time.Minute,
		MaxHeaderBytes:    64 << 10,
	}

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	go func() {
		t := time.NewTicker(time.Hour)
		defer t.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-t.C:
				if err := store.DeleteExpiredSessions(ctx); err != nil {
					log.Printf("clean sessions: %v", err)
				}
			}
		}
	}()

	go func() {
		signup := "open"
		if invite != "" {
			signup = "invite-only"
		}
		calls := "off"
		if os.Getenv("LIVEKIT_URL") != "" && os.Getenv("LIVEKIT_API_SECRET") != "" {
			calls = "on"
		}
		log.Printf("yap server listening on %s (database %s, sign-up %s, %d admins, calls %s)", *addr, *dbPath, signup, len(admins), calls)
		if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			log.Fatalf("listen: %v", err)
		}
	}()

	<-ctx.Done()
	shutdown, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	srv.Shutdown(shutdown)
}

func envOr(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}

func envBool(key string) bool {
	v, _ := strconv.ParseBool(os.Getenv(key))
	return v
}
