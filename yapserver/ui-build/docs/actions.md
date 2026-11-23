# Actions

`web/ui/actions.js` and `web/ui/actions.css`. Button, CloseButton,
ButtonGroup, ToggleButton, ToggleButtonGroup, Link and Kbd, on HeroUI v3's
styles (`button.css`, `button-group.css`, `close-button.css`,
`toggle-button.css`, `toggle-button-group.css`, `link.css`, `kbd.css`).
Option names match HeroUI's React props, so
[HeroUI's docs](https://heroui.com/en/docs/react/components/button) describe
them too. Every factory returns its root element, and stateful ones put a
controller on `el.yui`. Every factory also passes through `class`, `aria: {…}`,
`data: {…}` and `aria-*` / `data-*` keys.

Gallery: `web/ui/gallery.html#button` (and `#close-button`, `#button-group`,
`#toggle-button`, `#link`, `#kbd`). Tests: `PORT=9310 node test/run.mjs actions`.

---

## Button

Starts an action in the current view: save, send, open a dialog.

**Use it when**
- the control does something. For going somewhere, use a Link (NN/g, *Links vs. Buttons*).
- Use emphasis on purpose. Make the one main action in a view `primary`, and the rest `secondary` or `tertiary`. Two primaries make people stop and compare (NN/g, PatternFly *Button*).
- Use `danger` for destructive actions, mostly as the confirm button in a dialog. In lists and toolbars, `danger-soft` or `ghost` with a confirmation is enough (PatternFly).

**Don't**
- write long or vague labels. Use 1–3 words that start with a plain verb and leave out articles: "Add source", not "Click here to add a new source". The label should make sense out of context, because screen-reader users often move through buttons alone (PatternFly *Button*, NN/g).
- put icon-only buttons anywhere but well-known icons (close, more, export, delete). They need `ariaLabel` (the factory throws without one) and a tooltip with the same text: attach `YapUI.Tooltip(button, { content: 'More actions' })` from the overlays family (PatternFly).
- use `isPending` for fast actions. Use it only when the wait is long enough to notice (about a second or more) (NN/g, *Progress Indicators*).
- hide a disabled button's reason. Disabled buttons stay focusable, so add a description or tooltip that says why (NN/g, PatternFly).

**Spacing.** 16px between buttons in a row, 8px when stacked (PatternFly). `actions.css` provides `.yui-actions` (row, 16px) and `.yui-actions--vertical` (stacked, 8px).

| Option | Type | Default | Notes |
| --- | --- | --- | --- |
| `children` | string, Node, array | | The label. |
| `icon` | static SVG string or Node | | Leading icon. Pending replaces it with the spinner. |
| `variant` | `'primary' \| 'secondary' \| 'tertiary' \| 'outline' \| 'ghost' \| 'danger' \| 'danger-soft'` | `'primary'` | Unknown values throw. |
| `size` | `'sm' \| 'md' \| 'lg'` | `'md'` | |
| `isIconOnly` | boolean | `false` | Square. Requires `ariaLabel` (or `aria-label` / `aria-labelledby`), or it throws. |
| `ariaLabel` | string | | Accessible name. |
| `isPending` | boolean | `false` | Spinner, `aria-busy`, `data-pending`; presses ignored; stays focusable and keeps the enabled look. |
| `pendingLabel` | string | `'Loading'` | The accessible description while pending. |
| `isDisabled` | boolean | `false` | `aria-disabled="true"`; presses ignored; stays focusable. |
| `fullWidth` | boolean | `false` | |
| `type` | `'button' \| 'submit' \| 'reset'` | `'button'` | |
| `onPress(e)` | function | | Click, Enter or Space. `e = {type, target, pointerType: 'mouse' \| 'keyboard', shiftKey, ctrlKey, metaKey, altKey, nativeEvent}`. |

**Controller `el.yui`:** `setPending(bool)`, `setDisabled(bool)`, `setVariant(v)`, `setSize(s)`, `setFullWidth(bool)`, `isPending()`, `isDisabled()`, `destroy()`.

`YapUI.Button.classes({variant, size, isIconOnly, fullWidth})` returns the class string (HeroUI's `buttonVariants()`), for styling a Link or another element as a button.

**Markup:** `<button type="button" class="button button--md button--primary" data-slot="button">`.
While pending it adds `data-pending="true"`, `aria-busy="true"`, a
`<span class="spinner spinner--sm spinner--current" data-slot="spinner" aria-hidden="true">`
before the label (or in place of the leading icon), and
`aria-describedby` pointing at hidden "Loading" text.

**Keyboard and ARIA:** a native `<button>`, so Enter and Space activate it.
HeroUI's `:focus-visible` ring (a 2px `--focus` box-shadow with a 2px offset) shows for keyboard focus only.
Disabled uses `aria-disabled`, not `disabled`, so the button stays in the tab order and screen readers announce it as unavailable.
Pending keeps the name ("Save"), sets `aria-busy` and gives "Loading" as the description.
Under Windows High Contrast, `actions.css` adds a real outline, because box-shadow isn't drawn there.

```js
const save = YapUI.Button({ children: 'Save changes', onPress: async () => {
  save.yui.setPending(true);
  try { await api.save(); } finally { save.yui.setPending(false); }
} });

const more = YapUI.Button({ isIconOnly: true, variant: 'ghost', ariaLabel: 'More actions', icon: YapUI.icons.chevronDown });
YapUI.Tooltip(more, { content: 'More actions' });
```

---

## CloseButton

The × that dismisses a dialog, popover, alert, chip or panel.

**Use it when** something can be dismissed without losing work. Pair it with Escape (dialogs and overlays do this through `YapUI.pushLayer`).

**Don't** keep the default "Close" label when several are on screen. Name the thing: "Dismiss alert", "Close members panel" (PatternFly).

| Option | Type | Default | Notes |
| --- | --- | --- | --- |
| `ariaLabel` | string | `'Close'` | |
| `variant` | `'default'` | `'default'` | |
| `children` | Node | HeroUI's × icon | |
| `isDisabled` | boolean | `false` | `aria-disabled`, stays focusable. |
| `onPress(e)` | function | | As for Button. |

**Controller `el.yui`:** `setDisabled(bool)`, `isDisabled()`, `destroy()`.

**Markup:** `<button type="button" class="close-button close-button--default" data-slot="close-button" aria-label="Close"><svg data-slot="close-button-icon">…</svg></button>`.

```js
header.append(YapUI.CloseButton({ ariaLabel: 'Close settings', onPress: () => dialog.close() }));
```

---

## ButtonGroup

Joins related buttons into one control, such as a split button ("Merge" + ▾) or a set of view switches that act immediately.

**Use it when** the actions belong together and share a variant and size.

**Don't**
- use it for a choice that stays selected. Use a ToggleButtonGroup, which announces the state.
- mix in a primary next to tertiaries. A group reads as one control.

| Option | Type | Default | Notes |
| --- | --- | --- | --- |
| `children` | Button elements or Button option objects | | Objects are built with the group's options as defaults. |
| `variant`, `size`, `isDisabled`, `fullWidth` | as Button | | Applied to children that didn't set their own (HeroUI: direct props win over the group). A child can opt out with `isDisabled: false`. |
| `orientation` | `'horizontal' \| 'vertical'` | `'horizontal'` | |
| `hideSeparator` | boolean | `false` | HeroUI: leave out `ButtonGroup.Separator`. |
| `ariaLabel` | string | | Recommended: a name for the group. |

**Controller `el.yui`:** `setDisabled(bool)` (children that didn't set their own), `destroy()`.

**Markup:** `<div role="group" class="button-group button-group--horizontal" data-slot="button-group">`. Each button except the first starts with `<span class="button-group__separator" data-slot="button-group-separator" aria-hidden="true">`.

**Keyboard:** each button is its own tab stop, as in HeroUI and React Aria's Group. For one tab stop with arrow keys, use a ToggleButtonGroup.

```js
YapUI.ButtonGroup({ variant: 'secondary', ariaLabel: 'Merge', children: [
  { children: 'Merge', onPress: merge },
  { isIconOnly: true, ariaLabel: 'More merge options', icon: YapUI.icons.chevronDown, onPress: openMenu },
] });
```

---

## ToggleButton

A button that stays on or off: Bold, Mute, Favorite, Follow.

**Use it when** the state is visible on the button itself and takes effect immediately.

**Don't**
- change the label with the state ("Mute" → "Unmute"). The label names the feature and `aria-pressed` carries the state. A changing label makes screen readers announce the opposite of what's true (WAI-ARIA APG *Button*).
- use it for settings in a form that's saved later. Use a Switch or Checkbox (forms family).

| Option | Type | Default | Notes |
| --- | --- | --- | --- |
| `children` | string, Node, array | | Stable label. |
| `icon` | static SVG string or Node | | Leading icon. |
| `isSelected` / `defaultSelected` | boolean | `false` | Initial state. |
| `onChange(isSelected)` | function | | After the state flips. |
| `onPress(e)` | function | | Every press. |
| `variant` | `'default' \| 'ghost'` | `'default'` | |
| `size` | `'sm' \| 'md' \| 'lg'` | `'md'` | |
| `isIconOnly` | boolean | `false` | Requires `ariaLabel`, or it throws. |
| `isDisabled`, `fullWidth`, `ariaLabel` | | | As for Button. |
| `id` | string | | The key inside a ToggleButtonGroup. Not set on the DOM; use `domId` for that. |

**Controller `el.yui`:** `setSelected(bool)` (no `onChange`), `isSelected()`, `toggle()`, `setDisabled(bool)`, `isDisabled()`, `setSize(s)`, `destroy()`.

**Markup:** `<button type="button" class="toggle-button toggle-button--md toggle-button--default" data-slot="toggle-button" aria-pressed="false">`, plus `data-selected="true"` when on.

**Keyboard and ARIA:** Enter and Space toggle it. Screen readers announce it as a toggle button, pressed or not pressed.

---

## ToggleButtonGroup

A set of ToggleButtons joined into one control. In single mode it works like radio buttons (text alignment, list or grid). In multiple mode it's a toolbar of independent toggles (bold, italic, underline).

| Option | Type | Default | Notes |
| --- | --- | --- | --- |
| `children` | ToggleButton elements (each with `id`) or option objects | | |
| `selectionMode` | `'single' \| 'multiple'` | `'single'` | |
| `defaultSelectedKeys` / `selectedKeys` | iterable of ids | | Initial selection. |
| `onSelectionChange(keys)` | function | | Gets a new `Set` of ids. |
| `disallowEmptySelection` | boolean | `false` | The last selected button can't be turned off. |
| `orientation` | `'horizontal' \| 'vertical'` | `'horizontal'` | |
| `isDetached` | boolean | `false` | 4px gaps, separate pills, no separators. |
| `hideSeparator` | boolean | `false` | |
| `size`, `isDisabled` | | | Passed to children that didn't set their own. |
| `fullWidth` | boolean | `false` | Buttons share the width. |
| `ariaLabel` | string | | **Required** (throws without it). |

**Controller `el.yui`:** `getSelectedKeys()` → `Set`, `setSelectedKeys(iterable)` (no callback), `setDisabled(bool)`, `destroy()`.

**Keyboard and ARIA:**
- **Single mode:** `role="radiogroup"`, and each button gets `role="radio"` with `aria-checked`. The group is one tab stop, on the selected button. The arrow keys move focus and select, and wrap at the ends. Home and End jump to the ends (WAI-ARIA APG *Radio Group*).
- **Multiple mode:** `role="toolbar"`, and each button keeps `aria-pressed`. The group is one tab stop. The arrow keys and Home/End move focus. Space or Enter toggles (APG *Toolbar*).
- Disabled buttons are skipped by the arrow keys. Tab leaves the group.

```js
YapUI.ToggleButtonGroup({
  ariaLabel: 'Text alignment', defaultSelectedKeys: ['left'], disallowEmptySelection: true,
  onSelectionChange: (keys) => setAlign([...keys][0]),
  children: [{ id: 'left', children: 'Left' }, { id: 'center', children: 'Center' }, { id: 'right', children: 'Right' }],
});
```

---

## Link

Takes the user to another page, view or resource.

**Use it when** the result is navigation. If the control does something on the same page, use a Button (NN/g, *Links vs. Buttons*).

**Don't**
- write "click here" or "learn more" on its own. Name the destination: "Billing settings" (NN/g, PatternFly).
- open new tabs unless you have to. If you do, use `isExternal`, which shows the ↗ icon and tells screen readers the link opens a new tab (NN/g).
- rely on color alone inside running text. Pass `underline: 'always'` there (WCAG 1.4.1). HeroUI's default only underlines on hover.

| Option | Type | Default | Notes |
| --- | --- | --- | --- |
| `href`, `target`, `rel`, `download` | | | As on `<a>`. `target="_blank"` gets `rel="noopener noreferrer"`. |
| `children` | string, Node, array | | |
| `isExternal` | boolean | `false` | New tab, safe `rel`, ↗ icon and hidden "(opens in a new tab)". |
| `icon` | `true`, Node or static SVG | | `true` uses HeroUI's default Link.Icon. |
| `underline` | `'hover' \| 'always'` | `'hover'` | Yap addition. |
| `isDisabled` | boolean | `false` | `aria-disabled`; navigation and onPress blocked; stays focusable. |
| `onPress(e)` | function | | Click or Enter. Call `e.nativeEvent.preventDefault()` to handle navigation yourself. With no `href`, the link renders as `<span role="link" tabindex="0">`. |

**Controller `el.yui`:** `setDisabled(bool)`, `isDisabled()`, `destroy()`.
`YapUI.Link.Icon(icon?)` builds a `<span class="link__icon" data-slot="link-icon">`.

**Markup:** `<a class="link" data-slot="link" href="…">`. To make a link look like a button, use `class: YapUI.Button.classes({ variant: 'secondary' })` (HeroUI's `.link.button` rule handles it).

---

## Kbd

Shows a keyboard shortcut, in menus, tooltips and help text.

**Use it when** a shortcut exists and is worth learning. Show it next to the command it triggers (NN/g, *UI Accelerators*).

**Don't** show Mac symbols to Windows and Linux users. Write `mod` and Kbd renders ⌘ on the Mac and Ctrl elsewhere.

| Option | Type | Default | Notes |
| --- | --- | --- | --- |
| `keys` | `'mod+shift+k'` or `['command', 'K']` | | Named keys: command, shift, ctrl, option, alt, enter, delete, escape, tab, capslock, up, down, left, right, pageup, pagedown, home, end, help, space, fn, win, and `mod`. Aliases: cmd, meta, control, opt, return, esc, backspace, arrowup… |
| `isMac` | boolean | `YapUI.isMac` | Platform override. |
| `variant` | `'default' \| 'light'` | `'default'` | `light` has no background. |
| `children` | | | Raw content instead of `keys`. |

`YapUI.Kbd('mod+k')` is shorthand. `YapUI.Kbd.format('mod+b')` returns plain text ("⌘B", or "Ctrl+B" off the Mac) for tooltips. `YapUI.Kbd.label('mod+b')` returns the spoken form ("Command B").

**Markup (Mac):** `<kbd class="kbd kbd--default"><abbr class="kbd__abbr" title="Command"><span aria-hidden="true">⌘</span><span class="yui-visually-hidden">Command</span></abbr><span class="kbd__content">K</span></kbd>`.
Off the Mac, modifiers are written out as `.kbd__content` ("Ctrl") and joined with "+".
Symbols and titles come from HeroUI's `kbd.constants.js`: ⌘ Command, ⇧ Shift, ⌃ Control, ⌥ Option/Alt, ↵ Enter, ⌫ Delete, ⎋ Escape, ⇥ Tab, ⇪ Caps Lock, arrows, ⇞ ⇟ ↖ ↘, ␣ Space.

---

## Deviations from HeroUI

- **Pending:**
  - HeroUI leaves the spinner to the caller's render function. We add it ourselves: in place of a leading icon, so the width doesn't change, or before the label when there's no icon (HeroUI's examples), which widens the button by the spinner.
  - We add `aria-busy` and a "Loading" description, and keep the name.
  - The spinner is a local copy of HeroUI's Spinner markup, so this family doesn't depend on the display family.
- **Icon-only buttons** throw without an accessible name. HeroUI doesn't enforce one.
- **Kbd:**
  - Symbols get visually hidden text next to the `title`, because most screen readers ignore `abbr` titles.
  - `.kbd` text is nudged darker, because HeroUI's `--muted` on `--default` is 4.41:1 in light mode.
  - Off the Mac, keys are written out and joined with "+".
- **Vertical groups** stretch their buttons to one width. HeroUI centers buttons of different widths, which leaves ragged edges.
- **ToggleButtonGroup:**
  - Its CSS isn't in `vendor/heroui/heroui.css`, because `heroui.input.css` doesn't import `toggle-button-group.css`. `actions.css` carries a hand-expanded copy until the build imports it.
  - In single mode the arrow keys also select (APG radio group). React Aria's toolbar only moves focus.
- **Link:** `underline: 'always'` and `isExternal` are Yap additions.
