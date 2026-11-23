// display family: Avatar, Badge, Chip, Card, Separator, Spinner, Skeleton,
// ProgressBar, Alert, EmptyState.
const SECTIONS = ['avatar', 'badge', 'chip', 'card', 'separator', 'spinner', 'skeleton', 'progress-bar', 'alert', 'empty-state'];

export default async function (t) {
  const p = t.page;
  const ev = (body) => p.eval(body);
  await p.goto(t.url + '?theme=light');
  await p.waitFor(`document.querySelector('#avatar-broken')?.dataset.status === 'error'`, 'broken avatar image to fail');

  t.check(await ev(`return ${JSON.stringify(SECTIONS)}.every((id) => document.getElementById(id))`), 'every display section renders');

  // ---- Avatar ----
  t.check(await ev(`return YapUI.initials('Ana María Ruiz') === 'AR' && YapUI.initials('Cher') === 'C' && YapUI.initials('  ') === '' && YapUI.initials('élodie durand') === 'ÉD'`), 'initials: first and last word, one letter for single names');
  const broken = await ev(`const a = document.getElementById('avatar-broken'); return { img: !!a.querySelector('img'), fb: a.querySelector('.avatar__fallback').textContent, hidden: a.querySelector('.avatar__fallback').hidden, role: a.getAttribute('role'), name: a.getAttribute('aria-label') };`);
  t.check(!broken.img && broken.fb === 'RD' && !broken.hidden, 'avatar whose image fails to decode falls back to initials', broken);
  t.check(broken.role === 'img' && broken.name === 'Rosa Diaz', 'avatar is role="img" named by the person', broken);
  await p.waitFor(`document.querySelector('#avatar-group-clip .avatar')?.dataset.status === 'loaded'`, 'avatar photo to load');
  // An image URL that 404s on the test server.
  await ev(`window.__a404 = YapUI.Avatar({ name: 'Kai', src: '/ui/no-such-avatar.png' }); document.getElementById('avatar').append(__a404);`);
  await p.waitFor(`__a404.yui.status() === 'error'`, '404 avatar to fail');
  const a404 = await ev(`const r = { img: !!__a404.querySelector('img'), fb: __a404.textContent, hidden: __a404.querySelector('.avatar__fallback').hidden }; __a404.remove(); return r;`);
  t.check(!a404.img && a404.fb === 'K' && !a404.hidden, 'avatar whose image 404s on the server shows initials', a404);
  // That 404 is expected; drop Chrome's network log line for it.
  for (let i = p.problems.length - 1; i >= 0; i--) if (/status of 404/.test(p.problems[i])) p.problems.splice(i, 1);
  await p.waitFor(`getComputedStyle(document.querySelector('#avatar-group-clip .avatar img')).opacity === '1'`, 'photo to fade in');
  const loaded = await ev(`const a = document.querySelector('#avatar-group-clip .avatar'); const img = a.querySelector('img'); return { alt: img.getAttribute('alt'), op: getComputedStyle(img).opacity, name: a.getAttribute('aria-label') };`);
  t.check(loaded.op === '1' && loaded.alt === '' && loaded.name === 'Ana Ruiz', 'loaded photo shows; the name is on the avatar, not repeated on the img', loaded);
  t.check(await ev(`const a = document.querySelector('.yui-demo-person .avatar[aria-hidden="true"]'); return !!a && !a.getAttribute('role');`), 'alt: "" makes an avatar decorative (aria-hidden)');
  const group = await ev(`const g = document.getElementById('avatar-group-max'); const c = g.querySelector('.avatar-group__count'); return { role: g.getAttribute('role'), label: g.getAttribute('aria-label'), n: g.querySelectorAll('.avatar').length, count: c.textContent, countName: c.getAttribute('aria-label') };`);
  t.check(group.role === 'group' && group.label === 'In this call' && group.n === 4 && group.count === '+9' && group.countName === '9 more', 'AvatarGroup: max 3 of total 12 shows "+9", named "9 more", role group', group);
  const swap = await ev(`const a = YapUI.Avatar({ name: 'Zed' }); a.yui.setName('Yara Lopez'); return a.textContent + '|' + a.getAttribute('aria-label');`);
  t.check(swap === 'YL|Yara Lopez', 'avatar setName() updates initials and name', swap);

  // ---- Badge ----
  const unread = await ev(`const b = document.getElementById('badge-unread'); return { visible: b.querySelector('.badge__label').textContent, hiddenVis: b.querySelector('.badge__label').getAttribute('aria-hidden'), sr: b.querySelector('.yui-visually-hidden').textContent };`);
  t.check(unread.visible === '3' && unread.hiddenVis === 'true' && unread.sr === '3 unread messages', 'unread badge shows "3" and reads "3 unread messages"', unread);
  await p.click('#badge .button--secondary');
  const bumped = await ev(`const b = document.getElementById('badge-unread'); return b.textContent;`);
  t.check(bumped === '44 unread messages', 'Badge setContent() updates the count and its text equivalent', bumped);
  const dot = await ev(`const b = document.querySelector('#badge .badge-anchor .badge[data-dot="true"]'); const r = b.getBoundingClientRect(); return { sr: b.textContent, hidden: b.getAttribute('aria-hidden'), w: r.width };`);
  t.check(dot.sr === 'Online' && dot.hidden === null && dot.w <= 14, 'presence dot is small and reads "Online"', dot);
  t.check(await ev(`return YapUI.Badge({}).getAttribute('aria-hidden') === 'true'`), 'a badge with no content and no label is decorative');

  // ---- Chip ----
  const firstRemove = '#chip-tags .yui-chip__remove';
  t.check(await ev(`return [...document.querySelectorAll('#chip-tags .yui-chip__remove')].map((b) => b.getAttribute('aria-label')).join(',') === 'Remove design,Remove frontend,Remove release-2.4'`), 'remove buttons are named "Remove <label>"');
  await ev(`document.querySelector(${JSON.stringify(firstRemove)}).focus()`);
  await p.key('Enter');
  const afterEnter = await ev(`return { chips: [...document.querySelectorAll('#chip-tags .chip__label')].map((c) => c.textContent).join(','), focus: document.activeElement.getAttribute('aria-label'), log: document.querySelector('#chip .gallery-log').textContent };`);
  t.check(afterEnter.chips === 'frontend,release-2.4' && afterEnter.focus === 'Remove frontend' && afterEnter.log === 'Removed design', 'Enter on a chip remove button removes it and focus moves to the next chip', afterEnter);
  await p.key(' ');
  t.check(await ev(`return [...document.querySelectorAll('#chip-tags .chip__label')].map((c) => c.textContent).join(',') === 'release-2.4'`), 'Space removes a chip too');
  await p.key('Delete');
  t.check(await ev(`return document.querySelectorAll('#chip-tags .chip').length === 0 && /No tags/.test(document.getElementById('chip-tags').textContent)`), 'Delete removes the last chip');
  await ev(`document.getElementById('chip-filter-mentions').focus()`);
  await p.key('Enter');
  t.check(await ev(`return document.querySelector('#chip .gallery-log').textContent === 'Filter Mentions'`), 'clickable chip is a button that works by keyboard');
  const chipStyles = await ev(`const s = getComputedStyle(document.getElementById('chip-filter-threads')), st = getComputedStyle(document.querySelector('#chip .chip:not(.yui-chip--interactive)')); return { a: s.boxShadow, b: st.boxShadow, cursor: s.cursor };`);
  t.check(chipStyles.a !== chipStyles.b && chipStyles.a !== 'none', 'clickable chips look different from static chips', chipStyles);
  t.check(await ev(`return [...document.querySelectorAll('#chip .chip svg')].every((s) => s.getAttribute('aria-hidden') === 'true')`), 'chip icons are hidden from screen readers');

  // ---- Card ----
  const card = await ev(`const c = document.getElementById('card-channel'); const t = document.getElementById(c.getAttribute('aria-labelledby')); return { role: c.getAttribute('role'), title: t && t.textContent, tag: t && t.tagName };`);
  t.check(card.role === 'article' && card.title === '#design-reviews' && card.tag === 'H3', 'card is an article labelled by its h3 title', card);
  const icard = await ev(`const a = document.getElementById('card-link'), b = document.getElementById('card-button'); return { a: a.tagName + ':' + a.getAttribute('href'), b: b.tagName + ':' + b.type, bh: !!b.querySelector('h3'), cls: a.classList.contains('card') && b.classList.contains('card') };`);
  t.check(icard.a === 'A:#card' && icard.b === 'BUTTON:button' && !icard.bh && icard.cls, 'interactive cards are a link and a button with card classes (no heading inside the button)', icard);
  await ev(`document.getElementById('card-button').focus()`);
  await p.key('Enter');
  t.check(await ev(`return document.querySelector('#card .gallery-log').textContent === 'Opened thread'`), 'button card works by keyboard');

  // ---- Separator ----
  const sep = await ev(`const q = (id) => document.getElementById(id); return { h: q('separator-default').tagName, hRole: q('separator-default').role ?? null, v: q('separator-vertical').getAttribute('role') + '/' + q('separator-vertical').getAttribute('aria-orientation'), vh: q('separator-vertical').getBoundingClientRect().height, d: q('separator-decorative').getAttribute('aria-hidden') + '/' + q('separator-decorative').getAttribute('role'), hh: q('separator-default').getBoundingClientRect().height };`);
  t.check(sep.h === 'HR' && sep.hh === 1, 'horizontal separator is an <hr> (implicit role separator), 1px', sep);
  t.check(sep.v === 'separator/vertical' && sep.vh >= 16, 'vertical separator has role separator and aria-orientation vertical', sep);
  t.check(sep.d === 'true/null', 'decorative separator is aria-hidden with no role', sep);

  // ---- Spinner ----
  const spin = await ev(`const s = document.getElementById('spinner-md'); return { role: s.getAttribute('role'), text: s.textContent, anim: getComputedStyle(s).animationName, w: s.offsetWidth };`);
  t.check(spin.role === 'status' && spin.text === 'Loading' && spin.anim === 'spin' && spin.w === 24, 'spinner: role status, label "Loading", spinning, 24px at md', spin);
  t.check(await ev(`const s = document.querySelector('#spinner-button .spinner'); return s.getAttribute('aria-hidden') === 'true' && !s.getAttribute('role') && s.textContent === ''`), 'spinner inside a labelled button is decorative');
  t.check(await ev(`return ['sm','md','lg','xl'].map((s) => document.getElementById('spinner-' + s).offsetWidth).join() === '16,24,32,40'`), 'spinner sizes are 16/24/32/40px');

  // ---- Skeleton ----
  const sk = await ev(`const r = document.getElementById('skeleton-messages'); return { busy: r.getAttribute('aria-busy'), status: r.querySelector('[role="status"]').textContent, allHidden: [...r.querySelectorAll('.skeleton')].every((s) => s.getAttribute('aria-hidden') === 'true'), anim: getComputedStyle(r.querySelector('.skeleton'), '::after').animationName, pulse: getComputedStyle(document.querySelector('.skeleton--pulse')).animationName };`);
  t.check(sk.busy === 'true' && sk.status === 'Loading messages' && sk.allHidden, 'skeleton region is aria-busy with status text; shapes are aria-hidden', sk);
  t.check(sk.anim === 'skeleton' && sk.pulse === 'pulse', 'skeleton shimmer and pulse animate', sk);

  // ---- Reduced motion ----
  await p.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  const rm = await ev(`return { spin: getComputedStyle(document.getElementById('spinner-md')).animationName, shimmer: getComputedStyle(document.querySelector('#skeleton-messages .skeleton'), '::after').animationName, pulse: getComputedStyle(document.querySelector('.skeleton--pulse')).animationName, ind: getComputedStyle(document.querySelector('#progress-indeterminate .progress-bar__fill')).animationName };`);
  t.check(rm.spin === 'none' && rm.shimmer === 'none' && rm.pulse === 'none' && rm.ind === 'none', 'prefers-reduced-motion stops spinner, skeleton and indeterminate progress animation', rm);
  await p.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }] });

  // Loading the skeleton region swaps in content and clears aria-busy.
  await p.click('#skeleton .button--secondary');
  t.check(await ev(`const r = document.getElementById('skeleton-messages'); return !r.hasAttribute('aria-busy') && !r.querySelector('.skeleton') && /Pushed the new avatar/.test(r.textContent)`), 'Skeleton.Region resolve() swaps in the content and clears aria-busy');

  // ---- ProgressBar ----
  const pb = (id) => ev(`const e = document.getElementById(${JSON.stringify(id)}); const l = document.getElementById(e.getAttribute('aria-labelledby')); return { role: e.getAttribute('role'), now: e.getAttribute('aria-valuenow'), min: e.getAttribute('aria-valuemin'), max: e.getAttribute('aria-valuemax'), text: e.getAttribute('aria-valuetext'), label: l ? l.textContent : e.getAttribute('aria-label'), out: e.querySelector('.progress-bar__output')?.textContent, w: e.querySelector('.progress-bar__fill').style.width };`);
  let up = await pb('progress-upload');
  t.check(up.role === 'progressbar' && up.now === '0' && up.min === '0' && up.max === '100' && up.label === 'Uploading design-review.mp4' && up.text === '0%', 'progress bar: role, min/max/now, labelled by its label', up);
  await ev(`document.getElementById('progress-upload').yui.setValue(42)`);
  up = await pb('progress-upload');
  t.check(up.now === '42' && up.text === '42%' && up.out === '42%' && up.w === '42%', 'setValue(42) updates aria-valuenow, valuetext, output and fill', up);
  await ev(`document.getElementById('progress-upload').yui.setValue(250)`);
  up = await pb('progress-upload');
  t.check(up.now === '100' && up.w === '100%', 'values clamp to maxValue', up);
  const files = await pb('progress-files');
  t.check(files.now === '2' && files.max === '5' && files.text === '2 of 5 files' && files.out === '2 of 5 files' && files.w === '40%', 'step count: valueLabel "2 of 5 files"', files);
  const ind = await pb('progress-indeterminate');
  t.check(ind.now === null && ind.text === null && ind.label === 'Preparing export', 'indeterminate progress has no aria-valuenow', ind);
  await ev(`document.getElementById('progress-indeterminate').yui.setValue(10)`);
  t.check((await pb('progress-indeterminate')).now === '10', 'setValue() on an indeterminate bar makes it determinate');
  await ev(`const e = document.getElementById('progress-indeterminate'); e.yui.setIndeterminate(true)`);
  t.check((await pb('progress-indeterminate')).now === null, 'setIndeterminate(true) removes aria-valuenow again');
  t.check((await pb('progress-aria')).label === 'Storage used', 'unlabelled bar takes aria-label');
  await p.click('#progress-bar .button--secondary');
  await p.waitFor(`document.getElementById('progress-upload').getAttribute('aria-valuenow') === '100'`, 'upload demo to finish', 4000);
  t.check(await ev(`return document.querySelector('#progress-bar .gallery-log').textContent === 'Upload complete'`), 'upload demo reaches 100%');

  // ---- Alert ----
  const alerts = await ev(`return [...document.querySelectorAll('#alert .gallery-example:first-child .alert')].map((a) => ({ role: a.getAttribute('role'), title: a.querySelector('.alert__title').textContent, icon: a.querySelector('.alert__indicator svg').innerHTML.length, iconHidden: a.querySelector('.alert__indicator svg').getAttribute('aria-hidden') }));`);
  const titles = alerts.map((a) => a.title.split(':')[0]);
  t.check(titles.join() === 'Note,Info,Success,Warning,Error', 'alerts prefix their title with the status for screen readers', titles);
  t.check(alerts.every((a) => a.role === null && a.iconHidden === 'true') && new Set(alerts.slice(1).map((a) => a.icon)).size === 4, 'static alerts have no live role; each status has its own (hidden) icon', alerts);
  t.check(await ev(`return document.querySelector('#alert-closable .close-button').getAttribute('aria-label') === 'Close'`), 'alert close button is labelled "Close"');
  await ev(`document.querySelector('#alert-closable .close-button').focus()`);
  await p.key('Enter');
  await p.waitFor(`!document.getElementById('alert-closable')`, 'alert to close');
  t.check(await ev(`return document.querySelector('#alert .gallery-log').textContent === 'Closed'`), 'closing an alert by keyboard removes it and calls onClose');
  await p.click('#alert .gallery-example:last-child .button--secondary');
  t.check(await ev(`const a = document.querySelector('#alert-live .alert'); return a && a.getAttribute('role') === 'alert' && a.classList.contains('alert--danger')`), 'runtime-inserted urgent alert has role="alert"');

  // ---- EmptyState ----
  const es = await ev(`const e = document.getElementById('empty-messages'); return { h: e.querySelector('h3').textContent, p: e.querySelector('p').textContent, btns: e.querySelectorAll('button').length, iconColor: getComputedStyle(e.querySelector('.yui-empty-state__icon')).color, muted: getComputedStyle(document.documentElement).getPropertyValue('--muted').trim(), center: getComputedStyle(e).textAlign };`);
  t.check(es.h === 'No messages yet' && /\.$/.test(es.p) && es.btns === 1 && es.center === 'center', 'empty state: plain heading, body ending in a period, one action', es);
  t.check(await ev(`return [...document.querySelectorAll('#empty-state .yui-empty-state')].every((e) => !/please/i.test(e.textContent) && !/\\.$/.test(e.querySelector('h3').textContent))`), 'empty-state copy: no "please", headings without a period');

  // ---- axe and screenshots, light and dark ----
  // Fresh page, so every demo is in its initial state.
  await p.goto(t.url + '?theme=light');
  await ev(`document.querySelector('#chip-tags .yui-chip__remove').focus()`); // show a focus ring in the shots
  await p.key('Shift');
  for (const theme of ['light', 'dark']) {
    await p.theme(theme);
    await p.mouseAway();
    await new Promise((r) => setTimeout(r, 500)); // let color transitions finish
    for (const id of SECTIONS) await t.axe('#' + id, `${id} (${theme})`);
    for (const id of SECTIONS) {
      await ev(`document.getElementById(${JSON.stringify(id)}).scrollIntoView({ block: 'start' }); window.scrollBy(0, -50)`);
      await new Promise((r) => setTimeout(r, 120));
      await p.screenshot(`${t.shots}/display-${id}-${theme}.png`);
    }
  }
  await p.theme('light');
}
