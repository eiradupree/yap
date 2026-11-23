// Toast region and YapUI.toast(): content, lifetime, stacking, promise and
// update, focus, announcements, reduced motion, axe and screenshots.
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export default async function (t) {
  const p = t.page;
  await p.goto(t.url + '?theme=light');
  await p.mouseAway();

  const live = (sel = '') => `[...document.querySelectorAll('.toast:not([data-exiting="true"])${sel}')]`;
  const count = () => p.eval(`return ${live()}.length`);
  const reset = async () => {
    await p.eval(`YapUI.toast.clear(); YapUI.toast.configure({ timeout: 8000, maxVisible: 3, placement: 'bottom end' }); document.querySelector('#toast-demo-default').focus(); document.activeElement.blur();`);
    await p.waitFor(`!document.querySelector('.toast')`, 'toasts removed');
    await p.mouseAway();
  };

  // ---- content and variants ----
  await p.click('#toast-demo-success');
  await p.waitFor(`document.querySelector('.toast')`, 'a toast');
  await sleep(450); // let the enter transition finish
  const first = await p.eval(`
    const r = document.querySelector('.toast-region'), el = document.querySelector('.toast');
    return { regionTag: r.tagName, label: r.getAttribute('aria-label'), regionClass: r.className, cls: el.className, title: el.querySelector('.toast__title').textContent,
      labelled: document.getElementById(el.getAttribute('aria-labelledby'))?.textContent, slot: el.dataset.slot, role: el.getAttribute('role'),
      icon: !!el.querySelector('.toast__indicator [data-slot="toast-default-icon"]'),
      close: el.querySelector('.toast__close-button')?.getAttribute('aria-label'), closeCls: el.querySelector('[data-slot="toast-close"]')?.className,
      closeVisible: getComputedStyle(el.querySelector('.toast__close-button')).opacity,
      focused: document.activeElement.id };`);
  t.check(first.regionTag === 'SECTION' && first.label === 'Notifications' && first.regionClass.includes('toast-region--bottom-end'), 'region is a labelled landmark, bottom end by default', first);
  t.check(first.cls.includes('toast--success') && first.cls.includes('toast--bottom-end') && first.slot === 'toast' && first.role === 'group', 'toast has HeroUI classes and variant', first);
  t.check(first.title === 'Success: Message sent.' && first.labelled === first.title, 'title, with a screen-reader variant prefix, labels the toast', first);
  t.check(first.icon, 'indicator shows the variant icon');
  t.check(first.close === 'Close notification' && /close-button close-button--default toast__close-button/.test(first.closeCls) && first.closeVisible === '1', 'close button is labelled and always visible', first);
  t.check(first.focused === 'toast-demo-success', 'showing a toast does not move focus', first);

  // ---- announcements ----
  await p.waitFor(`document.querySelector('.toast-region [role="status"]').textContent.includes('Message sent.')`, 'status announcement', 1000).then(() => t.check(true, 'polite live region announces the toast'), (e) => t.check(false, 'polite live region announces the toast', String(e)));
  await p.click('#toast-demo-danger');
  const ann = await p.eval(`await new Promise(r => setTimeout(r, 300)); return { alert: document.querySelector('.toast-region [role="alert"]').textContent, status: document.querySelector('.toast-region [role="status"]').textContent };`);
  t.check(ann.alert.includes('Error: Message not sent. You’re offline.') && !ann.status.includes('not sent'), 'danger toasts are announced assertively (role=alert), with title and description', ann);
  await p.eval(`YapUI.toast({ title: 'Message deleted.', action: { label: 'Undo' } })`);
  t.check(await p.eval(`await new Promise(r => setTimeout(r, 300)); return document.querySelector('.toast-region [role="status"]').textContent.includes('Message deleted. Press Alt+T to reach Undo.')`), 'action toasts announce how to reach the action');
  t.check(await p.eval(`return document.querySelector('.toast-region [aria-live], .toast-region [role="status"]').closest('.toast') === null && !document.querySelector('.toast[aria-live], .toast[role="alert"], .toast[role="alertdialog"]')`), 'toasts themselves are not live regions (no double announcement)');
  await reset();

  // Gallery demos log their events.
  await p.click('#toast-demo-action');
  await sleep(450);
  await p.click('.toast__action');
  const logged = await p.eval(`await new Promise(r => setTimeout(r, 50)); return document.querySelector('#toast .gallery-log').textContent`);
  t.check(logged === 'closed: action (action)', 'gallery logs the Undo action and the close reason', logged);
  await reset();

  // ---- lifetime ----
  await p.eval(`window.__closed = []; YapUI.toast({ title: 'Quick', timeout: 300, onClose: (r) => __closed.push(r) })`);
  await sleep(150);
  t.check(await count() === 1, 'toast is showing before its timeout');
  await p.waitFor(`__closed.includes('timeout') && !document.querySelector('.toast')`, 'auto-dismiss', 2000).then(() => t.check(true, 'auto-dismisses after the timeout and calls onClose("timeout")'), (e) => t.check(false, 'auto-dismisses after the timeout', String(e)));

  t.check(await p.eval(`const c = YapUI.toast('Default'); const t0 = document.querySelector('.toast'); const ok = c.id && typeof c.close === 'function' && typeof c.update === 'function'; c.close(); return ok;`), 'toast(title) shorthand returns { id, close, update }');
  await reset();

  // Hover pauses.
  await p.eval(`YapUI.toast({ title: 'Hover me', timeout: 1500 })`);
  await sleep(400); // the toast slides in; hover where it ends up
  await p.hover('.toast');
  await sleep(1300);
  t.check(await count() === 1, 'hovering the toast pauses its timer');
  await p.mouseAway();
  await sleep(200);
  t.check(await count() === 1, 'timer resumes with its remaining time, not instantly');
  await p.waitFor(`!document.querySelector('.toast:not([data-exiting="true"])')`, 'dismiss after hover', 2000).then(() => t.check(true, 'dismisses after the pointer leaves'), (e) => t.check(false, 'dismisses after the pointer leaves', String(e)));
  await reset();

  // Focus pauses.
  await p.eval(`document.querySelector('#toast-demo-default').focus(); YapUI.toast({ title: 'Focus me', timeout: 400 })`);
  await p.key('t', { alt: true });
  const altT = await p.focused();
  t.check(altT.startsWith('div#yui-toast'), 'Alt+T moves focus to the newest toast in the region', altT);
  await sleep(900);
  t.check(await count() === 1, 'focus inside the toast pauses its timer');
  await p.key('Escape');
  const afterEsc = await p.focused();
  t.check(afterEsc.startsWith('button#toast-demo-default'), 'Escape leaves the region and returns focus', afterEsc);
  await p.waitFor(`!document.querySelector('.toast:not([data-exiting="true"])')`, 'dismiss after blur', 2000).then(() => t.check(true, 'dismisses after focus leaves'), (e) => t.check(false, 'dismisses after focus leaves', String(e)));
  await reset();

  // Persistent defaults.
  await p.eval(`YapUI.toast.configure({ timeout: 300 });
    YapUI.toast({ title: 'Plain' }); YapUI.toast({ title: 'Deleted.', action: { label: 'Undo' } }); YapUI.toast.danger('Not sent.');`);
  await sleep(900);
  const persisted = await p.eval(`return ${live()}.map(e => e.querySelector('.toast__title').textContent)`);
  t.check(persisted.length === 2 && persisted.includes('Deleted.') && persisted.includes('Error: Not sent.'), 'action and danger toasts are persistent by default; plain ones time out', persisted);
  t.check(await p.eval(`const c = YapUI.toast({ title: 'x', action: { label: 'Go' }, timeout: 300 }); await new Promise(r => setTimeout(r, 800)); return !c.isOpen;`), 'an explicit timeout still applies to an action toast');
  await reset();

  // Close button by keyboard; action button by keyboard.
  await p.eval(`window.__closed = []; window.__acted = 0;
    YapUI.toast({ title: 'Older', timeout: 0, onClose: (r) => __closed.push('older:' + r) });
    YapUI.toast({ title: 'Deleted.', action: { label: 'Undo', onPress: () => __acted++ }, onClose: (r) => __closed.push('newer:' + r) });
    document.querySelector('#toast-demo-default').focus();`);
  await p.key('t', { alt: true });
  await p.key('Tab');
  t.check((await p.focused()).includes('toast__action'), 'Tab reaches the action button');
  await p.key('Tab');
  t.check((await p.focused()).includes('toast__close-button'), 'then the close button');
  await p.key('Enter');
  const kb = await p.eval(`return { closed: __closed.slice(), acted: __acted, left: ${live()}.map(e => e.querySelector('.toast__title').textContent) }`);
  t.check(kb.closed[0] === 'newer:close' && kb.acted === 0 && kb.left.join() === 'Older', 'Enter on the close button closes that toast', kb);
  const moved = await p.focused();
  t.check(moved.startsWith('div#yui-toast') && moved.includes('Older'), 'focus moves to the next toast when the focused one closes', moved);
  await p.key('Tab');
  await p.key(' ');
  t.check(await p.eval(`return __closed.includes('older:close')`), 'Space on the close button closes it too');
  const back = await p.focused();
  t.check(back.startsWith('button#toast-demo-default'), 'closing the last focused toast returns focus to where it came from', back);
  await p.eval(`YapUI.toast({ title: 'Deleted.', action: { label: 'Undo', onPress: () => __acted++ }, onClose: (r) => __closed.push('act:' + r) })`);
  await p.key('t', { alt: true });
  await p.key('Tab');
  await p.key('Enter');
  t.check(await p.eval(`return __acted === 1 && __closed.includes('act:action')`), 'the action runs onPress and closes the toast');
  await reset();

  // Mouse: the close button.
  await p.eval(`YapUI.toast({ title: 'Click close', timeout: 0 })`);
  await p.click('.toast__close-button');
  t.check(await count() === 0, 'clicking the close button closes the toast');
  await reset();

  // ---- stacking ----
  await p.click('#toast-demo-burst');
  const stack = await p.eval(`await new Promise(r => setTimeout(r, 50)); return ${live()}.map(e => ({ t: e.querySelector('.toast__title').textContent, i: e.dataset.index, front: e.dataset.frontmost, hidden: e.dataset.hidden, inert: e.inert, ah: e.getAttribute('aria-hidden'), tab: e.tabIndex, z: +e.style.zIndex, scale: e.style.getPropertyValue('--scale-collapsed'), off: e.style.getPropertyValue('--offset-collapsed') }))`);
  t.check(stack.length === 6 && stack[0].t === 'Notification 6 of 6' && stack[5].t === 'Notification 1 of 6' && stack.every((s, i) => s.i === String(i)), 'newest first, with data-index in stack order', stack.map((s) => s.t));
  t.check(stack[0].front === 'true' && stack.slice(1).every((s) => s.front === 'false') && stack[0].z > stack[1].z, 'only the newest is frontmost and on top', stack);
  t.check(stack.slice(0, 3).every((s) => s.hidden === 'false') && stack.slice(3).every((s) => s.hidden === 'true' && s.inert && s.ah === 'true'), 'beyond maxVisible (3), older toasts are hidden, inert and aria-hidden', stack);
  t.check(stack[0].tab === 0 && stack[1].tab === -1 && stack[1].scale === '0.95' && stack[1].off === '12px', 'collapsed toasts behind the front one shrink, peek out and are not tab stops', stack.slice(0, 3));
  const ov = await p.eval(`const b = document.querySelector('.yui-toast-overflow'); return { hidden: b.hidden, text: b.textContent, exp: b.getAttribute('aria-expanded') }`);
  t.check(!ov.hidden && ov.text === '3 more notifications' && ov.exp === 'false', 'an overflow count shows how many are hidden', ov);
  const before = await p.eval(`return document.querySelector('.toast-region').dataset.expanded`);
  await p.hover('.toast[data-index="0"]');
  await sleep(50);
  const hov = await p.eval(`return { region: document.querySelector('.toast-region').dataset.expanded, offs: ${live()}.slice(0, 3).map(e => parseFloat(e.style.getPropertyValue('--offset-expanded'))) }`);
  t.check(before === 'false' && hov.region === 'true' && hov.offs[0] === 0 && hov.offs[1] > hov.offs[0] && hov.offs[2] > hov.offs[1], 'hovering expands the stack', { before, hov });
  const gaps = await p.eval(`const r = ${live()}.slice(0, 3).map(e => e.getBoundingClientRect()); await new Promise(r => setTimeout(r, 450)); const q = ${live()}.slice(0, 3).map(e => e.getBoundingClientRect()); return [Math.round(q[0].top - q[1].bottom), Math.round(q[1].top - q[2].bottom)]`);
  t.check(gaps.every((g) => g === 8), 'expanded toasts are 8px apart (PatternFly)', gaps);
  await p.click('.yui-toast-overflow');
  const all = await p.eval(`await new Promise(r => setTimeout(r, 50)); return { hidden: ${live('[data-hidden="true"]')}.length, text: document.querySelector('.yui-toast-overflow').textContent, exp: document.querySelector('.yui-toast-overflow').getAttribute('aria-expanded') }`);
  t.check(all.hidden === 0 && all.text === 'Show fewer' && all.exp === 'true', '"3 more notifications" reveals the hidden toasts', all);
  await p.key('Tab', { shift: true });
  const oldest = await p.focused();
  t.check(oldest.includes('toast__close-button'), 'the revealed oldest toast is reachable by keyboard', oldest);
  await p.key('Escape');
  await p.mouseAway();
  await sleep(50);
  t.check(await p.eval(`return ${live('[data-hidden="true"]')}.length === 3 && document.querySelector('.toast-region').dataset.expanded === 'false'`), 'leaving the region collapses back to 3');
  // Hidden toasts don't time out unseen.
  await p.eval(`YapUI.toast.clear()`);
  await p.waitFor(`!document.querySelector('.toast')`);
  await p.eval(`for (let i = 0; i < 4; i++) YapUI.toast({ title: 'T' + i, timeout: i === 0 ? 0 : 300 });`);
  await sleep(800);
  const unseen = await p.eval(`return ${live()}.map(e => e.querySelector('.toast__title').textContent)`);
  t.check(unseen.join() === 'T0', 'a hidden toast starts its timer only once it becomes visible', unseen);
  await p.eval(`YapUI.toast.configure({ maxVisible: 1 }); YapUI.toast({ title: 'A', timeout: 0 });`);
  t.check(await p.eval(`return ${live('[data-hidden="false"]')}.length === 1`), 'configure({maxVisible}) changes the cap');
  await reset();

  // ---- promise and update ----
  await p.eval(`window.__p = new Promise((res) => { window.__res = res; });
    window.__pc = YapUI.toast.promise(__p, { loading: 'Uploading report.pdf…', success: (n) => n + ' uploaded.', error: 'Upload failed.' });
    window.__el = document.querySelector('.toast');`);
  const loading = await p.eval(`const e = document.querySelector('.toast'); return { t: e.querySelector('.toast__title').textContent, spin: !!e.querySelector('.toast__indicator [data-slot="spinner"]'), busy: e.getAttribute('aria-busy') }`);
  t.check(loading.t === 'Uploading report.pdf…' && loading.spin && loading.busy === 'true', 'toast.promise shows a loading toast with a spinner', loading);
  await p.eval(`__res('report.pdf'); await __p; await new Promise(r => setTimeout(r, 200));`);
  const ok = await p.eval(`const e = document.querySelector('.toast'); return { same: e === __el, cls: e.className, t: e.querySelector('.toast__title').textContent, spin: !!e.querySelector('[data-slot="spinner"]'), swapped: e.querySelector('.toast__indicator').dataset.swapped, busy: e.getAttribute('aria-busy'), said: document.querySelector('.toast-region [role="status"]').textContent }`);
  t.check(ok.same && ok.cls.includes('toast--success') && ok.t === 'Success: report.pdf uploaded.' && !ok.spin && ok.swapped === 'true' && ok.busy === 'false', 'resolving moves it to success in place, with success(result)', ok);
  t.check(ok.said.includes('Success: report.pdf uploaded.'), 'the settled message is announced', ok.said);
  await p.eval(`window.__p2 = Promise.reject(new Error('Too big')); YapUI.toast.promise(__p2, { loading: 'Uploading…', success: 'Done', error: (e) => ({ title: 'Upload failed.', description: e.message }) }); await __p2.catch(() => {}); await new Promise(r => setTimeout(r, 200));`);
  const bad = await p.eval(`const e = document.querySelector('.toast'); return { cls: e.className, t: e.querySelector('.toast__title').textContent, d: e.querySelector('.toast__description')?.textContent, alert: document.querySelector('.toast-region [role="alert"]').textContent }`);
  t.check(bad.cls.includes('toast--danger') && bad.t === 'Error: Upload failed.' && bad.d === 'Too big' && bad.alert.includes('Upload failed. Too big'), 'rejecting moves it to danger with error(err), announced assertively', bad);
  const upd = await p.eval(`const c = YapUI.toast({ title: 'Draft saved.', timeout: 0 }); const e = document.querySelector('.toast'); c.update({ title: 'Draft saved to Notes.', description: 'Just now.', variant: 'accent' }); const e2 = document.querySelector('.toast'); YapUI.toast.update(c.id, { title: 'Again.' });
    return { same: e === e2 && e2.isConnected, cls: e2.className, t: e2.querySelector('.toast__title').textContent, d: e2.querySelector('.toast__description').textContent, idx: e2.dataset.index }`);
  t.check(upd.same && upd.cls.includes('toast--accent') && upd.t === 'Again.' && upd.d === 'Just now.' && upd.idx === '0', 'update() and toast.update(id) change content in place', upd);
  t.check(await p.eval(`const c = YapUI.toast({ title: 'x', timeout: 0 }); YapUI.toast.close(c.id); return !c.isOpen`), 'toast.close(id) closes by id');
  t.check(await p.eval(`YapUI.toast.pauseAll(); const c = YapUI.toast({ title: 'p', timeout: 200 }); await new Promise(r => setTimeout(r, 500)); const held = c.isOpen; YapUI.toast.resumeAll(); await new Promise(r => setTimeout(r, 500)); return held && !c.isOpen`), 'pauseAll() holds timers and resumeAll() releases them');
  await reset();

  // ---- focus ----
  await p.eval(`document.querySelector('#toast-demo-default').focus()`);
  await p.key('t', { alt: true });
  t.check((await p.focused()).startsWith('button#toast-demo-default'), 'Alt+T with no toasts does nothing');
  await p.click('#toast-demo-default');
  t.check((await p.focused()).startsWith('button#toast-demo-default'), 'clicking a demo keeps focus on it (no focus stealing)');
  await p.key('F6');
  t.check((await p.focused()).startsWith('div#yui-toast'), 'F6 moves focus to the region');
  t.check(await p.eval(`return document.activeElement.matches(':focus-visible')`), 'the focused toast shows a focus ring');
  await p.key('F6');
  t.check((await p.focused()).startsWith('button#toast-demo-default'), 'F6 again returns focus');
  await reset();

  // ---- placement ----
  const place = await p.eval(`YapUI.toast.configure({ placement: 'top start' }); YapUI.toast({ title: 'Top start', timeout: 0 }); await new Promise(r => setTimeout(r, 450)); const r = document.querySelector('.toast-region'), e = document.querySelector('.toast'); const b = e.getBoundingClientRect();
    return { rc: r.className, ec: e.className, dp: e.dataset.placement, left: Math.round(b.left), top: Math.round(b.top) }`);
  t.check(place.rc.includes('toast-region--top-start') && place.ec.includes('toast--top-start') && place.dp === 'top start' && place.left === 16 && place.top === 16, 'configure({placement}) moves the region', place);
  const offs = await p.eval(`YapUI.toast.configure({ placement: 'bottom end', offset: 96 }); await new Promise(r => setTimeout(r, 400)); const b = document.querySelector('.toast').getBoundingClientRect(); return Math.round(innerHeight - b.bottom)`);
  t.check(offs === 96, 'configure({offset}) keeps the stack clear of the message box', offs);
  await p.eval(`YapUI.toast.configure({ offset: 16 })`);
  await reset();

  // ---- reduced motion ----
  await p.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  const rm = await p.eval(`const c = YapUI.toast({ title: 'Still', timeout: 0 }); const e = document.querySelector('.toast'); const tp = getComputedStyle(e).transitionProperty; c.close(); return { tp, gone: !e.isConnected }`);
  t.check(rm.tp === 'none' && rm.gone, 'reduced motion: no transitions, and closing removes at once', rm);
  await p.send('Emulation.setEmulatedMedia', { features: [] });
  const motion = await p.eval(`const c = YapUI.toast({ title: 'Moves', timeout: 0 }); const e = document.querySelector('.toast'); const entering = e.dataset.entering; const tp = getComputedStyle(e).transitionProperty; c.close(); const still = e.isConnected; await new Promise(r => setTimeout(r, 450)); return { entering, tp, still, gone: !e.isConnected }`);
  t.check(motion.entering === 'true' && motion.tp.includes('transform') && motion.still && motion.gone, 'with motion: data-entering on show, data-exiting transition before removal', motion);
  await reset();

  // ---- axe and screenshots ----
  const showcase = `YapUI.toast.clear();
    YapUI.toast({ title: 'Link copied.' });
    YapUI.toast.warning({ title: 'You can attach up to 10 files to a message.' });
    YapUI.toast.danger({ title: 'Message not sent.', description: 'You’re offline. Yap will keep your draft.' });
    YapUI.toast.success({ title: 'Message deleted.', action: { label: 'Undo' } });`;
  for (const theme of ['light', 'dark']) {
    await p.theme(theme);
    await p.eval(showcase);
    await sleep(500);
    await t.axe('.toast-region', `toast region with toasts (${theme})`);
    await p.screenshot(`${t.shots}/toast-${theme}-collapsed.png`);
    await p.hover('.toast[data-index="0"]');
    await sleep(800);
    await t.axe('.toast-region', `expanded toast region (${theme})`);
    await p.screenshot(`${t.shots}/toast-${theme}-expanded.png`);
    await p.mouseAway();
    await sleep(500);
    await t.axe('#toast', `gallery section (${theme})`);
    await reset();
  }
  await p.theme('light');
  await p.eval(`for (let i = 1; i <= 6; i++) YapUI.toast({ title: 'Notification ' + i + ' of 6', timeout: 0 });`);
  await sleep(500);
  await t.axe('.toast-region', 'region with overflow count');
  await p.screenshot(`${t.shots}/toast-light-overflow.png`);
  await p.click('.yui-toast-overflow');
  await sleep(500);
  await p.screenshot(`${t.shots}/toast-light-showall.png`);
  await p.mouseAway();
  await reset();
  await p.click('#toast-demo-long');
  await p.eval(`YapUI.toast.promise(new Promise(() => {}), { loading: 'Uploading report.pdf…' })`);
  await sleep(500);
  await p.hover('.toast[data-index="0"]');
  await sleep(500);
  await p.screenshot(`${t.shots}/toast-light-long.png`);
  await p.mouseAway();
  await reset();

  // Narrow: top center, full width. Other families' demos are wider than
  // 390px today, which widens the layout viewport, so set them aside here.
  await p.eval(`for (const s of document.querySelectorAll('.gallery-section:not(#toast)')) s.style.display = 'none'`);
  await p.viewport(390, 800, true);
  await sleep(200);
  await p.eval(showcase);
  await sleep(500);
  const narrow = await p.eval(`const r = document.querySelector('.toast-region'), b = document.querySelector('.toast').getBoundingClientRect(); return { rc: r.className, left: Math.round(b.left), right: Math.round(innerWidth - b.right), top: Math.round(b.top), sw: document.documentElement.scrollWidth, w: innerWidth }`);
  t.check(narrow.rc.includes('toast-region--top') && !narrow.rc.includes('bottom') && narrow.left === 16 && narrow.right === 16 && narrow.top === 16 && narrow.sw <= narrow.w, 'at 390px the stack is top center and full width, without horizontal scroll', narrow);
  await t.axe('.toast-region', 'toast region at 390px');
  await p.screenshot(`${t.shots}/toast-390-light.png`);
  await p.theme('dark');
  await p.hover('.toast[data-index="0"]');
  await sleep(500);
  await p.screenshot(`${t.shots}/toast-390-dark-expanded.png`);
  await p.mouseAway();
  await p.theme('light');
  await reset();
  await p.viewport(1280, 900);
  await p.eval(`for (const s of document.querySelectorAll('.gallery-section')) s.style.display = ''`);

  // A modal makes the page inert, but not the toast region: toasts raised
  // while it's open are still announced and can be closed.
  await p.viewport(1280, 900);
  await p.eval(`YapUI.toast.clear(); window.__modal = YapUI.Modal.open({ title: 'Settings', body: YapUI.h('p', { text: 'Body' }), actions: [{ label: 'Done', variant: 'primary' }] });`);
  await p.waitFor(`document.querySelector('.yui-portal [role=dialog]')`, 'modal');
  await p.eval(`YapUI.toast.success('Settings saved.')`);
  await p.waitFor(`document.querySelector('.toast')`, 'toast during modal');
  t.check(await p.eval(`const r = document.querySelector('.toast-region'); return !r.inert && !r.closest('[inert]') && document.querySelector('.gallery-main').inert`),
    'a modal leaves the toast region live while the page is inert');
  let announced = true;
  try { await p.waitFor(`[...document.querySelectorAll('.toast-region [role=status]')].some(s => s.textContent.includes('Settings saved'))`, 'announcement', 2000); } catch { announced = false; }
  t.check(announced, 'a toast raised while a modal is open is announced');
  await p.eval(`__modal.close(); YapUI.toast.clear();`);
  await p.waitFor(`!document.querySelector('.yui-portal [role=dialog]')`, 'modal closed');
}
