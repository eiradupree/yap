'use strict';

// Gallery sections for display: avatar, badge, chip, card, separator,
// spinner, skeleton, progress-bar, alert, empty-state.
(() => {
  const Y = window.YapUI;
  const { h, icons } = Y;
  const { example, log } = Y.gallery;

  // Demo layout, applied through the CSSOM (the CSP forbids style attributes,
  // and the gallery's stylesheet is shared).
  const DEMO = {
    'yui-demo-row': { display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '12px' },
    'yui-demo-col': { display: 'flex', flexDirection: 'column', gap: '8px', minWidth: '0' },
    'yui-demo-grid': { display: 'grid', gap: '16px' },
    'yui-demo-caption': { color: 'var(--muted)', fontSize: '0.75rem', minWidth: '64px' },
    'yui-demo-name': { fontWeight: '500' },
    'yui-demo-person': { display: 'inline-flex', alignItems: 'center', gap: '10px', marginInlineEnd: '12px' },
    'yui-demo-box': { display: 'inline-block', width: '40px', height: '40px', borderRadius: '12px', background: 'var(--default)' },
    'yui-demo-card': { width: '240px' },
    'yui-demo-card--wide': { width: '360px' },
    'yui-demo-icon': { display: 'inline-flex', padding: '2px' },
    'yui-demo-spacer': { flex: '1' },
    'yui-demo-surface': { padding: '16px', borderRadius: '16px', width: '200px', border: '1px solid var(--border)' },
    'yui-demo-toolbar': { height: '28px', gap: '10px' },
    'yui-demo-msglist': { display: 'flex', flexDirection: 'column', gap: '16px', width: '420px', maxWidth: '100%' },
    'yui-demo-msg': { display: 'flex', alignItems: 'flex-start', gap: '12px' },
    'yui-demo-progress': { width: '320px', maxWidth: '100%' },
    'yui-demo-full': { width: '100%' },
    'yui-demo-wide': { width: '520px', maxWidth: '100%' },
    'yui-demo-stack': { display: 'flex', flexDirection: 'column', gap: '8px', width: '560px', maxWidth: '100%' },
    'yui-demo-sepcol': { display: 'flex', flexDirection: 'column', gap: '8px', width: '320px', maxWidth: '100%' },
    'yui-demo-panel': { padding: '16px' },
  };
  function styleDemos(root) {
    for (const [cls, st] of Object.entries(DEMO)) {
      const els = [...root.querySelectorAll('.' + cls)];
      if (root.classList && root.classList.contains(cls)) els.push(root);
      for (const el of els) for (const [k, v] of Object.entries(st)) el.style[k] = v;
    }
    for (const el of root.querySelectorAll('.yui-demo-col > .separator--horizontal, .yui-demo-col > .yui-demo-col')) el.style.width = '100%';
  }
  const section = (id, title, intro, build) => Y.gallery.section(id, title, intro, (body) => { build(body); styleDemos(body); });

  // Static icons for the demos (our own markup).
  const ico = (body, size = 16) => `<svg viewBox="0 0 24 24" width="${size}" height="${size}" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" data-slot="icon">${body}</svg>`;
  const demoIcons = {
    message: ico('<path d="M20 15a2 2 0 0 1-2 2H8l-4 4V5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2z"/>'),
    search: icons.search,
    hash: ico('<path d="M5 9h14M5 15h14M10 3 8 21M16 3l-2 18"/>'),
    cloudOff: ico('<path d="m3 3 18 18"/><path d="M8.5 6.2A6 6 0 0 1 17.7 10h.3a4 4 0 0 1 2.6 7"/><path d="M17 18H7a5 5 0 0 1-1.9-9.6"/>'),
    upload: ico('<path d="M12 16V4M7 9l5-5 5 5"/><path d="M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3"/>'),
  };

  // Photo stand-ins as data: URIs (the CSP allows img-src data:).
  const photo = (a, b) => 'data:image/svg+xml,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 80"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs><rect width="80" height="80" fill="url(#g)"/><circle cx="40" cy="32" r="14" fill="#fff" fill-opacity=".85"/><path d="M14 80a26 22 0 0 1 52 0z" fill="#fff" fill-opacity=".85"/></svg>`);
  const photos = { ana: photo('#7c6cf0', '#3b2fa8'), ben: photo('#f59e0b', '#c2410c'), chen: photo('#10b981', '#047857'), dee: photo('#ec4899', '#9d174d') };

  // HeroUI button markup, so the demos don't depend on the actions family.
  const button = (text, variant = 'primary', on) => {
    const b = h('button', { type: 'button', class: `button button--${variant} button--sm`, 'data-slot': 'button' }, text);
    if (on) b.addEventListener('click', on);
    return b;
  };
  const row = (...kids) => h('div', { class: 'yui-demo-row' }, ...kids);
  const col = (...kids) => h('div', { class: 'yui-demo-col' }, ...kids);
  const caption = (t) => h('span', { class: 'yui-demo-caption' }, t);

  const COLORS = ['default', 'accent', 'success', 'warning', 'danger'];
  const SIZES = ['sm', 'md', 'lg'];

  // ---- Avatar ----
  section('avatar', 'Avatar', 'A person, shown as a photo or their initials. The fallback shows while the photo loads and stays if it fails. Alt text is the name, or empty when the name is printed beside it.', (body) => {
    body.append(
      example('Sizes', ...SIZES.map((size) => Y.Avatar({ name: 'Ana Ruiz', src: photos.ana, size }))),
      example('Initials fallback, every color', ...COLORS.map((color) => Y.Avatar({ name: { default: 'Ben Okafor', accent: 'Ana María Ruiz', success: 'Chen Wei', warning: 'Dee', danger: 'Eli Stone' }[color], color }))),
      example('Soft variant', ...COLORS.map((color) => Y.Avatar({ name: 'Mo Patel', color, variant: 'soft' }))),
      example('Fallback sizes', ...SIZES.map((size) => Y.Avatar({ name: 'Mo Patel', size, color: 'accent', variant: 'soft' })), Y.Avatar({ name: '', alt: 'Unknown user' })),
      example('Broken image falls back to initials', Y.Avatar({ id: 'avatar-broken', name: 'Rosa Diaz', src: 'data:image/png;base64,AAAA', color: 'accent', variant: 'soft' })),
      example('Name beside it: decorative avatar', h('span', { class: 'yui-demo-person' }, Y.Avatar({ name: 'Chen Wei', alt: '', src: photos.chen, size: 'sm' }), h('span', {}, 'Chen Wei'))),
      example('AvatarGroup: clip, ring, max with count, grid',
        Y.AvatarGroup({ id: 'avatar-group-clip', label: 'Channel members', children: [{ name: 'Ana Ruiz', src: photos.ana }, { name: 'Ben Okafor', src: photos.ben }, { name: 'Chen Wei', src: photos.chen }, { name: 'Dee', src: photos.dee }] }),
        Y.AvatarGroup({ overlap: 'ring', label: 'Reviewers', size: 'sm', children: [{ name: 'Ana Ruiz', src: photos.ana }, { name: 'Ben Okafor', color: 'accent', variant: 'soft' }, { name: 'Chen Wei', src: photos.chen }] }),
        Y.AvatarGroup({ id: 'avatar-group-max', label: 'In this call', max: 3, total: 12, variant: 'soft', color: 'accent', children: [{ name: 'Ana Ruiz' }, { name: 'Ben Okafor' }, { name: 'Chen Wei' }, { name: 'Dee' }] }),
        Y.AvatarGroup({ isGrid: true, label: 'Team', size: 'sm', children: ['Ana Ruiz', 'Ben Okafor', 'Chen Wei', 'Dee', 'Eli Stone', 'Mo Patel'].map((name, i) => ({ name, color: COLORS[i % 5], variant: 'soft' })) })),
    );
  });

  // ---- Badge ----
  section('badge', 'Badge', 'A count or status dot on another element. Every badge carries a text equivalent for screen readers ("3 unread messages", "Online"). For standalone tags, use a Chip.', (body) => {
    const presence = (name, src, status) => {
      const st = { online: ['success', 'Online'], away: ['warning', 'Away'], busy: ['danger', 'Do not disturb'], offline: ['default', 'Offline'] }[status];
      return h('span', { class: 'yui-demo-person' },
        Y.Badge.Anchor(Y.Avatar({ name, src }), Y.Badge({ color: st[0], placement: 'bottom-right', label: st[1] })),
        col(h('span', { class: 'yui-demo-name' }, name), caption(st[1])));
    };
    const unread = Y.Badge({ id: 'badge-unread', color: 'danger', size: 'sm', children: '3', label: '3 unread messages' });
    let n = 3;
    const unreadLog = log('Unread');
    body.append(
      example('Chat presence', presence('Ana Ruiz', photos.ana, 'online'), presence('Ben Okafor', photos.ben, 'away'), presence('Chen Wei', photos.chen, 'busy'), presence('Dee Laurent', null, 'offline')),
      example('Unread count',
        Y.Badge.Anchor(h('button', { type: 'button', class: 'button button--tertiary button--sm', 'data-slot': 'button', id: 'badge-inbox' }, Y.Badge.Anchor(h('span', { class: 'yui-demo-icon', html: demoIcons.message }), unread), 'Messages')),
        button('New message', 'secondary', () => { n++; unread.yui.setContent(n > 99 ? '99+' : String(n), `${n} unread messages`); unreadLog.set(`${n} unread messages`); }),
        unreadLog),
      example('Variants × colors', h('div', { class: 'yui-demo-grid' }, ...['primary', 'secondary', 'soft'].map((variant) => row(caption(variant), ...COLORS.map((color) => Y.Badge.Anchor(h('span', { class: 'yui-demo-box' }), Y.Badge({ variant, color, children: '5', label: `5 ${color}` }))))))),
      example('Sizes', ...SIZES.map((size) => Y.Badge.Anchor(Y.Avatar({ name: 'Ana Ruiz', src: photos.ana, size }), Y.Badge({ size, color: 'accent', children: '8', label: '8 mentions' }))),
        ...SIZES.map((size) => Y.Badge.Anchor(Y.Avatar({ name: 'Ana Ruiz', src: photos.ana, size }), Y.Badge({ size, color: 'success', placement: 'bottom-right', label: 'Online' })))),
      example('Placements', ...['top-right', 'top-left', 'bottom-right', 'bottom-left'].map((placement) => Y.Badge.Anchor(h('span', { class: 'yui-demo-box' }), Y.Badge({ placement, color: 'accent', size: 'sm', children: '1', label: placement })))),
    );
  });

  // ---- Chip ----
  section('chip', 'Chip', 'A short label or tag. Status chips pair color with an icon; red is only for danger. Clickable chips look different from static ones, and removable chips have a "Remove …" button.', (body) => {
    const chipLog = log('Chips');
    const tags = h('div', { class: 'yui-demo-row', id: 'chip-tags', role: 'group', 'aria-label': 'Channel tags' });
    for (const name of ['design', 'frontend', 'release-2.4']) {
      tags.append(Y.Chip({
        children: name, variant: 'soft', color: 'accent',
        onRemove: (e, chip) => {
          const next = chip.nextElementSibling || chip.previousElementSibling;
          chip.remove();
          chipLog.set(`Removed ${name}`);
          if (next) next.querySelector('button').focus(); else tags.append(caption('No tags'));
        },
      }));
    }
    body.append(
      example('Variants × colors', h('div', { class: 'yui-demo-grid' }, ...['primary', 'secondary', 'tertiary', 'soft'].map((variant) => row(caption(variant), ...COLORS.map((color) => Y.Chip({ variant, color, children: color })))))),
      example('Sizes', ...SIZES.map((size) => Y.Chip({ size, children: 'Size ' + size }))),
      example('Status chips (icon + color)',
        Y.Chip({ color: 'success', variant: 'soft', icon: icons.success, children: 'Delivered' }),
        Y.Chip({ color: 'accent', variant: 'soft', icon: icons.info, children: 'Beta' }),
        Y.Chip({ color: 'warning', variant: 'soft', icon: icons.warning, children: 'Pending' }),
        Y.Chip({ color: 'danger', variant: 'soft', icon: icons.danger, children: 'Failed to send' })),
      example('Removable tags', tags, chipLog),
      example('Clickable filter chips',
        ...['All', 'Mentions', 'Threads'].map((name) => Y.Chip({ children: name, size: 'lg', variant: name === 'All' ? 'primary' : 'secondary', color: name === 'All' ? 'accent' : 'default', onPress: () => chipLog.set(`Filter ${name}`), id: 'chip-filter-' + name.toLowerCase() }))),
    );
  });

  // ---- Card ----
  section('card', 'Card', 'Groups related content. A card is an article labelled by its title; a clickable card is a link or button that uses the card classes. Surface is the plain background container cards sit on.', (body) => {
    const cardLog = log('Card');
    const variants = ['default', 'secondary', 'tertiary', 'transparent'].map((variant) => Y.Card({ variant, title: variant[0].toUpperCase() + variant.slice(1), description: 'card--' + variant, children: 'Body text sits in the content slot.', class: 'yui-demo-card' }));
    body.append(
      example('Variants', ...variants),
      example('Channel card',
        Y.Card({
          id: 'card-channel', class: 'yui-demo-card yui-demo-card--wide',
          title: '#design-reviews', description: '14 members · active 2 minutes ago',
          header: null,
          children: [h('p', {}, 'Weekly critique of in-flight work. Post screenshots and tag the owner.'), row(Y.Chip({ size: 'sm', children: 'design' }), Y.Chip({ size: 'sm', children: 'weekly' }))],
          footer: [Y.AvatarGroup({ size: 'sm', max: 3, label: 'Members', children: [{ name: 'Ana Ruiz', src: photos.ana }, { name: 'Ben Okafor', src: photos.ben }, { name: 'Chen Wei', src: photos.chen }, { name: 'Dee' }, { name: 'Eli' }] }), h('span', { class: 'yui-demo-spacer' }), button('Join', 'primary', () => cardLog.set('Join #design-reviews'))],
        })),
      example('Interactive cards',
        Y.Card({ href: '#card', title: 'Release notes', description: 'What changed in Yap 2.4', class: 'yui-demo-card', id: 'card-link' }),
        Y.Card({ onPress: () => cardLog.set('Opened thread'), title: 'Open thread', description: '12 replies, last from Ben', class: 'yui-demo-card', variant: 'secondary', id: 'card-button' }),
        cardLog),
      example('Surface variants', ...['default', 'secondary', 'tertiary', 'transparent'].map((variant) => Y.Surface({ variant, class: 'yui-demo-surface', children: 'surface--' + variant }))),
    );
  });

  // ---- Separator ----
  section('separator', 'Separator', 'Divides content. Semantic separators are announced; decorative ones are hidden from assistive technology.', (body) => {
    body.append(
      example('Horizontal variants', h('div', { class: 'yui-demo-sepcol' },...['default', 'secondary', 'tertiary'].map((variant) => col(caption(variant), Y.Separator({ variant, id: 'separator-' + variant }))))),
      example('Vertical, in a toolbar row', h('div', { class: 'yui-demo-row yui-demo-toolbar' }, h('span', {}, 'Bold'), Y.Separator({ orientation: 'vertical', id: 'separator-vertical' }), h('span', {}, 'Italic'), Y.Separator({ orientation: 'vertical', variant: 'secondary' }), h('span', {}, 'Link'))),
      example('Decorative', h('div', { class: 'yui-demo-sepcol' },h('span', {}, 'Above'), Y.Separator({ isDecorative: true, id: 'separator-decorative' }), h('span', {}, 'Below'))),
    );
  });

  // ---- Spinner ----
  section('spinner', 'Spinner', 'For waits of about 1 to 10 seconds when the shape of what loads is unknown. Show nothing under a second; for longer waits use a progress bar. Stops spinning under reduced motion.', (body) => {
    const saving = h('button', { type: 'button', class: 'button button--primary button--sm', 'data-slot': 'button', id: 'spinner-button', 'aria-disabled': 'true' }, Y.Spinner({ size: 'sm', color: 'current', isDecorative: true }), 'Sending…');
    body.append(
      example('Sizes', ...['sm', 'md', 'lg', 'xl'].map((size) => Y.Spinner({ size, id: 'spinner-' + size }))),
      example('Colors', ...['current', 'accent', 'success', 'warning', 'danger'].map((color) => Y.Spinner({ color, label: `Loading (${color})` }))),
      example('Inside a labelled button (decorative)', saving),
      example('Loading older messages', h('span', { class: 'yui-demo-person' }, Y.Spinner({ size: 'sm', label: 'Loading older messages' }), caption('Loading older messages…'))),
    );
  });

  // ---- Skeleton ----
  section('skeleton', 'Skeleton', 'Placeholder shapes that match the layout about to load. The shapes are hidden from screen readers; the region is aria-busy and announces "Loading messages".', (body) => {
    const message = (anim, i) => h('div', { class: 'yui-demo-msg' },
      Y.Skeleton({ shape: 'circle', width: 40, height: 40, animationType: anim }),
      col(row(Y.Skeleton({ shape: 'text', width: 96, animationType: anim }), Y.Skeleton({ shape: 'text', width: 40, animationType: anim })),
        Y.Skeleton({ shape: 'text', width: ['90%', '70%', '80%'][i % 3], animationType: anim }),
        i % 2 ? null : Y.Skeleton({ shape: 'text', width: '55%', animationType: anim })));
    const region = Y.Skeleton.Region({ id: 'skeleton-messages', label: 'Loading messages', class: 'yui-demo-msglist card card--default', children: [0, 1, 2].map((i) => message('shimmer', i)) });
    const skLog = log('Messages');
    body.append(
      example('Message list (shimmer)', region,
        button('Load messages', 'secondary', () => {
          region.yui.resolve(...[['Ana Ruiz', 'Pushed the new avatar styles. Can someone review?'], ['Ben Okafor', 'Looking now.']].map(([name, text]) =>
            h('div', { class: 'yui-demo-msg' }, Y.Avatar({ name, alt: '' }), col(h('span', { class: 'yui-demo-name' }, name), h('span', {}, text)))));
          styleDemos(region);
          skLog.set('loaded');
        }), skLog),
      example('Pulse', h('div', { class: 'yui-demo-msglist card card--default', 'aria-hidden': 'true' }, message('pulse', 1))),
      example('No animation', h('div', { class: 'yui-demo-msglist card card--default', 'aria-hidden': 'true' }, message('none', 2))),
      example('Card', Y.Skeleton.Region({ label: 'Loading channel', children: h('div', { class: 'card card--default yui-demo-card' }, Y.Skeleton({ height: 96, class: 'yui-demo-full' }), Y.Skeleton({ shape: 'text', width: '60%' }), Y.Skeleton({ shape: 'text', width: '85%' })) })),
    );
  });

  // ---- ProgressBar ----
  section('progress-bar', 'Progress bar', 'For waits over about 10 seconds and for uploads, with a percentage or step count. Indeterminate when the total is unknown.', (body) => {
    const upload = Y.ProgressBar({ id: 'progress-upload', label: 'Uploading design-review.mp4', value: 0, class: 'yui-demo-progress' });
    const files = Y.ProgressBar({ id: 'progress-files', label: 'Uploading files', value: 2, maxValue: 5, valueLabel: ({ value }) => `${value} of 5 files`, color: 'success', class: 'yui-demo-progress' });
    let timer = 0;
    const pLog = log('Upload');
    body.append(
      example('Upload', col(upload,
        row(button('Start upload', 'secondary', () => {
          clearInterval(timer);
          let v = 0; upload.yui.setValue(0); pLog.set('started');
          timer = setInterval(() => { v = Math.min(100, v + 10); upload.yui.setValue(v); if (v === 100) { clearInterval(timer); pLog.set('Upload complete'); } }, 150);
        }), pLog))),
      example('Step count', files),
      example('Indeterminate', Y.ProgressBar({ id: 'progress-indeterminate', label: 'Preparing export', isIndeterminate: true, class: 'yui-demo-progress' })),
      example('Sizes', col(...SIZES.map((size) => Y.ProgressBar({ size, label: 'Size ' + size, value: 40, class: 'yui-demo-progress' })))),
      example('Colors', col(...COLORS.map((color) => Y.ProgressBar({ color, label: color, value: 65, class: 'yui-demo-progress' })))),
      example('No visible label', Y.ProgressBar({ 'aria-label': 'Storage used', value: 72, class: 'yui-demo-progress', id: 'progress-aria' })),
    );
  });

  // ---- Alert ----
  section('alert', 'Alert', 'Inline feedback. Lead with the outcome; for errors say what happened and what to do next. Each status has its own icon. Inline alerts stay until closed or resolved.', (body) => {
    const aLog = log('Alert');
    const live = h('div', { class: 'yui-demo-stack', id: 'alert-live' });
    body.append(
      example('Statuses', h('div', { class: 'yui-demo-stack' },
        Y.Alert({ status: 'default', title: 'Notifications are paused until 9:00', description: 'You won’t get desktop alerts for new messages.' }),
        Y.Alert({ status: 'accent', title: 'Yap 2.4 is available', description: 'Restart the app to update.' }),
        Y.Alert({ status: 'success', title: 'Account created.', description: 'You can now join channels and send messages.' }),
        Y.Alert({ status: 'warning', title: 'Your storage is 90% full', description: 'Delete old files to keep uploading.' }),
        Y.Alert({ status: 'danger', title: 'Message not sent', description: 'Yap lost its connection. Check your network, then try again.', children: [button('Try again', 'primary', () => aLog.set('Retry')), button('Copy text', 'tertiary', () => aLog.set('Copy'))] }),
      )),
      example('Title only, closable', h('div', { class: 'yui-demo-stack' },
        Y.Alert({ id: 'alert-closable', status: 'accent', title: 'New messages are below.', onClose: () => aLog.set('Closed') }),
        aLog)),
      example('Inserted at runtime (role="alert")', h('div', { class: 'yui-demo-stack' },button('Simulate failure', 'secondary', () => {
        live.replaceChildren(Y.Alert({ status: 'danger', role: 'alert', title: 'Upload failed', description: 'The file is over 100 MB. Choose a smaller file.', onClose: () => {} }));
      }), live)),
    );
  });

  // ---- EmptyState ----
  section('empty-state', 'Empty state', 'Shown when there is nothing to display. A plain heading, a sentence with the next step, and at most one primary action. Small for "no results", large for first use, setup and errors.', (body) => {
    const eLog = log('Empty state');
    body.append(
      example('No messages yet (large)', h('div', { class: 'card card--default yui-demo-wide' }, Y.EmptyState({
        id: 'empty-messages', icon: demoIcons.message, title: 'No messages yet',
        description: 'Start the conversation with a message to #design-reviews.',
        children: button('Write a message', 'primary', () => eLog.set('Write a message')),
      }))),
      example('No search results (small)', h('div', { class: 'card card--default yui-demo-wide' }, Y.EmptyState({
        size: 'sm', icon: demoIcons.search, title: 'No results for “roadmap”',
        description: 'Try a different word, or search all channels.',
        children: button('Search all channels', 'tertiary', () => eLog.set('Search all')),
      }))),
      example('Error (large)', h('div', { class: 'card card--default yui-demo-wide' }, Y.EmptyState({
        icon: demoIcons.cloudOff, title: 'Can’t load this channel',
        description: 'Yap can’t reach the server. Check your connection and reload.',
        children: button('Reload', 'secondary', () => eLog.set('Reload')),
      }))),
      eLog,
    );
  });
})();
