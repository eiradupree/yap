# Display components

`web/ui/display.js` and `web/ui/display.css`. They use HeroUI v3's classes and
`data-slot` values, so `vendor/heroui/heroui.css` styles them unchanged;
`display.css` adds only what HeroUI's CSS leaves out (chip remove button,
interactive card and chip states, empty-state layout, reduced motion for
skeletons, and a few contrast fixes).

Every factory returns the root element and accepts `class`, `id`, `style`,
`aria: {…}`, `data: {…}` and flat `aria-*` / `data-*` keys. `children` takes a
string, a node or an array. Icon options take a node or static SVG markup from
our own code (for example `YapUI.icons.success`), never user data.

Sources: NN/g = Nielsen Norman Group, PF = PatternFly.

---

## Avatar

A person, shown as a photo or as their initials.

**Use it when** you show who wrote, owns or is present in something.
**Don't** use it for things that aren't people or groups. Always have a
fallback: PF says an avatar without an image shows initials, and so does this
one, automatically.

```js
YapUI.Avatar({ name: 'Ana Ruiz', src: '/avatars/ana.png' })
YapUI.Avatar({ name: 'Chen Wei', alt: '' })   // name printed next to it
```

| Option | Values | Default |
| --- | --- | --- |
| `name` | Person's name. Initials and the default alt come from it. | `''` |
| `src` | Image URL. | none |
| `alt` | Accessible name. `''` makes the avatar decorative. | `name` |
| `size` | `'sm' \| 'md' \| 'lg'` (32/40/48px) | `'md'` |
| `color` | `'default' \| 'accent' \| 'success' \| 'warning' \| 'danger'` (fallback color) | `'default'` |
| `variant` | `'default' \| 'soft'` | `'default'` |
| `fallback` | Text or node to show instead of the initials. | initials |
| `delayMs` | Hide the fallback this long while the image loads, to avoid a flash. | none |
| `loading`, `crossOrigin`, `onLoad`, `onError` | Passed to / called from the image. | |

Controller `el.yui`:

- `setSrc(src)` swaps the image (or removes it with `null`).
- `setName(name)` updates the initials and the accessible name.
- `status()` returns `'none' | 'loading' | 'loaded' | 'error'` (also on `data-status`).

**Behavior.** The fallback is always rendered. The image sits on top,
invisible until it loads. If it fails to load (404, bad data), it is removed
and the initials stay. Initials are the first letters of the first and last
word, or one letter for a single name (`YapUI.initials(name)`). With no name, a
generic person icon shows.

**ARIA.** The root is `role="img"` with `aria-label` set to the alt text. The
`<img>` has `alt=""` and the initials are `aria-hidden`, so the name is read
once whether or not the photo loaded. With `alt: ''` the whole avatar is
`aria-hidden`. Use that when the name is printed beside it (PF).

### AvatarGroup

```js
YapUI.AvatarGroup({ label: 'In this call', max: 3, total: 12, children: [{ name: 'Ana Ruiz', src }, …] })
```

| Option | Values | Default |
| --- | --- | --- |
| `children` | Avatar elements, or Avatar option objects. Objects inherit `size`, `color` and `variant`. | `[]` |
| `max` | Show at most this many avatars. The rest collapse into a "+N" count. | all |
| `total` | Known total (for example from the server). Sets N to `total - shown`. | none |
| `overlap` | `'clip' \| 'ring'` | `'clip'` |
| `isGrid` | Wrap the avatars with no overlap. | `false` |
| `size`, `color`, `variant` | Defaults for the avatars and the count. | |
| `label` | Gives the group `role="group"` and this `aria-label`. | none |

The "+N" count is named "N more".

---

## Badge

A count or a status dot attached to another element.

**Use it when** you mark another element with a count ("3 unread") or a status
(online, away).
**Don't** use it as a standalone label or tag. Use a Chip (PF, HeroUI). Don't
rely on color alone: PF requires a text equivalent, so pass `label`.

```js
const unread = YapUI.Badge({ color: 'danger', children: '3', label: '3 unread messages' });
YapUI.Badge.Anchor(iconEl, unread);
unread.yui.setContent('4', '4 unread messages');

YapUI.Badge.Anchor(YapUI.Avatar({ name: 'Ana Ruiz' }),
  YapUI.Badge({ color: 'success', placement: 'bottom-right', label: 'Online' }));
```

| Option | Values | Default |
| --- | --- | --- |
| `children` | Visible content. Omit it for a dot. | none (dot) |
| `label` | Screen-reader text ("3 unread messages", "Online"). | none |
| `color` | `'default' \| 'accent' \| 'success' \| 'warning' \| 'danger'` | `'default'` |
| `variant` | `'primary' \| 'secondary' \| 'soft'` | `'primary'` |
| `size` | `'sm' \| 'md' \| 'lg'` | `'md'` |
| `placement` | `'top-right' \| 'top-left' \| 'bottom-right' \| 'bottom-left'` | `'top-right'` |

`YapUI.Badge.Anchor(target, badge)` (also `Badge.Anchor({ children })`, or
`YapUI.BadgeAnchor`) wraps the element in `span.badge-anchor`.

Controller: `el.yui.setContent(children, label)`.

**ARIA.** With `label`, the visible content is `aria-hidden` and the label is
visually hidden text. Without one, a dot is `aria-hidden` (decorative). When
the badge sits on a button, put the anchor inside the button so the count
becomes part of its name. For counts that change live, announce the change
separately (for example with a toast or a live region). A badge isn't a live
region.

---

## Chip

A short label, tag or status.

**Use it when** you tag or categorise something ("design", "Beta") or show a
compact status ("Delivered").

**Don't**:

- Pair a status with color alone. Give status chips an `icon` (PF).
- Use red for anything but danger (PF).
- Use a chip for counts on another element. That's a Badge.

```js
YapUI.Chip({ children: 'Delivered', color: 'success', variant: 'soft', icon: YapUI.icons.success })
YapUI.Chip({ children: 'design', onRemove: (e, chip) => chip.remove() })
YapUI.Chip({ children: 'Mentions', onPress: () => filter('mentions') })
```

| Option | Values | Default |
| --- | --- | --- |
| `children` | Label. | |
| `color` | `'default' \| 'accent' \| 'success' \| 'warning' \| 'danger'` | `'default'` |
| `variant` | `'primary' \| 'secondary' \| 'tertiary' \| 'soft'` | `'secondary'` |
| `size` | `'sm' \| 'md' \| 'lg'` | `'md'` |
| `icon` | Node or static SVG, shown before the label, `aria-hidden`. | none |
| `onRemove(event, chip)` | Adds a remove (×) button. The caller removes the chip and moves focus. | none |
| `removeLabel` | Accessible name of the remove button. | `"Remove <label>"` |
| `onPress(event)` | Makes the whole chip a `<button>`. Don't combine with `onRemove`. | none |
| `isDisabled` | `aria-disabled` on the button. | `false` |

Controller: `el.yui.remove()` (runs `onRemove`), `el.yui.setLabel(text)`.

**Keyboard.**

- The remove button is a real `<button>`: Tab reaches it, and Enter or Space
  removes the chip.
- Delete and Backspace also remove it while the button has focus.
- After a removal, move focus to the next chip's remove button, or to the
  previous one if it was the last (the gallery demo shows how).

Clickable chips have an outline and hover state, so they look different from
static chips (PF).

---

## Card

Groups related content about one subject.

**Use it when** a block of content (a channel, a file, a summary) stands on
its own.
**Don't** nest interactive controls inside a clickable card. If the card has
several actions, keep it static and put buttons in the footer.

```js
YapUI.Card({ title: '#design-reviews', description: '14 members', children: 'Weekly critique…', footer: joinButton })
YapUI.Card({ href: '/notes/2.4', title: 'Release notes', description: 'What changed in 2.4' })
YapUI.Card({ onPress: openThread, title: 'Open thread', description: '12 replies' })
```

| Option | Values | Default |
| --- | --- | --- |
| `variant` | `'transparent' \| 'default' \| 'secondary' \| 'tertiary'` | `'default'` |
| `title` | Title, an `h3` (`headingLevel` changes it). | none |
| `description` | Text under the title (`p.card__description`). | none |
| `header` | Extra nodes in the header. | none |
| `children` | Content (wrapped in `.card__content`), or ready-made parts. | none |
| `footer` | Footer nodes. | none |
| `headingLevel` | 1–6. | `3` |
| `href` | Render the card as an `<a>`. | none |
| `onPress` | Render the card as a `<button>`. | none |
| `role` | Role of a static card. `false` drops it. | `'article'` |

Parts for custom layouts: `Card.Header`, `Card.Title`, `Card.Description`,
`Card.Content` and `Card.Footer`. Each takes `({ children, as })` or the
children directly. A static card built from parts is still labelled by its
`.card__title`.

**ARIA.** A static card is `role="article"` with `aria-labelledby` pointing at
its title, as HeroUI recommends. A link or button card takes its name from its
content. Its parts are spans, because a `<button>` can't contain headings.

### Surface

`YapUI.Surface({ variant: 'default' | 'secondary' | 'tertiary' | 'transparent', children, as: 'div' })`
is a plain container on a surface color, with no semantics. Use it for panels
and for the background that cards sit on.

---

## Separator

**Use it when** you divide groups of content or toolbar items.
**Don't** use it for spacing alone. If the line is purely visual, make it
decorative.

```js
YapUI.Separator()
YapUI.Separator({ orientation: 'vertical' })
YapUI.Separator({ isDecorative: true })
```

| Option | Values | Default |
| --- | --- | --- |
| `orientation` | `'horizontal' \| 'vertical'` | `'horizontal'` |
| `variant` | `'default' \| 'secondary' \| 'tertiary'` | `'default'` |
| `isDecorative` | Hide it from assistive technology. | `false` |

**ARIA.**

- Horizontal renders `<hr>`, which has the implicit role `separator`.
- Vertical renders a div with `role="separator" aria-orientation="vertical"`.
  It needs a flex parent to stretch.
- Decorative renders an `aria-hidden` div with no role.

---

## Spinner

**Use it when** the wait is about 1–5 seconds (PF) or 2–10 seconds (NN/g) and
you don't know the shape of what's loading.

**Don't**:

- Show anything for waits under 1 second. Delay showing the spinner.
- Use it for waits over about 10 seconds or for uploads. Use a ProgressBar.
- Use it when you know the layout. Use a Skeleton.

```js
YapUI.Spinner()
YapUI.Spinner({ size: 'sm', label: 'Loading older messages' })
YapUI.Spinner({ size: 'sm', color: 'current', isDecorative: true })  // inside a "Sending…" button
```

| Option | Values | Default |
| --- | --- | --- |
| `size` | `'sm' \| 'md' \| 'lg' \| 'xl'` (16/24/32/40px) | `'md'` |
| `color` | `'current' \| 'accent' \| 'success' \| 'warning' \| 'danger'` | `'accent'` |
| `label` | Screen-reader text. | `'Loading'` |
| `isDecorative` | `aria-hidden`, no role. Use it when a nearby label already says it's loading. | `false` |

Controller: `el.yui.setLabel(text)`.

**ARIA and motion.** `role="status"` with the label as visually hidden text,
so it's announced when inserted. Under `prefers-reduced-motion: reduce` it
stops spinning (HeroUI's CSS) and still shows as a ring.

---

## Skeleton

**Use it when** you know the layout that's loading (a message list, a card).
Make the skeleton match that layout (PF, NN/g).

**Don't**:

- Show a frame-only skeleton (an empty box).
- Use it for unknown layouts. Use a Spinner.
- Use it for long operations. Use a ProgressBar.

```js
const region = YapUI.Skeleton.Region({ label: 'Loading messages', children: [
  YapUI.Skeleton({ shape: 'circle', width: 40, height: 40 }),
  YapUI.Skeleton({ shape: 'text', width: '70%' }),
] });
region.yui.resolve(...messageNodes);
```

| Option | Values | Default |
| --- | --- | --- |
| `animationType` | `'shimmer' \| 'pulse' \| 'none'` | `'shimmer'` |
| `shape` | `'rect' \| 'circle' \| 'text'` (`text` is a 12px line) | `'rect'` |
| `width`, `height` | CSS lengths. Numbers are px. | from CSS |

`Skeleton.Region({ children, label = 'Loading' })` is a container with
`aria-busy="true"` and a `role="status"` message for screen readers.
`el.yui.resolve(...nodes)` swaps in the loaded content and clears `aria-busy`.

**ARIA and motion.** Every shape is `aria-hidden`; the region carries the
status. Skeletons sit best on a surface (a card). On the page background,
HeroUI's skeleton color is very faint. Under reduced motion, shimmer and pulse
stop. HeroUI doesn't do this for skeletons, so `display.css` adds it.

---

## ProgressBar

**Use it when** a wait is 10 seconds or longer, and for uploads. Show a
percentage or a step count ("2 of 5 files") (NN/g). Use indeterminate only
when you can't know the total.

**Don't** use it for short waits. Use nothing, or a Spinner.

```js
const bar = YapUI.ProgressBar({ label: 'Uploading design-review.mp4', value: 0 });
bar.yui.setValue(42);
YapUI.ProgressBar({ label: 'Uploading files', value: 2, maxValue: 5, valueLabel: ({ value }) => `${value} of 5 files` });
YapUI.ProgressBar({ label: 'Preparing export', isIndeterminate: true });
```

| Option | Values | Default |
| --- | --- | --- |
| `label` | Visible label. The bar is `aria-labelledby` it. | none |
| `aria-label` | Name when there's no visible label. | none |
| `value`, `minValue`, `maxValue` | Numbers. The value is clamped. | `0`, `0`, `100` |
| `isIndeterminate` | Unknown total. | `false` |
| `size` | `'sm' \| 'md' \| 'lg'` | `'md'` |
| `color` | `'default' \| 'accent' \| 'success' \| 'warning' \| 'danger'` | `'accent'` |
| `formatOptions` | `Intl.NumberFormatOptions` for the value text. | `{ style: 'percent' }` |
| `valueLabel` | A string, or `({ value, percentage, valueText }) => string`. | formatted value |
| `showValueLabel` | Show the value at the end of the label row. | `true` |
| `isDisabled` | `aria-disabled`, dimmed. | `false` |

Controller `el.yui`:

- `setValue(n)` also leaves indeterminate mode.
- `setIndeterminate(bool)`
- `setLabel(text)`
- `setValueLabel(v)`
- `value()`

**ARIA.** `role="progressbar"` with `aria-valuemin`, `aria-valuemax`,
`aria-valuenow` and `aria-valuetext` (the same text that's shown).
Indeterminate removes `aria-valuenow` and `aria-valuetext`. HeroUI's CSS also
keys its sweep animation off the missing `aria-valuenow`, and stops it under
reduced motion. Progress bars aren't live regions. Announce completion
separately, for example with "Upload complete".

---

## Alert

Inline feedback about the page or a task.

**Use it when** you show something the user should know about in context: a
paused state, an update, a confirmation, a warning or an error.

**Don't**:

- Use it for transient confirmations. Use a toast.
- Stack many alerts.
- Write "successfully". Lead with the outcome: "Account created." (NN/g).

Errors say what happened and what to do next: "Yap lost its connection. Check
your network, then try again."

```js
YapUI.Alert({ status: 'success', title: 'Account created.', description: 'You can now join channels.' })
YapUI.Alert({ status: 'danger', title: 'Message not sent', description: 'Check your network, then try again.',
  children: [tryAgainButton] })
YapUI.Alert({ status: 'danger', role: 'alert', title: 'Upload failed', description: '…', onClose })
```

| Option | Values | Default |
| --- | --- | --- |
| `status` | `'default' \| 'accent'` (info) `\| 'success' \| 'warning' \| 'danger'` | `'default'` |
| `title`, `description` | Text or nodes. | none |
| `children` | Actions (buttons or links), shown under the description. | none |
| `icon` | Replaces the status icon. `false` hides it. | status icon |
| `statusLabel` | Screen-reader prefix on the title. `false` drops it. | Note / Info / Success / Warning / Error |
| `role` | `'alert' \| 'status' \| null` | `null` |
| `onClose` | Adds a close button and is called after the alert is removed. | none |
| `closeLabel` | Close button name. | `'Close'` |

Controller: `el.yui.close()`.

**Which role.** PF and WAI-ARIA:

- `role: 'alert'` is only for urgent messages inserted while the user works,
  such as a failed send. It interrupts the screen reader.
- `role: 'status'` is for non-urgent messages inserted at runtime, such as
  "Draft saved". They're announced politely.
- Leave `role` off for alerts that are part of the page when it loads.
  Screen readers find them while reading, and a live role would announce
  nothing anyway.

**Meaning beyond color.** Each status has its own icon (`aria-hidden`), and
the title starts with visually hidden status text ("Error: Message not sent").

**Closing.** Inline alerts stay until the user closes them or the problem is
resolved (PF). Don't auto-dismiss them. The close button is labelled "Close".
If focus was inside the alert, move it somewhere sensible in `onClose`.

---

## EmptyState

What to show when there's nothing to show.

**Use it when** a list, search or view has no content: first use, no results,
or a load error.

**Don't**:

- Leave a blank area.
- Write "please", or blame the user.
- Offer more than one primary action (PF).

**Content** (PF):

- The heading is short and plain, in sentence case, with no period: "No
  messages yet".
- The body says what to do next and ends with a period.
- The action label is specific: "Write a message", not "OK".
- Use the small size for "no results" inside a list or panel, and the large
  size for first use, setup and errors.
- The icon is gray by default.

```js
YapUI.EmptyState({
  icon: messageIcon, title: 'No messages yet',
  description: 'Start the conversation with a message to #design-reviews.',
  children: YapUI.Button({ variant: 'primary', children: 'Write a message' }),
})
YapUI.EmptyState({ size: 'sm', icon: YapUI.icons.search, title: 'No results for “roadmap”', description: 'Try a different word.' })
```

| Option | Values | Default |
| --- | --- | --- |
| `size` | `'sm' \| 'lg'` | `'lg'` |
| `icon` | Node or static SVG, gray, `aria-hidden`. | none |
| `title` | Heading text. | none |
| `headingLevel` | 1–6. Pick the level that fits the page outline. | `3` |
| `description` | Body text. | none |
| `children` | The action: one primary button, plus an optional secondary link. | none |

**ARIA.** A heading plus text. No role is needed. If the empty state replaces
results after a search, announce the result count with a status message
elsewhere.
