# Yap

Yap is an open-source, Slack-like workspace. It comes in two forms: a Mattermost plugin (`com.eiradupree.yap`) that adds team-chat features to a self-hosted Mattermost server, and its own [server and desktop app](#yap-without-mattermost) that don't need Mattermost at all.

Yap is fully open source. It uses only open-source Mattermost components (the Apache-2.0 plugin API in `github.com/mattermost/mattermost/server/public` and MIT-licensed webapp packages) and does not include or depend on Mattermost Enterprise or Source Available code.

## Status

Yap is in early development. It is based on the [Mattermost plugin starter template](https://github.com/mattermost/mattermost-plugin-starter-template) and currently includes that template's example features:

- **Channel status**: run `/channelstatus at-risk` in a channel to show an **At risk** tag in the channel header for everyone, live. `/channelstatus` shows the current status and `/channelstatus clear` removes it.
- **Channel status sidebar**: click the tag, or the flag icon in the App Bar, to view or change the status. Changing it requires permission to edit the channel header.
- **Webhook endpoint**: `POST <SiteURL>/plugins/com.eiradupree.yap/webhook` with an `X-Webhook-Secret` header. Generate the secret under System Console > Plugins > Yap.

## Yap without Mattermost

Yap also has its own stack that doesn't need Mattermost at all:

- **`yapserver/`**: the chat server. It's one Go program with accounts, channels, message history and live updates, storing everything in a single SQLite file and serving its own web client.
- **`yapdesktop/`**: a small native macOS app for that server, with an unread badge on the dock icon and native notifications.

Both are MVPs. The server is live at **<https://yap-chat-712e13.fly.dev>**.

### Use it

1. **In a browser:** open <https://yap-chat-712e13.fly.dev>, click **Need an account? Create one**, and enter the invite code. Sign-up is invite-only. The code isn't in this repo because the repo is public. Ask the server owner for it, or set a new one (see [Operate the live server](#operate-the-live-server)).
2. **On a Mac:** build the desktop app (below), open `yapdesktop/release/<version>/yap-<version>-mac-universal.dmg`, and drag **Yap** to Applications. It suggests the live server on first launch, so click **Connect** and sign in.
   - Builds aren't signed with an Apple Developer ID. On another Mac, right-click **Yap** and choose **Open** the first time.
   - If macOS asks to let Yap use **"Yap Safe Storage"** in your keychain, click **Always Allow**. It's the key that encrypts the app's saved sign-in. It may ask again after updates until builds are Developer ID signed.
3. **Notifications:** click **Turn on notifications** in the sidebar, in the app or the browser.

### Run it locally

Needs Go (version in `yapserver/go.mod`) and, for the desktop app, Node.js 24.

```bash
# Server: http://localhost:8080, data in yapserver/yap.db
cd yapserver
go test -race ./...
go build -o yapserver . && ./yapserver -addr 127.0.0.1:8080

# Desktop app (another terminal). On the connect screen, enter http://localhost:8080
cd yapdesktop
export PATH="/opt/homebrew/opt/node@24/bin:$PATH"            # brew install node@24
export DEVELOPER_DIR=/Library/Developer/CommandLineTools    # only if Xcode is broken
npm ci
npm test
npm start              # run without packaging
npm run package:mac    # universal DMG and zip in yapdesktop/release/
```

Locally, sign-up is open unless you set `YAP_INVITE_CODE`.

### Operate the live server

It runs on Fly.io as app `yap-chat-712e13`: one shared-cpu-1x machine in Chicago (`ord`) with 256 MB of memory and a 1 GB volume, at about $2–5 a month. You need the Fly CLI (`brew install flyctl`) and `fly auth login`. Then, from `yapserver/`:

```bash
fly deploy                                   # ship the current code
fly logs                                     # watch logs
fly status                                   # machine and health check
fly secrets set YAP_INVITE_CODE=new-code     # change the invite code (restarts the server)
fly secrets set YAP_ADMINS=yourname          # admin tools for these usernames (create the account first)
```

Database upgrades run on their own when a new version starts. Take a snapshot first with `fly volumes snapshots create <volume-id>` (`fly volumes list` shows the ID).

[yapserver/DEPLOY.md](yapserver/DEPLOY.md) covers backups, custom domains, scaling, the settings, and why this runs on one machine rather than Kubernetes.

### What's built

- **Accounts:** usernames and passwords (bcrypt) and 30-day sessions in an HttpOnly cookie. Sign-up is invite-only on the live server.
- **Channels:** everyone starts in `#general`. Anyone can create, join or leave public channels, and the server checks that you've joined a channel before you can read or post in it.
- **Calls:** voice and video calls in any channel, with screen sharing, through a self-hosted [LiveKit](livekit/README.md) media server. Click **Call** or **Video** in a channel's header. Everyone in the channel sees who's on the call and can join, and banned people are dropped from calls right away.
- **Messages:** edit and delete your own. Changes show up live for everyone.
- **Account settings:** change your password (signs out your other devices) or delete your account and everything you've posted.
- **Admin tools:** people listed in `YAP_ADMINS` get a **Members** list where they can ban and unban people, optionally deleting everything a banned person posted, and they can delete any message. A ban signs the person out everywhere at once.
- **Live updates** over websockets, with an unread count in the page title and the dock badge.
- **Protection:** rate limits on sign-in, sign-up (both per IP), posting and channel creation (both per user), and a cap of 10 live connections per user. Cross-site requests are refused, and the security headers include HSTS. The Docker image runs as an unprivileged user with no shell.
- **Desktop app:** the server's pages run sandboxed with no Node.js access. Only the connected server may show notifications; every other permission is refused, and links outside Yap open in your browser. Electron's security fuses are set at build time.

### What's been tested

- **Server:** the Go test suite covers sign-in, permissions, paging, cross-site blocking, invite codes, rate limits, client IPs, connection caps, live delivery, editing and deleting, password changes, account deletion, bans and upgrading a database from the first release. It passes with `-race`, and GitHub Actions runs it on every pull request that touches `yapserver/` or `yapdesktop/`.
- **Web client:** driven in Chrome with two users: editing, deleting, a ban with message clean-up (the banned user is kicked to sign-in and sees "suspended"), and changing a password.
- **Live server:** checked from the internet. HTTPS redirect, invite enforcement, auth required, cross-site refusal and headers all work, and a faked `X-Forwarded-For` can't get around the rate limit.
- **Capacity:** measured on a container capped to the Fly VM's size (1 CPU, 256 MB):

  | Load | Send latency p50 / p99 | Live delivery | Memory |
  | --- | --- | --- | --- |
  | 500 users, 1,000 open tabs, 25 messages/s | 2.4 ms / 7.9 ms | 100% | under 40 MB |
  | 200 users, 400 tabs, 200 messages/s in one channel | 1 ms / 58 ms | 100% (80,000/s) | under 40 MB |

- **Desktop app:** unit tests cover address handling. The app was driven end to end against a local server: connect screen, sign-up, live messages, unread counts, dock badge, restart while signed in, offline screen and link handling. The packaged build was checked for both CPU architectures, a valid signature and the fuse settings, and it connected to the live server.
- **Not checked yet:** the full sign-up flow on the live server (there's no way to delete test accounts, so none were made), and seeing a notification appear on screen.

### Known issues and next steps

- **Desktop signing:** ad-hoc signed only, so other Macs show a Gatekeeper warning and the keychain may prompt after updates. Fix with an Apple Developer ID and notarization.
- **No automatic updates** in the desktop app, and no Windows or Linux builds yet.
- **Calls on the live server** need the LiveKit app deployed, which needs a card on the Fly account (see [livekit/README.md](livekit/README.md)). There's no TURN relay yet, so a few very locked-down networks can't connect to calls.
- **Missing chat features:** direct messages, private channels, file uploads, password reset by email, reactions and threads.
- **Admins** are set with `YAP_ADMINS`, not from inside the app.
- **Rate limits** are in memory, so they reset whenever the server restarts.
- **Backups:** only Fly's daily volume snapshots, kept for 5 days. Add off-site backups, for example Litestream.
- **Scaling past one machine** means moving from SQLite to Postgres (see [yapserver/DEPLOY.md](yapserver/DEPLOY.md)).
- **Open decision:** whether to keep the Mattermost plugin and the old Mattermost-based `desktop/` app now that the own stack exists.

Details: [yapserver/README.md](yapserver/README.md) (API, settings and code layout), [yapdesktop/README.md](yapdesktop/README.md), [docs/UPGRADES.md](docs/UPGRADES.md).

## Desktop app (Mattermost-based)

`desktop/` contains the earlier Mattermost-based Yap Desktop, a native app for macOS that runs on both Intel and Apple silicon Macs. It's a modified version of the Apache-2.0 [Mattermost Desktop](https://github.com/mattermost/desktop) app and can only connect to Mattermost servers. For the Yap server, use `yapdesktop/` instead. See [desktop/README.md](desktop/README.md) to build it.

## Roadmap

Planned work (the mobile app, desktop signing and updates) and open decisions are tracked in [docs/UPGRADES.md](docs/UPGRADES.md).

## Plugin requirements

- Mattermost Server 11.7 or later (the oldest supported ESR)
- Go (version in `go.mod`) and Node.js (version in `.nvmrc`) to build
- GNU Make

On macOS with Homebrew:

```bash
brew install go node make
export PATH="$(brew --prefix make)/libexec/gnubin:$PATH"   # use GNU make as `make`
```

## Building

```bash
make dist
```

This builds the Go server for Linux, macOS and Windows plus the webapp bundle, and produces a single plugin file:

```
dist/com.eiradupree.yap-<version>.tar.gz
```

Upload it under System Console > Plugins > Plugin Management, or deploy it to a local server with `make deploy` (see `make help`).

## Development

```bash
SKIP_DOCKER_TESTS=1 go test ./server/...   # server unit tests
cd webapp && npm test                      # webapp tests
make check-style                           # lint server and webapp
make test                                  # full check before pushing
```

`plugin.json` is the source of truth for the plugin ID, version and settings. `AGENTS.md`, `server/AGENTS.md` and `webapp/AGENTS.md` describe the code layout and conventions. For general plugin development, see the [Mattermost plugin documentation](https://developers.mattermost.com/extend/plugins/).

## Contributing

Issues and pull requests are welcome at <https://github.com/eiradupree/yap>. Please keep contributions open source: don't add Mattermost Enterprise or Source Available code, or dependencies under non-open-source licenses.

## License

Yap is licensed under the [Apache License 2.0](LICENSE).

## Trademarks

Yap is built on Mattermost. Mattermost is a trademark of Mattermost, Inc. Yap is an independent project and is not affiliated with, sponsored by or endorsed by Mattermost, Inc. Yap follows the [Mattermost Trademark Standards of Use](https://mattermost.com/trademark-standards-of-use/): it uses the Mattermost name only to describe what Yap is built on, and does not use Mattermost logos or branding as its own.
