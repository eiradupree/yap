# Yap UI build and tests

Tooling for Yap UI, the component library in `../web/ui/`. Nothing here is
served or embedded in the server binary. See [CONVENTIONS.md](CONVENTIONS.md)
for how the library is put together and [docs/](docs/) for each component.

Needs Node 24 (`export PATH="/opt/homebrew/opt/node@24/bin:$PATH"` with
Homebrew's `node@24`) and Google Chrome for the tests.

```bash
npm install
npm run build          # recompile ../web/vendor/heroui/heroui.css
npm run test           # every browser test
node test/run.mjs menus dialogs   # some of them
```

## The stylesheet

`heroui.input.css` imports HeroUI's base, theme and the component styles Yap
uses from `@heroui/styles`, in HeroUI's order, and Tailwind compiles them.

- **Size.** The output is about 220 KB, or 22 KB gzipped. HeroUI's full
  prebuilt `heroui.min.css` is 467 KB.
- **No utilities.** `source(none)` stops Tailwind from scanning Yap's files
  for utility classes. Yap's markup uses HeroUI's component classes only.
- **Layers.** Everything stays in HeroUI's cascade layers (`theme`, `base`,
  `components`, `utilities`). Yap's own stylesheets are unlayered, so they
  always win over HeroUI's, including its CSS reset.

To add a component, add its `@import` to `heroui.input.css` in the same group
and order as `node_modules/@heroui/styles/dist/components/index.css`, then
rebuild.

## Tests

`test/run.mjs` serves `../web` with yapserver's Content-Security-Policy. It
drives headless Chrome over the DevTools protocol with real mouse and keyboard
input, and audits with axe-core (WCAG 2.1 A/AA). A test fails on any failed
check, page error, console error or warning, or CSP violation. Screenshots go
to `shots/`, which is ignored by git.

Run several suites at once on different ports, e.g.
`PORT=9400 node test/run.mjs forms`. Each run uses its `PORT` and `PORT+1`.

### The app itself

`test/app.e2e.mjs` tests the web client (`../web/index.html`, `app.js`,
`editor.js`, `calls.js`) on the library, end to end. It builds yapserver into
a temporary directory, starts it on a fresh database with `YAP_ADMINS=alice`
and calls pointed at a closed port, then signs up, creates a channel, sends,
reacts, replies in a thread, uses the attach menu and formatting tooltips,
edits, deletes, leaves a channel, and opens the Account and Members dialogs,
with real keyboard and mouse input. It fails on any failed check, page error,
console error or warning, CSP violation, native `alert()`/`confirm()`, or axe
violation (sign-in, main screen and dialogs, light and dark). Screenshots go
to `shots/app-*.png`. It stops the server and Chrome when it's done.

```bash
node test/app.e2e.mjs              # ports 9700 (server) and 9701 (Chrome)
PORT=9800 node test/app.e2e.mjs
```
