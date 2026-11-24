# Yap server

`yapserver` is Yap's own chat server. It doesn't need Mattermost. It's a single Go program that stores everything in one SQLite file and serves its own web client.

Status: MVP, live at <https://yap-chat-712e13.fly.dev> (invite-only). See [DEPLOY.md](DEPLOY.md) for deploying and operating it, including measured capacity.

## Features

- Accounts with a username and password (bcrypt). Sessions last 30 days, are kept in an HttpOnly cookie, and only the token's hash is stored.
- Channels: everyone starts in `#general`. Anyone can create, join or leave public channels.
- Message history with paging, plus live updates over a websocket. You can edit and delete your own messages.
- Voice and video calls in every channel, with screen sharing, through a self-hosted [LiveKit](../livekit/README.md) server. Only channel members can join a channel's call. Calls are off unless the `LIVEKIT_*` settings are set.
- Private muting: mute a person to collapse their messages (with Show) and keep them out of your unread counts and notifications, or mute a channel to keep it out of both. Only you can see your mutes; nobody is told. Account settings lists the people you've muted.
- Account settings: change your password (which signs out your other devices) or delete your account and everything you've posted.
- Admins, listed in `YAP_ADMINS`, can delete any message and ban people. A ban signs the person out everywhere, closes their live connections and blocks sign-in, and can also delete everything they've posted.
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
| | `LIVEKIT_URL` | unset | LiveKit address browsers use, e.g. `wss://yap-livekit-712e13.fly.dev`. Calls are on when this, the key and the secret are set. |
| | `LIVEKIT_API_URL` | from `LIVEKIT_URL` | How the server reaches LiveKit's API, e.g. over Fly's private network |
| | `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET` | unset | Shared with the LiveKit server. Keep the secret in Fly secrets. |
| | `YAP_ADMINS` | unset | Comma-separated usernames that get admin tools. Create those accounts before setting it, or someone else could register the name first. |

Or with Docker: `docker build -t yapserver . && docker run -p 8080:8080 -v yap-data:/data yapserver`.

To back up, copy `yap.db` together with any `yap.db-wal` and `yap.db-shm` files while the server is stopped.

## Test

```bash
cd yapserver
go test -race ./...
```

## Code layout

- `main.go`: flags, startup, graceful shutdown, hourly cleanup of expired sessions
- `store.go`: SQLite schema, migrations and queries
- `server.go`: HTTP API, authentication, CSRF checks, websocket endpoint
- `ratelimit.go`: per-IP and per-user rate limits, client IP handling
- `hub.go`: fans live events out to connected clients
- `mutes.go`: private mutes of people and channels
- `livekit.go`: call tokens, LiveKit webhooks, who's on each call, removing banned users from calls
- `web/calls.js`, `web/calls.css`: the call screen; `web/vendor/`: the LiveKit browser client
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
| `GET /api/me` | session | Current user, with `admin: true` for admins |
| `POST /api/me/password` | session | `{current_password, new_password}`: changes the password and signs out other sessions |
| `DELETE /api/me` | session | `{password}`: deletes the account, its sessions and its messages |
| `GET /api/channels` | session | All channels, each with `joined`, and `muted` if you muted it |
| `POST /api/channels` | session | `{name}`: creates a channel and joins it |
| `POST /api/channels/{id}/join` | session | Join a channel |
| `POST /api/channels/{id}/leave` | session | Leave a channel |
| `GET /api/channels/{id}/messages?before=&limit=` | member | Up to `limit` (default 50, max 200) messages older than `before`, oldest first |
| `POST /api/channels/{id}/messages` | member | `{body}`: post a message of 1 to 4000 characters |
| `PATCH /api/messages/{id}` | author | `{body}`: edit your own message (you must still be in the channel) |
| `DELETE /api/messages/{id}` | author or admin | Delete a message |
| `GET /api/me/muted-users` | session | The people you've muted: `[{id, username}]` |
| `PUT /api/me/muted-users/{id}` | session | `{}`: mute a person (not yourself). Only you are told. |
| `DELETE /api/me/muted-users/{id}` | session | `{}`: unmute a person |
| `PUT /api/me/muted-channels/{id}` | session | `{}`: mute a channel for yourself |
| `DELETE /api/me/muted-channels/{id}` | session | `{}`: unmute a channel |
| `GET /api/admin/users` | admin | Every account, with `banned` and `admin` |
| `POST /api/admin/users/{id}/ban` | admin | `{delete_messages?}`: ban a user. Admins can't be banned. |
| `POST /api/admin/users/{id}/unban` | admin | Lift a ban |
| `GET /api/calls` | session | Calls going on in channels you've joined, with who's on them |
| `POST /api/channels/{id}/call` | member | `{}`: a one-hour LiveKit token for the channel's call, plus the LiveKit URL |
| `POST /api/livekit/webhook` | LiveKit signature | Join and leave events from LiveKit |
| `GET /api/ws` | session | Websocket with events for your channels (`message`, `message_edited`, `message_deleted`) and for everyone (`channel_created`, and `user_removed` when an account's messages are deleted, plus `call_update` when people join or leave a channel's call), and to you alone `mutes_changed` when you mute or unmute something on any device. The server closes it on sign-out, password change or ban. |

Every state-changing request needs `Content-Type: application/json`, including `DELETE` (send `{}` when there's nothing else).

Database upgrades run automatically at startup. The schema version is kept in SQLite's `user_version`.

Rules: usernames are 3 to 32 characters (letters, digits, `.`, `_`, `-`) and case-insensitive. Passwords are 8 to 72 characters. Channel names are 1 to 32 characters (lowercase letters, digits, `_`, `-`).

## Not built yet

- **Features**: direct messages, private channels, password reset by email.
- **Abuse protection**: rate limits are in memory, so they reset on restart. There's no account lockout. Admins are set by configuration, not from the app.
- **Scaling past one machine**: needs Postgres instead of SQLite (see [DEPLOY.md](DEPLOY.md)).
