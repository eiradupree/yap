# Upgrade notes

Planned work and open decisions for Yap, with what each one needs. Last updated 2026-11-20.

## Own server (MVP, in progress)

Goal: Yap runs on its own backend instead of Mattermost. The first version is in `yapserver/` (see [yapserver/README.md](../yapserver/README.md)). It provides accounts, public channels, message history and live updates, works locally and has tests.

Needs:

- **Desktop app**: done in `yapdesktop/` (see [yapdesktop/README.md](../yapdesktop/README.md)). Still to do: Developer ID signing and notarization, automatic updates, Windows and Linux builds.
- **Hosting**: live on Fly.io at https://yap-chat-712e13.fly.dev (app `yap-chat-712e13`, region `ord`, one shared-cpu-1x machine with 256 MB and a 1 GB volume) (see [yapserver/DEPLOY.md](../yapserver/DEPLOY.md)). Still to do: a custom domain and off-site backups (for example Litestream).
- **Features**: done: editing and deleting messages, notifications, password change, account deletion. Still needed: direct messages, private channels, file uploads, password reset by email, managing admins from the app.
- **Abuse protection**: rate limits, invite-only sign-up, admin message deletion and bans are done. Still needed: rate limits that survive restarts.
- **Open decision**: whether to keep the Mattermost plugin and desktop fork once the own server covers what's needed.

## Mobile app (planned, not started)

Goal: a Yap-branded iOS and Android app, forked from [mattermost-mobile](https://github.com/mattermost/mattermost-mobile) (Apache-2.0, React Native) the same way `desktop/` was forked from Mattermost Desktop.

Needs:

- **Rebranding** like the desktop app: app name, bundle IDs, icons, splash screen, URL scheme and any Mattermost logos (see `desktop/MODIFICATIONS.md` for the pattern).
- **iOS**: a working Xcode. On the development Mac, Xcode 27.2 fails to load (`libxcodebuildLoader.dylib ... Symbol not found: _XPCTypeBool`), probably a mismatch with macOS 26.6.2. Fix by updating macOS or reinstalling Xcode, then run `xcodebuild -runFirstLaunch`. App Store or TestFlight distribution also needs an Apple Developer account.
- **Android**: a JDK (`brew install openjdk@17`) and the Android SDK (Android Studio or `brew install --cask android-commandlinetools`). Several GB.
- **Push notifications**: Mattermost's mobile push goes through Mattermost's hosted proxy, which only serves their official apps. A Yap app needs its own [push proxy](https://github.com/mattermost/mattermost-push-proxy) (Apache-2.0) with Yap's Apple and Firebase credentials, configured on each server.
- **Plugin UI on mobile**: the mobile app doesn't run a plugin's webapp code. Features meant for phones should use slash commands, bot posts and interactive messages, which work everywhere.

## Desktop app follow-ups

The macOS universal build works (see `desktop/README.md`). Still to do:

- **Signing and notarization**: local builds are ad-hoc signed with hardened runtime off, so other Macs show a Gatekeeper warning. Distributing properly needs an Apple Developer ID certificate. Then build with hardened runtime on (the electron-builder default) and notarize.
- **Communication notifications**: the `com.apple.developer.usernotifications.communication` entitlement is left out of builds without a provisioning profile (`resources/mac/entitlements.mac.local.plist`). Add a `mac.provisionProfile` from the Apple Developer account to get it back.
- **Updates**: update notifications are off because they pointed at Mattermost's release feed. Re-enable them in `src/common/config/buildConfig.ts` once Yap publishes releases (for example GitHub Releases).
- **Deep links**: Yap registers `yap://`. Mattermost servers generate `mattermost://` links ("Open in desktop app"), so those open the official Mattermost app instead, or nothing.
- **Translations**: only English strings were rebranded. Other files in `desktop/i18n/` still say "Mattermost" where the app names itself.
- **Help menu**: the help, Academy and upgrade links still point to Mattermost's site (`DEFAULT_HELP_LINK` and others in `src/common/constants.ts`).
- **Windows and Linux**: the config is rebranded, but builds there are untested. The Windows Group Policy templates (`resources/windows/gpo`) and registry path (`SOFTWARE\Policies\Mattermost`) are unchanged.
- **Security reports**: `desktop/SECURITY.md` points to GitHub private vulnerability reporting. Turn it on under the repo's Settings > Code security.
- **Upstream updates**: the desktop code is a copy of Mattermost Desktop v6.3.2 without its git history. To take a newer release, diff it against v6.3.2 and reapply the changes in `desktop/MODIFICATIONS.md`.

## Plugin webapp UI library

Decided: the plugin's components use [HeroUI v3](https://heroui.com/docs/react/getting-started) (`@heroui/react`, Apache-2.0, on React Aria). HeroUI needs React 19, so `min_server_version` is 12.0. See "HeroUI" in `webapp/AGENTS.md` for how its styles are kept off the host page and follow the user's theme.

Still open: `@mattermost/compass-ui` has no license field or LICENSE file, and its source repository (`mattermost/compass-design`) isn't public. The plugin no longer uses its components, only its global styles (`webapp/src/index.tsx`), which provide the spacing, radius and type tokens the plugin's CSS uses. Mattermost 12.0 doesn't load them itself. Either confirm its license with Mattermost, or declare those tokens in the plugin and drop the package.

## Development machine notes

- Xcode is broken (see above). Workarounds that need no `sudo`:
  - GNU make from Homebrew: `export PATH="/opt/homebrew/opt/make/libexec/gnubin:$PATH"` before `make dist`.
  - `export DEVELOPER_DIR=/Library/Developer/CommandLineTools` for anything that needs clang or python3 (desktop native modules, Go with cgo).
  - `CGO_ENABLED=0` for `go vet` and `go test` in the plugin.
- The desktop app needs Node 24 (`brew install node@24`, keg-only). The plugin uses the default Node.
