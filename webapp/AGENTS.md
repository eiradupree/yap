# AGENTS.md (webapp)

Adapted from the Mattermost webapp's `webapp/AGENTS.md` and `STYLE_GUIDE.md` so plugins match the product. ESLint and `tsc` enforce formatting, imports, `dangerouslySetInnerHTML` and `javascript:` URLs; the rules below are the ones they can't.

## Host-provided packages

- React, ReactDOM, the JSX runtime (`window.ReactJSXRuntime`), react-intl, Redux, react-redux, react-router-dom and prop-types are webpack `externals` from the host. Their versions in `package.json` are dev-only and must match the host for `min_server_version` (12.0: React 19.2.8). Never bundle a second copy or move them to `dependencies`.
- `@mattermost/shared/*` loads from the host via `window.loadSharedDependency` (see `webpack.config.js`): `components/emoji`, `components/button`, `components/shortcut_key`, `components/tooltip`, `utils/i18n` and `utils/user_agent`. Add `@mattermost/shared` as a devDependency for types on first use.
- Host APIs for plugins live on `window.WebappUtils` (e.g. `modals.openModalById` for published host modals) and `window.PostUtils`. Don't use `window.Components` or `window.ProductApi`; they change without notice.
- Don't add react-bootstrap, MUI, Emotion or Sass.

## HeroUI

The plugin's UI is built with [HeroUI v3](https://heroui.com/docs/react/getting-started) (`@heroui/react`, on React Aria).

- Import from subpaths (`@heroui/react/button`), never the root barrel. Use HeroUI's compound parts as documented (`Select.Trigger`, `Alert.Title`…) and its prop names (`variant`, `isDisabled`, `isPending`, `onPress`); don't invent props.
- Every component registered with the host renders inside `YapUIProvider` (`src/heroui/yap_ui_provider.tsx`). HeroUI's styles only apply inside its `.yap-ui` scope, overlays portal into a `.yap-ui` container, and React Aria uses the user's locale.
- `src/heroui/heroui.css` imports only the HeroUI components the plugin uses. When you use a new one, add its `@import` there in the order of `@heroui/styles/dist/components/index.css`, or it renders unstyled.
- `postcss.scope.js` keeps HeroUI and Tailwind off the host page: theme variables and resets are moved under `.yap-ui`, dark-theme blocks are dropped and cascade layers are flattened. Don't load `@heroui/styles` or `tailwindcss` any other way.
- `src/heroui/theme.css` maps HeroUI's tokens to the host theme variables, so components follow the user's Mattermost theme, light or dark. Change colors there, not per component.
- Tooltips: `WithTooltip` from `@mattermost/shared/components/tooltip`, so they match the host's.

## Branding

- `src/branding/` shows Yap's logo (`assets/yap-icon.svg`, the one source) in place of Mattermost's: the header of the pages before sign-in, the global header, the favicon (with unread and mention dots) and system-message avatars. The host loads plugin bundles before sign-in too (`GET /api/v4/plugins/webapp` needs no session), so `initialize` runs on the login page: keep it free of calls that need a user.
- The host has no setting for these logos, so `branding.css` targets the host's classes under `.yap-branded`; if a host release renames them, its own logo shows again. Check them on each new `min_server_version`.
- The server's `NameSiteYap` setting (`server/branding.go`) names the site Yap for the tab title and the sign-in header, and turns on custom branding with Yap's text, which removes "Mattermost" from the sign-up subtitle and the landing page.

## Compass

- Compass (`@mattermost/compass-ui`) still provides the design tokens (spacing, radius, type) and icons. Build components with HeroUI.
- `src/index.tsx` imports `@mattermost/compass-ui/styles` once. Never import `@mattermost/compass-ui/styles/standalone`: it overrides the user's theme.
- Never use `@mattermost/compass-proto` (unpublished prototypes).
- Icons come from `@mattermost/compass-icons/components`.
- Emoji: `Emoji` from `@mattermost/shared/components/emoji`.
- For published host modals use `window.WebappUtils.modals`.

## Styling

- Co-locate `my_component.css` with `my_component.tsx`. Root class is the plugin name plus the component in PascalCase (`.StarterTemplate-ChannelStatusSidebar`; plain CSS is global, so the prefix keeps it from clashing with the host or other plugins), BEM children (`.StarterTemplate-ChannelStatusSidebar__heading`), modifiers as a separate class. No `!important`, inline `style`, or element selectors.
- Colors from host theme variables (`--center-channel-color`, `--button-bg`, `--error-text`; `rgba(var(--center-channel-color-rgb), 0.72)` for transparency). Spacing, radius, elevation, type and motion from Compass tokens (`--spacing-m`, `--font-size-100`, `--line-height-100`, `--font-weight-semibold`). Never hard-code those. HeroUI components get theirs from `src/heroui/theme.css`. Pills use `var(--radius-pill)`: the webapp's `--radius-full` is `50%`.

## Accessibility and i18n

- Accessible names come from visible text or a `label` before `aria-label`, and never repeat the role ("button"). Help and error text go in `aria-describedby`. Content that updates asynchronously gets `aria-live`.
- Everything works by keyboard; focus moves into modals and back to the trigger on close.
- All UI text goes through react-intl, with strings added to `i18n/en.json` only. Prefer `<FormattedMessage>`; use `useIntl` only for string props. Use rich text (`values={{b: (chunks) => <b>{chunks}</b>}}`) instead of concatenation or Markdown.

## Security

- Call the plugin server only through `src/client.ts`; `Client4.getOptions` adds the CSRF token. Don't rely on the server's deprecated `X-Requested-With` fallback, which `ExperimentalStrictCSRFEnforcement` disables.
- Render Markdown with the host's sanitizing `window.PostUtils.formatText` + `messageHtmlToComponent`.
- Only `http:`/`https:` URLs from user data go into `href` or `src`.
- No tokens or secrets in `localStorage` or Redux, and no third-party API calls with credentials from the browser; route them through the plugin server.
- Check `event.origin` in every `message` listener.
- Before releasing: `npm audit --omit=dev` (0 advisories is the bar for the shipped bundle).

## Tests

- React Testing Library with a real Redux store and `IntlProvider`; mock `client` at the module boundary (see `channel_status_sidebar.test.tsx` and `channel_status/test_utils.tsx`).
- `await userEvent...`; `fireEvent` only for focus/blur, scroll, image load or fake timers.
- Query by role first (`getByRole` > text/placeholder > label/alt/title > `getByTestId`). No snapshots: assert `toBeVisible` and ARIA attributes.
