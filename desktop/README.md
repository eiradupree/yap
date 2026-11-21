# Yap Desktop

The Yap desktop app for macOS. It connects to Mattermost servers running the [Yap plugin](../README.md) and gives your team a native window with notifications, unread badges, a menu bar icon and `yap://` deep links.

Yap Desktop is a modified version of [Mattermost Desktop](https://github.com/mattermost/desktop) v6.3.2, built on [Electron](https://www.electronjs.org/) and licensed under the [Apache License 2.0](LICENSE.txt). [MODIFICATIONS.md](MODIFICATIONS.md) lists what was changed for Yap. Yap is not affiliated with or endorsed by Mattermost, Inc.

## Download and install

Build the app (below), then open `release/<version>/yap-desktop-<version>-mac-universal.dmg` and drag **Yap** to Applications. The universal build runs natively on both Intel and Apple silicon (M-series) Macs.

Local builds are not signed with an Apple Developer ID. The first time you open one on another Mac, right-click **Yap** in Applications and choose **Open**.

On first launch, enter a name and the URL of your Mattermost server, for example `https://chat.example.com`.

Settings are saved in `~/Library/Application Support/Yap`.

## Build

Requirements: Node.js 24 (see `.nvmrc`) and the macOS Command Line Tools for compiling native modules.

```bash
brew install node@24
export PATH="/opt/homebrew/opt/node@24/bin:$PATH"

npm ci
npm run package:mac-local
```

`package:mac-local` builds a universal (Intel + Apple silicon) DMG and zip in `release/`, ad-hoc signed so it runs on the machine that built it.

If Xcode is installed but broken (`xcodebuild` fails with a library error), point the build at the standalone Command Line Tools instead:

```bash
export DEVELOPER_DIR=/Library/Developer/CommandLineTools
```

## Develop

```bash
npm run watch          # rebuild and restart on change
npm run check-types    # TypeScript
npm run lint:js        # ESLint
npm run test:unit      # Jest
```

`AGENTS.md` and the `AGENTS.md` files in subdirectories describe the architecture.

## Icons

The app, tray and menu bar icons are generated from the SVGs in `resources/yap/`. After editing them:

```bash
brew install librsvg imagemagick
./scripts/generate_yap_assets.sh
```

## Trademarks

Yap Desktop is built on Mattermost Desktop. Mattermost is a trademark of Mattermost, Inc. Yap follows the [Mattermost Trademark Standards of Use](https://mattermost.com/trademark-standards-of-use/): it uses the Mattermost name only to describe what it is built on and which servers it connects to, and does not use Mattermost logos or branding.
