package main

import (
	"context"
	"errors"
	"net/http"
	"strconv"
	"unicode/utf8"
)

// maxReactionsPerUser caps how many different emoji one person can add to a
// single message.
const maxReactionsPerUser = 20

var errTooManyReactions = errors.New("too many reactions")

type Reactor struct {
	ID       int64  `json:"id"`
	Username string `json:"username"`
}

// Reaction is one emoji on a message and who added it, in the order they did.
type Reaction struct {
	Emoji string    `json:"emoji"`
	Users []Reactor `json:"users"`
}

// React adds or removes the user's emoji on a message in a channel they're in,
// and returns the message with its updated reactions.
func (s *Store) React(ctx context.Context, userID, messageID int64, emoji string, add bool) (Message, error) {
	m, err := s.GetMessage(ctx, messageID)
	if err != nil {
		return Message{}, err
	}
	if err := s.requireMember(ctx, userID, m.ChannelID); err != nil {
		return Message{}, err
	}
	if add {
		var n int
		if err := s.db.QueryRowContext(ctx,
			`SELECT COUNT(*) FROM reactions WHERE message_id = ? AND user_id = ? AND emoji != ?`,
			messageID, userID, emoji).Scan(&n); err != nil {
			return Message{}, err
		}
		if n >= maxReactionsPerUser {
			return Message{}, errTooManyReactions
		}
		_, err = s.db.ExecContext(ctx,
			`INSERT OR IGNORE INTO reactions (message_id, user_id, emoji, created_at) VALUES (?, ?, ?, ?)`,
			messageID, userID, emoji, now())
	} else {
		_, err = s.db.ExecContext(ctx,
			`DELETE FROM reactions WHERE message_id = ? AND user_id = ? AND emoji = ?`, messageID, userID, emoji)
	}
	if err != nil {
		return Message{}, err
	}
	msgs := []Message{m}
	if err := s.decorate(ctx, msgs); err != nil {
		return Message{}, err
	}
	return msgs[0], nil
}

func (s *Server) handleAddReaction(w http.ResponseWriter, r *http.Request, u User) {
	s.react(w, r, u, true)
}

func (s *Server) handleRemoveReaction(w http.ResponseWriter, r *http.Request, u User) {
	s.react(w, r, u, false)
}

func (s *Server) react(w http.ResponseWriter, r *http.Request, u User, add bool) {
	id, ok := pathIDOf(w, r, "message")
	if !ok {
		return
	}
	if !s.reactLimit.allow(strconv.FormatInt(u.ID, 10)) {
		writeError(w, http.StatusTooManyRequests, "you're reacting too quickly")
		return
	}
	var req struct {
		Emoji string `json:"emoji"`
	}
	if !readJSON(w, r, &req) {
		return
	}
	if !validEmoji(req.Emoji) {
		writeError(w, http.StatusBadRequest, "reactions must be a single emoji")
		return
	}
	m, err := s.store.React(r.Context(), u.ID, id, req.Emoji, add)
	if errors.Is(err, errTooManyReactions) {
		writeError(w, http.StatusBadRequest, "that's enough reactions on one message")
		return
	} else if err != nil {
		s.messageError(w, "react", err)
		return
	}
	// Send just what changed, so clients don't overwrite newer edits.
	update := Message{ID: m.ID, ChannelID: m.ChannelID, ParentID: m.ParentID, Reactions: m.Reactions}
	s.broadcastChannel(r.Context(), m.ChannelID, event{Type: "reactions", Message: &update})
	writeJSON(w, http.StatusOK, update)
}

// validEmoji accepts one emoji, including skin tones, flags, keycaps and
// sequences joined with ZWJ, and rejects ordinary text.
func validEmoji(s string) bool {
	if s == "" || len(s) > 64 || !utf8.ValidString(s) || utf8.RuneCountInString(s) > 16 {
		return false
	}
	pictograph := false
	for _, r := range s {
		switch {
		case r == 0x200D, r >= 0xFE00 && r <= 0xFE0F, r >= 0xE0020 && r <= 0xE007F:
			// joiner, variation selectors and tag characters (subdivision flags)
		case r >= '0' && r <= '9', r == '#', r == '*':
			// keycap bases, valid only with U+20E3
		case r == 0x20E3,
			r == 0xA9, r == 0xAE, r == 0x203C, r == 0x2049,
			r >= 0x2100 && r <= 0x2BFF, // letterlike symbols through misc symbols and arrows
			r == 0x3030, r == 0x303D, r == 0x3297, r == 0x3299,
			r >= 0x1F000 && r <= 0x1FAFF: // emoji blocks, including flags and skin tones
			pictograph = true
		default:
			return false
		}
	}
	return pictograph
}
