package main

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"errors"
	"fmt"
	"slices"
	"strings"
	"time"

	"golang.org/x/crypto/bcrypt"
	_ "modernc.org/sqlite"
)

var (
	errNotFound   = errors.New("not found")
	errTaken      = errors.New("already taken")
	errBadLogin   = errors.New("invalid username or password")
	errNotMember  = errors.New("not a channel member")
	errForbidden  = errors.New("not allowed")
	errBanned     = errors.New("this account has been suspended")
	errBadParent  = errors.New("can't reply to that message")
	errBadFile    = errors.New("attachment not found")
	sessionMaxAge = 30 * 24 * time.Hour
)

// A precomputed hash so a login for an unknown user costs the same as a real one.
var dummyHash, _ = bcrypt.GenerateFromPassword([]byte("not-a-real-password"), bcrypt.DefaultCost)

type User struct {
	ID       int64  `json:"id"`
	Username string `json:"username"`
	Admin    bool   `json:"admin,omitempty"`

	session string // hash of the session token this request used
}

// AccountInfo is what admins see in the member list.
type AccountInfo struct {
	ID        int64  `json:"id"`
	Username  string `json:"username"`
	CreatedAt int64  `json:"created_at"`
	Banned    bool   `json:"banned"`
	Admin     bool   `json:"admin"`
}

type Channel struct {
	ID     int64  `json:"id"`
	Name   string `json:"name"`
	Joined bool   `json:"joined"`
}

type Message struct {
	ID        int64  `json:"id"`
	ChannelID int64  `json:"channel_id"`
	UserID    int64  `json:"user_id"`
	Username  string `json:"username"`
	Body      string `json:"body"`
	CreatedAt int64  `json:"created_at"` // unix milliseconds
	EditedAt  int64  `json:"edited_at,omitempty"`

	// ParentID is the thread a reply belongs to; 0 for channel messages.
	ParentID int64 `json:"parent_id,omitempty"`
	// ParentUserID is the thread starter, so clients can notify them of replies.
	ParentUserID int64 `json:"parent_user_id,omitempty"`
	ReplyCount   int   `json:"reply_count,omitempty"`
	LastReplyAt  int64 `json:"last_reply_at,omitempty"`

	Attachments []Attachment `json:"attachments,omitempty"`
	Reactions   []Reaction   `json:"reactions,omitempty"`
}

// messageCols selects a Message for scanMessage; it needs "m" joined to users "u".
const messageCols = `m.id, m.channel_id, m.user_id, u.username, m.body, m.created_at,
	COALESCE(m.edited_at, 0), COALESCE(m.parent_id, 0)`

type scanner interface{ Scan(...any) error }

func scanMessage(row scanner) (Message, error) {
	var m Message
	err := row.Scan(&m.ID, &m.ChannelID, &m.UserID, &m.Username, &m.Body, &m.CreatedAt, &m.EditedAt, &m.ParentID)
	return m, err
}

type Store struct {
	db *sql.DB
}

const schema = `
PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS users (
	id            INTEGER PRIMARY KEY,
	username      TEXT NOT NULL UNIQUE COLLATE NOCASE,
	password_hash BLOB NOT NULL,
	created_at    INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
	token_hash TEXT PRIMARY KEY,
	user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
	expires_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS channels (
	id         INTEGER PRIMARY KEY,
	name       TEXT NOT NULL UNIQUE COLLATE NOCASE,
	created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
	created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS members (
	channel_id INTEGER NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
	user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
	PRIMARY KEY (channel_id, user_id)
);
CREATE TABLE IF NOT EXISTS messages (
	id         INTEGER PRIMARY KEY,
	channel_id INTEGER NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
	user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
	body       TEXT NOT NULL,
	created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS messages_channel ON messages(channel_id, id);
CREATE INDEX IF NOT EXISTS members_user ON members(user_id);
CREATE INDEX IF NOT EXISTS sessions_expiry ON sessions(expires_at);
INSERT OR IGNORE INTO channels (name, created_at) VALUES ('general', unixepoch() * 1000);
`

func OpenStore(path string) (*Store, error) {
	// _pragma applies to every pooled connection, not just the first.
	dsn := "file:" + path + "?_pragma=foreign_keys(1)&_pragma=journal_mode(WAL)&_pragma=busy_timeout(5000)&_pragma=synchronous(NORMAL)"
	db, err := sql.Open("sqlite", dsn)
	if err != nil {
		return nil, err
	}
	if _, err := db.Exec(schema); err != nil {
		db.Close()
		return nil, err
	}
	if err := migrate(db); err != nil {
		db.Close()
		return nil, err
	}
	return &Store{db: db}, nil
}

// migrations upgrade existing databases. Each runs once, in order, and the
// database's user_version records how many have run. Only ever append.
var migrations = []string{
	`ALTER TABLE users ADD COLUMN banned_at INTEGER;
	 ALTER TABLE messages ADD COLUMN edited_at INTEGER;
	 CREATE INDEX IF NOT EXISTS messages_user ON messages(user_id);`,

	// Threads, emoji reactions and attachments.
	`ALTER TABLE messages ADD COLUMN parent_id INTEGER REFERENCES messages(id) ON DELETE CASCADE;
	 CREATE INDEX messages_parent ON messages(parent_id, id);
	 CREATE TABLE reactions (
		message_id INTEGER NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
		user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
		emoji      TEXT NOT NULL,
		created_at INTEGER NOT NULL,
		PRIMARY KEY (message_id, user_id, emoji)
	 );
	 CREATE TABLE attachments (
		id           INTEGER PRIMARY KEY,
		message_id   INTEGER REFERENCES messages(id) ON DELETE CASCADE, -- NULL until sent
		uploader_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
		name         TEXT NOT NULL,
		content_type TEXT NOT NULL,
		size         INTEGER NOT NULL,
		data         BLOB NOT NULL,
		created_at   INTEGER NOT NULL
	 );
	 CREATE INDEX attachments_message ON attachments(message_id);
	 CREATE INDEX attachments_pending ON attachments(created_at) WHERE message_id IS NULL;`,
}

func migrate(db *sql.DB) error {
	var version int
	if err := db.QueryRow(`PRAGMA user_version`).Scan(&version); err != nil {
		return err
	}
	for i := version; i < len(migrations); i++ {
		tx, err := db.Begin()
		if err != nil {
			return err
		}
		if _, err := tx.Exec(migrations[i]); err != nil {
			tx.Rollback()
			return fmt.Errorf("migration %d: %w", i+1, err)
		}
		if _, err := tx.Exec(fmt.Sprintf(`PRAGMA user_version = %d`, i+1)); err != nil {
			tx.Rollback()
			return err
		}
		if err := tx.Commit(); err != nil {
			return err
		}
	}
	return nil
}

func (s *Store) Close() error { return s.db.Close() }

func now() int64 { return time.Now().UnixMilli() }

func isUnique(err error) bool {
	return err != nil && strings.Contains(err.Error(), "UNIQUE constraint failed")
}

func hashToken(token string) string {
	sum := sha256.Sum256([]byte(token))
	return hex.EncodeToString(sum[:])
}

// CreateUser registers a user and adds them to #general.
func (s *Store) CreateUser(ctx context.Context, username, password string) (User, error) {
	hash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		return User{}, err
	}
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return User{}, err
	}
	defer tx.Rollback()
	res, err := tx.ExecContext(ctx,
		`INSERT INTO users (username, password_hash, created_at) VALUES (?, ?, ?)`,
		username, hash, now())
	if isUnique(err) {
		return User{}, errTaken
	} else if err != nil {
		return User{}, err
	}
	id, _ := res.LastInsertId()
	if _, err := tx.ExecContext(ctx,
		`INSERT INTO members (channel_id, user_id) SELECT id, ? FROM channels WHERE name = 'general'`, id); err != nil {
		return User{}, err
	}
	return User{ID: id, Username: username}, tx.Commit()
}

func (s *Store) CheckPassword(ctx context.Context, username, password string) (User, error) {
	var u User
	var hash []byte
	var banned bool
	err := s.db.QueryRowContext(ctx,
		`SELECT id, username, password_hash, banned_at IS NOT NULL FROM users WHERE username = ?`, username).
		Scan(&u.ID, &u.Username, &hash, &banned)
	if errors.Is(err, sql.ErrNoRows) {
		bcrypt.CompareHashAndPassword(dummyHash, []byte(password))
		return User{}, errBadLogin
	} else if err != nil {
		return User{}, err
	}
	if bcrypt.CompareHashAndPassword(hash, []byte(password)) != nil {
		return User{}, errBadLogin
	}
	// Only said after the right password, so it doesn't reveal who is banned.
	if banned {
		return User{}, errBanned
	}
	return u, nil
}

// VerifyPassword checks the password of a signed-in user.
func (s *Store) VerifyPassword(ctx context.Context, userID int64, password string) error {
	var hash []byte
	err := s.db.QueryRowContext(ctx, `SELECT password_hash FROM users WHERE id = ?`, userID).Scan(&hash)
	if errors.Is(err, sql.ErrNoRows) {
		return errNotFound
	} else if err != nil {
		return err
	}
	if bcrypt.CompareHashAndPassword(hash, []byte(password)) != nil {
		return errBadLogin
	}
	return nil
}

// ChangePassword sets a new password and signs out every other session.
func (s *Store) ChangePassword(ctx context.Context, u User, password string) error {
	hash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		return err
	}
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	if _, err := tx.ExecContext(ctx, `UPDATE users SET password_hash = ? WHERE id = ?`, hash, u.ID); err != nil {
		return err
	}
	if _, err := tx.ExecContext(ctx,
		`DELETE FROM sessions WHERE user_id = ? AND token_hash != ?`, u.ID, u.session); err != nil {
		return err
	}
	return tx.Commit()
}

// DeleteUser removes an account with its sessions, memberships and messages.
func (s *Store) DeleteUser(ctx context.Context, userID int64) error {
	_, err := s.db.ExecContext(ctx, `DELETE FROM users WHERE id = ?`, userID)
	return err
}

func (s *Store) GetUser(ctx context.Context, userID int64) (User, error) {
	var u User
	err := s.db.QueryRowContext(ctx, `SELECT id, username FROM users WHERE id = ?`, userID).Scan(&u.ID, &u.Username)
	if errors.Is(err, sql.ErrNoRows) {
		return User{}, errNotFound
	}
	return u, err
}

func (s *Store) ListUsers(ctx context.Context) ([]AccountInfo, error) {
	rows, err := s.db.QueryContext(ctx,
		`SELECT id, username, created_at, banned_at IS NOT NULL FROM users ORDER BY username`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	users := []AccountInfo{}
	for rows.Next() {
		var a AccountInfo
		if err := rows.Scan(&a.ID, &a.Username, &a.CreatedAt, &a.Banned); err != nil {
			return nil, err
		}
		users = append(users, a)
	}
	return users, rows.Err()
}

// SetBanned bans or unbans a user. Banning signs them out everywhere and,
// with purge, deletes everything they've posted.
func (s *Store) SetBanned(ctx context.Context, userID int64, banned, purge bool) error {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	var res sql.Result
	if banned {
		res, err = tx.ExecContext(ctx,
			`UPDATE users SET banned_at = COALESCE(banned_at, ?) WHERE id = ?`, now(), userID)
	} else {
		res, err = tx.ExecContext(ctx, `UPDATE users SET banned_at = NULL WHERE id = ?`, userID)
	}
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return errNotFound
	}
	if banned {
		if _, err := tx.ExecContext(ctx, `DELETE FROM sessions WHERE user_id = ?`, userID); err != nil {
			return err
		}
	}
	if banned && purge {
		if _, err := tx.ExecContext(ctx, `DELETE FROM messages WHERE user_id = ?`, userID); err != nil {
			return err
		}
	}
	return tx.Commit()
}

// CreateSession returns a new random token; only its hash is stored.
func (s *Store) CreateSession(ctx context.Context, userID int64) (string, error) {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	token := hex.EncodeToString(b)
	_, err := s.db.ExecContext(ctx,
		`INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)`,
		hashToken(token), userID, time.Now().Add(sessionMaxAge).UnixMilli())
	return token, err
}

func (s *Store) SessionUser(ctx context.Context, token string) (User, error) {
	u := User{session: hashToken(token)}
	err := s.db.QueryRowContext(ctx, `
		SELECT u.id, u.username FROM sessions s JOIN users u ON u.id = s.user_id
		WHERE s.token_hash = ? AND s.expires_at > ? AND u.banned_at IS NULL`, u.session, now()).
		Scan(&u.ID, &u.Username)
	if errors.Is(err, sql.ErrNoRows) {
		return User{}, errNotFound
	}
	return u, err
}

func (s *Store) DeleteSession(ctx context.Context, token string) error {
	_, err := s.db.ExecContext(ctx, `DELETE FROM sessions WHERE token_hash = ?`, hashToken(token))
	return err
}

func (s *Store) DeleteExpiredSessions(ctx context.Context) error {
	_, err := s.db.ExecContext(ctx, `DELETE FROM sessions WHERE expires_at <= ?`, now())
	return err
}

func (s *Store) ListChannels(ctx context.Context, userID int64) ([]Channel, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT c.id, c.name, m.user_id IS NOT NULL
		FROM channels c LEFT JOIN members m ON m.channel_id = c.id AND m.user_id = ?
		ORDER BY c.name`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	chans := []Channel{}
	for rows.Next() {
		var c Channel
		if err := rows.Scan(&c.ID, &c.Name, &c.Joined); err != nil {
			return nil, err
		}
		chans = append(chans, c)
	}
	return chans, rows.Err()
}

func (s *Store) CreateChannel(ctx context.Context, userID int64, name string) (Channel, error) {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return Channel{}, err
	}
	defer tx.Rollback()
	res, err := tx.ExecContext(ctx,
		`INSERT INTO channels (name, created_by, created_at) VALUES (?, ?, ?)`, name, userID, now())
	if isUnique(err) {
		return Channel{}, errTaken
	} else if err != nil {
		return Channel{}, err
	}
	id, _ := res.LastInsertId()
	if _, err := tx.ExecContext(ctx,
		`INSERT INTO members (channel_id, user_id) VALUES (?, ?)`, id, userID); err != nil {
		return Channel{}, err
	}
	return Channel{ID: id, Name: name, Joined: true}, tx.Commit()
}

func (s *Store) JoinChannel(ctx context.Context, userID, channelID int64) error {
	res, err := s.db.ExecContext(ctx,
		`INSERT OR IGNORE INTO members (channel_id, user_id) SELECT id, ? FROM channels WHERE id = ?`,
		userID, channelID)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		// Either already a member or no such channel.
		if _, err := s.isMember(ctx, userID, channelID); err != nil {
			return err
		}
	}
	return nil
}

func (s *Store) LeaveChannel(ctx context.Context, userID, channelID int64) error {
	_, err := s.db.ExecContext(ctx,
		`DELETE FROM members WHERE channel_id = ? AND user_id = ?`, channelID, userID)
	return err
}

// isMember returns errNotFound if the channel doesn't exist.
func (s *Store) isMember(ctx context.Context, userID, channelID int64) (bool, error) {
	var exists, member bool
	err := s.db.QueryRowContext(ctx, `
		SELECT EXISTS(SELECT 1 FROM channels WHERE id = ?),
		       EXISTS(SELECT 1 FROM members WHERE channel_id = ? AND user_id = ?)`,
		channelID, channelID, userID).Scan(&exists, &member)
	if err != nil {
		return false, err
	}
	if !exists {
		return false, errNotFound
	}
	return member, nil
}

func (s *Store) requireMember(ctx context.Context, userID, channelID int64) error {
	ok, err := s.isMember(ctx, userID, channelID)
	if err != nil {
		return err
	}
	if !ok {
		return errNotMember
	}
	return nil
}

// Messages returns up to limit messages older than before (0 = newest), oldest first.
func (s *Store) Messages(ctx context.Context, userID, channelID, before int64, limit int) ([]Message, error) {
	if err := s.requireMember(ctx, userID, channelID); err != nil {
		return nil, err
	}
	if before <= 0 {
		before = 1<<63 - 1
	}
	msgs, err := s.queryMessages(ctx, `
		SELECT `+messageCols+`
		FROM messages m JOIN users u ON u.id = m.user_id
		WHERE m.channel_id = ? AND m.parent_id IS NULL AND m.id < ?
		ORDER BY m.id DESC LIMIT ?`, channelID, before, limit)
	if err != nil {
		return nil, err
	}
	for i, j := 0, len(msgs)-1; i < j; i, j = i+1, j-1 {
		msgs[i], msgs[j] = msgs[j], msgs[i]
	}
	return msgs, s.decorate(ctx, msgs)
}

func (s *Store) queryMessages(ctx context.Context, query string, args ...any) ([]Message, error) {
	rows, err := s.db.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	msgs := []Message{}
	for rows.Next() {
		m, err := scanMessage(rows)
		if err != nil {
			return nil, err
		}
		msgs = append(msgs, m)
	}
	return msgs, rows.Err()
}

// Thread returns a thread's first message and all its replies, oldest first.
// Given a reply's ID, it returns the thread that reply is in.
func (s *Store) Thread(ctx context.Context, userID, id int64) (Message, []Message, error) {
	parent, err := s.GetMessage(ctx, id)
	if err != nil {
		return Message{}, nil, err
	}
	if parent.ParentID != 0 {
		if parent, err = s.GetMessage(ctx, parent.ParentID); err != nil {
			return Message{}, nil, err
		}
	}
	if err := s.requireMember(ctx, userID, parent.ChannelID); err != nil {
		return Message{}, nil, err
	}
	replies, err := s.queryMessages(ctx, `
		SELECT `+messageCols+`
		FROM messages m JOIN users u ON u.id = m.user_id
		WHERE m.parent_id = ? ORDER BY m.id LIMIT ?`, parent.ID, maxThreadReplies)
	if err != nil {
		return Message{}, nil, err
	}
	all := append([]Message{parent}, replies...)
	if err := s.decorate(ctx, all); err != nil {
		return Message{}, nil, err
	}
	return all[0], all[1:], nil
}

const maxThreadReplies = 1000

// decorate fills in each message's reply count, attachments and reactions.
func (s *Store) decorate(ctx context.Context, msgs []Message) error {
	if len(msgs) == 0 {
		return nil
	}
	byID := make(map[int64]*Message, len(msgs))
	ids := make([]any, len(msgs))
	for i := range msgs {
		byID[msgs[i].ID] = &msgs[i]
		ids[i] = msgs[i].ID
	}
	in := "(" + strings.TrimSuffix(strings.Repeat("?,", len(ids)), ",") + ")"

	rows, err := s.db.QueryContext(ctx, `
		SELECT parent_id, COUNT(*), MAX(created_at) FROM messages
		WHERE parent_id IN `+in+` GROUP BY parent_id`, ids...)
	if err != nil {
		return err
	}
	for rows.Next() {
		var id, last int64
		var n int
		if err := rows.Scan(&id, &n, &last); err != nil {
			rows.Close()
			return err
		}
		byID[id].ReplyCount, byID[id].LastReplyAt = n, last
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return err
	}

	rows, err = s.db.QueryContext(ctx, `
		SELECT id, message_id, name, content_type, size FROM attachments
		WHERE message_id IN `+in+` ORDER BY id`, ids...)
	if err != nil {
		return err
	}
	for rows.Next() {
		var a Attachment
		var msgID int64
		if err := rows.Scan(&a.ID, &msgID, &a.Name, &a.ContentType, &a.Size); err != nil {
			rows.Close()
			return err
		}
		a.setURL()
		byID[msgID].Attachments = append(byID[msgID].Attachments, a)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return err
	}

	rows, err = s.db.QueryContext(ctx, `
		SELECT r.message_id, r.emoji, u.id, u.username
		FROM reactions r JOIN users u ON u.id = r.user_id
		WHERE r.message_id IN `+in+` ORDER BY r.created_at, r.rowid`, ids...)
	if err != nil {
		return err
	}
	defer rows.Close()
	for rows.Next() {
		var msgID int64
		var emoji string
		var who Reactor
		if err := rows.Scan(&msgID, &emoji, &who.ID, &who.Username); err != nil {
			return err
		}
		m := byID[msgID]
		i := slices.IndexFunc(m.Reactions, func(r Reaction) bool { return r.Emoji == emoji })
		if i < 0 {
			m.Reactions = append(m.Reactions, Reaction{Emoji: emoji})
			i = len(m.Reactions) - 1
		}
		m.Reactions[i].Users = append(m.Reactions[i].Users, who)
	}
	return rows.Err()
}

// NewMessage is what a user sends: text, attachments they uploaded, or both,
// optionally as a reply in the thread started by ParentID.
type NewMessage struct {
	Body          string
	ParentID      int64
	AttachmentIDs []int64
}

func (s *Store) PostMessage(ctx context.Context, user User, channelID int64, nm NewMessage) (Message, error) {
	if err := s.requireMember(ctx, user.ID, channelID); err != nil {
		return Message{}, err
	}
	m := Message{ChannelID: channelID, UserID: user.ID, Username: user.Username, Body: nm.Body, CreatedAt: now()}
	if nm.ParentID != 0 {
		parent, err := s.GetMessage(ctx, nm.ParentID)
		// Threads are one level deep, and stay in their channel.
		if errors.Is(err, errNotFound) || err == nil && (parent.ChannelID != channelID || parent.ParentID != 0) {
			return Message{}, errBadParent
		} else if err != nil {
			return Message{}, err
		}
		m.ParentID, m.ParentUserID = parent.ID, parent.UserID
	}
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return Message{}, err
	}
	defer tx.Rollback()
	var parentID any
	if m.ParentID != 0 {
		parentID = m.ParentID
	}
	res, err := tx.ExecContext(ctx,
		`INSERT INTO messages (channel_id, user_id, body, created_at, parent_id) VALUES (?, ?, ?, ?, ?)`,
		channelID, user.ID, nm.Body, m.CreatedAt, parentID)
	if err != nil {
		return Message{}, err
	}
	m.ID, _ = res.LastInsertId()
	for _, id := range nm.AttachmentIDs {
		// Only the uploader can attach a file, and only to one message.
		res, err := tx.ExecContext(ctx,
			`UPDATE attachments SET message_id = ? WHERE id = ? AND uploader_id = ? AND message_id IS NULL`,
			m.ID, id, user.ID)
		if err != nil {
			return Message{}, err
		}
		if n, _ := res.RowsAffected(); n == 0 {
			return Message{}, errBadFile
		}
	}
	if err := tx.Commit(); err != nil {
		return Message{}, err
	}
	msgs := []Message{m}
	if err := s.decorate(ctx, msgs); err != nil {
		return Message{}, err
	}
	return msgs[0], nil
}

func (s *Store) GetMessage(ctx context.Context, id int64) (Message, error) {
	m, err := scanMessage(s.db.QueryRowContext(ctx, `
		SELECT `+messageCols+`
		FROM messages m JOIN users u ON u.id = m.user_id WHERE m.id = ?`, id))
	if errors.Is(err, sql.ErrNoRows) {
		return Message{}, errNotFound
	}
	return m, err
}

// EditMessage changes the text of one of the user's own messages in a
// channel they're still in.
func (s *Store) EditMessage(ctx context.Context, userID, id int64, body string) (Message, error) {
	m, err := s.GetMessage(ctx, id)
	if err != nil {
		return Message{}, err
	}
	if m.UserID != userID {
		return Message{}, errForbidden
	}
	if err := s.requireMember(ctx, userID, m.ChannelID); err != nil {
		return Message{}, err
	}
	m.Body, m.EditedAt = body, now()
	if _, err := s.db.ExecContext(ctx,
		`UPDATE messages SET body = ?, edited_at = ? WHERE id = ?`, m.Body, m.EditedAt, id); err != nil {
		return Message{}, err
	}
	msgs := []Message{m}
	if err := s.decorate(ctx, msgs); err != nil {
		return Message{}, err
	}
	return msgs[0], nil
}

func (s *Store) DeleteMessage(ctx context.Context, id int64) error {
	_, err := s.db.ExecContext(ctx, `DELETE FROM messages WHERE id = ?`, id)
	return err
}

func (s *Store) ChannelMemberIDs(ctx context.Context, channelID int64) ([]int64, error) {
	rows, err := s.db.QueryContext(ctx, `SELECT user_id FROM members WHERE channel_id = ?`, channelID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var ids []int64
	for rows.Next() {
		var id int64
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		ids = append(ids, id)
	}
	return ids, rows.Err()
}
