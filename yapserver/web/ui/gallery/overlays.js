'use strict';

// Gallery sections for overlays: Tooltip and Popover.
(() => {
  const { h, icons, gallery } = YapUI;
  const { section, example } = gallery;

  // Plain HeroUI button markup, so this file doesn't depend on actions.js.
  const btn = (text, variant = 'secondary', props = {}) =>
    h('button', { type: 'button', class: `button button--${variant}`, ...props }, text);
  const ico = (body) => `<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" data-slot="icon">${body}</svg>`;
  const glyphs = {
    bold: ico('<path d="M7 5h6a3.5 3.5 0 0 1 0 7H7zM7 12h7a3.5 3.5 0 0 1 0 7H7z"/>'),
    italic: ico('<path d="M10 5h8M6 19h8M14 5l-4 14"/>'),
    link: ico('<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>'),
    settings: ico('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>'),
    help: ico('<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6v.6M12 17v.01"/>'),
  };
  const iconBtn = (glyph, props = {}) =>
    h('button', { type: 'button', class: 'button button--ghost button--icon-only', html: glyph, ...props });
  const shortcut = (label, keys) => h('span', null, label, h('kbd', { class: 'yui-tooltip__kbd', text: keys }));
  const mod = YapUI.isMac ? '⌘' : 'Ctrl+';

  section('tooltip', 'Tooltip',
    'Short text that identifies a control, shown on hover after a short delay and immediately on keyboard focus. Supplementary only: never the sole label, never an error message.',
    (body) => {
      const log = gallery.log('Tooltip events');
      const watch = (name) => (open) => log.set(`${name} ${open ? 'opened' : 'closed'}`);
      const tip = (el, opts, name) => { YapUI.Tooltip(el, { onOpenChange: watch(name || el.textContent.trim() || el.getAttribute('aria-label')), ...opts }); return el; };

      body.append(
        example('Placement',
          ...['top', 'bottom', 'left', 'right'].map((p) =>
            tip(btn(p[0].toUpperCase() + p.slice(1), 'secondary', { 'data-demo': 'tip-' + p }), { content: `Placed ${p}`, placement: p }))),
        example('With arrow',
          ...['top', 'bottom', 'left', 'right'].map((p) =>
            tip(btn(p[0].toUpperCase() + p.slice(1), 'tertiary', { 'data-demo': 'tip-arrow-' + p }), { content: 'With an arrow', placement: p, showArrow: true }))),
        example('Toolbar with shortcuts (move between buttons: no second delay)',
          h('div', { role: 'toolbar', 'aria-label': 'Formatting', style: { display: 'flex', gap: '4px' } },
            tip(iconBtn(glyphs.bold, { 'aria-label': 'Bold', 'data-demo': 'tip-bold' }), { content: shortcut('Bold', mod + 'B') }, 'Bold'),
            tip(iconBtn(glyphs.italic, { 'aria-label': 'Italic', 'data-demo': 'tip-italic' }), { content: shortcut('Italic', mod + 'I') }, 'Italic'),
            tip(iconBtn(glyphs.link, { 'aria-label': 'Link', 'data-demo': 'tip-link' }), { content: shortcut('Link', mod + 'K') }, 'Link'))),
        example('Icon button named by its tooltip (aria-label is set from the text)',
          tip(iconBtn(glyphs.settings, { 'data-demo': 'tip-nameless' }), { content: 'Channel settings' }, 'Channel settings')),
        example('Explains a disabled control (showWhenDisabled)',
          tip(btn('Delete channel', 'danger', { 'aria-disabled': 'true', 'data-demo': 'tip-disabled' }),
            { content: 'Only channel admins can delete a channel', showWhenDisabled: true }),
          tip(btn('No tooltip', 'secondary', { 'aria-disabled': 'true', 'data-demo': 'tip-disabled-off' }),
            { content: 'You should never see this' })),
        example('Keyboard focus only (trigger: focus)',
          tip(btn('Focus me', 'outline', { 'data-demo': 'tip-focus' }), { content: 'Shown on keyboard focus only', trigger: 'focus' })),
        example('Near the edge (flips)',
          tip(btn('Left at the edge', 'secondary', { 'data-demo': 'tip-edge-left' }), { content: 'No room on the left, so it flips right', placement: 'left' }),
          tip(btn('Bottom', 'secondary', { 'data-demo': 'tip-edge-bottom' }), { content: 'Flips to the top near the bottom of the window', placement: 'bottom' })),
        log);
    });

  section('popover', 'Popover',
    'A non-modal dialog that opens on click and holds a little more context (1–3 sentences) or a small form. Escape, a click outside, a close button or tabbing out closes it.',
    (body) => {
      const log = gallery.log('Popover events');
      const watch = (name) => (open) => log.set(`${name} ${open ? 'opened' : 'closed'}`);

      // Heading, text and a close button, from a "?" icon trigger.
      const help = iconBtn(glyphs.help, { 'aria-label': 'About channel roles', 'data-demo': 'pop-help' });
      YapUI.Popover(help, {
        showArrow: true,
        onOpenChange: watch('Channel roles'),
        children: [
          h('div', { class: 'yui-popover__header' },
            YapUI.Popover.Heading('Channel roles'),
            h('button', { type: 'button', class: 'close-button close-button--default', slot: 'close', 'aria-label': 'Close', html: icons.close })),
          h('p', { class: 'yui-popover__body', text: 'Admins can rename the channel and remove members. Members can post and react.' }),
          h('p', { class: 'yui-popover__body' }, h('a', { href: '#popover', class: 'link', text: 'Learn more about roles' })),
        ],
      });

      // A small form.
      const statusBtn = btn('Set status', 'secondary', { 'data-demo': 'pop-form' });
      const input = h('input', { class: 'input', id: 'yui-demo-status', name: 'status', placeholder: 'In a meeting', autocomplete: 'off' });
      const form = h('form', { style: { marginTop: '8px' } },
        h('div', { class: 'yui-popover__field' },
          h('label', { class: 'label', for: 'yui-demo-status', text: 'Status' }), input),
        h('div', { class: 'yui-popover__footer' },
          h('button', { type: 'button', class: 'button button--tertiary button--sm', slot: 'close', text: 'Cancel' }),
          h('button', { type: 'submit', class: 'button button--primary button--sm', text: 'Save' })));
      const statusPop = YapUI.Popover(statusBtn, {
        onOpenChange: watch('Set status'),
        children: [YapUI.Popover.Heading('Set your status'), form],
      });
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        statusPop.close();
        log.set(`Saved status "${input.value || 'In a meeting'}"`);
      });

      const placed = ['top', 'bottom', 'left', 'right'].map((p) => {
        const b = btn(p[0].toUpperCase() + p.slice(1), 'tertiary', { 'data-demo': 'pop-' + p });
        YapUI.Popover(b, { placement: p, showArrow: true, onOpenChange: watch('Popover ' + p),
          heading: `Placed ${p}`, children: h('p', { class: 'yui-popover__body', text: 'Flips to the other side when there is no room.' }) });
        return b;
      });

      const edge = btn('Near the bottom', 'secondary', { 'data-demo': 'pop-edge' });
      YapUI.Popover(edge, { showArrow: true, onOpenChange: watch('Near the bottom'), heading: 'Flipped',
        children: h('p', { class: 'yui-popover__body', text: 'There was no room below the button, so this opened above it.' }) });

      // Room on every side, so each placement shows as asked.
      const centered = (ex) => { const d = ex.querySelector('.gallery-example__demo'); d.style.justifyContent = 'center'; d.style.maxWidth = '720px'; return ex; };
      body.append(
        example('Heading, text and close button', help),
        example('Small form', statusBtn),
        centered(example('Placement, with arrow', ...placed)),
        example('Near the edge (flips)', edge),
        log);
    });
})();
