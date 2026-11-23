# menus: Dropdown and Tabs

`web/ui/menus.js` and `web/ui/menus.css`. Markup uses HeroUI v3's
`dropdown.css`, `menu.css`, `menu-item.css`, `menu-section.css`, `kbd.css`
and `tabs.css`. Behavior follows the WAI-ARIA APG
[Menu Button](https://www.w3.org/WAI/ARIA/apg/patterns/menu-button/) and
[Tabs](https://www.w3.org/WAI/ARIA/apg/patterns/tabs/) patterns, with React
Aria's `useMenu` / `useTabList` as the reference.

Gallery sections: `#dropdown` and `#tabs`. Tests: `PORT=9340 node test/run.mjs menus`.

---

## Dropdown

A menu button: a button that opens a list of actions or options.

### Use it when / Don't

- **Use it** for a handful of actions on one thing (a message's "More
  actions"), for picking how to add something (Yap's attachment menu), or for
  view options (sort order, what to show).
- **Keep it short.** Up to about 7 items; group longer menus into sections
  with headers and separators (PatternFly, Menus).
- **Labels are 1–3 words and start with a verb**: "Copy link", "Upload file"
  (PatternFly). Use `description` for the extra detail, at most 2 lines; the
  library clamps it to 2.
- **Icons only when they're easily recognized**, never as decoration
  (PatternFly). If one item has an icon, give its neighbors icons too.
- **Destructive items go last**, after a separator, with `variant: 'danger'`.
  The caller confirms the action (an AlertDialog); the menu doesn't (PatternFly).
- **Gray out, don't hide.** Show unavailable items disabled, and say why in
  the description ("You can attach up to 10 files to a message"), so people
  learn the option exists (NN/g, "Dropdown menus: when to use them").
  `hidden: true` is for items that can never apply on this device.
- **Keep the menu's label in view** (NN/g): a text trigger says what it
  controls ("Sort by: Newest"); an icon-only trigger needs `aria-label` and a
  tooltip.
- **Don't** use a dropdown for navigation between pages or for choosing a
  form value; use links, Tabs, or a select.
- **Don't** nest submenus more than one level.

### API

```js
const menu = YapUI.Dropdown(triggerButton, options);
```

Attaches to an existing button (HeroUI's `Dropdown.Trigger`) and returns a
controller, also stored as `trigger.yui`.

| Option | Type | Default | Notes |
| --- | --- | --- | --- |
| `items` | array or `() => array` | `[]` | A function is called on every open, so items can reflect current state. Entries below. |
| `selectionMode` | `'none' \| 'single' \| 'multiple'` | `'none'` | HeroUI `Dropdown.Menu selectionMode`. |
| `selectedKeys` / `defaultSelectedKeys` | iterable | — | The initial selection. |
| `disabledKeys` | iterable | — | Same as `isDisabled` on those items. |
| `disallowEmptySelection` | boolean | `false` | In single mode, choosing the selected item keeps it selected (React Aria). |
| `shouldCloseOnSelect` | boolean | `true`, `false` for multiple | React Aria. |
| `indicator` | `'checkmark' \| 'dot'` | `'checkmark'` | HeroUI `Dropdown.ItemIndicator type`, for every item. |
| `onAction(key)` | function | — | An item was activated (also with selection). |
| `onSelectionChange(keys)` | function | — | Gets a new `Set` of keys. |
| `onOpenChange(isOpen)` | function | — | |
| `placement` | HeroUI placement | `'bottom'` | `'top start'`, `'bottom end'`, `'right'`… Flips when there's no room. |
| `offset` | number | `8` | Pixels from the trigger. |
| `trigger` | `'press' \| 'longPress'` | `'press'` | `longPress`: hold 500 ms or Alt+ArrowDown opens; a plain click runs the button's own action. |
| `label` | string | — | The menu's `aria-label`. Without it the menu is labelled by the trigger. |
| `footer` | string or node | — | A note under the menu (Yap's "You can also drag files…"); it describes the menu. Yap addition. |
| `class` | string | — | Extra classes on `.dropdown__popover`. |

**Item** (`Dropdown.Item`):

| Field | Notes |
| --- | --- |
| `key` | Defaults to `label`. Also `id`. |
| `label` | Text. |
| `description` | Second line (HeroUI `Description`). |
| `icon` | Static SVG markup from your own code, or a node. Never user data. |
| `shortcut` | `'E'` or `['mod', 'E']`. Rendered as HeroUI `.kbd` with `slot="keyboard"`; named keys (`mod`, `shift`, `alt`, `ctrl`, `enter`, `delete`…) become `<abbr class="kbd__abbr">`. `mod` is ⌘ on Mac and Ctrl elsewhere. Display only: the caller handles the shortcut itself. |
| `variant` | `'default' \| 'danger'`. |
| `isDisabled` | Shown dimmed, still focusable, never activates. |
| `textValue` | Text for typeahead when the label isn't plain (`'#general'` → `'general'`). |
| `indicator` | `'checkmark' \| 'dot'` for this item. |
| `onAction(key)` | Per-item handler, called before the menu's `onAction`. |
| `items` | An array (or function) makes this a submenu trigger (`Dropdown.SubmenuTrigger`). |
| `selectionMode` | The submenu's own selection mode. |
| `hidden` | Skip it. |

`{ type: 'section', title, items }` is a `Dropdown.Section` with a `Header`
(`'aria-label'` instead of `title` for an unlabelled group).
`{ type: 'separator' }` is a `Separator`.

**Controller**

| Method | |
| --- | --- |
| `open(focus = 'first')` | Opens. `focus`: `'first'` (the selected item in a selection menu), `'last'`, or `false` to leave focus alone. |
| `close({ focusTrigger = true })` | Closes the menu and any submenu. |
| `isOpen()` | |
| `setSelectedKeys(keys)` | Replaces the selection without calling `onSelectionChange`. |
| `selectedKeys()` | A copy of the selection. |
| `setItems(items)` | New items, used from the next open. |
| `update()` | Re-position (after the trigger moves). |
| `destroy()` | Closes and removes listeners and ARIA attributes. |

### Keyboard

| Where | Key | Does |
| --- | --- | --- |
| Trigger | Enter, Space, ArrowDown, click | Opens; focuses the first item (or the selected one). |
| Trigger | ArrowUp | Opens; focuses the last item. |
| Menu | ArrowDown / ArrowUp | Next / previous item, wrapping. |
| Menu | Home / End (PageUp / PageDown) | First / last item. |
| Menu | Letters | Typeahead on the label (or `textValue`); multi-character within 0.7 s; skips disabled items. |
| Menu | Enter, Space | Activates. Closes and returns focus to the trigger, except in a multiple-selection menu. |
| Menu | Escape | Closes the menu (or only the open submenu) and returns focus. |
| Menu | Tab / Shift+Tab | Closes and moves to the control after / before the trigger. |
| Submenu item | ArrowRight, Enter | Opens the submenu and focuses its first item. Hover opens it after 200 ms. |
| Submenu | ArrowLeft, Escape | Closes it; focus returns to its item. |

A press outside closes the menu (inside the menu, only a submenu).

### ARIA

- Trigger: `aria-haspopup="menu"`, `aria-expanded`, and `aria-controls` while
  open (React Aria also sets it only while open, since the menu exists only
  then).
- Menu: `role="menu"`, labelled by the trigger (or `label`), rendered in
  `YapUI.portal()`, positioned with flip and animated with HeroUI's
  `data-entering` / `data-exiting`.
- Items: `role="menuitem"`, or `menuitemradio` / `menuitemcheckbox` with
  `aria-checked` in single / multiple mode, `tabindex="-1"`,
  `aria-labelledby` its label, `aria-describedby` its description and
  shortcut, `aria-keyshortcuts`. Disabled: `aria-disabled="true"` +
  `data-disabled`.
- Submenu items: `aria-haspopup="menu"`, `aria-expanded`, `aria-controls`,
  `data-has-submenu`.
- Sections: `role="group"` `aria-labelledby` the header. Separators:
  `role="separator"`.
- Focus ring: `data-focused` / `data-focus-visible` (React Aria's attributes),
  so the ring shows for keyboard focus only.

### Example: Yap's attachment menu

```js
YapUI.Dropdown(attachBtn, {
  label: 'Attach',
  placement: 'top start',
  footer: 'You can also drag files into the message box or paste them.',
  items: () => {
    const full = pending.length >= maxFiles ? `You can attach up to ${maxFiles} files to a message` : null;
    return [
      { key: 'image', icon: icons.image, label: 'Upload image or GIF', description: full || 'PNG, JPEG, GIF or WebP, up to 10 MB. Shown in the message.', isDisabled: !!full },
      { key: 'file', icon: icons.file, label: 'Upload file', description: full || 'Any type, up to 10 MB. Others can download it.', isDisabled: !!full },
      { key: 'photo', icon: icons.camera, label: 'Take photo', description: full || 'Use your camera.', isDisabled: !!full, hidden: !touchDevice },
    ];
  },
  onAction: (key) => ({ image: imageInput, file: fileInput, photo: cameraInput })[key].click(),
});
```

---

## Tabs

Switches between views of the same thing, one at a time.

### Use it when / Don't

- **Use it** for a few clear, parallel groupings of content that people
  don't need to compare side by side (NN/g, "Tabs, used right").
- **Labels are 1–2 words**, in sentence case, never ALL CAPS (NN/g,
  PatternFly).
- **One row**, with the tab list directly above its panel. Don't wrap tabs
  onto two rows (NN/g).
- **Show the selected tab with at least two cues.** HeroUI's styles give two:
  the selected tab's text is foreground-colored and sits on a raised surface
  (primary) or above an accent underline (secondary). Unselected tabs stay
  readable and look clickable.
- **A disabled tab says why** in `tooltip` (PatternFly). Better still, keep
  the tab enabled and explain inside the panel.
- **Don't** use tabs for steps in a sequence (use a wizard) or for actions
  (use buttons). Don't use them to switch pages; use links.

### API

```js
const tabs = YapUI.Tabs(options); // returns the .tabs element
```

| Option | Type | Default | Notes |
| --- | --- | --- | --- |
| `tabs` | `[{ key, label, panel, isDisabled, tooltip }]` | `[]` | `panel`: string, node, array or function. `tooltip`: why it's disabled. |
| `variant` | `'primary' \| 'secondary'` | `'primary'` | |
| `orientation` | `'horizontal' \| 'vertical'` | `'horizontal'` | |
| `align` | `'start' \| 'center' \| 'end'` | `'center'` | Tab text alignment. |
| `selectedKey` / `defaultSelectedKey` | key | first enabled tab | |
| `disabledKeys` | iterable | — | |
| `keyboardActivation` (alias `activationMode`) | `'automatic' \| 'manual'` | `'automatic'` | React Aria. Manual: arrows move focus, Enter/Space select. Use manual when showing a panel is slow. |
| `onSelectionChange(key)` | function | — | Not called by `setSelectedKey`. |
| `'aria-label'` (or `label`) / `'aria-labelledby'` | string | — | The tab list's name. Required. |
| `class`, `aria`, `data` | | | On the root. |

**Controller** (`el.yui`): `setSelectedKey(key)`, `selectedKey()`,
`setDisabledKeys(keys)`, `destroy()`.

**Tooltip hook.** `YapUI.Tabs.tooltip(tab, text)` shows a disabled tab's
reason. By default it uses `YapUI.Tooltip(tab, { content })` if the overlays
family is loaded, and the native `title` otherwise. Assign your own function
to change that; return an undo function. Either way the reason is also the
tab's `aria-describedby`, and disabled tabs with a reason keep pointer events
so hover works.

### Keyboard and ARIA

- `role="tablist"` with `aria-orientation`; `role="tab"` with
  `aria-selected`, `aria-controls`; `role="tabpanel"` with
  `aria-labelledby`.
- Roving tabindex: only the selected tab is in the Tab order.
- Horizontal: ArrowLeft / ArrowRight (swapped in RTL). Vertical: ArrowUp /
  ArrowDown. Home / End. Arrows wrap and skip disabled tabs
  (`aria-disabled="true"`).
- Tab moves from the tab list into the panel. A panel with no focusable
  content gets `tabindex="0"` (APG).
- `.tabs__indicator` (React Aria's SelectionIndicator) lives inside the
  selected tab and slides from the previous one (translate, width, height
  over 250 ms; none under reduced motion).

### Example

```js
const el = YapUI.Tabs({
  'aria-label': 'Conversation',
  variant: 'secondary',
  tabs: [
    { key: 'messages', label: 'Messages', panel: messageList },
    { key: 'files', label: 'Files', panel: () => fileList() },
    { key: 'pins', label: 'Pins', isDisabled: true, tooltip: 'Pin a message to see it here' },
  ],
  onSelectionChange: (key) => show(key),
});
```

---

## Deviations from HeroUI

- **Attach to a trigger.** `Dropdown(trigger, options)` takes a data
  description of the items, not composed children (no React).
- **Disabled items stay focusable** (APG); React Aria skips them. Typeahead
  still skips them.
- **`footer`** is a Yap addition for the attachment menu's note.
- **Section selection.** HeroUI lets each `Dropdown.Section` have its own
  `selectionMode`; here the mode is per menu (and per submenu).
- **`.header`.** HeroUI's `header.css` isn't in the compiled stylesheet, so
  `menus.css` repeats its rules for section headers.
- **Unselected primary tab text** is slightly darker than HeroUI's `--muted`
  (4.41:1 on `--default` in light mode, under AA).
- **No overflow scroll buttons** on the tab list (`.tabs__list-container__scroller`).
