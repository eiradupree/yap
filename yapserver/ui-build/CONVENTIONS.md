# Yap UI conventions

Yap UI is the component library for Yap's web client (`yapserver/web/`), which
is also what the desktop app shows. It uses **HeroUI v3's stylesheet** and
reimplements **HeroUI's behavior in plain JavaScript**.

## Why it's built this way

- HeroUI v3's React package needs React 19 and Tailwind v4. Yap's web client
  has no React and no build step, and the Mattermost plugin is pinned to the
  host's React 18.
- HeroUI separates styles from behavior. `@heroui/styles` is plain CSS with
  BEM classes, data attributes and CSS-variable tokens. HeroUI's docs say it
  works on plain HTML, but you bring your own behavior (React Aria's role).
  That's what Yap UI is.
- `ui-build/` compiles the HeroUI components Yap uses into
  `web/vendor/heroui/heroui.css` (`npm run build`). The output is committed
  and served as-is; there's no build step at runtime.

## Files

| Path | What |
| --- | --- |
| `web/vendor/heroui/heroui.css` | HeroUI's styles, compiled. Don't edit; rebuild. |
| `web/ui/theme.css` | Yap's tokens over HeroUI's (accent, contrast fixes), portal, scroll lock. |
| `web/ui/core.js` | Shared plumbing: `h`, `cx`, `uid`, `icons`, focus, layers, positioning, animation, theme. |
| `web/ui/<family>.js` / `.css` | Components, one file per family (below). |
| `web/ui/gallery.html`, `web/ui/gallery/*.js` | Every component, every variant and state, in light and dark. |
| `ui-build/test/*.test.mjs` | Browser tests: real Chrome, real keyboard and mouse, production CSP, axe-core. |
| `ui-build/docs/<family>.md` | API reference and usage guidance. |

| Family | Components |
| --- | --- |
| actions | Button, CloseButton, ButtonGroup, ToggleButton, Link, Kbd |
| display | Avatar, AvatarGroup, Badge, Chip, Card, Surface, Separator, Spinner, Skeleton, ProgressBar, Alert, EmptyState |
| overlays | Tooltip, Popover |
| menus | Dropdown (menu button + menu, sections, separators, single/multiple selection, submenus), Tabs |
| dialogs | Modal, AlertDialog |
| toast | Toast region and `toast()` |
| forms | Label, Description, FieldError, TextField (input), TextArea, SearchField, Checkbox, CheckboxGroup, Switch, Fieldset |

## Hard rules

1. **Content-Security-Policy.** Yap serves `default-src 'self'` with no
   `style-src`, so:
   - No `style="…"` attributes in markup.
   - No `<style>` elements.
   - No inline event handlers.
   - No `eval`.
   - Set styles through the CSSOM (`el.style.x = …`, `h(..., {style: {...}})`), which is allowed.

   Tests run under this exact policy and fail on any violation.
2. **No globals.** Every file is a classic script wrapped in an IIFE that
   only adds to `window.YapUI`. `app.js` and `editor.js` share the global
   scope (they declare `icons`, `md`, `tooltip`, `isMac`…), so a top-level
   `const` would collide.
3. **Never put user data in `innerHTML`.** Build DOM with `YapUI.h` and text
   nodes. `html:` is only for static markup from our own files, like icons.
4. **Use HeroUI's markup exactly.** For each component, read its source CSS in
   `ui-build/node_modules/@heroui/styles/dist/components/<name>.css`. Use the
   same classes, `data-slot` values, data attributes and element structure, so
   the stylesheet applies unchanged. Add to `<family>.css` only what HeroUI's
   CSS doesn't cover, using the `.yui-` prefix or HeroUI's BEM names.
5. **Don't change shared files.** That means `core.js`, `theme.css`,
   `gallery.html`, `gallery/gallery.js`, `test/harness.mjs`, `test/run.mjs`
   and other families' files. If you need something from core, write a local
   helper in your file and say so in your report.
6. **No new dependencies** at runtime. Test tooling stays in `ui-build/`.

## API style

Mirror HeroUI's React props, as plain JavaScript options. Use the same names
and values: `variant`, `size: 'sm' | 'md' | 'lg'`, `color`, `isDisabled`,
`isPending`, `isSelected`, `placement`, `onPress`, `onOpenChange`,
`onAction`, `onChange`. That way HeroUI's docs describe ours too.

- **Factories return the root element:** `YapUI.Button({ variant: 'primary', children: 'Save', onPress })`.
  - `children` takes a string, a node or an array.
  - `class` adds classes.
  - Any `aria`/`data` options pass through.
- **Stateful components** put a small controller on the root as `el.yui`,
  for example `el.yui.setPending(true)`, `el.yui.setSelected(true)` or
  `el.yui.destroy()`. Document every method.
- **Overlays attach to an existing trigger and return a controller:**
  `const tip = YapUI.Tooltip(trigger, { content: 'Bold ⌘B' })` returns
  `{ open(), close(), update(), destroy() }`. Modals and toasts are
  imperative:
  - `YapUI.Modal.open({...})` returns `{ close(), closed: Promise }`.
  - `YapUI.toast(...)` returns a controller with `close()`.
- **Events:** `onPress` fires on click and on Enter/Space where a native
  button wouldn't already do so. Never fire it on a disabled or pending
  control.
- **Disabled:** prefer `aria-disabled="true"` plus ignoring activation over
  the `disabled` attribute when the control should stay focusable and
  explain itself (NN/g, PatternFly). Use native `disabled` for form fields.

## Behavior and accessibility

Follow the WAI-ARIA Authoring Practices pattern for each component (React
Aria implements those). Each component needs:

- **Roles and labels.** The right role, an accessible name and the correct
  state attributes (`aria-expanded`, `aria-pressed`, `aria-checked`,
  `aria-selected`, `aria-invalid`, `aria-describedby`, `aria-controls`).
- **Keyboard.**
  - Everything works without a mouse.
  - Composite widgets (menus, tabs) use a roving tabindex: one tab stop,
    arrow keys inside, Home/End, typeahead in menus.
  - Escape closes overlays, through `YapUI.pushLayer`.
- **Focus.**
  - Visible focus (HeroUI's `:focus-visible` styles).
  - Dialogs trap focus (`YapUI.trapFocus`) and make the page inert
    (`YapUI.isolate`).
  - Focus returns to the trigger on close.
- **Motion.** Use `YapUI.enter(el)` / `YapUI.exit(el, done)` so HeroUI's
  `data-entering` / `data-exiting` animations run. They're skipped under
  `prefers-reduced-motion`.
- **Positioning.** Use `YapUI.position(el, anchor, {placement, offset})` and
  `YapUI.autoUpdate`. It sets `data-placement` and `--trigger-anchor-point`.
  Overlays render into `YapUI.portal()`.
- **Hover states.** Use the CSS `:hover` / `:active` / `:focus-visible`
  styles. Only set HeroUI's `data-hovered` / `data-pressed` attributes if a
  selector requires them.
- **Content guidance.** Follow it from Nielsen Norman Group and PatternFly,
  summarized per component in your brief. Put the guidance that callers need
  in your docs file as "Use it when / Don't".

## Definition of done (per family)

1. **Components** in `web/ui/<family>.js`, with a short comment on each
   public function describing its options.
2. **Gallery section(s)** in `web/ui/gallery/<family>.js`.
   - Use `YapUI.gallery.section(id, title, intro, build)` and
     `YapUI.gallery.example(title, ...nodes)`.
   - Show every variant, size and state.
   - Interactive demos write to a `YapUI.gallery.log()` so tests can assert
     on events.
3. **Tests** in `ui-build/test/<family>.test.mjs`. Run them with
   `PORT=<yours> node test/run.mjs <family>` from `ui-build/`, using Node 24:
   `export PATH="/opt/homebrew/opt/node@24/bin:$PATH"`. Cover:
   - real keyboard and mouse interaction, ARIA states and focus movement;
   - `t.axe('#<section-id>')` in both `light` and `dark` (`await t.page.theme('dark')`);
   - no page errors or CSP violations;
   - screenshots (`t.page.screenshot(t.shots + '/<family>-….png')`), light and dark,
     which you then look at with your image viewer. Check alignment, spacing
     and contrast, and fix what looks wrong.
4. **Docs** in `ui-build/docs/<family>.md`, covering for each component:
   - what it's for, with "Use it when / Don't" guidance cited to NN/g or PatternFly;
   - the options table with HeroUI-matching names, defaults and controller methods;
   - keyboard and ARIA behavior;
   - a short example.
