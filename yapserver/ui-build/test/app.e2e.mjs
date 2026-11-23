// End-to-end test of the Yap web client (web/index.html, app.js, editor.js,
// calls.js) on the UI library, against a real yapserver.
//
//   cd yapserver/ui-build && node test/app.e2e.mjs
//   PORT=9700 SHOTS=/tmp/shots node test/app.e2e.mjs
//
// It builds yapserver into a temporary directory, starts it with a fresh
// database (YAP_ADMINS=alice, so the first account is an admin), drives
// headless Chrome with real mouse and keyboard input (harness.mjs), and
// fails on any failed check, page error, console error or warning, CSP
// violation, native dialog (alert/confirm), or axe violation. Screenshots go
// to ui-build/shots/app-*.png (or $SHOTS). Everything it starts is stopped.

import { spawn, execFileSync } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launch } from './harness.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const serverDir = join(here, '..', '..');
const base = Number(process.env.PORT || 9700);
const shots = process.env.SHOTS || join(here, '..', 'shots');
const origin = `http://127.0.0.1:${base}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const results = [];
const check = (ok, what, detail) => {
  results.push({ ok: !!ok, what, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${what}${!ok && detail !== undefined ? '\n     ' + JSON.stringify(detail) : ''}`);
};

// ---- the server ----

const tmp = await mkdtemp(join(tmpdir(), 'yap-e2e-'));
const bin = join(tmp, 'yapserver');
execFileSync('go', ['build', '-o', bin, '.'], { cwd: serverDir, stdio: 'inherit' });
const server = spawn(bin, ['-addr', `127.0.0.1:${base}`, '-db', join(tmp, 'yap.db')], {
  // Calls on, pointed at a port where nothing listens, so joining fails fast.
  env: { ...process.env, YAP_ADMINS: 'alice', YAP_INVITE_CODE: '', LIVEKIT_URL: `ws://127.0.0.1:${base + 9}`, LIVEKIT_API_KEY: 'e2e', LIVEKIT_API_SECRET: 'e2e-secret-e2e-secret-e2e-secret' },
  stdio: ['ignore', 'ignore', 'pipe'],
});
let serverLog = '';
server.stderr.on('data', (d) => { serverLog += d; });

// A run takes about 30 s. If anything outside a DevTools call hangs (each of
// those times out on its own), fail after 3 minutes and clean up instead of
// running forever.
const watchdog = setTimeout(async () => {
  console.log('FAIL the run took over 3 minutes; stopping it' + (results.length ? ` after: ${results.at(-1).what}` : ''));
  try { if (page) await page.close(); } catch {}
  server.kill();
  await rm(tmp, { recursive: true, force: true }).catch(() => {});
  process.exit(1);
}, 180000);
watchdog.unref();
for (let i = 0; i < 100; i++) {
  try { if ((await fetch(origin + '/api/ping')).ok) break; } catch {}
  await sleep(100);
}

// A second person, made through the API, to ban and to post.
async function register(username, password) {
  const res = await fetch(origin + '/api/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password }) });
  return res.headers.get('set-cookie')?.split(';')[0];
}

async function login(username) {
  const res = await fetch(origin + '/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password: 'correct-horse-battery' }) });
  return res.headers.get('set-cookie')?.split(';')[0];
}

// The browser logs failed requests. These are the ones the test causes on
// purpose: not signed in yet (401), a channel name the server refuses (400),
// and a wrong password (401).
const expected = (problem) => /^log: Failed to load resource: the server responded with a status of 40[01] /.test(problem);

let page;
try {
  page = await launch(base + 1);
  const p = page;
  // A native alert() or confirm() is a failure: the app should use YapUI.
  p.ws.addEventListener('message', (e) => {
    const msg = JSON.parse(e.data);
    if (msg.method === 'Page.javascriptDialogOpening') p.problems.push(`native ${msg.params.type}(): ${msg.params.message}`);
  });
  const ev = (body) => p.eval(body);
  const text = (sel) => ev(`return document.querySelector(${JSON.stringify(sel)})?.textContent.trim() ?? null`);
  const visible = (sel) => ev(`const el = document.querySelector(${JSON.stringify(sel)}); return !!el && el.getClientRects().length > 0 && !el.closest('[hidden]')`);
  const focusedText = () => ev(`const el = document.activeElement; return el ? (el.getAttribute('aria-label') || el.textContent || '').trim() : ''`);
  const tooltip = () => ev(`const t = [...document.querySelectorAll('.yui-portal .tooltip')].filter(t => !t.dataset.exiting).pop(); return t ? t.textContent.trim() : null`);
  const alertDialog = () => ev(`const d = document.querySelector('.yui-portal [role=alertdialog]'); return d && !d.closest('[data-exiting]') ? d.querySelector('h2')?.textContent : null`);
  const settle = () => sleep(350);
  const shot = async (name) => { await settle(); await p.screenshot(join(shots, `app-${name}.png`)); };
  // Overlays animate in; audit once they've settled, or axe measures
  // half-faded text.
  const axe = async (what) => {
    await settle();
    const v = await p.axe('body');
    let detail = v;
    if (v.length) {
      detail = await ev(`const r = await axe.run(document.body, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice'] }, rules: { region: { enabled: false } } });
        return r.violations.flatMap(v => v.nodes.slice(0, 4).map(n => v.id + ' ' + n.target.join(' ') + ' ' + JSON.stringify(n.any[0]?.data || n.failureSummary)))`);
    }
    check(v.length === 0, `axe: ${what}`, detail);
  };

  // ---- sign up ----

  await p.goto(origin + '/');
  await p.waitFor(`!document.getElementById('auth').hidden`, 'sign-in screen');
  check(await text('#auth-submit') === 'Sign in', 'starts on sign-in', await text('#auth-submit'));
  check(await ev(`return document.activeElement.id`) === 'username', 'focus starts in Username');
  for (const theme of ['light', 'dark']) {
    await p.theme(theme);
    await axe(`sign-in screen (${theme})`);
    await shot(`signin-${theme}`);
  }
  await p.theme('light');

  await p.click('#auth-toggle');
  check(await text('#auth-submit') === 'Create account', 'the toggle switches to sign-up');
  await p.click('#auth-submit');
  await settle();
  const invalid = await ev(`return { summary: !document.querySelector('#auth-form .yui-form__summary').hidden, user: document.getElementById('username').getAttribute('aria-invalid'), focus: document.activeElement.id }`);
  check(invalid.summary && invalid.user === 'true' && invalid.focus === 'username', 'empty sign-up: error summary, field marked invalid, focus on the first bad field', invalid);
  await ev(`document.getElementById('username').focus()`);
  await p.type('alice');
  await ev(`document.getElementById('password').focus()`);
  await p.type('short');
  await p.key('Tab');
  await settle();
  check(/8–72/.test(await text('#password-error') || await ev(`return document.querySelector('#password').closest('.textfield').querySelector('[data-slot=field-error]').textContent`)), 'a short password gets "Use 8–72 characters" when you leave the field');
  await ev(`const i = document.getElementById('password'); i.focus(); i.select();`);
  await p.type('correct-horse-battery');
  await p.key('Enter');
  await p.waitFor(`!document.getElementById('app').hidden && document.querySelector('#channels .channel')`, 'the app after sign-up');
  check(await text('#me') === 'Signed in as alice', 'signed in as alice');
  check(await visible('#members'), 'alice is an admin (Members shows)');

  const bob = await register('bob', 'correct-horse-battery');

  // ---- create a channel ----

  await ev(`document.getElementById('new-channel-name').focus()`);
  await p.key('Enter');
  await settle();
  check(/Enter a name/.test(await text('#new-channel-error')), 'empty channel name: inline error, no alert()', await text('#new-channel-error'));
  await p.type('Design!');
  check(await text('#new-channel-error') === '', 'typing clears the error');
  await p.key('Enter');
  await settle();
  const badName = await ev(`return { err: document.getElementById('new-channel-error').textContent, invalid: document.getElementById('new-channel-name').getAttribute('aria-invalid') }`);
  check(badName.err.length > 0 && badName.invalid === 'true', 'a name the server refuses: inline error, input aria-invalid', badName);
  await ev(`const i = document.getElementById('new-channel-name'); i.value = ''; i.dispatchEvent(new Event('input'));`);
  await p.type('design');
  await p.key('Enter');
  await p.waitFor(`document.getElementById('channel-title').textContent === '# design'`, 'channel #design opens');
  check(true, 'created and opened #design');

  // ---- send a message ----

  await p.waitFor(`document.activeElement.classList.contains('editor')`, 'focus in the message box');
  const sendState = await ev(`const b = document.querySelector('#composer .send'); return { dis: b.getAttribute('aria-disabled'), native: b.disabled, tab: b.tabIndex }`);
  check(sendState.dis === 'true' && !sendState.native && sendState.tab === 0, 'empty box: Send is aria-disabled but focusable', sendState);
  await p.hover('#composer .send');
  await sleep(500);
  check(await tooltip() === 'Type a message or attach a file', 'disabled Send explains itself in a tooltip', await tooltip());
  await p.mouseAway();
  await ev(`document.querySelector('#composer .editor').focus()`);
  await p.type('Hello world');
  await p.key('Enter');
  await p.waitFor(`[...document.querySelectorAll('#messages > li')].some(li => li.textContent.includes('Hello world'))`, 'the message in the list');
  const msg = await ev(`const li = document.querySelector('#messages > li'); return { avatar: !!li.querySelector('.avatar[aria-hidden=true]'), initials: li.querySelector('.avatar__fallback')?.textContent, author: li.querySelector('.author')?.textContent }`);
  check(msg.avatar && msg.initials === 'A' && msg.author === 'alice', 'the message shows a decorative Avatar and the author', msg);

  // A message from bob, so there's someone else in the channel.
  const ch = await (await fetch(origin + '/api/channels', { headers: { cookie: bob } })).json();
  const design = ch.find((c) => c.name === 'design');
  await fetch(origin + `/api/channels/${design.id}/join`, { method: 'POST', headers: { cookie: bob, 'Content-Type': 'application/json' }, body: '{}' });
  await fetch(origin + `/api/channels/${design.id}/messages`, { method: 'POST', headers: { cookie: bob, 'Content-Type': 'application/json' }, body: JSON.stringify({ body: 'Hi alice, **welcome**' }) });
  await p.waitFor(`[...document.querySelectorAll('#messages > li')].some(li => li.textContent.includes('Hi alice'))`, "bob's message arrives live");

  // ---- calls: buttons, and a failed join reported in a toast ----

  await p.waitFor(`!document.querySelector('.call-buttons').hidden`, 'the call buttons');
  const callBtns = await ev(`return [...document.querySelectorAll('.call-buttons .button')].map(b => b.textContent)`);
  check(callBtns.join() === 'Call,Video', 'the channel header has Call and Video buttons', callBtns);
  await p.hover('.call-buttons .button');
  await sleep(500);
  check(await tooltip() === 'Start a voice call in this channel', 'Call has a tooltip', await tooltip());
  await p.click('.call-buttons .button');
  await p.waitFor(`document.querySelector('.toast-region .toast--danger')`, 'the call error toast', 15000);
  const toast = await ev(`const t = document.querySelector('.toast-region .toast--danger'); return { title: t.querySelector('.toast__title').textContent, desc: t.querySelector('.toast__description')?.textContent }`);
  check(/Couldn't join the call/.test(toast.title) && toast.desc, 'a failed join shows a danger toast with the reason, not alert()', toast);
  check(await ev(`return document.querySelector('.call-stage').hidden && !document.querySelector('.call-buttons').hidden`), 'the call stage closes again');
  await p.mouseAway();
  await shot('call-error-light');
  await ev(`document.querySelector('.toast-region .toast__close-button').click()`);
  await settle();
  // LiveKit logs its own failed connection attempts; those aren't the app's.
  for (let i = p.problems.length - 1; i >= 0; i--) if (/livekit|websocket|Couldn't connect to server|could not establish|signal connection|ERR_CONNECTION_REFUSED/i.test(p.problems[i])) { console.log('     (ignored LiveKit log: ' + p.problems[i].slice(0, 120) + ')'); p.problems.splice(i, 1); }

  // ---- the attach menu, keyboard and mouse ----

  await ev(`document.querySelector('#composer .editor').focus()`);
  await p.key('Tab'); // editor → attach button
  check((await focusedText()) === 'Attach', 'Tab from the editor reaches Attach', await focusedText());
  await sleep(100);
  check(await tooltip() === 'Attach files', 'keyboard focus shows the Attach tooltip', await tooltip());
  await p.key('Enter');
  await settle();
  const menu = await ev(`const b = document.querySelector('#composer .attach'); const m = document.getElementById(b.getAttribute('aria-controls')); return { ex: b.getAttribute('aria-expanded'), role: m?.getAttribute('role'), items: m ? [...m.querySelectorAll('.menu-item')].map(i => i.querySelector('[data-slot=label]').textContent) : [], footer: m?.parentElement.querySelector('.yui-dropdown__footer')?.textContent }`);
  check(menu.ex === 'true' && menu.role === 'menu' && menu.items[0] === 'Upload image or GIF' && menu.items[1] === 'Upload file', 'Enter opens the attach menu with its items', menu);
  check(/drag files/.test(menu.footer || ''), 'the menu keeps its drag-and-drop note', menu.footer);
  check(/Upload image/.test(await focusedText()), 'focus is on the first item', await focusedText());
  await p.key('ArrowDown');
  check(/Upload file/.test(await focusedText()), 'ArrowDown moves to "Upload file"', await focusedText());
  await shot('attach-menu-light');
  await p.key('Escape');
  await settle();
  check(await ev(`return document.querySelector('#composer .attach').getAttribute('aria-expanded')`) === 'false' && (await focusedText()) === 'Attach', 'Escape closes it and focus returns to Attach');
  await p.click('#composer .attach');
  await settle();
  check(await ev(`return document.querySelector('#composer .attach').getAttribute('aria-expanded')`) === 'true', 'a click opens the attach menu');
  await p.clickAt(600, 200);
  await settle();
  check(await ev(`return document.querySelector('#composer .attach').getAttribute('aria-expanded')`) === 'false', 'a click outside closes it');

  // ---- formatting tooltips ----

  await ev(`document.querySelector('#composer .editor').focus()`);
  await p.key('Tab', { shift: true }); // editor → the toolbar's one tab stop
  check((await focusedText()) === 'Bold', 'Shift+Tab from the editor reaches the toolbar (Bold)', await focusedText());
  await sleep(100);
  check(/^Bold\s*(⌘B|Ctrl\+B)$/.test(await tooltip() || ''), 'Bold tooltip shows its shortcut', await tooltip());
  await p.key('ArrowRight');
  await sleep(100);
  check(/^Italic\s*(⌘I|Ctrl\+I)$/.test(await tooltip() || ''), 'ArrowRight moves on and shows the Italic tooltip', await tooltip());
  await shot('format-tooltip-light');
  await p.key('Escape');
  await sleep(100);
  check(await tooltip() === null, 'Escape hides the tooltip');
  await p.mouseAway();
  await p.hover('#composer .fmt[aria-label="Strikethrough"]');
  await sleep(500);
  check(/^Strikethrough\s*(⌘⇧X|Ctrl\+Shift\+X)$/.test(await tooltip() || ''), 'hover shows the Strikethrough tooltip after a delay', await tooltip());
  // In code, inline formats are disabled but explain why.
  await ev(`document.querySelector('#composer .editor').focus()`);
  await p.type('x');
  await p.click('#composer .fmt[aria-label="Code block"]');
  await p.mouseAway();
  await sleep(600);
  await p.hover('#composer .fmt[aria-label="Bold"]');
  await sleep(500);
  const offBold = await ev(`return document.querySelector('#composer .fmt[aria-label="Bold"]').getAttribute('aria-disabled')`);
  check(offBold === 'true' && /isn't available in a code block/.test(await tooltip() || ''), 'in a code block, Bold is aria-disabled and its tooltip says why', { offBold, tip: await tooltip() });
  await p.mouseAway();
  await ev(`const e = document.querySelector('#composer .editor'); e.replaceChildren(); e.dispatchEvent(new Event('input')); e.focus();`);

  // ---- reactions ----

  const firstMsg = '#messages > li:first-child';
  await p.hover(firstMsg);
  await p.click(`${firstMsg} .actions .button`); // React
  await settle();
  const pop = await ev(`const d = document.querySelector('.yui-portal .emoji-popover [role=dialog]'); return { open: !!d, label: d?.getAttribute('aria-label'), focus: document.activeElement.classList.contains('emoji'), n: d?.querySelectorAll('.emoji').length }`);
  check(pop.open && pop.label === 'Add reaction' && pop.focus && pop.n === 32, 'React opens the reaction Popover with focus on the first emoji', pop);
  await shot('reaction-picker-light');
  await p.key('ArrowRight');
  await p.key('Enter');
  await p.waitFor(`document.querySelector('${firstMsg} .reaction.mine')`, 'the reaction');
  const rx = await ev(`const r = document.querySelector('${firstMsg} .reaction.mine'); return { text: r.textContent, pressed: r.getAttribute('aria-pressed'), popover: !!document.querySelector('.yui-portal .emoji-popover:not([data-exiting])'), focus: document.activeElement.classList.contains('reaction') }`);
  check(rx.pressed === 'true' && rx.text.includes('1') && !rx.popover, 'picking adds my reaction and closes the picker', rx);
  check(rx.focus, 'focus lands on the reaction after the redraw', rx);
  await p.hover(firstMsg);
  await p.click(`${firstMsg} .reaction.add`);
  await settle();
  check(await visible('.yui-portal .emoji-popover'), 'the + button opens the picker too');
  await p.key('Escape');
  await settle();
  check(!(await ev(`return !!document.querySelector('.yui-portal .emoji-popover:not([data-exiting])')`)) && (await focusedText()) === 'Add reaction', 'Escape closes the picker and returns focus to +');

  // ---- threads ----

  await p.hover(firstMsg);
  await p.click(`${firstMsg} .actions .button:nth-child(2)`); // Reply
  await p.waitFor(`!document.getElementById('thread').hidden && document.querySelector('#thread-messages > li')`, 'the thread panel');
  await p.waitFor(`document.activeElement.closest('#thread-composer')`, 'focus in the reply box');
  await p.type('A reply');
  await p.key('Enter');
  await p.waitFor(`[...document.querySelectorAll('#thread-messages > li')].some(li => li.textContent.includes('A reply'))`, 'the reply');
  await p.waitFor(`document.querySelector('${firstMsg} .replies')?.textContent.startsWith('1 reply')`, 'reply count on the message');
  check(await text('#thread-messages .thread-sep') === '1 reply', 'the thread shows "1 reply"');

  // The reply box's toolbar is narrower than the formats: the ones that don't
  // fit go into "More formatting" instead of wrapping onto a second row.
  const bar = await ev(`const bar = document.querySelector('#thread-composer .format-bar');
    const tops = new Set([...bar.querySelectorAll('button')].filter(b => !b.hidden).map(b => Math.round(b.getBoundingClientRect().top)));
    return { rows: tops.size, overflowing: bar.scrollWidth > bar.clientWidth, more: !bar.querySelector('.fmt-more').hidden }`);
  check(bar.rows === 1 && !bar.overflowing && bar.more, 'the thread toolbar is one row with a "More formatting" button', bar);
  await p.type('Quoted');
  await p.click('#thread-composer .fmt-more');
  await p.waitFor(`document.querySelector('[role=menu][aria-label="More formatting"]')`, 'the More formatting menu');
  const moreItems = await ev(`return [...document.querySelectorAll('[role=menu][aria-label="More formatting"] [role=menuitemcheckbox]')].map(i => i.textContent.trim())`);
  check(moreItems.some((t) => t.startsWith('Quote')) && moreItems.some((t) => t.startsWith('Code block')), 'the menu has the formats that didn\'t fit', moreItems);
  await p.click(`[role=menu][aria-label="More formatting"] [data-key="quote"]`);
  await p.waitFor(`document.querySelector('#thread-composer .editor blockquote')?.textContent.includes('Quoted')`, 'the quote applied from the menu');
  check(await ev(`return document.activeElement.closest('#thread-composer .editor') !== null`), 'focus goes back to the reply box after a format from the menu');
  await ev(`const ed = document.querySelector('#thread-composer .editor'); ed.focus(); document.execCommand('selectAll'); document.execCommand('delete'); if (ed.querySelector('blockquote')) document.execCommand('formatBlock', false, 'div')`);
  await p.mouseAway();
  await shot('thread-light');
  await p.theme('dark');
  await shot('thread-dark');
  await p.theme('light');
  await p.click('#thread-close');
  await settle();
  check(await ev(`return document.getElementById('thread').hidden`), 'Close thread hides the panel');

  // ---- edit in place, and a message that's too long ----

  await p.hover(firstMsg);
  await ev(`[...document.querySelectorAll('${firstMsg} .actions .button')].find(b => b.textContent === 'Edit').click()`);
  await p.waitFor(`document.querySelector('${firstMsg} form.edit .editor') === document.activeElement`, 'the edit box');
  check(await ev(`return document.querySelector('${firstMsg} form.edit .send').getAttribute('aria-label')`) === 'Save', 'Edit swaps in a message box with Save');
  await p.key('Escape');
  await settle();
  check(await ev(`return !document.querySelector('${firstMsg} form.edit') && document.querySelector('${firstMsg} .text').textContent.includes('Hello world')`), 'Escape cancels the edit');
  await ev(`document.querySelector('#composer .editor').focus()`);
  await p.type('x'.repeat(4001));
  await p.key('Enter');
  await settle();
  const long = await ev(`const e = document.querySelector('#composer .composer-error'); return { text: e.textContent, hidden: e.hidden, role: e.getAttribute('role'), kept: document.querySelector('#composer .editor').textContent.length }`);
  check(/up to 4,000 characters/.test(long.text) && !long.hidden && long.role === 'alert' && long.kept === 4001, 'too long: inline error under the box, draft kept, no alert()', long);
  await ev(`const e = document.querySelector('#composer .editor'); e.replaceChildren(); e.dispatchEvent(new Event('input'));`);
  await settle();
  check(await ev(`return document.querySelector('#composer .composer-error').hidden`), 'editing clears the error');

    // ---- main screen: axe and screenshots ----

  await p.mouseAway();
  await ev(`document.querySelector('#composer .editor').focus()`);
  for (const theme of ['light', 'dark']) {
    await p.theme(theme);
    await settle();
    await axe(`main screen (${theme})`);
    await shot(`main-${theme}`);
  }
  await p.theme('light');

  // ---- delete a message ----

  await p.hover(firstMsg);
  const del = await ev(`return [...document.querySelectorAll('${firstMsg} .actions .button')].map(b => b.textContent)`);
  check(del.includes('Delete'), 'my message has Delete', del);
  await ev(`[...document.querySelectorAll('${firstMsg} .actions .button')].find(b => b.textContent === 'Delete').click()`);
  await settle();
  check(await alertDialog() === 'Delete this message and its replies?', 'Delete asks in an AlertDialog', await alertDialog());
  check((await focusedText()) === 'Cancel', 'destructive: Cancel has focus first', await focusedText());
  check(await ev(`return !!document.querySelector('.yui-portal [role=alertdialog] .button--danger')`), 'the Delete button is danger-styled');
  await shot('delete-confirm-light');
  await p.key('Escape');
  await settle();
  check(await alertDialog() === null && await ev(`return !!document.querySelector('${firstMsg}')?.textContent.includes('Hello world')`), 'Escape cancels; the message stays');

  // ---- leave the channel ----

  await p.click('#leave');
  await settle();
  check(await alertDialog() === 'Leave #design?', 'Leave asks first', await alertDialog());
  await ev(`[...document.querySelectorAll('.yui-portal [role=alertdialog] .button')].find(b => b.textContent === 'Cancel').click()`);
  await settle();
  check(await text('#channel-title') === '# design' && (await focusedText()) === 'Leave', 'Cancel keeps you in #design and returns focus to Leave');
  await p.click('#leave');
  await settle();
  await ev(`[...document.querySelectorAll('.yui-portal [role=alertdialog] .button')].find(b => b.textContent === 'Leave').click()`);
  await p.waitFor(`document.getElementById('channel-title').textContent === '# general'`, 'back in #general');
  check(true, 'confirming Leave leaves #design');

  // ---- the account dialog ----

  await p.click('#account');
  await settle();
  check(await visible('#account-dialog') && await ev(`return document.getElementById('account-dialog').getAttribute('role')`) === 'dialog', 'Account opens a modal dialog');
  await shot('account-light');
  await p.theme('dark');
  await axe('account dialog (dark)');
  await shot('account-dark');
  await p.theme('light');
  await axe('account dialog (light)');
  await ev(`[...document.querySelectorAll('#password-form button[type=submit]')][0].click()`);
  await settle();
  const pwErr = await ev(`return document.getElementById('current-password').getAttribute('aria-invalid')`);
  check(pwErr === 'true', 'Change password with empty fields shows field errors', pwErr);
  await ev(`document.getElementById('delete-password').focus()`);
  await p.type('not-my-password');
  await ev(`document.querySelector('#delete-form button[type=submit]').click()`);
  await settle();
  check(await alertDialog() === 'Delete the account alice?', 'Delete my account asks in an AlertDialog', await alertDialog());
  check((await focusedText()) === 'Cancel', 'Cancel has focus first');
  await p.key('Enter'); // Cancel
  await settle();
  check(await alertDialog() === null && await visible('#account-dialog') && !(await ev(`return document.getElementById('app').hidden`)), 'Cancel keeps the account and the Account dialog');
  await p.key('Escape');
  await settle();
  check(!(await visible('#account-dialog')) && (await focusedText()) === 'Account', 'Escape closes Account; focus returns to its button');

  // ---- members (admin) ----

  await p.click('#members');
  await p.waitFor(`document.querySelectorAll('#member-list li').length === 2`, 'the member list');
  const rows = await ev(`return [...document.querySelectorAll('#member-list li')].map(li => li.textContent)`);
  check(rows.some((r) => r.includes('alice') && r.includes('Admin')) && rows.some((r) => r.includes('bob') && r.includes('Ban')), 'members: alice (Admin chip) and bob (Ban)', rows);
  const gap = await ev(`const li = [...document.querySelectorAll('#member-list li')].find(l => l.textContent.includes('bob')); const a = li.querySelector('.member-info').getBoundingClientRect(), b = li.querySelector('button').getBoundingClientRect(); return { gap: b.left - a.right }`);
  check(gap.gap >= 8, 'member rows keep a gap between the join date and Ban', gap);
  await axe('members dialog (light)');
  await shot('members-light');
  await ev(`[...document.querySelectorAll('#member-list button')].find(b => b.textContent === 'Ban').click()`);
  await settle();
  const ban = await ev(`const d = document.querySelector('.yui-portal [role=alertdialog]'); return { title: d?.querySelector('h2').textContent, box: d?.querySelector('.checkbox')?.textContent, checked: d?.querySelector('.checkbox input')?.checked }`);
  check(ban.title === 'Ban bob?' && /Also delete everything bob has posted/.test(ban.box || '') && ban.checked === false, 'Ban is one AlertDialog with an unchecked "Also delete" checkbox', ban);
  await shot('ban-confirm-light');
  await p.theme('dark');
  await shot('ban-confirm-dark');
  await p.theme('light');
  await ev(`[...document.querySelectorAll('.yui-portal [role=alertdialog] .button')].find(b => b.textContent === 'Ban').click()`);
  await p.waitFor(`[...document.querySelectorAll('#member-list li')].some(li => li.textContent.includes('bob') && li.textContent.includes('Banned'))`, 'bob banned');
  check(true, 'banning bob (keeping messages) marks him Banned');
  await ev(`[...document.querySelectorAll('#member-list button')].find(b => b.textContent === 'Unban').click()`);
  await p.waitFor(`[...document.querySelectorAll('#member-list li')].some(li => li.textContent.includes('bob') && li.textContent.includes('Ban') && !li.textContent.includes('Banned'))`, 'bob unbanned');
  check(true, 'Unban works');
  const bobMsg = await (await fetch(origin + `/api/channels/${design.id}/messages`, { headers: { cookie: await login('bob') } })).json();
  check(Array.isArray(bobMsg) && bobMsg.some((m) => m.username === 'bob'), "bob's messages were kept (checkbox unchecked)", bobMsg);
  await p.key('Escape');
  await settle();

  // ---- phone width ----

  await p.viewport(390, 844, true);
  await settle();
  // Toasts sit at the bottom on phones, clear of the message box, so they
  // don't cover the channel list and Sign out at the top.
  await ev(`YapUI.toast('Phone toast')`);
  await p.waitFor(`document.querySelector('.toast-region .toast')`, 'the phone toast');
  await settle();
  const phoneToast = await ev(`const t = document.querySelector('.toast-region .toast').getBoundingClientRect();
    const c = document.getElementById('composer'); const box = c.hidden ? null : c.getBoundingClientRect();
    return { top: Math.round(t.top), bottom: Math.round(t.bottom), height: innerHeight, composerTop: box && Math.round(box.top) }`);
  check(phoneToast.top > phoneToast.height / 2 && phoneToast.bottom <= (phoneToast.composerTop ?? phoneToast.height), 'on a phone, toasts are at the bottom, above the message box', phoneToast);
  await ev(`YapUI.toast.clear()`);
  await settle();
  await shot('phone-light');
  await p.theme('dark');
  await shot('phone-dark');
  await p.theme('light');
  await p.viewport(1280, 900);

  // ---- sign out ----

  await p.click('#logout');
  await p.waitFor(`!document.getElementById('auth').hidden`, 'signed out');
  check(await text('#auth-submit') === 'Sign in', 'sign out returns to sign-in');
  await ev(`const i = document.getElementById('username'); i.focus(); i.select();`);
  await p.type('alice');
  await ev(`document.getElementById('password').focus()`);
  await p.type('wrong-password');
  await p.key('Enter');
  await settle();
  check(await ev(`const s = document.querySelector('#auth-form .yui-form__summary'); return !s.hidden && s.textContent.length > 0`), 'a wrong password shows the server error in the form, not alert()');
  await ev(`const i = document.getElementById('password'); i.focus(); i.select();`);
  await p.type('correct-horse-battery');
  await p.key('Enter');
  await p.waitFor(`!document.getElementById('app').hidden`, 'signed back in').catch(async (err) => {
    console.log('auth form state:', await ev(`return document.getElementById('auth-form').textContent + ' | pw=' + document.getElementById('password').value.length`));
    throw err;
  });
  check(true, 'sign in works');

  const problems = p.problems.filter((x) => !expected(x));
  check(problems.length === 0, 'no page errors, console errors, CSP violations or native dialogs', problems);
} catch (err) {
  check(false, 'test threw', String(err.stack || err));
  if (page) check(page.problems.filter((x) => !expected(x)).length === 0, 'no page errors before the throw', page.problems);
} finally {
  if (page) await page.close();
  server.kill();
  await sleep(200);
  await rm(tmp, { recursive: true, force: true });
}

clearTimeout(watchdog);
const failed = results.filter((r) => !r.ok).length;
console.log(failed ? `\n${failed} failed, ${results.length - failed} passed` : `\nall ${results.length} passed`);
if (failed && serverLog) console.log('server log:\n' + serverLog.slice(-2000));
process.exit(failed ? 1 : 0);
