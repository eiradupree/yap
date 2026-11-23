'use strict';

// Gallery sections for menus: Dropdown and Tabs.
(() => {
  const { h, gallery } = YapUI;

  // Static icon markup (same as editor.js's where Yap has one).
  const svg = (body) => `<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
  const ic = {
    paperclip: svg('<path d="m20 11.5-8.2 8.2a5.3 5.3 0 0 1-7.5-7.5L12.8 3.7a3.5 3.5 0 0 1 5 5l-8.5 8.5a1.8 1.8 0 0 1-2.5-2.5l7.8-7.8"/>'),
    image: svg('<rect x="3.5" y="4.5" width="17" height="15" rx="2"/><circle cx="15.5" cy="9.5" r="1.5"/><path d="m3.5 16 5-5 4.5 4.5 2-2 5.5 5.5"/>'),
    file: svg('<path d="M7 3h7l5 5v12a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z"/><path d="M14 3v5h5"/>'),
    camera: svg('<path d="M4 8h3l2-2.5h6L17 8h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z"/><circle cx="12" cy="13" r="3.5"/>'),
    more: svg('<circle cx="5" cy="12" r="1.2"/><circle cx="12" cy="12" r="1.2"/><circle cx="19" cy="12" r="1.2"/>'),
    reply: svg('<path d="M9 14 4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 6 6v4"/>'),
    link: svg('<path d="M10 14a4 4 0 0 0 5.66 0l3-3a4 4 0 0 0-5.66-5.66l-1 1M14 10a4 4 0 0 0-5.66 0l-3 3a4 4 0 0 0 5.66 5.66l1-1"/>'),
    edit: svg('<path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16z"/><path d="m13.5 6.5 4 4"/>'),
    trash: svg('<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>'),
    forward: svg('<path d="m15 14 5-5-5-5"/><path d="M20 9H10a6 6 0 0 0-6 6v4"/>'),
  };

  const button = (props, ...children) => h('button', { type: 'button', ...props, class: ['button', props.class || 'button--secondary'], data: { slot: 'button' } }, ...children);
  const iconButton = (id, label, icon) => button({ id, class: 'button--ghost button--icon-only', aria: { label } }, h('span', { html: icon }));

  gallery.section('dropdown', 'Dropdown', 'A menu button: a list of actions or options that opens from a button. Arrow keys move, a letter jumps, Enter picks, Escape closes.', (body) => {
    const log = gallery.log('Last event');
    log.id = 'dropdown-log';

    // Yap's attachment menu (editor.js createMenu), rebuilt on every open.
    const attach = iconButton('dd-attach', 'Attach', ic.paperclip);
    const fullBox = h('input', { type: 'checkbox', id: 'dd-attach-full' });
    const full = () => (fullBox.checked ? 'You can attach up to 10 files to a message' : null);
    YapUI.Dropdown(attach, {
      label: 'Attach',
      placement: 'top start',
      footer: 'You can also drag files into the message box or paste them.',
      items: () => [
        { key: 'image', icon: ic.image, label: 'Upload image or GIF', description: full() || 'PNG, JPEG, GIF or WebP, up to 10 MB. Shown in the message.', isDisabled: !!full() },
        { key: 'file', icon: ic.file, label: 'Upload file', description: full() || 'Any type, up to 10 MB. Others can download it.', isDisabled: !!full() },
        { key: 'photo', icon: ic.camera, label: 'Take photo', description: full() || 'This device has no camera.', isDisabled: true },
      ],
      onAction: (key) => log.set('action: ' + key),
    });
    body.append(gallery.example('Attachment menu (Yap)', attach,
      h('label', null, fullBox, ' 10 of 10 files attached')));

    // A message's "more actions" menu.
    const more = iconButton('dd-more', 'More actions', ic.more);
    YapUI.Dropdown(more, {
      placement: 'bottom end',
      items: [
        { key: 'reply', icon: ic.reply, label: 'Reply' },
        { key: 'copy-link', icon: ic.link, label: 'Copy link' },
        { key: 'edit', icon: ic.edit, label: 'Edit', shortcut: ['mod', 'E'] },
        { type: 'separator' },
        { key: 'delete', icon: ic.trash, label: 'Delete', variant: 'danger', onAction: () => log.set('action: delete (the caller confirms first)') },
      ],
      onAction: (key) => { if (key !== 'delete') log.set('action: ' + key); },
    });
    body.append(gallery.example('Message actions', more));

    // Single selection.
    const sortLabels = { newest: 'Newest', oldest: 'Oldest', replies: 'Most replies' };
    const sortText = h('span', null, 'Sort by: Newest');
    const sort = button({ id: 'dd-sort' }, sortText, h('span', { html: YapUI.icons.chevronDown }));
    YapUI.Dropdown(sort, {
      selectionMode: 'single',
      disallowEmptySelection: true,
      defaultSelectedKeys: ['newest'],
      indicator: 'dot',
      placement: 'bottom start',
      items: [{ type: 'section', title: 'Sort by', items: Object.entries(sortLabels).map(([key, label]) => ({ key, label })) }],
      onSelectionChange: (keys) => {
        const k = [...keys][0];
        sortText.textContent = 'Sort by: ' + sortLabels[k];
        log.set('selection: ' + [...keys].join(', '));
      },
    });
    body.append(gallery.example('Single selection', sort));

    // Multiple selection: stays open.
    const show = button({ id: 'dd-show' }, 'Show', h('span', { html: YapUI.icons.chevronDown }));
    YapUI.Dropdown(show, {
      selectionMode: 'multiple',
      defaultSelectedKeys: ['replies', 'reactions'],
      placement: 'bottom start',
      items: [
        { key: 'replies', label: 'Replies' },
        { key: 'reactions', label: 'Reactions' },
        { key: 'joins', label: 'Join and leave' },
        { key: 'previews', label: 'Link previews' },
      ],
      onSelectionChange: (keys) => log.set('selection: ' + ([...keys].join(', ') || 'none')),
    });
    body.append(gallery.example('Multiple selection', show));

    // Sections and a submenu.
    const msg = button({ id: 'dd-sub' }, 'Message', h('span', { html: YapUI.icons.chevronDown }));
    YapUI.Dropdown(msg, {
      placement: 'bottom start',
      items: [
        { type: 'section', title: 'Message', items: [
          { key: 'unread', label: 'Mark unread' },
          { key: 'pin', label: 'Pin to channel' },
          { key: 'forward', icon: ic.forward, label: 'Forward to', items: [
            { key: 'fwd-general', label: '#general', textValue: 'general' },
            { key: 'fwd-design', label: '#design', textValue: 'design' },
            { key: 'fwd-random', label: '#random', textValue: 'random', isDisabled: true },
            { key: 'fwd-support', label: '#support', textValue: 'support' },
          ] },
        ] },
        { type: 'separator' },
        { type: 'section', title: 'Thread', items: [
          { key: 'follow', label: 'Follow thread' },
          { key: 'mute', label: 'Mute thread' },
        ] },
      ],
      onAction: (key) => log.set('action: ' + key),
    });
    body.append(gallery.example('Sections and a submenu', msg));

    // Long press: the button's own click sends; holding opens options.
    const send = button({ id: 'dd-long', class: 'button--primary' }, 'Send');
    send.addEventListener('click', () => log.set('action: send'));
    YapUI.Dropdown(send, {
      trigger: 'longPress',
      placement: 'bottom start',
      items: [
        { key: 'schedule', label: 'Schedule send' },
        { key: 'silent', label: 'Send without sound' },
      ],
      onAction: (key) => log.set('action: ' + key),
    });
    body.append(gallery.example('Long press (hold, or Alt+Down)', send));

    body.append(log);
  });

  gallery.section('tabs', 'Tabs', 'Switch between views of the same thing. Arrow keys move between tabs; disabled tabs are skipped.', (body) => {
    const log = gallery.log('Last event');
    log.id = 'tabs-log';
    const para = (text) => h('p', null, text);
    const logger = (name) => (key) => log.set(`${name}: ${key}`);

    const primary = YapUI.Tabs({
      'aria-label': 'Channel',
      tabs: [
        { key: 'overview', label: 'Overview', panel: para('What this channel is for, and who started it.') },
        { key: 'members', label: 'Members', panel: para('12 members, 3 online.') },
        { key: 'settings', label: 'Settings', panel: [para('Notifications and retention.'), button({ id: 'tabs-panel-button' }, 'Edit settings')] },
      ],
      onSelectionChange: logger('primary'),
    });
    primary.id = 'tabs-primary';
    body.append(gallery.example('Primary', primary));

    const secondary = YapUI.Tabs({
      variant: 'secondary',
      align: 'start',
      'aria-label': 'Conversation',
      tabs: [
        { key: 'messages', label: 'Messages', panel: para('The conversation.') },
        { key: 'files', label: 'Files', panel: para('Everything shared here.') },
        { key: 'pins', label: 'Pins', isDisabled: true, tooltip: 'Pin a message to see it here', panel: para('Pinned messages.') },
        { key: 'links', label: 'Links', panel: para('Links shared here.') },
      ],
      onSelectionChange: logger('secondary'),
    });
    secondary.id = 'tabs-secondary';
    body.append(gallery.example('Secondary, start-aligned, with a disabled tab', secondary));

    const vertical = YapUI.Tabs({
      orientation: 'vertical',
      'aria-label': 'Account',
      tabs: [
        { key: 'profile', label: 'Profile', panel: para('Your name and picture.') },
        { key: 'alerts', label: 'Notifications', panel: para('When Yap tells you about new messages.') },
        { key: 'privacy', label: 'Privacy', isDisabled: true, tooltip: 'Your admin manages privacy settings', panel: para('Who can see you.') },
        { key: 'advanced', label: 'Advanced', panel: para('Developer options.') },
      ],
      onSelectionChange: logger('vertical'),
    });
    vertical.id = 'tabs-vertical';
    body.append(gallery.example('Vertical', vertical));

    const verticalSecondary = YapUI.Tabs({
      orientation: 'vertical', variant: 'secondary', align: 'start',
      'aria-label': 'Settings',
      tabs: [
        { key: 'general', label: 'General', panel: para('Language and theme.') },
        { key: 'audio', label: 'Audio', panel: para('Microphone and speakers.') },
        { key: 'video', label: 'Video', panel: para('Camera.') },
      ],
      onSelectionChange: logger('vertical-secondary'),
    });
    verticalSecondary.id = 'tabs-vertical-secondary';
    body.append(gallery.example('Vertical, secondary', verticalSecondary));

    const manual = YapUI.Tabs({
      keyboardActivation: 'manual',
      'aria-label': 'Search results',
      tabs: [
        { key: 'all', label: 'All', panel: para('Every result.') },
        { key: 'people', label: 'People', panel: para('People who match.') },
        { key: 'channels', label: 'Channels', panel: para('Channels that match.') },
      ],
      onSelectionChange: logger('manual'),
    });
    manual.id = 'tabs-manual';
    body.append(gallery.example('Manual activation (Enter or Space selects)', manual));

    for (const t of [primary, secondary, vertical, verticalSecondary, manual]) t.style.flex = '1 1 100%';
    for (const t of [primary, secondary, manual]) t.style.maxWidth = '32rem';
    body.append(log);
  });
})();
