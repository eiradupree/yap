# Yap server

`yapserver` is Yap's own chat server. It doesn't need Mattermost. It's a single Go program that stores everything in one SQLite file and serves its own web client.

Status: MVP, running locally only.

## Features

- Accounts with a username and password (bcrypt). Sessions last 30 days, are kept in an HttpOnly cookie, and only the token's hash is stored.
- Channels: everyone starts in `#general`. Anyone can create, join or leave public channels.
- Message history with paging, plus live updates over a websocket.
- Read and post permissions are checked on the server: you only see and post in channels you've joined.
- The web client (`web/`) is plain HTML, CSS and JavaScript, built into the binary. It has light and dark themes and works on phone-sized screens.

## Run

Needs Go (version in `go.mod`). No cgo or Xcode is required.

```bash
cd yapserver
go build -o yapserver .
./yapserver -addr 127.0.0.1:8080 -db yap.db
```

Open <http://localhost:8080> and create an account.

| Flag | Default | Meaning |
| --- | --- | --- |
| `-addr` | `:8080` | Address to listen on |
| `-db` | `yap.db` | SQLite database file, created if missing |
| `-secure-cookies` | `false` | Mark session cookies `Secure`. Set it when serving over HTTPS. |

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
- `hub.go`: fans live events out to connected clients
- `web/`: the web client

## API

All request and response bodies are JSON. Every POST must send `Content-Type: application/json`. Requests whose `Origin` is a different site are refused.

| Method and path | Auth | Description |
| --- | --- | --- |
| `GET /api/ping` | none | Health check: `{"status":"ok","app":"yap"}` |
| `POST /api/register` | none | `{username, password}`: creates the account and signs in |
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

- **Desktop app**: `desktop/` is still the Mattermost-based app, and its Connect screen only accepts Mattermost servers. It needs a small replacement app that opens a Yap server.
- **Hosting**: the server only runs locally so far. Making it reachable needs a host, a domain and HTTPS (for example a reverse proxy such as Caddy in front of it), with `-secure-cookies` turned on.
- **Features**: direct messages, private channels, editing and deleting messages, file uploads, notifications, password reset, admin roles.
- **Abuse protection**: there's no rate limit on login or registration, and anyone who can reach the server can create an account.
