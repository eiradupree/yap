# Yap Desktop (for the Yap server)

A small native macOS app for Yap. It opens a [Yap server](../yapserver/README.md) in its own window and adds the things a browser tab doesn't give you: a dock badge with your unread count, native notifications, and a window that stays in the dock. It doesn't need Mattermost.

This replaces the Mattermost-based app in `desktop/`, which can only connect to Mattermost servers.

## Install

Build it (below), then open `release/<version>/yap-<version>-mac-universal.dmg` and drag **Yap** to Applications. It runs natively on both Intel and Apple silicon Macs.

Builds are ad-hoc signed, not signed with an Apple Developer ID. The first time you open one on another Mac, right-click **Yap** in Applications and choose **Open**.

On first launch, Yap suggests the team server (`https://yap-chat-712e13.fly.dev`). Click **Connect**, then sign in or create an account with the invite code. To switch servers later, choose **Yap > Change Server…**.

macOS may ask whether Yap can use **"Yap Safe Storage"** in your keychain. Click **Always Allow**. That key encrypts the app's saved sign-in. On a Mac that had the old Mattermost-based Yap app, the key already exists, so macOS asks first. Because builds are ad-hoc signed, macOS may ask again after an update.

Settings and the saved sign-in are kept in `~/Library/Application Support/Yap Desktop`.

## What it does

- **Connect screen**: checks that the address answers `GET /api/ping` as a Yap server before saving it. It adds `https://` if you leave it out, and refuses plain `http://` except for `localhost`.
- **Dock badge**: the web client puts the unread count in the page title (`(3) Yap`), and the app shows it on the dock icon.
- **Notifications**: click **Turn on notifications** in the sidebar. Only the connected server may show notifications. Every other permission (camera, microphone, location and so on) is refused.
- **Links**: anything outside the server opens in your default browser. Pages can't open new app windows.
- **Offline screen**: if the server can't be reached, the app shows a retry screen and tries again on its own when the connection comes back.
- Remembers the window size and position. Only one copy runs at a time.

## Security

- The server's pages run sandboxed with context isolation and no Node.js access. The preload only gives the app's own bundled pages (`file://`) a small API, and the main process also checks the sender of every call.
- Electron fuses are set at build time: running as Node, `NODE_OPTIONS` and inspector flags are disabled, cookies are encrypted, and the app only loads its own integrity-checked `app.asar`.

## Build

Requirements: Node.js 24 and the macOS Command Line Tools.

```bash
brew install node@24
export PATH="/opt/homebrew/opt/node@24/bin:$PATH"
export DEVELOPER_DIR=/Library/Developer/CommandLineTools   # only if Xcode is broken

cd yapdesktop
npm ci
npm test               # unit tests for address handling
npm start              # run without packaging
npm run package:mac    # universal DMG and zip in release/
```

To point a development run at a local server, start `yapserver` on `127.0.0.1:8080` and enter `http://localhost:8080` on the connect screen.

## Code layout

- `src/main.js`: window, menu, permissions, link handling, connect and offline flow
- `src/server-url.js`: address checks, with no Electron dependency so it can be unit tested
- `src/preload.js`: the API for the bundled pages
- `src/pages/`: connect and offline screens
- `build/icon.icns`: app icon, from `desktop/resources/yap/`

## Not built yet

- Apple Developer ID signing and notarization, so other Macs don't show a Gatekeeper warning and the keychain doesn't prompt after updates.
- Automatic updates.
- Windows and Linux builds (the code is cross-platform but untested).
- Clicking a notification focuses Yap, but doesn't always bring the window forward from another Space.
