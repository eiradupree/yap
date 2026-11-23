'use strict';

// Gallery sections for actions: Button, CloseButton, ButtonGroup,
// ToggleButton (+ ToggleButtonGroup), Link, Kbd.
(() => {
  const { h, icons, gallery } = YapUI;
  const { section, example, log } = gallery;
  const { Button, CloseButton, ButtonGroup, ToggleButton, ToggleButtonGroup, Link, Kbd } = YapUI;

  const VARIANTS = ['primary', 'secondary', 'tertiary', 'outline', 'ghost', 'danger', 'danger-soft'];
  const SIZES = ['sm', 'md', 'lg'];
  const LABEL = { primary: 'Save', secondary: 'Add source', tertiary: 'Export', outline: 'Filter', ghost: 'Cancel', danger: 'Delete', 'danger-soft': 'Remove' };

  // Static icon markup (our own), 16px.
  const svg = (body) => `<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" data-slot="icon">${body}</svg>`;
  const ico = {
    plus: svg('<path d="M12 5v14M5 12h14"/>'),
    more: svg('<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>'),
    trash: svg('<path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3"/>'),
    download: svg('<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>'),
    bold: svg('<path d="M7 5h6a3.5 3.5 0 0 1 0 7H7zM7 12h7a3.5 3.5 0 0 1 0 7H7z"/>'),
    italic: svg('<path d="M19 4h-9M14 20H5M15 4 9 20"/>'),
    underline: svg('<path d="M6 4v6a6 6 0 0 0 12 0V4M4 20h16"/>'),
    alignLeft: svg('<path d="M4 6h16M4 12h10M4 18h14"/>'),
    alignCenter: svg('<path d="M4 6h16M7 12h10M5 18h14"/>'),
    alignRight: svg('<path d="M4 6h16M10 12h10M6 18h14"/>'),
    star: svg('<path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1 6.2L12 17.3 6.5 20.2l1-6.2L3 9.6l6.2-.9z"/>'),
  };

  // ---- Button ----
  section('button', 'Button', 'Primary for the one main action in a view, secondary and tertiary for the rest, danger for destructive actions (mostly inside confirmation dialogs). Labels are 1–3 words that start with a verb.', (body) => {
    const out = log('Pressed');
    const press = (e) => out.set(`${e.target.textContent.trim() || e.target.getAttribute('aria-label')} (${e.pointerType})`);

    body.append(example('Variants', ...VARIANTS.map((v) => Button({ variant: v, children: LABEL[v], onPress: press, data: { demo: 'variant-' + v } }))));
    for (const size of SIZES) {
      body.append(example(`Size ${size}`, ...VARIANTS.map((v) => Button({ variant: v, size, children: LABEL[v], onPress: press }))));
    }
    body.append(example('With icon',
      Button({ icon: ico.plus, children: 'Add source', onPress: press }),
      Button({ variant: 'secondary', icon: ico.download, children: 'Export', onPress: press }),
      Button({ variant: 'danger-soft', icon: ico.trash, children: 'Delete', onPress: press })));
    body.append(example('Icon only (attach a YapUI.Tooltip with the same label)',
      ...SIZES.map((size) => Button({ isIconOnly: true, size, variant: 'tertiary', ariaLabel: 'More actions', icon: ico.more, onPress: press, data: size === 'md' ? { demo: 'icon-only' } : null })),
      Button({ isIconOnly: true, variant: 'ghost', ariaLabel: 'Delete', icon: ico.trash, onPress: press }),
      Button({ isIconOnly: true, variant: 'primary', ariaLabel: 'Add', icon: ico.plus, onPress: press })));

    // Pending: a press starts a slow save; the toggle holds every demo pending.
    const pendingDemos = [];
    const slow = (b) => (e) => { press(e); b.yui.setPending(true); setTimeout(() => { if (!toggle.yui.isSelected()) b.yui.setPending(false); }, 1500); };
    const p1 = Button({ children: 'Save', data: { demo: 'pending' } });
    const p2 = Button({ variant: 'secondary', icon: ico.download, children: 'Export' });
    const p3 = Button({ variant: 'tertiary', isIconOnly: true, ariaLabel: 'Download', icon: ico.download });
    const p4 = Button({ variant: 'danger', children: 'Delete' });
    for (const b of [p1, p2, p3, p4]) { pendingDemos.push(b); b.addEventListener('click', slow(b)); }
    const toggle = ToggleButton({ children: 'Hold pending', size: 'sm', data: { demo: 'pending-toggle' }, onChange: (on) => { for (const b of pendingDemos) b.yui.setPending(on); out.set(on ? 'pending on' : 'pending off'); } });
    body.append(example('Pending (press one, or hold all)', p1, p2, p3, p4, toggle));

    body.append(example('Disabled (still focusable, announced as unavailable)',
      ...['primary', 'secondary', 'tertiary', 'outline', 'danger'].map((v, i) => Button({ variant: v, isDisabled: true, children: LABEL[v], onPress: press, data: i === 0 ? { demo: 'disabled' } : null }))));
    const fw = h('div', { class: 'yui-actions yui-actions--vertical gallery-fullwidth' },
      Button({ fullWidth: true, children: 'Continue', onPress: press }),
      Button({ fullWidth: true, variant: 'tertiary', children: 'Back', onPress: press }));
    fw.style.width = '320px';
    body.append(example('Full width, stacked 8px apart', fw));
    body.append(example('Action row, 16px apart (.yui-actions)', h('div', { class: 'yui-actions' },
      Button({ variant: 'ghost', children: 'Cancel', onPress: press }),
      Button({ children: 'Save changes', onPress: press }))));
    body.append(out);
  });

  // ---- CloseButton ----
  section('close-button', 'CloseButton', 'Dismisses a dialog, popover, alert or chip. Give it a specific label when there are several on screen.', (body) => {
    const out = log('Pressed');
    body.append(example('Default', CloseButton({ onPress: (e) => out.set(`${e.target.getAttribute('aria-label')} (${e.pointerType})`), data: { demo: 'close' } }),
      CloseButton({ ariaLabel: 'Dismiss alert', onPress: (e) => out.set(`${e.target.getAttribute('aria-label')} (${e.pointerType})`) })));
    body.append(example('Disabled', CloseButton({ isDisabled: true, ariaLabel: 'Close panel', onPress: () => out.set('disabled close pressed (bug)') })));
    body.append(out);
  });

  // ---- ButtonGroup ----
  section('button-group', 'ButtonGroup', 'Related actions joined into one control. variant, size and isDisabled pass to buttons that don\'t set their own.', (body) => {
    const out = log('Pressed');
    const press = (e) => out.set(e.target.textContent.trim() || e.target.getAttribute('aria-label'));
    const items = (prefix) => ['Day', 'Week', 'Month'].map((t) => ({ children: t, onPress: press, data: { demo: prefix + t.toLowerCase() } }));
    for (const v of ['primary', 'secondary', 'tertiary', 'outline', 'ghost']) {
      body.append(example(`Variant ${v}`, ButtonGroup({ variant: v, ariaLabel: 'Range', children: items(v === 'tertiary' ? 'group-' : 'g-' + v + '-') })));
    }
    body.append(example('Sizes', ...SIZES.map((size) => ButtonGroup({ size, variant: 'tertiary', ariaLabel: 'Range ' + size, children: items('s' + size + '-') }))));
    body.append(example('With icons and a split action', ButtonGroup({
      variant: 'secondary', ariaLabel: 'Merge',
      children: [{ children: 'Merge', onPress: press }, { isIconOnly: true, ariaLabel: 'More merge options', icon: icons.chevronDown, onPress: press }],
    })));
    body.append(example('Vertical', ButtonGroup({ orientation: 'vertical', variant: 'tertiary', ariaLabel: 'Range vertical', children: items('v-') })));
    body.append(example('No separators', ButtonGroup({ hideSeparator: true, variant: 'tertiary', ariaLabel: 'Range plain', children: items('n-') })));
    body.append(example('Disabled (one button opts back in)', ButtonGroup({
      isDisabled: true, variant: 'tertiary', ariaLabel: 'Range disabled',
      children: [{ children: 'Day', onPress: press, data: { demo: 'group-disabled' } }, { children: 'Week', onPress: press }, { children: 'Month', isDisabled: false, onPress: press }],
    })));
    const fw = h('div', {}, ButtonGroup({ fullWidth: true, variant: 'tertiary', ariaLabel: 'Range full width', children: items('f-') }));
    fw.style.width = '420px';
    body.append(example('Full width', fw));
    body.append(out);
  });

  // ---- ToggleButton ----
  section('toggle-button', 'ToggleButton', 'An on/off control whose label never changes; the state is aria-pressed. ToggleButtonGroup joins them for single or multiple selection.', (body) => {
    const out = log('Changed');
    const change = (name) => (on) => out.set(`${name}: ${on ? 'on' : 'off'}`);
    body.append(example('Default and ghost',
      ToggleButton({ children: 'Favorite', icon: ico.star, onChange: change('Favorite'), data: { demo: 'toggle' } }),
      ToggleButton({ children: 'Pinned', isSelected: true, onChange: change('Pinned') }),
      ToggleButton({ variant: 'ghost', children: 'Mute', onChange: change('Mute') }),
      ToggleButton({ variant: 'ghost', children: 'Follow', isSelected: true, onChange: change('Follow') })));
    for (const size of SIZES) {
      body.append(example(`Size ${size}`,
        ToggleButton({ size, children: 'Off', onChange: change('Off ' + size) }),
        ToggleButton({ size, children: 'On', isSelected: true, onChange: change('On ' + size) }),
        ToggleButton({ size, isIconOnly: true, ariaLabel: 'Bold', icon: ico.bold, onChange: change('Bold ' + size) }),
        ToggleButton({ size, isIconOnly: true, ariaLabel: 'Italic', icon: ico.italic, isSelected: true, onChange: change('Italic ' + size) })));
    }
    body.append(example('Disabled',
      ToggleButton({ isDisabled: true, children: 'Off', onChange: change('disabled (bug)'), data: { demo: 'toggle-disabled' } }),
      ToggleButton({ isDisabled: true, isSelected: true, children: 'On', onChange: change('disabled (bug)') })));
    const fw = h('div', {}, ToggleButton({ fullWidth: true, children: 'Show resolved threads', onChange: change('Resolved') }));
    fw.style.width = '320px';
    body.append(example('Full width', fw));

    const gout = log('Selection');
    const show = (keys) => gout.set([...keys].join(', ') || 'none');
    body.append(example('Group, multiple selection (toolbar)', ToggleButtonGroup({
      selectionMode: 'multiple', ariaLabel: 'Text style', defaultSelectedKeys: ['bold'], onSelectionChange: show, data: { demo: 'group-multiple' },
      children: [
        { id: 'bold', isIconOnly: true, ariaLabel: 'Bold', icon: ico.bold },
        { id: 'italic', isIconOnly: true, ariaLabel: 'Italic', icon: ico.italic },
        { id: 'underline', isIconOnly: true, ariaLabel: 'Underline', icon: ico.underline },
      ],
    })));
    body.append(example('Group, single selection (radio group)', ToggleButtonGroup({
      ariaLabel: 'Text alignment', defaultSelectedKeys: ['left'], disallowEmptySelection: true, onSelectionChange: show, data: { demo: 'group-single' },
      children: [
        { id: 'left', children: 'Left', icon: ico.alignLeft },
        { id: 'center', children: 'Center', icon: ico.alignCenter },
        { id: 'right', children: 'Right', icon: ico.alignRight },
      ],
    })));
    body.append(example('Group sizes, detached, vertical',
      ToggleButtonGroup({ size: 'sm', ariaLabel: 'View small', defaultSelectedKeys: ['list'], onSelectionChange: show, children: [{ id: 'list', children: 'List' }, { id: 'grid', children: 'Grid' }] }),
      ToggleButtonGroup({ size: 'lg', ariaLabel: 'View large', defaultSelectedKeys: ['grid'], onSelectionChange: show, children: [{ id: 'list', children: 'List' }, { id: 'grid', children: 'Grid' }, { id: 'board', children: 'Board', isDisabled: true }] }),
      ToggleButtonGroup({ isDetached: true, selectionMode: 'multiple', ariaLabel: 'Filters', onSelectionChange: show, children: [{ id: 'mine', children: 'Mine' }, { id: 'unread', children: 'Unread' }, { id: 'starred', children: 'Starred' }] }),
      ToggleButtonGroup({ orientation: 'vertical', ariaLabel: 'Density', defaultSelectedKeys: ['comfy'], onSelectionChange: show, children: [{ id: 'compact', children: 'Compact' }, { id: 'comfy', children: 'Comfortable' }, { id: 'roomy', children: 'Spacious' }] })));
    const gfw = h('div', {}, ToggleButtonGroup({ fullWidth: true, ariaLabel: 'Period', defaultSelectedKeys: ['week'], onSelectionChange: show, children: [{ id: 'day', children: 'Day' }, { id: 'week', children: 'Week' }, { id: 'month', children: 'Month' }] }));
    gfw.style.width = '420px';
    body.append(example('Group, full width', gfw));
    body.append(out, gout);
  });

  // ---- Link ----
  section('link', 'Link', 'Navigation. The text says where it goes. Underline links inside running text; use a Button for actions that don\'t navigate.', (body) => {
    const out = log('Pressed');
    const press = (e) => out.set(`${e.target.closest('.link').textContent.trim()} (${e.pointerType})`);
    const stay = (e) => { e.nativeEvent.preventDefault(); press(e); };
    body.append(example('Default (underline on hover)',
      Link({ href: '#link', children: 'Billing settings', onPress: stay, data: { demo: 'link' } }),
      Link({ href: '#link', children: 'Release notes', icon: true, onPress: stay })));
    body.append(example('External', Link({ href: 'https://heroui.com/', isExternal: true, children: 'HeroUI docs', onPress: stay, data: { demo: 'link-external' } })));
    body.append(example('Inside text', h('p', {}, 'Read the ', Link({ href: '#link', underline: 'always', children: 'sharing guide', onPress: stay }), ' before you invite guests.')));
    body.append(example('Without href (onPress only)', Link({ children: 'Show older messages', onPress: press, data: { demo: 'link-nohref' } })));
    body.append(example('Disabled', Link({ href: '#link-disabled', isDisabled: true, children: 'Archived channel', onPress: () => out.set('disabled link pressed (bug)'), data: { demo: 'link-disabled' } })));
    body.append(example('Styled as a button', h('a', { href: '#link', class: Button.classes({ variant: 'secondary' }) + ' link', 'data-slot': 'link', text: 'Open workspace' })));
    body.append(out);
  });

  // ---- Kbd ----
  section('kbd', 'Kbd', 'Keyboard shortcuts. "mod" is ⌘ on the Mac and Ctrl elsewhere; named keys get a title for the symbol.', (body) => {
    body.append(example('Platform (this machine)', Kbd({ keys: 'mod+k' }), Kbd({ keys: 'mod+shift+p' }), Kbd({ keys: 'mod+enter' }), Kbd({ keys: 'escape' })));
    body.append(example('Mac', Kbd({ keys: 'mod+k', isMac: true, data: { demo: 'kbd-mac' } }), Kbd({ keys: 'mod+shift+p', isMac: true }), Kbd({ keys: 'option+up', isMac: true }), Kbd({ keys: 'ctrl+tab', isMac: true })));
    body.append(example('Windows / Linux', Kbd({ keys: 'mod+k', isMac: false, data: { demo: 'kbd-pc' } }), Kbd({ keys: 'mod+shift+p', isMac: false }), Kbd({ keys: 'alt+up', isMac: false }), Kbd({ keys: 'escape', isMac: false })));
    body.append(example('Named keys', ...Object.keys(Kbd.symbols).map((k) => Kbd({ keys: [k], isMac: true }))));
    body.append(example('Light variant', Kbd({ keys: 'mod+b', variant: 'light' }), Kbd({ children: 'Space', variant: 'light' })));
    body.append(example('In text', h('p', {}, 'Press ', Kbd({ keys: 'mod+k' }), ' to search, or ', Kbd({ keys: '/' }), ' to focus the composer.')));
    body.append(example('Kbd.format() for tooltips', h('span', { text: `Bold ${Kbd.format('mod+b')} · Search ${Kbd.format('mod+k', false)}` })));
  });
})();
