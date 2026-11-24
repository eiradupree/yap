package main

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
)

// Muting is private: each person's mutes are only ever sent to that person.
// Nobody is told they've been muted, and muting doesn't change what anyone
// else sees. The server stores the mutes; the client collapses muted people's
// messages and keeps muted people and channels out of unread counts and
// notifications.

var errMuteSelf = errors.New("you can't mute yourself")

// MutedUsers lists the people userID has muted, by name.
func (s *Store) MutedUsers(ctx context.Context, userID int64) ([]User, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT u.id, u.username FROM muted_users m JOIN users u ON u.id = m.muted_id
		WHERE m.user_id = ? ORDER BY u.username`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	users := []User{}
	for rows.Next() {
		var u User
		if err := rows.Scan(&u.ID, &u.Username); err != nil {
			return nil, err
		}
		users = append(users, u)
	}
	return users, rows.Err()
}

// SetUserMuted mutes or unmutes targetID for userID. Both are idempotent. It
// returns errNotFound if there's no such user.
func (s *Store) SetUserMuted(ctx context.Context, userID, targetID int64, muted bool) error {
	if userID == targetID {
		return errMuteSelf
	}
	if !muted {
		_, err := s.db.ExecContext(ctx, `DELETE FROM muted_users WHERE user_id = ? AND muted_id = ?`, userID, targetID)
		return err
	}
	res, err := s.db.ExecContext(ctx, `
		INSERT OR IGNORE INTO muted_users (user_id, muted_id, created_at)
		SELECT ?, id, ? FROM users WHERE id = ?`, userID, now(), targetID)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		var exists bool
		if err := s.db.QueryRowContext(ctx, `SELECT EXISTS(SELECT 1 FROM users WHERE id = ?)`, targetID).Scan(&exists); err != nil {
			return err
		}
		if !exists {
			return errNotFound
		}
	}
	return nil
}

// SetChannelMuted mutes or unmutes channelID for userID. Both are idempotent.
// It returns errNotFound if there's no such channel. A mute outlives leaving
// the channel, so it's still muted if they join again.
func (s *Store) SetChannelMuted(ctx context.Context, userID, channelID int64, muted bool) error {
	if !muted {
		_, err := s.db.ExecContext(ctx, `DELETE FROM muted_channels WHERE user_id = ? AND channel_id = ?`, userID, channelID)
		return err
	}
	res, err := s.db.ExecContext(ctx, `
		INSERT OR IGNORE INTO muted_channels (user_id, channel_id, created_at)
		SELECT ?, id, ? FROM channels WHERE id = ?`, userID, now(), channelID)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		if _, err := s.isMember(ctx, userID, channelID); err != nil {
			return err // errNotFound when there's no such channel
		}
	}
	return nil
}

func (s *Server) registerMutes() {
	s.mux.HandleFunc("GET /api/me/muted-users", s.auth(s.handleMutedUsers))
	s.mux.HandleFunc("PUT /api/me/muted-users/{id}", s.auth(s.handleMuteUser(true)))
	s.mux.HandleFunc("DELETE /api/me/muted-users/{id}", s.auth(s.handleMuteUser(false)))
	s.mux.HandleFunc("PUT /api/me/muted-channels/{id}", s.auth(s.handleMuteChannel(true)))
	s.mux.HandleFunc("DELETE /api/me/muted-channels/{id}", s.auth(s.handleMuteChannel(false)))
}

func (s *Server) handleMutedUsers(w http.ResponseWriter, r *http.Request, u User) {
	users, err := s.store.MutedUsers(r.Context(), u.ID)
	if err != nil {
		s.internal(w, "list muted users", err)
		return
	}
	writeJSON(w, http.StatusOK, users)
}

func (s *Server) handleMuteUser(muted bool) func(http.ResponseWriter, *http.Request, User) {
	return func(w http.ResponseWriter, r *http.Request, u User) {
		id, ok := pathIDOf(w, r, "user")
		if !ok {
			return
		}
		switch err := s.store.SetUserMuted(r.Context(), u.ID, id, muted); {
		case errors.Is(err, errMuteSelf):
			writeError(w, http.StatusBadRequest, err.Error())
			return
		case errors.Is(err, errNotFound):
			writeError(w, http.StatusNotFound, "user not found")
			return
		case err != nil:
			s.internal(w, "mute user", err)
			return
		}
		s.mutesChanged(u.ID)
		w.WriteHeader(http.StatusNoContent)
	}
}

func (s *Server) handleMuteChannel(muted bool) func(http.ResponseWriter, *http.Request, User) {
	return func(w http.ResponseWriter, r *http.Request, u User) {
		id, ok := pathIDOf(w, r, "channel")
		if !ok {
			return
		}
		if err := s.store.SetChannelMuted(r.Context(), u.ID, id, muted); err != nil {
			s.storeError(w, "mute channel", err)
			return
		}
		s.mutesChanged(u.ID)
		w.WriteHeader(http.StatusNoContent)
	}
}

// mutesChanged tells the person's other devices to reload their mutes. It
// goes to them alone, never to the person muted or the channel.
func (s *Server) mutesChanged(userID int64) {
	payload, _ := json.Marshal(event{Type: "mutes_changed"})
	s.hub.SendTo([]int64{userID}, payload)
}
