# Yap server

`yapserver` is Yap's own chat server. It doesn't need Mattermost. It's a single Go program that stores everything in one SQLite file and serves its own web client.

Status: MVP, live at <https://yap-chat-712e13.fly.dev> (invite-only). See [DEPLOY.md](DEPLOY.md) for deploying and operating it, including measured capacity.

## Features

- Accounts with a username and password (bcrypt). Sessions last 30 days, are kept in an HttpOnly cookie, and only the token's hash is stored.
- Channels: everyone starts in `#general`. Anyone can create, join or leave public channels.
- Message history with paging, plus live updates over a websocket.
- Read and post permissions are checked on the server: you only see and post in channels you've joined.
- Optional invite-only sign-up, rate limits on sign-in, sign-up, posting and channel creation, and a cap of 10 live connections per user.
- The web client (`web/`) is plain HTML, CSS and JavaScript, built into the binary. It has light and dark themes and works on phone-sized screens. It shows the unread count in the page title and can show browser notifications.
- A native macOS app is in [`../yapdesktop`](../yapdesktop/README.md).

## Run

Needs Go (version in `go.mod`). No cgo or Xcode is required.

```bash
cd yapserver
go build -o yapserver .
./yapserver -addr 127.0.0.1:8080 -db yap.db
```

Open <http://localhost:8080> and create an account.

| Flag | Env var | Default | Meaning |
| --- | --- | --- | --- |
| `-addr` | `PORT` | `:8080` | Address to listen on |
| `-db` | `YAP_DB` | `yap.db` | SQLite database file, created if missing |
| `-secure-cookies` | `YAP_SECURE_COOKIES` | `false` | Mark session cookies `Secure`. Set it when serving over HTTPS. |
| `-behind-proxy` | `YAP_BEHIND_PROXY` | `false` | Take the client IP from the last `X-Forwarded-For` entry. Set it only behind a reverse proxy. |
| | `YAP_INVITE_CODE` | unset | When set, creating an account requires this code |

Or with Docker: `docker build -t yapserver . && docker run -p 8080:8080 -v yap-data:/data yapserver`.

To back up, copy `yap.db` together with any `yap.db-wal` and `yap.db-shm` files while the server is stopped.

## Test

```bash
cd yapserver
go test -race ./...
```

## Code layout

- `main.go`: flags, startup, graceful shutdown, hourly cleanup of expired sessions
- `store.go`: SQLite schema and queries
- `server.go`: HTTP API, authentication, CSRF checks, websocket endpoint
- `ratelimit.go`: per-IP and per-user rate limits, client IP handling
- `hub.go`: fans live events out to connected clients
- `web/`: the web client

## API

All request and response bodies are JSON. Every POST must send `Content-Type: application/json`. Requests whose `Origin` is a different site are refused.

| Method and path | Auth | Description |
| --- | --- | --- |
| `GET /api/ping` | none | Health check: `{"status":"ok","app":"yap"}` |
| `GET /api/config` | none | `{"signup":"open"}` or `{"signup":"invite"}` |
| `POST /api/register` | none | `{username, password, invite?}`: creates the account and signs in |
| `POST /api/login` | none | `{username, password}`: signs in |
| `POST /api/logout` | session | Ends the current session |
| `GET /api/me` | session | Current user |
| `GET /api/channels` | session | All channels, each with `joined` |
| `POST /api/channels` | session | `{name}`: creates a channel and joins it |
| `POST /api/channels/{id}/join` | session | Join a channel |
| `POST /api/channels/{id}/leave` | session | Leave a channel |
| `GET /api/channels/{id}/messages?before=&limit=` | member | Up to `limit` (default 50, max 200) messages older than `before`, oldest first |
| `POST /api/channels/{id}/messages` | member | `{body}`: post a message of 1 to 4000 characters |
| `GET /api/ws` | session | Websocket that sends `message` events for your channels and `channel_created` events |

Rules: usernames are 3 to 32 characters (letters, digits, `.`, `_`, `-`) and case-insensitive. Passwords are 8 to 72 characters. Channel names are 1 to 32 characters (lowercase letters, digits, `_`, `-`).

## Not built yet

- **Features**: direct messages, private channels, editing and deleting messages, file uploads, notifications, password reset, admin roles.
- **Abuse protection**: rate limits are in memory, so they reset on restart. There's no account lockout, and no way to ban a user yet.
- **Scaling past one machine**: needs Postgres instead of SQLite (see [DEPLOY.md](DEPLOY.md)).
