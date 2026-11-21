# Modifications for Yap

Yap Desktop is based on [Mattermost Desktop](https://github.com/mattermost/desktop) v6.3.2 (commit `4c3a87a`), licensed under the Apache License 2.0. As required by section 4(b) of that license, this file lists the changes made for Yap. Files not listed here are unchanged from upstream.

## Branding and identity

| File | Change |
|---|---|
| `package.json`, `package-lock.json` | Package name `yap-desktop`, product name `Yap`, author, homepage, repository and Linux desktop name. Added the `package:mac-local` script. The version stays at 6.3.2 so Mattermost servers see a supported desktop version. |
| `electron-builder.ts` | App ID `com.eiradupree.yap.desktop`, `yap://` URL scheme, Linux synopsis and app ID, macOS focus-status usage text, a new Windows MSI upgrade code (so a Yap installer never replaces Mattermost Desktop), and local entitlements when no provisioning profile is present. |
| `scripts/afterpack.js` | Derives the app file name from the product name instead of hardcoding `Mattermost.app` / `Mattermost.exe`, so the Electron security fuses are still applied. |
| `src/common/constants.ts` | Deep-link protocol is `yap` instead of `mattermost`. |
| `src/common/config/buildConfig.ts` | Update notifications off (Yap has no update feed yet), `yap` replaces `mattermost` in allowed protocols. |
| `src/main/app/initialize.ts`, `src/main/app/utils.ts` | Windows AppUserModelID and dev deep-link scheme (`yap-dev`). |
| `src/main/utils.ts` | Screen-capture permission reset targets Yap's bundle ID. |
| `src/main/notifications/dnd-windows.ts` | Windows Focus Assist lookup uses Yap's app ID. |
| `webpack.config.renderer.js` | Window titles. |
| `i18n/en.json` and the matching `defaultMessage`s in `WelcomeScreen.tsx`, `DeveloperModeIndicator.tsx`, `NewServerModal.tsx` | Strings where the app named itself. |
| `src/renderer/components/Images/Logo.tsx` | Yap wordmark instead of the Mattermost logotype. |
| `src/renderer/components/LoadingAnimation/LoadingIcon.tsx` | Yap bubble instead of the Mattermost compass logo; animation structure kept. |
| `src/renderer/utils.ts`, `src/renderer/css/downloadsDropdown.scss` | Update downloads use the Yap thumbnail (`app-update.svg`). |
| `src/main/app/utils.test.js` | Deep-link tests use `yap://`. |

## Assets

All Mattermost logos were replaced with Yap artwork generated from the SVG sources in `resources/yap/` by `scripts/generate_yap_assets.sh`:

- `src/assets/icon.icns`, `icon.ico`, `appicon_48.png`, `appicon_with_spacing_32.png`, `linux/app_icon.png`
- `src/assets/osx/menuIcons/*`, `src/assets/osx/DMG_BG.png`
- `src/assets/windows/tray_*.ico`, `src/assets/linux/top_bar_*.png`, `resources/windows/tray*.svg`
- `src/assets/thumbnails/mattermost.svg` removed, `src/assets/thumbnails/app-update.svg` added

## Added

- `resources/mac/entitlements.mac.local.plist`: the macOS entitlements without `com.apple.developer.usernotifications.communication`, a restricted entitlement that needs a provisioning profile.
- `resources/yap/`, `scripts/generate_yap_assets.sh`, `MODIFICATIONS.md`.
- `go.mod`: keeps the plugin's Go tooling in the repository root out of this directory.

## Removed

- `.github/`, `.gitlab-ci.yml`, `fastlane/`: Mattermost's release automation, tied to their signing and store accounts.
- `CONTRIBUTING.md`: Mattermost's contribution process. See the Yap repository README instead.

## Documentation

- `README.md`, `SECURITY.md` rewritten for Yap. `NOTICE.txt` gained a Yap header; the upstream notices are unchanged below it.

## Intentionally unchanged

These still say Mattermost because they describe or interoperate with the Mattermost server Yap connects to:

- The `Mattermost/<version>` user-agent token and the `X-Mattermost-Preauth-Secret` header, which the server relies on.
- Strings that refer to "your Mattermost server".
- Source file copyright headers, which stay as required by the license.
