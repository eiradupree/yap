# Dialogs: Modal and AlertDialog

`web/ui/dialogs.js`, `web/ui/dialogs.css`. Both render HeroUI v3's markup
(`modal.css`, `alert-dialog.css`, `close-button.css`, `button.css`) and follow
the WAI-ARIA APG [Dialog (Modal)](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/)
and [Alert Dialog](https://www.w3.org/WAI/ARIA/apg/patterns/alertdialog/) patterns.
Gallery sections: `#modal`, `#alert-dialog`.

```
.modal__backdrop.modal__backdrop--opaque          [data-slot=modal-backdrop]
  .modal__container[data-placement]               (+ --scroll-outside, --full)
    section.modal__dialog.modal__dialog--md       role=dialog aria-modal=true
      button.close-button.modal__close-trigger    aria-label="Close"
      .modal__header > (.modal__icon) h2.modal__heading
      .modal__body.modal__body--scroll-inside > p.yui-dialog-description, body
      .modal__footer > button.button…
```

AlertDialog is the same with the `alert-dialog__` block, `role="alertdialog"`,
a status icon (`.alert-dialog__icon--<status>`) and no X.

## Modal

A dialog that blocks the page until the person deals with it.

**Use it when** (NN/g, *Modal & Nonmodal Dialogs*; PatternFly, *Modal*)

- the content is vital: input required to continue, or a short, direct decision;
- you need to prevent a critical or irreversible error.

**Don't**

- use it for nonessential information, promotions or tips (NN/g);
- use it for an error that belongs next to a form field. Show that inline (NN/g);
- put long content in it. Keep the body short; PatternFly suggests at most three
  lines of text for a confirmation;
- label buttons "OK" / "Yes". Use 1–3 word action verbs that match the title
  ("Delete", "Change password"), and make Cancel secondary or tertiary (PF).

### `YapUI.Modal.open(options)`

Returns `{ el, root, close(result), closed }`.

| Option | Type | Default | |
| --- | --- | --- | --- |
| `title` | string \| Node | — | Visible heading; `aria-labelledby` points to it. |
| `aria-label` | string | — | Required when there is no `title`; `open()` throws a `TypeError` without one. |
| `description` | string \| Node | — | First paragraph of the body; `aria-describedby` points to it. |
| `body` | Node \| Node[] | — | Body content. |
| `actions` | Action[] | — | Footer buttons (below). Primary last. |
| `footer` | Node \| Node[] | — | Custom footer instead of `actions`. Any `[slot="close"]` button inside the dialog closes it, resolving with its `value`. |
| `icon` | Node \| icon markup | — | `.modal__icon` in the header (e.g. `YapUI.icons.warning`). |
| `size` | `'xs' \| 'sm' \| 'md' \| 'lg' \| 'cover' \| 'full'` | `'md'` | HeroUI `Modal.Container size`. |
| `placement` | `'auto' \| 'center' \| 'top' \| 'bottom'` | `'auto'` | `auto`: bottom sheet on phones, centered from 640px. |
| `scroll` | `'inside' \| 'outside'` | `'inside'` | Long content scrolls in the body, or the whole dialog scrolls in the backdrop. |
| `backdrop` | `'opaque' \| 'blur' \| 'transparent'` | `'opaque'` | HeroUI `Modal.Backdrop variant`. |
| `isDismissable` | boolean | `true` | A click on the backdrop closes it. |
| `isKeyboardDismissDisabled` | boolean | `false` | Escape doesn't close it. |
| `showCloseButton` | boolean | `true` | The X (`Modal.CloseTrigger`). |
| `initialFocus` | selector \| Element | — | What to focus first (see Focus). |
| `isDestructive` | boolean | any action is `danger`/`danger-soft` | Start focus on the least destructive action. |
| `returnFocus` | Element | the focused element | Where focus goes on close. |
| `onClose(reason, result)` | function | — | `reason`: `'escape' \| 'backdrop' \| 'close-button' \| 'action' \| 'api' \| 'parent'`. |
| `class` | string | — | Extra classes on `.modal__dialog`. |

**Action**: `{ label, variant = 'tertiary', onPress(event, ctrl), autoFocus, closes = true, value = label, isDisabled }`.
`variant` is any HeroUI button variant (`primary`, `secondary`, `tertiary`,
`outline`, `ghost`, `danger`, `danger-soft`). If `onPress` returns `false`
the modal stays open (use it for validation). If it returns a Promise, the
button gets `data-pending="true"` and `aria-busy` until it settles, and the
modal stays open when it resolves to `false` or rejects.
`isDisabled` sets `aria-disabled="true"`: the button stays focusable and ignores presses.

**Controller**

| | |
| --- | --- |
| `el` | The `role="dialog"` element. |
| `root` | The backdrop (the node in `YapUI.portal()`). |
| `close(result)` | Closes it; `closed` resolves with `result`. Calling again does nothing and returns the same promise. |
| `closed` | `Promise` that resolves exactly once, after the exit animation, when the DOM is gone. Dismissals (Escape, backdrop, X) resolve `undefined`; actions resolve their `value`. |

### Focus

On open, focus goes to the first of:

1. `initialFocus`;
2. an action with `autoFocus`, or an element with `autofocus` / `data-autofocus`;
3. for destructive dialogs, the least destructive action (Cancel), per PatternFly;
4. the first focusable element in the body;
5. the primary (last) footer action;
6. the dialog itself (`tabindex="-1"`).

Tab and Shift+Tab cycle inside (`YapUI.trapFocus`). On close, focus returns
to the element that was focused before opening. If that element is gone (a
menu item whose menu has closed), it goes to the control that owned the menu:
an element whose `aria-controls`/`aria-owns` names the menu, or the
`aria-labelledby` of a `role="menu"`/`listbox` ancestor.

### Keyboard and ARIA

| Key | |
| --- | --- |
| Tab / Shift+Tab | Next / previous control, wrapping inside the dialog. |
| Escape | Closes the top dialog (unless `isKeyboardDismissDisabled`). Through `YapUI.pushLayer`, so a popover or menu open inside the dialog closes first. |

- `role="dialog"`, `aria-modal="true"`, `aria-labelledby` (heading) or `aria-label`, `aria-describedby` (description).
- The rest of the page is `inert` and page scroll is locked (`YapUI.isolate`).
- Nested modals stack: the lower one is inert until it's on top again, and
  Escape closes only the top one. Closing a lower modal closes those above it.
- Enter/exit use HeroUI's `data-entering`/`data-exiting` animations; with
  `prefers-reduced-motion` the dialog appears and disappears at once.

### Example

```js
const m = YapUI.Modal.open({
  title: 'Change password',
  description: 'Your other devices will be signed out.',
  body: form,
  actions: [
    { label: 'Cancel', variant: 'tertiary' },
    { label: 'Change password', variant: 'primary', value: 'changed', onPress: async () => {
      try { await api('POST', '/api/me/password', body()); }
      catch (err) { showError(err.message); return false; } // stays open
    } },
  ],
});
if (await m.closed === 'changed') toast('Password changed');
```

## AlertDialog

A confirmation that interrupts on purpose. `AlertDialog.confirm()` is a drop-in
replacement for `window.confirm()`.

**Use it when** (PatternFly, *Modal: confirmation*; NN/g)

- the person is about to do something destructive or irreversible ("Delete this message?");
- a decision must be made before continuing.

**Don't**

- use it for success messages or anything that doesn't need a decision. Use a toast;
- ask a vague question. The title is the question, naming the thing: "Ban alice?";
- label the confirm button "OK"/"Yes". Repeat the verb from the title: "Delete", "Leave", "Ban";
- add type-to-confirm to routine actions. Reserve it for severe, hard-to-undo
  actions (banning, deleting an account).

### `YapUI.AlertDialog.confirm(options)` → `Promise<boolean>`

`true` on the confirm button; `false` on Cancel or Escape.

| Option | Type | Default | |
| --- | --- | --- | --- |
| `title` | string | — | The question. (Or `aria-label`.) |
| `description` | string | — | One to three lines about consequences. |
| `status` | `'default' \| 'accent' \| 'success' \| 'warning' \| 'danger'` | `'default'` | Icon color; `danger` also makes the confirm button `button--danger`. |
| `confirmLabel` | string | `'Confirm'` | Always pass a verb. |
| `cancelLabel` | string | `'Cancel'` | |
| `typeToConfirm` | string | — | Shows "Type **x** to confirm" and a field. Confirm stays `aria-disabled` until the field matches exactly. Enter in the field confirms once it matches. |
| `isDestructive` | boolean | `status === 'danger'` | Start focus on Cancel. |
| `icon` | Node \| markup | `YapUI.icons[status]` | |
| `size`, `placement`, `backdrop` | | `md`, `auto`, `opaque` | As for Modal. |
| `isDismissable` | boolean | `false` | Backdrop clicks don't close an alert dialog. |
| `isKeyboardDismissDisabled` | boolean | `false` | Escape cancels (APG). |

Initial focus: Cancel for destructive confirmations; the field for
type-to-confirm; otherwise the confirm button.

### `YapUI.AlertDialog.alert(options)` → `Promise<void>`

One button (`actionLabel`, default `'Close'`), for something the person must
acknowledge. Same `title`, `description`, `status` options.

### `YapUI.AlertDialog.open(options)`

Same options and controller as `Modal.open`, rendered with the alert-dialog
markup and `role="alertdialog"`, for custom footers. Not dismissable by the
backdrop by default; no X.

### Example: replacing `confirm()` in app.js

```js
async function deleteMessage(m) {
  const ok = await YapUI.AlertDialog.confirm({
    title: !m.parent_id && m.reply_count ? 'Delete this message and its replies?' : 'Delete this message?',
    description: 'This can\'t be undone.',
    status: 'danger',
    confirmLabel: 'Delete',
  });
  if (!ok) return;
  …
}

// Ban, with type-to-confirm
await YapUI.AlertDialog.confirm({
  title: `Ban ${u.username}?`,
  description: 'They\'ll be signed out and can\'t sign in again until unbanned.',
  status: 'danger', confirmLabel: 'Ban', typeToConfirm: u.username,
});
```

`confirm()` is synchronous and this is a Promise, so callers become `async`.
For Yap's two-step ban ("Also delete everything alice has posted?"), prefer one
dialog with a checkbox in a custom `AlertDialog.open` body over a second
confirm whose Cancel means "keep messages".

## Deviations from HeroUI

- **AlertDialog Escape.** HeroUI's AlertDialog defaults `isKeyboardDismissDisabled`
  to `true`. Yap defaults it to `false`: the APG Alert Dialog pattern closes on
  Escape, and `confirm()` returns false on Escape, which callers expect. Backdrop
  clicks still don't dismiss it (`isDismissable: false`, as in HeroUI).
- **Footer button order.** HeroUI's `.modal__footer` is `justify-end`, with Cancel
  before the primary action, so the primary action is last and on the right.
  PatternFly puts buttons left-aligned with the primary first. We follow HeroUI
  (its CSS lays out the footer that way, and it matches macOS); keep the primary last.
- **`--visual-viewport-height`.** React Aria sets it at runtime. `dialogs.js` sets
  it on the backdrop from `window.visualViewport` (updated on resize), and
  `dialogs.css` falls back to `100dvh`.
- **cover/full width.** HeroUI's container is `width: fit-content` from 640px,
  which shrinks `cover` to its content. `dialogs.css` makes the container full
  width for those two sizes.
- **Description.** HeroUI has no description slot; ours is the body's first
  `<p class="yui-dialog-description">`, wired to `aria-describedby`.
- **Dark `--muted`.** `dialogs.css` restores HeroUI's dark `--muted` inside
  dialogs, to work around `theme.css` applying the light value in dark mode.
