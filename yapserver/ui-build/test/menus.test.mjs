// menus: Dropdown (menu button) and Tabs, with real keyboard and mouse.
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export default async function (t) {
  const p = t.page;
  await p.goto(t.url + '?theme=light');
  const ev = (body) => p.eval(body);
  const focusedText = () => ev(`const el = document.activeElement; return el ? (el.querySelector('[data-slot=label]')?.textContent || el.textContent || '').trim() : ''`);
  const isOpen = (id) => ev(`return document.getElementById(${JSON.stringify(id)}).yui.isOpen()`);
  const expanded = (id) => ev(`return document.getElementById(${JSON.stringify(id)}).getAttribute('aria-expanded')`);
  const log = (id) => ev(`return document.querySelector('#${id} output').textContent`);
  const pops = () => ev(`return document.querySelectorAll('.yui-portal .dropdown__popover:not([data-exiting])').length`);
  const focus = (sel) => ev(`document.querySelector(${JSON.stringify(sel)}).focus()`);
  const settle = () => sleep(250);

  // ---- menu button basics ----
  const attrs = await ev(`const b = document.getElementById('dd-more'); return { hp: b.getAttribute('aria-haspopup'), ex: b.getAttribute('aria-expanded'), ctl: b.getAttribute('aria-controls') }`);
  t.check(attrs.hp === 'menu' && attrs.ex === 'false' && attrs.ctl === null, 'trigger has aria-haspopup="menu", aria-expanded="false", no aria-controls while closed', attrs);

  await focus('#dd-more');
  await p.key('Enter');
  const opened = await ev(`const b = document.getElementById('dd-more'); const m = document.getElementById(b.getAttribute('aria-controls')); return { ex: b.getAttribute('aria-expanded'), role: m && m.getAttribute('role'), inPortal: !!(m && m.closest('.yui-portal')), labelledby: m && m.getAttribute('aria-labelledby') === 'dd-more', entering: m && m.parentElement.dataset.entering }`);
  t.check(opened.ex === 'true' && opened.role === 'menu' && opened.inPortal && opened.labelledby, 'Enter opens: aria-expanded="true", aria-controls points to the role="menu" in the portal, labelled by the trigger', opened);
  t.check(opened.entering === 'true', 'the menu runs the enter animation (data-entering)', opened);
  t.check(await focusedText() === 'Reply', 'Enter focuses the first item', await focusedText());
  const roles = await ev(`const m = document.getElementById(document.getElementById('dd-more').getAttribute('aria-controls')); return { items: [...m.querySelectorAll('.menu-item')].map(i => i.getAttribute('role')), sep: m.querySelectorAll('[role=separator]').length, tab: [...m.querySelectorAll('.menu-item')].every(i => i.tabIndex === -1) }`);
  t.check(roles.items.every((r) => r === 'menuitem') && roles.sep === 1 && roles.tab, 'items are role="menuitem" with tabindex -1, the divider is role="separator"', roles);
  const kbd = await ev(`const it = [...document.querySelectorAll('.yui-portal .menu-item')].find(i => i.textContent.includes('Edit')); const k = it.querySelector('kbd.kbd[data-slot=keyboard]'); return { kbd: !!k, abbr: k && k.querySelector('abbr.kbd__abbr')?.title, content: k && k.querySelector('.kbd__content')?.textContent, describedby: it.getAttribute('aria-describedby') === k?.id, shortcuts: it.getAttribute('aria-keyshortcuts') }`);
  t.check(kbd.kbd && kbd.content === 'E' && kbd.describedby && /\+E$/.test(kbd.shortcuts), 'shortcut renders as HeroUI .kbd with slot="keyboard", aria-describedby and aria-keyshortcuts', kbd);
  const danger = await ev(`const it = [...document.querySelectorAll('.yui-portal .menu-item')].pop(); return { cls: it.className, prevSep: it.previousElementSibling.getAttribute('role'), color: getComputedStyle(it.querySelector('[data-slot=label]')).color, danger: getComputedStyle(document.documentElement).getPropertyValue('--danger').trim() }`);
  t.check(danger.cls.includes('menu-item--danger') && danger.prevSep === 'separator', 'Delete is last, after a separator, in the danger variant', danger);

  await p.key('ArrowDown');
  t.check(await focusedText() === 'Copy link', 'ArrowDown moves to the next item');
  await p.key('ArrowUp'); await p.key('ArrowUp');
  t.check(await focusedText() === 'Delete', 'ArrowUp wraps from the first item to the last', await focusedText());
  await p.key('ArrowDown');
  t.check(await focusedText() === 'Reply', 'ArrowDown wraps from the last item to the first', await focusedText());
  await p.key('End');
  t.check(await focusedText() === 'Delete', 'End jumps to the last item');
  await p.key('Home');
  t.check(await focusedText() === 'Reply', 'Home jumps to the first item');
  await p.key('e');
  t.check(await focusedText() === 'Edit', 'typeahead: "e" focuses Edit', await focusedText());
  t.check(await ev(`return document.activeElement.dataset.focusVisible === 'true' && getComputedStyle(document.activeElement).boxShadow !== 'none'`), 'keyboard focus on an item shows the focus ring (data-focus-visible)');
  await p.key('Escape');
  t.check(!(await isOpen('dd-more')) && await expanded('dd-more') === 'false' && (await p.focused()).startsWith('button#dd-more'), 'Escape closes and returns focus to the trigger', await p.focused());
  await settle();
  t.check(await ev(`return document.querySelectorAll('.yui-portal .dropdown__popover').length === 0`), 'the closed menu leaves the DOM after its exit animation');

  await p.key(' ');
  t.check(await isOpen('dd-more') && await focusedText() === 'Reply', 'Space opens and focuses the first item');
  await p.key('Escape');
  await p.key('ArrowUp');
  t.check(await isOpen('dd-more') && await focusedText() === 'Delete', 'ArrowUp opens and focuses the last item', await focusedText());
  await p.key('Escape');
  await p.key('ArrowDown');
  t.check(await isOpen('dd-more') && await focusedText() === 'Reply', 'ArrowDown opens and focuses the first item');
  await p.key('ArrowDown'); await p.key('ArrowDown');
  await p.key('Enter');
  t.check(!(await isOpen('dd-more')) && await log('dropdown-log') === 'action: edit' && (await p.focused()).startsWith('button#dd-more'), 'Enter activates the item (onAction), closes, and returns focus to the trigger', { log: await log('dropdown-log'), f: await p.focused() });

  // Tab closes and moves on.
  await p.key('Enter');
  await p.key('Tab');
  t.check(!(await isOpen('dd-more')) && (await p.focused()).startsWith('button#dd-sort'), 'Tab closes the menu and moves focus to the next control after the trigger', await p.focused());
  await focus('#dd-sort');
  await p.key('Enter');
  await p.key('Tab', { shift: true });
  t.check(!(await isOpen('dd-sort')) && (await p.focused()).startsWith('button#dd-more'), 'Shift+Tab closes and moves focus to the control before the trigger', await p.focused());
  await settle();

  // Mouse.
  await p.click('#dd-more');
  t.check(await isOpen('dd-more') && await focusedText() === 'Reply', 'a click opens and focuses the first item');
  t.check(await ev(`const el = document.activeElement; return el.dataset.focused === 'true' && !el.dataset.focusVisible && getComputedStyle(el).boxShadow === 'none'`), 'after a click, the focused item shows no keyboard ring');
  await p.click('#dd-more');
  t.check(!(await isOpen('dd-more')), 'clicking the trigger again closes the menu');
  await settle();
  await p.click('#dd-more');
  await settle();
  await p.click('.yui-portal .menu-item[data-key="copy-link"]');
  t.check(!(await isOpen('dd-more')) && await log('dropdown-log') === 'action: copy-link' && (await p.focused()).startsWith('button#dd-more'), 'clicking an item activates it, closes, and returns focus', await log('dropdown-log'));
  await settle();
  await p.click('#dd-more');
  await settle();
  await p.clickAt(900, 860);
  t.check(!(await isOpen('dd-more')) && await expanded('dd-more') === 'false', 'a click outside closes the menu');
  await settle();

  // Flip near the bottom of the viewport.
  const flip = await ev(`
    const b = document.getElementById('dd-more');
    b.style.position = 'fixed'; b.style.left = '400px'; b.style.top = '860px';
    b.yui.open(false);
    const pop = document.querySelector('.yui-portal .dropdown__popover:not([data-exiting])');
    const r = pop.getBoundingClientRect(), a = b.getBoundingClientRect();
    const out = { placement: pop.dataset.placement, above: r.bottom <= a.top, top: r.top };
    b.yui.close({ focusTrigger: false });
    b.style.position = ''; b.style.left = ''; b.style.top = '';
    b.yui.open(false);
    const pop2 = [...document.querySelectorAll('.yui-portal .dropdown__popover')].pop();
    out.normal = pop2.dataset.placement;
    b.yui.close({ focusTrigger: false });
    return out;`);
  t.check(flip.placement === 'top' && flip.above && flip.normal === 'bottom', 'the menu flips above the trigger near the bottom of the viewport', flip);
  await settle();

  // ---- disabled items (attachment menu) ----
  await p.click('#dd-attach');
  await settle();
  const att = await ev(`const m = document.querySelector('.yui-portal [role=menu]'); const its = [...m.querySelectorAll('.menu-item')]; const pop = m.parentElement; const a = document.getElementById('dd-attach').getBoundingClientRect(); return { label: m.getAttribute('aria-label'), dis: its.map(i => i.getAttribute('aria-disabled')), desc: its[0].getAttribute('aria-describedby') && document.getElementById(its[0].getAttribute('aria-describedby').split(' ')[0]).textContent, footer: m.getAttribute('aria-describedby') && document.getElementById(m.getAttribute('aria-describedby')).textContent, placement: pop.dataset.placement, startAligned: Math.abs(pop.getBoundingClientRect().left - a.left) < 2 }`);
  t.check(att.label === 'Attach' && att.desc && att.desc.startsWith('PNG') && /drag files/.test(att.footer || ''), 'attachment menu: labelled, descriptions via aria-describedby, footer note describes the menu', att);
  t.check(att.dis[2] === 'true' && att.dis[0] === null, 'Take photo is aria-disabled', att.dis);
  t.check(att.placement === 'top' && att.startAligned, 'placement "top start" opens above, aligned to the trigger start', att);
  t.check(await focusedText() === 'Upload image or GIF', 'click focuses the first item');
  await p.key('ArrowDown'); await p.key('ArrowDown');
  t.check(await focusedText() === 'Take photo' && await ev(`return document.activeElement.getAttribute('aria-disabled') === 'true'`), 'disabled items stay focusable with aria-disabled');
  const before = await log('dropdown-log');
  await p.key('Enter');
  t.check(await isOpen('dd-attach') && await log('dropdown-log') === before, 'Enter on a disabled item does nothing and the menu stays open');
  await p.key(' ');
  t.check(await isOpen('dd-attach') && await log('dropdown-log') === before, 'Space on a disabled item does nothing');
  await p.key('Home');
  await p.key('t');
  t.check(await focusedText() === 'Upload image or GIF', 'typeahead skips disabled items ("t" does not reach Take photo)', await focusedText());
  await sleep(800);
  for (const ch of 'upload f') await p.key(ch);
  t.check(await focusedText() === 'Upload file', 'multi-character typeahead ("upload f") matches on the label', await focusedText());
  await sleep(800);
  await p.key('u');
  t.check(await focusedText() === 'Upload image or GIF', 'typeahead wraps around to the first match', await focusedText());
  await p.key('Enter');
  t.check(!(await isOpen('dd-attach')) && await log('dropdown-log') === 'action: image', 'Enter activates Upload image', await log('dropdown-log'));
  await settle();
  await p.click('#dd-attach-full');
  await p.click('#dd-attach');
  await settle();
  const full = await ev(`return [...document.querySelectorAll('.yui-portal .menu-item')].map(i => [i.getAttribute('aria-disabled'), i.querySelector('.description').textContent])`);
  t.check(full.every(([d, txt]) => d === 'true' && /up to 10 files/.test(txt)), 'items are rebuilt on open: when full, every item is disabled and explains why', full);
  await p.click('.yui-portal .menu-item[data-key="file"]');
  t.check(await isOpen('dd-attach') && await log('dropdown-log') === 'action: image', 'clicking a disabled item does nothing');
  await p.key('Escape');
  await p.click('#dd-attach-full');
  await settle();

  // ---- single selection ----
  await focus('#dd-sort');
  await p.key('Enter');
  const single = await ev(`const m = document.querySelector('.yui-portal [role=menu]'); const g = m.querySelector('[role=group]'); const its = [...m.querySelectorAll('.menu-item')]; return { roles: its.map(i => i.getAttribute('role')), checked: its.map(i => i.getAttribute('aria-checked')), group: g && document.getElementById(g.getAttribute('aria-labelledby'))?.textContent, mode: its[0].dataset.selectionMode, dot: !!its[0].querySelector('[data-slot="menu-item-indicator--dot"]'), dotOpacity: getComputedStyle(its[0].querySelector('[data-slot="menu-item-indicator--dot"]')).opacity, dotOff: getComputedStyle(its[1].querySelector('[data-slot="menu-item-indicator--dot"]')).opacity }`);
  t.check(single.roles.every((r) => r === 'menuitemradio') && single.mode === 'single', 'single selection: items are role="menuitemradio" with data-selection-mode="single"', single);
  t.check(JSON.stringify(single.checked) === '["true","false","false"]', 'aria-checked reflects the selected key', single.checked);
  t.check(single.group === 'Sort by', 'the section is role="group" labelled by its header', single);
  await sleep(300);
  const dots = await ev(`const its = [...document.querySelectorAll('.yui-portal .menu-item')]; return its.map(i => getComputedStyle(i.querySelector('[data-slot="menu-item-indicator--dot"]')).opacity)`);
  t.check(single.dot && dots[0] === '1' && dots[1] === '0', 'the dot indicator shows only on the selected item', dots);
  await p.key('ArrowDown');
  await p.key('Enter');
  t.check(!(await isOpen('dd-sort')) && await log('dropdown-log') === 'selection: oldest' && /Oldest/.test(await ev(`return document.getElementById('dd-sort').textContent`)), 'choosing an option closes the menu, calls onSelectionChange and the trigger shows it', await log('dropdown-log'));
  await p.key('Enter');
  t.check(JSON.stringify(await ev(`return [...document.querySelectorAll('.yui-portal .dropdown__popover:not([data-exiting]) .menu-item')].map(i => i.getAttribute('aria-checked'))`)) === '["false","true","false"]', 'reopened, the new option is checked');
  t.check(await focusedText() === 'Oldest', 'a selection menu opens with focus on the selected item (React Aria)', await focusedText());
  await p.key('ArrowUp');
  await p.key('Enter');
  t.check(await log('dropdown-log') === 'selection: newest' && await ev(`return [...document.getElementById('dd-sort').yui.selectedKeys()].join() === 'newest'`), 'Enter on Newest selects it', await log('dropdown-log'));
  await p.key('Enter'); await p.key('Enter');
  t.check(await ev(`return [...document.getElementById('dd-sort').yui.selectedKeys()].join() === 'newest'`), 'disallowEmptySelection keeps the selected option selected when chosen again');
  await settle();

  // ---- multiple selection ----
  await focus('#dd-show');
  await p.key('Enter');
  const multi = await ev(`const m = document.querySelector('.yui-portal .dropdown__popover:not([data-exiting]) [role=menu]'); const its = [...m.querySelectorAll('.menu-item')]; return { roles: its.map(i => i.getAttribute('role')), checked: its.map(i => i.getAttribute('aria-checked')), ms: m.getAttribute('aria-multiselectable'), check: !!its[0].querySelector('[data-slot="menu-item-indicator--checkmark"]') }`);
  t.check(multi.roles.every((r) => r === 'menuitemcheckbox') && multi.ms === null && multi.check, 'multiple selection: role="menuitemcheckbox" with the checkmark indicator', multi);
  t.check(JSON.stringify(multi.checked) === '["true","true","false","false"]', 'aria-checked reflects defaultSelectedKeys', multi.checked);
  await p.key(' ');
  t.check(await isOpen('dd-show') && await log('dropdown-log') === 'selection: reactions' && await ev(`return document.activeElement.getAttribute('aria-checked') === 'false'`), 'Space toggles an item off and the menu stays open', await log('dropdown-log'));
  await p.key('ArrowDown'); await p.key('ArrowDown');
  await p.key('Enter');
  t.check(await isOpen('dd-show') && await log('dropdown-log') === 'selection: reactions, joins', 'Enter toggles an item on and the menu stays open', await log('dropdown-log'));
  await p.click('.yui-portal .menu-item[data-key="previews"]');
  t.check(await isOpen('dd-show') && await log('dropdown-log') === 'selection: reactions, joins, previews' && await ev(`return document.querySelector('.yui-portal .menu-item[data-key="previews"]').getAttribute('aria-checked') === 'true'`), 'clicking toggles too and the menu stays open', await log('dropdown-log'));
  await p.key('Escape');
  t.check(!(await isOpen('dd-show')) && (await p.focused()).startsWith('button#dd-show'), 'Escape closes the multiple-selection menu');
  await ev(`document.getElementById('dd-show').yui.setSelectedKeys(['replies'])`);
  await p.key('Enter');
  t.check(JSON.stringify(await ev(`return [...document.querySelectorAll('.yui-portal .dropdown__popover:not([data-exiting]) .menu-item')].map(i => i.getAttribute('aria-checked'))`)) === '["true","false","false","false"]', 'setSelectedKeys() replaces the selection');
  await p.key('Escape');
  await settle();

  // ---- submenus ----
  await focus('#dd-sub');
  await p.key('Enter');
  const sec = await ev(`const m = document.querySelector('.yui-portal [role=menu]'); return [...m.querySelectorAll('[role=group]')].map(g => document.getElementById(g.getAttribute('aria-labelledby')).textContent)`);
  t.check(JSON.stringify(sec) === '["Message","Thread"]', 'sections are groups labelled by their headers', sec);
  await p.key('f');
  const fwd = await ev(`const el = document.activeElement; return { label: el.textContent.trim(), hp: el.getAttribute('aria-haspopup'), ex: el.getAttribute('aria-expanded'), has: el.dataset.hasSubmenu, chevron: !!el.querySelector('.menu-item__indicator--submenu') }`);
  t.check(fwd.label === 'Forward to' && fwd.hp === 'menu' && fwd.ex === 'false' && fwd.has === 'true' && fwd.chevron, 'a submenu item has aria-haspopup="menu", aria-expanded, data-has-submenu and the chevron', fwd);
  await p.key('ArrowRight');
  const subOpen = await ev(`const it = document.querySelector('.yui-portal .menu-item[data-key=forward]'); const sub = document.getElementById(it.getAttribute('aria-controls')); const pr = it.closest('.dropdown__popover').getBoundingClientRect(), sr = sub.parentElement.getBoundingClientRect(); return { ex: it.getAttribute('aria-expanded'), labelled: sub.getAttribute('aria-labelledby') === it.id, right: sr.left >= pr.right - 1, placement: sub.parentElement.dataset.placement }`);
  t.check(subOpen.ex === 'true' && subOpen.labelled && subOpen.right && subOpen.placement === 'right', 'ArrowRight opens the submenu to the right, labelled by its item', subOpen);
  t.check(await focusedText() === '#general', 'and focuses its first item', await focusedText());
  await p.key('ArrowDown'); await p.key('ArrowDown');
  t.check(await focusedText() === '#random' && await ev(`return document.activeElement.getAttribute('aria-disabled') === 'true'`), 'arrow keys move inside the submenu, disabled items focusable');
  await p.key('ArrowDown'); await p.key('ArrowDown');
  t.check(await focusedText() === '#general', 'the submenu wraps too');
  await p.key('ArrowLeft');
  t.check(await pops() === 1 && await focusedText() === 'Forward to' && await ev(`return document.activeElement.getAttribute('aria-expanded') === 'false'`), 'ArrowLeft closes the submenu and returns focus to its item');
  await p.key('Enter');
  t.check(await pops() === 2 && await focusedText() === '#general', 'Enter opens the submenu and focuses its first item');
  await p.key('Escape');
  t.check(await pops() === 1 && await isOpen('dd-sub') && await focusedText() === 'Forward to', 'Escape closes only the submenu and returns focus to its item');
  await p.key('ArrowLeft');
  t.check(await isOpen('dd-sub') && await focusedText() === 'Forward to', 'ArrowLeft in the top menu does nothing');
  await p.key('ArrowRight');
  await p.key('d');
  t.check(await focusedText() === '#design', 'typeahead works in the submenu');
  await p.key('Enter');
  t.check(!(await isOpen('dd-sub')) && await pops() === 0 && await log('dropdown-log') === 'action: fwd-design' && (await p.focused()).startsWith('button#dd-sub'), 'activating a submenu item closes every menu and returns focus to the trigger', await log('dropdown-log'));
  await settle();

  // Hover opens after a delay; moving to a sibling closes it.
  await p.click('#dd-sub');
  await settle();
  await p.hover('.yui-portal .menu-item[data-key=forward]');
  await sleep(60);
  t.check(await pops() === 1, 'hovering a submenu item does not open it at once');
  await sleep(300);
  t.check(await pops() === 2 && await focusedText() === 'Forward to', 'hover opens the submenu after a short delay; focus stays on the item', await pops());
  await p.hover('.yui-portal .dropdown__popover:last-child .menu-item[data-key=fwd-support]');
  await sleep(300);
  t.check(await pops() === 2 && await focusedText() === '#support', 'moving into the submenu keeps it open and hover focuses its items', await focusedText());
  await p.hover('.yui-portal .menu-item[data-key=pin]');
  await sleep(350);
  t.check(await pops() === 1 && await focusedText() === 'Pin to channel', 'hovering another item in the parent closes the submenu');
  await p.hover('.yui-portal .menu-item[data-key=forward]');
  await sleep(350);
  await p.click('.yui-portal .dropdown__popover:last-child .menu-item[data-key=fwd-general]');
  t.check(!(await isOpen('dd-sub')) && await log('dropdown-log') === 'action: fwd-general', 'clicking a submenu item activates it and closes everything');
  await settle();
  await p.click('#dd-sub');
  await settle();
  await p.click('.yui-portal .menu-item[data-key=forward]');
  t.check(await pops() === 2, 'clicking a submenu item opens the submenu');
  await p.clickAt(900, 860);
  t.check(!(await isOpen('dd-sub')) && await pops() === 0, 'a click outside closes the submenu and the menu');
  await settle();

  // ---- long press ----
  await p.click('#dd-long');
  t.check(!(await isOpen('dd-long')) && await log('dropdown-log') === 'action: send', 'longPress: a normal click runs the button\'s own action');
  const c = await p.center('#dd-long');
  await p.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: c.x, y: c.y });
  await p.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: c.x, y: c.y, button: 'left', clickCount: 1 });
  await sleep(650);
  t.check(await isOpen('dd-long'), 'longPress: holding opens the menu');
  await ev(`document.querySelector('#dropdown-log output').textContent = '—'`);
  await p.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: c.x, y: c.y, button: 'left', clickCount: 1 });
  await sleep(50);
  t.check(await isOpen('dd-long') && await log('dropdown-log') === '—', 'longPress: releasing after the hold doesn\'t click the button');
  await p.key('Escape');
  await p.key('ArrowDown', { alt: true });
  t.check(await isOpen('dd-long') && await focusedText() === 'Schedule send', 'longPress: Alt+ArrowDown opens from the keyboard');
  await p.key('Escape');
  await settle();

  // ---- axe and screenshots, menu open ----
  for (const theme of ['light', 'dark']) {
    await p.theme(theme);
    await sleep(300); // let color transitions finish before measuring contrast
    await focus('#dd-sub');
    await p.key('Enter');
    await p.key('f');
    await p.key('ArrowRight');
    await settle();
    t.check(await pops() === 2 && await focusedText() === '#general', `submenu open for the audit (${theme})`);
    await t.axe('#dropdown', `dropdown section (${theme}, menu open)`);
    await t.axe('.yui-portal', `open menu and submenu (${theme})`);
    await p.screenshot(`${t.shots}/menus-dropdown-submenu-${theme}.png`);
    await p.key('Escape'); await p.key('Escape');
    await settle();
    await p.click('#dd-more');
    await p.key('End');
    await settle();
    await t.axe('.yui-portal', `message actions menu (${theme})`);
    await p.screenshot(`${t.shots}/menus-dropdown-more-${theme}.png`);
    await p.key('Escape');
    await settle();
    await p.click('#dd-attach');
    await p.key('ArrowDown');
    await settle();
    await t.axe('.yui-portal', `attachment menu (${theme})`);
    await p.screenshot(`${t.shots}/menus-dropdown-attach-${theme}.png`);
    await p.key('Escape');
    await settle();
    await focus('#dd-sort');
    await p.key('Enter');
    await settle();
    await t.axe('.yui-portal', `sort menu (${theme})`);
    await p.screenshot(`${t.shots}/menus-dropdown-sort-${theme}.png`);
    await p.key('Escape');
    await focus('#dd-show');
    await p.key('Enter');
    await settle();
    await t.axe('.yui-portal', `show menu (${theme})`);
    await p.screenshot(`${t.shots}/menus-dropdown-show-${theme}.png`);
    await p.key('Escape');
    await settle();
  }
  await p.theme('light');

  // ---- tabs ----
  const tabInfo = (id) => ev(`const root = document.getElementById(${JSON.stringify(id)}); return [...root.querySelectorAll('[role=tab]')].map(t => ({ label: t.textContent.trim(), sel: t.getAttribute('aria-selected'), ti: t.tabIndex, panel: document.getElementById(t.getAttribute('aria-controls')), }) ).map(x => ({ label: x.label, sel: x.sel, ti: x.ti, hidden: x.panel.hidden }))`);
  const struct = await ev(`const root = document.getElementById('tabs-primary'); const list = root.querySelector('[role=tablist]'); const tabs = [...list.querySelectorAll('[role=tab]')]; return { list: list.className, orient: list.getAttribute('aria-orientation'), label: list.getAttribute('aria-label'), rootOrient: root.dataset.orientation, container: list.parentElement.className, controls: tabs.every(t => { const p = document.getElementById(t.getAttribute('aria-controls')); return p && p.getAttribute('role') === 'tabpanel' && p.getAttribute('aria-labelledby') === t.id; }), sel: tabs.map(t => t.getAttribute('aria-selected')), ti: tabs.map(t => t.tabIndex), indicator: tabs[0].querySelector('.tabs__indicator') !== null }`);
  t.check(struct.list === 'tabs__list' && struct.container === 'tabs__list-container' && struct.orient === 'horizontal' && struct.label === 'Channel' && struct.rootOrient === 'horizontal', 'tabs: HeroUI structure, role="tablist" with aria-orientation and a label', struct);
  t.check(struct.controls, 'each tab has aria-controls → its tabpanel, which is aria-labelledby the tab');
  t.check(JSON.stringify(struct.sel) === '["true","false","false"]' && JSON.stringify(struct.ti) === '[0,-1,-1]' && struct.indicator, 'first tab selected, roving tabindex, indicator in the selected tab', struct);
  t.check(await ev(`const s = getComputedStyle(document.querySelector('#tabs-primary [role=tab]')); const u = getComputedStyle(document.querySelectorAll('#tabs-primary [role=tab]')[1]); return s.color !== u.color`), 'selected and unselected tabs differ in color as well as the indicator');

  await p.click('#tabs-primary [role=tab]:nth-child(1)');
  await p.key('ArrowRight');
  let info = await tabInfo('tabs-primary');
  t.check(info[1].sel === 'true' && info[1].ti === 0 && info[0].ti === -1 && !info[1].hidden && info[0].hidden && await focusedText() === 'Members' && await log('tabs-log') === 'primary: members', 'ArrowRight selects and focuses the next tab and shows its panel (automatic activation)', { info, log: await log('tabs-log') });
  const mid = await ev(`const ind = document.querySelector('#tabs-primary .tabs__indicator'); return { parent: ind.parentElement.textContent.trim(), translate: ind.style.translate, ready: ind.dataset.animationReady }`);
  t.check(mid.parent === 'Members' && /^0px( 0px)?$/.test(mid.translate) && mid.ready === 'true', 'the indicator moves to the selected tab and animates from the old one', mid);
  await sleep(400);
  const done = await ev(`const ind = document.querySelector('#tabs-primary .tabs__indicator'); const a = ind.getBoundingClientRect(), b = ind.parentElement.getBoundingClientRect(); return { dx: Math.abs(a.left - b.left), dw: Math.abs(a.width - b.width), style: ind.getAttribute('style') }`);
  t.check(done.dx < 1 && done.dw < 1 && !done.style, 'after the animation the indicator covers the selected tab', done);
  await p.key('ArrowLeft'); await p.key('ArrowLeft');
  info = await tabInfo('tabs-primary');
  t.check(info[2].sel === 'true' && await focusedText().then((x) => x.startsWith('Settings')), 'ArrowLeft wraps from the first tab to the last', info);
  await p.key('Home');
  t.check((await tabInfo('tabs-primary'))[0].sel === 'true', 'Home selects the first tab');
  await p.key('End');
  t.check((await tabInfo('tabs-primary'))[2].sel === 'true', 'End selects the last tab');
  const panels = await ev(`return [...document.querySelectorAll('#tabs-primary [role=tabpanel]')].map(p => p.getAttribute('tabindex'))`);
  t.check(panels[0] === '0' && panels[2] === null, 'panels without focusable content are tabindex 0; the one with a button is not', panels);
  await p.key('Tab');
  t.check((await p.focused()).startsWith('button#tabs-panel-button'), 'Tab moves from the tab list into the panel content', await p.focused());
  await p.key('Tab', { shift: true });
  t.check(await focusedText() === 'Settings', 'Shift+Tab returns to the selected tab');
  await p.key('ArrowDown');
  t.check((await tabInfo('tabs-primary'))[2].sel === 'true', 'ArrowDown does nothing in horizontal tabs');

  // Disabled tab (secondary).
  const dis = await ev(`const t = [...document.querySelectorAll('#tabs-secondary [role=tab]')][2]; return { ad: t.getAttribute('aria-disabled'), why: document.getElementById(t.getAttribute('aria-describedby'))?.textContent, root: document.getElementById('tabs-secondary').className }`);
  t.check(dis.ad === 'true' && dis.why === 'Pin a message to see it here' && /tabs--secondary/.test(dis.root) && /tabs--align-start/.test(dis.root), 'a disabled tab is aria-disabled and described by why (tooltip hook)', dis);
  await p.click('#tabs-secondary [role=tab]:nth-child(2)');
  await p.key('ArrowRight');
  info = await tabInfo('tabs-secondary');
  t.check(info[3].sel === 'true' && await focusedText() === 'Links', 'arrow keys skip the disabled tab', info);
  await p.key('ArrowLeft');
  t.check(await focusedText() === 'Files', 'and skip it going back');
  await p.click('#tabs-secondary [role=tab]:nth-child(3)');
  t.check((await tabInfo('tabs-secondary'))[2].sel === 'false', 'clicking a disabled tab does nothing');
  await p.key('End');
  t.check(await focusedText() === 'Links', 'End goes to the last enabled tab');

  // Vertical.
  await p.click('#tabs-vertical [role=tab]:nth-child(1)');
  t.check(await ev(`return document.querySelector('#tabs-vertical [role=tablist]').getAttribute('aria-orientation') === 'vertical' && document.getElementById('tabs-vertical').dataset.orientation === 'vertical'`), 'vertical tabs have aria-orientation="vertical"');
  await p.key('ArrowDown');
  t.check(await focusedText() === 'Notifications' && (await tabInfo('tabs-vertical'))[1].sel === 'true', 'ArrowDown moves down vertical tabs');
  await p.key('ArrowDown');
  t.check(await focusedText() === 'Advanced', 'ArrowDown skips the disabled tab');
  await p.key('ArrowDown');
  t.check(await focusedText() === 'Profile', 'ArrowDown wraps');
  await p.key('ArrowUp');
  t.check(await focusedText() === 'Advanced', 'ArrowUp wraps back');
  await p.key('ArrowRight');
  t.check(await focusedText() === 'Advanced', 'ArrowRight does nothing in vertical tabs');
  await sleep(350);
  const vind = await ev(`const ind = document.querySelector('#tabs-vertical .tabs__indicator'); const a = ind.getBoundingClientRect(), b = ind.parentElement.getBoundingClientRect(); return { parent: ind.parentElement.textContent.trim(), dy: Math.abs(a.top - b.top) }`);
  t.check(vind.parent === 'Advanced' && vind.dy < 1, 'the vertical indicator follows the selection', vind);

  // Manual activation.
  await p.click('#tabs-manual [role=tab]:nth-child(1)');
  await ev(`document.querySelector('#tabs-log output').textContent = '—'`);
  await p.key('ArrowRight');
  info = await tabInfo('tabs-manual');
  t.check(await focusedText() === 'People' && info[0].sel === 'true' && info[1].sel === 'false' && await log('tabs-log') === '—', 'manual: arrow keys move focus without selecting');
  await p.key('Enter');
  info = await tabInfo('tabs-manual');
  t.check(info[1].sel === 'true' && !info[1].hidden && await log('tabs-log') === 'manual: people', 'manual: Enter selects the focused tab', await log('tabs-log'));
  await p.key('ArrowRight');
  await p.key(' ');
  t.check((await tabInfo('tabs-manual'))[2].sel === 'true' && await log('tabs-log') === 'manual: channels', 'manual: Space selects the focused tab');
  await ev(`document.getElementById('tabs-manual').yui.setSelectedKey('all')`);
  t.check((await tabInfo('tabs-manual'))[0].sel === 'true' && await log('tabs-log') === 'manual: channels', 'setSelectedKey() selects without calling onSelectionChange');

  for (const theme of ['light', 'dark']) {
    await p.theme(theme);
    await sleep(300); // let color transitions finish before measuring contrast
    await focus('#tabs-primary [aria-selected=true]');
    await t.axe('#tabs', `tabs section (${theme})`);
    await ev(`document.getElementById('tabs').scrollIntoView()`);
    await p.hover('#tabs-secondary [role=tab]:nth-child(3)');
    await sleep(100);
    await p.screenshot(`${t.shots}/menus-tabs-${theme}.png`);
  }
  await p.theme('light');
}
