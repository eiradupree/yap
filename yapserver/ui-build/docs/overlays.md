# Overlays: Tooltip and Popover

`web/ui/overlays.js` and `overlays.css`. Both components attach to an existing
trigger element and return a controller. The overlay renders HeroUI's markup
into `YapUI.portal()` only while it's open, is positioned with
`YapUI.position` / `YapUI.autoUpdate`, flips when there's no room, and
animates with HeroUI's `data-entering` / `data-exiting` motion (skipped under
`prefers-reduced-motion`).

Gallery: `ui/gallery.html#tooltip`, `#popover`. Tests: `PORT=9330 node test/run.mjs overlays`.

## Tooltip

Short text that identifies a control. It shows on hover after a short delay,
and immediately on keyboard focus.

### Use it when / Don't

Use it when:

- You need to name an icon-only control or show its keyboard shortcut ("Bold ⌘B"). Give tooltips to all icons in a set, or to none. [NN/g, Tooltip Guidelines]
- You need to say why a control is disabled. Make the control `aria-disabled="true"` so it stays focusable, and pass `showWhenDisabled: true`. [PatternFly, Tooltip]

Don't:

- Put vital information in a tooltip. Tooltips are supplementary, and touch users never see them. [NN/g]
- Put error messages in a tooltip. Show errors next to the field. [NN/g]
- Make the tooltip a control's only label. A tooltip on a button with no name sets the button's `aria-label` from its text as a fallback, but name the control yourself (`aria-label`) whenever you can.
- Write more than a short phrase, or cover related content the user needs to see. For a sentence or more of context, or anything interactive, use a Popover. [PatternFly, NN/g]

### Options

`const tip = YapUI.Tooltip(trigger, options)`

| Option | Type | Default | Notes |
| --- | --- | --- | --- |
| `content` | string \| Node | `''` | Text, or a node built with `YapUI.h`. Never an HTML string. |
| `delay` | ms | `300` | Before showing on hover. HeroUI defaults to 1500; Yap's editor and PatternFly use 300. |
| `closeDelay` | ms | `500` | Before hiding after the pointer leaves the trigger and the tooltip. |
| `trigger` | `'hover'` \| `'focus'` | `'hover'` | `'hover'` shows on hover and on keyboard focus; `'focus'` only on keyboard focus. |
| `placement` | `'top'` \| `'bottom'` \| `'left'` \| `'right'` (+ `' start'` / `' end'`) | `'top'` | |
| `offset` | px | `3`, or `7` with the arrow | Gap to the trigger. |
| `showArrow` | boolean | `false` | HeroUI's arrow, pointing at the trigger's center. |
| `shouldFlip` | boolean | `true` | Flip to the opposite side when there's no room. |
| `isDisabled` | boolean | `false` | Never show. |
| `showWhenDisabled` | boolean | `false` | Show even when the trigger is `disabled` or `aria-disabled="true"`. Yap addition. |
| `class` | string | | Extra classes on `.tooltip`. |
| `onOpenChange` | `(isOpen) => void` | | |

Controller:

| Method | |
| --- | --- |
| `open()` | Show now, without the delay. |
| `close()` | Hide, with the exit animation. |
| `update()` | Reposition. Call this if the trigger moved without a scroll or resize. |
| `setContent(x)` | Replace the content (string or Node). This updates the fallback `aria-label` if the tooltip names the trigger. |
| `setDisabled(bool)` | Same as `isDisabled`. |
| `isOpen()` | |
| `destroy()` | Hide, remove the listeners and undo the attributes it set. |

### Behavior

- **Hover.** The tooltip shows after `delay` and hides `closeDelay` after the pointer leaves. Moving onto the tooltip keeps it open, so it's hoverable (WCAG 1.4.13). Touch doesn't trigger it.
- **Warm-up.** Once one tooltip has shown, hovering a neighbor within 500 ms of it closing shows the neighbor's tooltip at once, as React Aria does. This makes toolbars quick to scan.
- **Keyboard.** The tooltip shows immediately when the trigger gets keyboard focus, using `YapUI.isKeyboardFocus()`. It doesn't show on mouse focus. Blur hides it.
- **Hiding.** It hides on Escape (through `YapUI.pushLayer`, so it's the top layer), any pointer press (pressing the trigger keeps it hidden until the pointer leaves), Enter or Space on the trigger, and once the page scrolls the trigger.
- **One at a time.** Opening a tooltip removes any other at once.
- **Disabled triggers.** A trigger that is `disabled` or `aria-disabled="true"` gets no tooltip unless you pass `showWhenDisabled`. HeroUI's buttons set `pointer-events: none` when `aria-disabled`. `overlays.css` restores hover for these triggers but keeps the disabled look. The button still receives clicks, so your click handler must ignore them while it's `aria-disabled`. A natively `disabled` button can't be focused, and browsers don't reliably send it pointer events, so use `aria-disabled`.
- **ARIA.** The tooltip is `role="tooltip"` with an id. While it's open, the trigger's `aria-describedby` includes that id. If the trigger has no accessible name (no `aria-label`, `aria-labelledby`, `title` or text), the tooltip text becomes its `aria-label` instead, and no `aria-describedby` is added, so the text isn't announced twice.

Markup:

```html
<div class="tooltip" role="tooltip" id="yui-tooltip-3" data-placement="top">
  <div class="yui-overlay-arrow" aria-hidden="true"><svg data-slot="overlay-arrow" …/></div>
  <div class="yui-tooltip__content">Bold <kbd class="yui-tooltip__kbd">⌘B</kbd></div>
</div>
```

### Example

```js
const bold = YapUI.h('button', { type: 'button', class: 'button button--ghost button--icon-only', 'aria-label': 'Bold', html: icons.bold });
YapUI.Tooltip(bold, { content: YapUI.h('span', null, 'Bold', YapUI.h('kbd', { class: 'yui-tooltip__kbd', text: '⌘B' })) });

// Explaining a disabled control
YapUI.Tooltip(deleteBtn, { content: 'Only channel admins can delete a channel', showWhenDisabled: true });
```

## Popover

A non-modal dialog that opens when the trigger is clicked. It holds a little more context than a tooltip (1–3 sentences), or a small form.

### Use it when / Don't

Use it when:

- You need to give extra context on demand, often from a "?" icon button next to a label. [PatternFly, Popover]
- You need a small, self-contained task, such as setting a status or renaming something, that doesn't deserve a modal.

Don't:

- Put critical information in a popover. Users may never open it. [PatternFly]
- Use it for a single word or label. Use a Tooltip. [PatternFly]
- Use it for long content, or for tasks that must block the page. Use a Modal.
- Leave it without a way to close it. Escape and outside click always work. For content longer than a line, also add a close button (`slot="close"`) or an action that closes it. [PatternFly]

### Options

`const pop = YapUI.Popover(trigger, options)`

| Option | Type | Default | Notes |
| --- | --- | --- | --- |
| `children` (or `content`) | string \| Node \| array | | The dialog's contents. |
| `heading` | string \| Node | | A shortcut that renders `Popover.Heading(heading)` first. |
| `aria-label` | string | | The dialog's name when there's no heading. |
| `placement` | `'top'` \| `'bottom'` \| `'left'` \| `'right'` (+ `' start'` / `' end'`) | `'bottom'` | |
| `offset` | px | `8` | |
| `shouldFlip` | boolean | `true` | |
| `showArrow` | boolean | `false` | HeroUI's `popover-overlay-arrow`. |
| `isOpen` / `defaultOpen` | boolean | `false` | Open once the trigger is in the page, on the next frame. This doesn't move focus. |
| `initialFocus` | selector | | What to focus on open. By default it's the first focusable element, or the dialog itself. |
| `class` | string | | Extra classes on `.popover`. |
| `onOpenChange` | `(isOpen) => void` | | |

Helpers:

- `YapUI.Popover.Heading(text, level = 3)` returns `<h3 class="popover__heading">`. The first heading in the popover labels the dialog through `aria-labelledby`.
- `YapUI.Popover.Dialog(...children)` returns a bare `.popover__dialog`. `Popover()` already builds one, so you only need this to match HeroUI's anatomy in your own markup.

Any element inside the popover with `slot="close"` (React Aria's convention) or `data-yui-close` closes it when clicked.

Optional layout classes (in `overlays.css`):

- `.yui-popover__header`: a row with the heading and a close button.
- `.yui-popover__body`: muted body text.
- `.yui-popover__field`: a label above its input.
- `.yui-popover__footer`: actions, aligned right.

Controller:

| Member | |
| --- | --- |
| `open()`, `close()`, `toggle()` | |
| `isOpen()` | |
| `update()` | Reposition. |
| `destroy()` | Close at once, remove the listeners and the trigger's ARIA attributes. |
| `el`, `dialog` | The `.popover` and `.popover__dialog` elements, which exist even while closed. |

### Behavior

- **Trigger.** The trigger gets `aria-haspopup="dialog"` and `aria-expanded`. While the popover is open, it also gets `aria-controls` pointing at the dialog. Clicking the trigger (or pressing Enter or Space on it) toggles the popover. A trigger with `aria-disabled="true"` doesn't open it.
- **Dialog.** The content is `role="dialog"`, labelled by its heading. It's non-modal: the page stays interactive and focus isn't trapped.
- **Focus.** Opening moves focus into the popover. Escape, the close button, or an action that calls `close()` returns focus to the trigger. An outside click closes it and returns focus to the trigger, unless the click focused something else.
- **Tab.** Tab past the last element closes the popover and moves focus to the next control after the trigger in page order. Shift+Tab before the first element goes back to the trigger. If focus moves anywhere else outside the popover, it closes.
- **Layers.** Escape and outside clicks go through `YapUI.pushLayer`, so only the topmost overlay closes. A tooltip shown inside or over a popover doesn't stop an outside click from closing the popover.
- **Position.** The popover follows its trigger when the page scrolls or the window resizes (`autoUpdate`), and flips when there's no room.

### Example

```js
const help = YapUI.h('button', { type: 'button', class: 'button button--ghost button--icon-only', 'aria-label': 'About channel roles', html: helpIcon });
YapUI.Popover(help, {
  showArrow: true,
  children: [
    YapUI.h('div', { class: 'yui-popover__header' },
      YapUI.Popover.Heading('Channel roles'),
      YapUI.h('button', { type: 'button', class: 'close-button close-button--default', slot: 'close', 'aria-label': 'Close', html: YapUI.icons.close })),
    YapUI.h('p', { class: 'yui-popover__body', text: 'Admins can rename the channel and remove members.' }),
  ],
  onOpenChange: (open) => console.log('popover', open),
});
```

## Differences from HeroUI

- **Tooltip delay** is 300 ms, not 1500 ms, to match Yap's editor and PatternFly. It's an option.
- **Tooltip line breaking.** HeroUI's `.tooltip` uses `word-break: break-all`, which splits ordinary words. `overlays.css` uses `word-break: normal; overflow-wrap: anywhere` instead.
- **Text color.** `.tooltip` and `.popover` set `color: var(--overlay-foreground)`, because portal content shouldn't depend on inherited color.
- **Popover max-width.** Popovers get `max-width: min(20rem, 100vw - 16px)`. HeroUI sets no width, so text runs as wide as the viewport allows.
- **Arrow placement.** React Aria positions `OverlayArrow` with inline styles. Here a `.yui-overlay-arrow` wrapper is positioned by `--yui-arrow-x` / `--yui-arrow-y`, and HeroUI's CSS still styles and rotates the `<svg data-slot="overlay-arrow">` (tooltip) or `<svg data-slot="popover-overlay-arrow">` (popover).
- **Trigger classes.** `.tooltip__trigger` and `.popover__trigger` aren't added to the trigger. They set `display: inline-block`, which would break `.button`'s `inline-flex` layout. HeroUI uses them on wrapper elements.
- **No `--tooltip-delay` CSS variable.** The delays are JavaScript options.
- **Controlled `isOpen`** has no React equivalent here. It only sets the initial state. Use the controller's `open()` and `close()`.
