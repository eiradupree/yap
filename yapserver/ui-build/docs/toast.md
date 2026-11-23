# Toast

`web/ui/toast.js`, `web/ui/toast.css`. Gallery section: `#toast`.

Toasts are brief, passive notifications. They show in a corner of the screen,
stack, and go away on their own or when closed. Yap UI implements HeroUI v3's
Toast (`Toast.Provider` and the `toast()` queue) with HeroUI's markup and
stylesheet. The region is created the first time a toast is shown.

```js
YapUI.toast.success('Message sent.');

const t = YapUI.toast({
  title: 'Message deleted.',
  action: { label: 'Undo', onPress: () => restore(msg) },
});

YapUI.toast.promise(upload(file), {
  loading: `Uploading ${file.name}…`,
  success: (att) => `${att.name} uploaded.`,
  error: (err) => ({ title: 'Upload failed.', description: err.message }),
});
```

## Use it when / Don't

**Use it when:**

- You're confirming something the person just did and can see worked, such as
  "Message sent.", "Link copied." or "Message deleted." PatternFly calls these
  toast alerts. NN/g says toasts suit passive, low-priority notifications.
- You're reporting progress of background work that finishes later
  (`toast.promise`).
- You're offering a short-lived shortcut such as **Undo**, as long as the same
  thing can be done elsewhere.

**Don't:**

- **Don't use a toast as the only way to do something** (PatternFly). A
  keyboard or screen-reader user may never reach it. Undo should also be
  possible from the message's menu or with ⌘Z.
- **Don't report errors the person must act on in a toast.** NN/g calls toasts
  "a bad way to implement an error message": they're far from the cause, easy
  to miss and may disappear. Put validation errors next to the field, and
  blocking failures in an inline Alert or an AlertDialog. A danger toast is
  for failures of background work that have no better home, such as
  "Message not sent. You're offline." This is also why `toast.danger` stays
  until closed.
- **Don't write "successfully".** Lead with the outcome, in past tense and a
  short sentence: "Message deleted.", not "The message was successfully
  deleted!" (PatternFly).
- **Don't put anything a person needs later only in a toast**, such as a
  generated password or a link. Use a dialog or the page.

### Replacing Yap's `alert()` calls

| Today | Use |
| --- | --- |
| `editor.js` "You can attach up to N files to a message." | `toast.warning(...)`, since the extra files simply weren't added. Better still, show it inline in the attachment tray. |
| `editor.js` "Messages can be up to 4,000 characters…" | Show it inline under the message box. It's a validation error the person has to fix. |
| `editor.js` send failure `alert(err.message)` | Show it inline in the composer, since the draft is restored there. If that isn't possible, use `toast.danger({ title: 'Message not sent.', description: err.message })`, which is persistent. |
| `app.js` create-channel and other request failures | Show the error inline in the form that caused it. Use `toast.danger` only for background failures. |

## API

### `YapUI.toast(title, options?)` / `YapUI.toast(options)`

Shows a toast and returns its controller.

| Option | Type | Default | Notes |
| --- | --- | --- | --- |
| `title` | string \| Node | — | Required in practice. It labels the toast. |
| `description` | string \| Node | — | A second line in muted text. |
| `variant` | `'default' \| 'accent' \| 'success' \| 'warning' \| 'danger'` | `'default'` | Sets the icon, the title color and a screen-reader prefix ("Success:", "Warning:", "Error:"). |
| `timeout` | ms | `8000`; `0` for danger, action and loading toasts | `0` keeps the toast until it's closed. |
| `action` | `{ label, onPress(event, toast), variant? }` | — | Renders a `.button.button--sm.button--tertiary.toast__action`. Pressing it calls `onPress` and then closes the toast, unless `onPress` calls `event.preventDefault()`. |
| `isLoading` | boolean | `false` | Shows a spinner in the indicator, sets `aria-busy` and holds the timer. |
| `indicator` | Node \| `null` | variant icon | `null` hides the indicator. |
| `onClose` | `(reason) => void` | — | `reason` is `'timeout'`, `'close'`, `'action'`, `'api'` or `'clear'`. It's called when dismissal starts. |

**Controller:** `{ id, close(), update(options), isOpen }`.

- `update(options)` changes the toast in place. It keeps the toast's place in
  the stack and announces the new text.
- Leaving out `timeout` in an update keeps the current one, except when a
  loading toast finishes: it then gets its default (8 s, or persistent for
  danger and action toasts).

### Shortcuts

| Function | Does |
| --- | --- |
| `toast.success(...)` | Same arguments as `toast()`; sets the variant. |
| `toast.warning(...)` | Same; sets the variant. |
| `toast.danger(...)` | Same; sets the variant. Persistent by default. |
| `toast.accent(...)` | Same; sets the variant. |
| `toast.default(...)` | Same; sets the variant. |
| `toast.info(...)` | Alias of `accent`, as in HeroUI. |
| `toast.promise(promiseOrFn, { loading, success, error })` | Shows a loading toast and updates it to success or danger when the promise settles. Each message is a string or an options object. `success` and `error` can also be functions of the result or the error. Returns the controller plus `.promise`. |
| `toast.update(id, options)` | Same as `controller.update`. |
| `toast.close(id)` | Closes one toast. |
| `toast.clear()` | Closes every toast. |
| `toast.pauseAll()` / `toast.resumeAll()` | Hold or release every timer. |
| `toast.getToasts()` | Returns the open toasts' controllers, newest first. |

### `toast.configure(options)`

Applies to the single region and returns the resulting settings.

| Option | Default | HeroUI | Notes |
| --- | --- | --- | --- |
| `placement` | `'bottom end'` | `'bottom'` | `'top start' \| 'top' \| 'top end' \| 'bottom start' \| 'bottom' \| 'bottom end'`. Used at 640px and wider. |
| `narrowPlacement` | `'top'` | — | Used below 640px (HeroUI's `sm`). There the region is full width minus 16px on each side, and it sits clear of the message box. |
| `maxVisible` | `3` | `maxVisibleToasts: 3` | Toasts beyond this are hidden behind an "N more notifications" button. |
| `timeout` | `8000` | `4000` | The default for toasts that time out. |
| `gap` | `8` | `12` | The space between expanded toasts (PatternFly uses 8px). |
| `width` | `460` | `460` | Sets `--toast-width`. |
| `offset` | `16` | — | Distance in px from the viewport edge, plus the safe area. In Yap, set it so bottom placements clear the message box, for example `configure({ offset: composer.offsetHeight + 16 })`. |
| `hotkey` | `true` | `['altKey', 'KeyT']` | Turns Alt+T and F6 on or off. |

The collapsed-stack constants are fixed: `scaleFactor` 0.05 (HeroUI) and a
12px peek per toast behind the front one.

## Behavior

### Stacking

- Toasts render newest first in `.toast-region`, so DOM order, tab order and
  `data-index` all match the stack.
- The newest toast has `data-frontmost="true"`. Older ones sit behind it,
  scaled by `--scale-collapsed` and offset by `--offset-collapsed`, with only
  their edge showing.
- When the pointer is over the region or focus is inside it, the stack
  expands. `data-expanded="true"` is set and each toast moves to
  `--offset-expanded`, 8px apart.
- Beyond `maxVisible`, toasts get `data-hidden="true"` and are `inert` and
  `aria-hidden`. An **"N more notifications"** button (PatternFly's overflow
  count) reveals all of them; it then reads "Show fewer" and has
  `aria-expanded`. Leaving the region collapses the stack again.
- Collapsed toasts behind the front one aren't tab stops. Focusing the front
  toast expands the stack, which makes them reachable.

### Lifetime

- **8 seconds by default** (PatternFly), longer than HeroUI's 4 s, so there's
  time to read.
- **Persistent by default:** toasts with an `action` (PatternFly), `danger`
  toasts (NN/g: a person should never miss an error that vanished), and
  loading toasts. An explicit `timeout` always wins.
- **Timers pause** while the pointer is over the region, while focus is
  inside it, while the tab is hidden, and between `pauseAll()` and
  `resumeAll()`. They then resume with the time that was left.
- **Hidden toasts don't time out.** A toast's timer starts only once it's
  visible, so nothing disappears unseen behind the stack. HeroUI keeps hidden
  toasts' timers running.
- **Every toast has a close button,** and it's always visible on the toasts you
  can see. HeroUI shows it only on hover, which leaves touch and keyboard
  users without it. It's 24px (HeroUI uses 20px) to meet WCAG 2.5.8's target
  size.

### Keyboard and focus

| Key | Does |
| --- | --- |
| Alt+T (Option+T on Mac), F6 | Moves focus to the newest toast, from anywhere on the page. Does nothing when no toast is showing, so the keys keep their usual meaning. |
| Tab / Shift+Tab | Moves through the toasts, their action and close buttons, and the "N more" button. |
| Enter / Space | Activates the focused button. |
| Escape, F6 (inside the region) | Collapses the stack and returns focus to where it was before. |

- **Toasts never take focus on their own.** Showing, updating or settling a
  toast leaves focus where it was.
- When a focused toast closes, focus moves to the toast that takes its place
  (the next older one), or else the next newer one. If none is left, focus
  goes back to where it was before entering the region.

### Screen readers

- The region is a `<section aria-label="Notifications" aria-keyshortcuts="Alt+T">`
  landmark.
- Each toast is `role="group"`, labelled by its title (`aria-labelledby`) and
  described by its description (`aria-describedby`).
- Announcements go through two visually hidden live regions inside the
  landmark. Both exist before any message is added, which is what makes
  announcements reliable.
  - `role="status"` (polite) for default, accent, success and warning toasts.
  - `role="alert"` (assertive) for danger toasts.
- Each announcement is the variant prefix, title and description, for example
  "Error: Message not sent. You're offline. Yap will keep your draft."
- Toasts with an action add "Press Alt+T to reach Undo." That's the only way a
  screen-reader user learns the action exists without hunting for it.
- `update()` and `toast.promise` settling announce the new text.

### Motion

- Toasts slide in and out with HeroUI's transitions, driven by
  `data-entering` and `data-exiting`.
- Under `prefers-reduced-motion: reduce`, HeroUI's stylesheet turns the
  transitions off and closing removes the toast at once.

## Markup

```html
<section class="toast-region toast-region--bottom-end" data-slot="toast-region" data-placement="bottom end"
         aria-label="Notifications" aria-keyshortcuts="Alt+T" tabindex="-1" data-expanded="false">
  <div class="yui-toast-list">
    <div class="toast toast--bottom-end toast--success" data-slot="toast" role="group" id="yui-toast-1"
         aria-labelledby="yui-toast-1-title" tabindex="0"
         data-index="0" data-frontmost="true" data-hidden="false" data-expanded="false" data-placement="bottom end"
         style="--offset-collapsed:0px; --offset-expanded:0px; --scale-collapsed:1; --front-height:56px; --toast-height:56px; z-index:1">
      <div class="toast__indicator" data-slot="toast-indicator"><svg data-slot="toast-default-icon">…</svg></div>
      <div class="toast__content" data-slot="toast-content">
        <div class="toast__title" data-slot="toast-title" id="yui-toast-1-title"><span class="yui-visually-hidden">Success: </span>Message deleted.</div>
      </div>
      <button class="button button--sm button--tertiary toast__action" data-slot="toast-action-button">Undo</button>
      <button class="close-button close-button--default toast__close-button" data-slot="toast-close" aria-label="Close notification"><svg data-slot="close-button-icon">…</svg></button>
    </div>
  </div>
  <button class="button button--sm button--tertiary yui-toast-overflow" hidden>3 more notifications</button>
  <div class="yui-visually-hidden" role="status"></div>
  <div class="yui-visually-hidden" role="alert"></div>
</section>
```

The inline styles are set through the CSSOM, which the CSP allows.

## Differences from HeroUI, and why

| HeroUI | Yap UI | Why |
| --- | --- | --- |
| Each toast is `role="alertdialog"`. | Each toast is `role="group"`; announcements go through `status`/`alert` live regions. | A toast that never takes focus isn't a dialog, and many screen readers don't announce an `alertdialog` that appears without focus. Live regions that already exist announce reliably without moving focus. |
| `timeout` 4000. | 8000. | PatternFly: 8 s gives time to read. |
| Every toast times out unless `timeout: 0`. | Danger, action and loading toasts are persistent by default. | PatternFly (actions) and NN/g (errors). |
| The close button shows only on hover. | The close button is always visible, and 24px. | Touch, keyboard and low-vision users need it; WCAG 2.5.8. |
| `gap` 12. | `gap` 8 when expanded; collapsed toasts still peek out by 12px. | PatternFly spacing; a peek of 8px would be hard to see. |
| Hidden toasts keep timing out, and there's no overflow count. | Hidden toasts' timers wait until they're visible, and "N more notifications" reveals them. | PatternFly overflow; nothing disappears unseen. |
| Escape blurs, leaving focus on `<body>`. | Escape returns focus to where it was. | Focus shouldn't be lost. |
| `placement` default `'bottom'`. | `'bottom end'` on desktop and `'top'` below 640px, with a configurable `offset`. | Clear of Yap's message box. |
| Region is focused with Alt+T. | Alt+T and F6 focus the newest toast, and only when one is showing. | The region has no height of its own, so its focus ring would be invisible; the toast's ring is. |
| Variant is shown by color and icon only. | Adds a visually hidden "Success:", "Warning:" or "Error:" prefix. | So the variant isn't conveyed by color alone (PatternFly does the same). |

## Known limits

- **Modals hide toasts from assistive technology.** `YapUI.isolate()` makes
  every portal sibling of a modal `inert`, including the toast region. While a
  modal is open, toasts can't be reached, and their live regions are out of
  the accessibility tree, so screen readers may not announce them. Call
  `toast.pauseAll()` while a modal is open if that matters, or wait for core
  support for keeping the region outside isolation.
