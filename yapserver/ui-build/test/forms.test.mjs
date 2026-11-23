// Forms: fields, validation timing, search, checkbox, switch, disabled, form
// submit, axe in light and dark, screenshots.
import { writeFile } from 'node:fs/promises';

const SECTIONS = ['text-field', 'text-area', 'search-field', 'checkbox', 'switch', 'fieldset', 'form-example'];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export default async function (t) {
  const p = t.page;
  await p.goto(t.url + '?theme=light');
  const ev = (body) => p.eval(body);
  const attr = (sel, name) => ev(`return document.querySelector(${JSON.stringify(sel)})?.getAttribute(${JSON.stringify(name)})`);
  const value = (sel) => ev(`return document.querySelector(${JSON.stringify(sel)}).value`);
  const focusedId = () => ev(`return document.activeElement && document.activeElement.id`);
  const logText = (sectionId, i = 0) => ev(`return document.querySelectorAll('#${sectionId} .gallery-log')[${i}].textContent`);
  const focus = (sel) => ev(`document.querySelector(${JSON.stringify(sel)}).focus()`);

  // The accessibility tree as Chrome computes it (role, name, checked…).
  async function ax(selector) {
    const doc = await p.send('DOM.getDocument', { depth: 0 });
    const q = await p.send('DOM.querySelector', { nodeId: doc.result.root.nodeId, selector });
    const d = await p.send('DOM.describeNode', { nodeId: q.result.nodeId });
    const r = await p.send('Accessibility.getPartialAXTree', { nodeId: q.result.nodeId, fetchRelatives: false });
    const n = r.result.nodes.find((x) => x.backendDOMNodeId === d.result.node.backendNodeId) || r.result.nodes[0];
    const props = Object.fromEntries((n.properties || []).map((x) => [x.name, x.value.value]));
    return { role: n.role?.value, name: n.name?.value, description: n.description?.value, ...props };
  }

  // Full-section screenshot (the harness's screenshot is viewport-only).
  async function shot(id, file) {
    const r = await ev(`const el = document.getElementById(${JSON.stringify(id)}); el.scrollIntoView({block: 'start'}); const b = el.getBoundingClientRect(); return { x: b.left + scrollX, y: b.top + scrollY, w: b.width, h: b.height };`);
    await sleep(250);
    const { result } = await p.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip: { x: Math.max(0, r.x - 8), y: Math.max(0, r.y - 8), width: Math.ceil(r.w + 16), height: Math.ceil(r.h + 16), scale: 1 } });
    await writeFile(`${t.shots}/${file}`, Buffer.from(result.data, 'base64'));
  }

  // ---- fields and validation ----

  await p.click('label[for="tf-username"]');
  t.check(await focusedId() === 'tf-username', 'clicking a label focuses its field');
  const user = await ax('#tf-username');
  t.check(user.name === 'Username' && user.role === 'textbox', 'the field is named by its visible label (the asterisk is not read)', user);
  t.check(await attr('#tf-username', 'aria-describedby') === 'tf-username-description' && user.description === "3–32 letters, digits, '.', '_' or '-'", 'the description is wired through aria-describedby', user);
  t.check(await attr('#tf-username', 'aria-required') === 'true' && user.required === true, 'required sets aria-required', user);
  t.check(await ev(`return getComputedStyle(document.querySelector('label[for="tf-username"]'), '::after').content`) === '"*" / ""', 'required fields show an asterisk after the label (hidden from screen readers)');

  await p.type('ab');
  t.check(await attr('#tf-username', 'aria-invalid') === null && await ev(`return document.getElementById('tf-username-error').hidden`), 'no error while typing', await attr('#tf-username', 'aria-invalid'));
  t.check(await logText('text-field') === 'change "ab"', 'onChange gets the string value', await logText('text-field'));
  await p.key('Tab');
  t.check(await attr('#tf-username', 'aria-invalid') === 'true', 'leaving the field validates it (aria-invalid="true")');
  const err = await ev(`const e = document.getElementById('tf-username-error'); return { text: e.textContent, visible: e.dataset.visible, shown: !e.hidden && e.getBoundingClientRect().height > 0, icon: !!e.querySelector('svg'), color: getComputedStyle(e).color, danger: getComputedStyle(document.documentElement).getPropertyValue('--danger').trim() }`);
  t.check(err.text === "Use 3–32 letters, digits, '.', '_' or '-'" && err.shown && err.icon, 'the error says what is expected, with an icon', err);
  t.check((await attr('#tf-username', 'aria-describedby')).split(' ').includes('tf-username-error'), 'the error is wired through aria-describedby', await attr('#tf-username', 'aria-describedby'));
  t.check((await ax('#tf-username')).invalid === 'true', 'the accessibility tree reports the field invalid');
  t.check(await ev(`return document.getElementById('tf-username').closest('.textfield').dataset.invalid === 'true' && getComputedStyle(document.getElementById('tf-username-description')).display === 'none'`), 'HeroUI hides the description while the error shows');
  await p.click('#tf-username');
  await p.key('End');
  await p.type('c');
  t.check(await attr('#tf-username', 'aria-invalid') === null && await ev(`return document.getElementById('tf-username-error').hidden`), 'once invalid, it re-validates as you type, so the error clears when fixed');
  await p.type('!');
  t.check(await attr('#tf-username', 'aria-invalid') === null, 'a valid field does not validate again until you leave it');
  await p.key('Tab');
  t.check(await attr('#tf-username', 'aria-invalid') === 'true', 'and does when you leave');

  // Tabbing through an untouched required field doesn't flag it.
  await focus('#tf-required');
  await p.key('Tab');
  t.check(await attr('#tf-required', 'aria-invalid') === null, 'tabbing past an untouched field shows no error');

  const ac = await ev(`const g = (id) => document.getElementById(id); return {
    u: g('su-username').autocomplete, p: g('su-password').autocomplete, pmin: g('su-password').minLength, pmax: g('su-password').maxLength, ptype: g('su-password').type,
    cur: g('pw-current').autocomplete, email: g('tf-placeholder').inputMode, etype: g('tf-placeholder').type, spell: g('su-username').getAttribute('spellcheck'), cap: g('su-username').getAttribute('autocapitalize'), name: g('su-username').name, ulen: g('su-username').maxLength }`);
  t.check(ac.u === 'username' && ac.p === 'new-password' && ac.cur === 'current-password' && ac.ptype === 'password', 'autocomplete and type pass through for password managers', ac);
  t.check(ac.pmin === 8 && ac.pmax === 72 && ac.ulen === 32 && ac.email === 'email' && ac.etype === 'email' && ac.spell === 'false' && ac.cap === 'none' && ac.name === 'username', 'minlength, maxlength, inputmode, spellcheck, autocapitalize and name pass through', ac);
  t.check(await attr('#tf-placeholder', 'placeholder') === 'you@example.com' && (await ax('#tf-placeholder')).name === 'Email', 'a placeholder never replaces the label');
  t.check(await attr('#tf-invalid', 'aria-invalid') === 'true' && await ev(`return document.getElementById('tf-invalid-error').textContent`) === 'Use lowercase letters, digits, - or _', 'isInvalid with errorMessage shows the error');
  t.check(await ev(`return document.getElementById('tf-readonly').readOnly`), 'isReadOnly sets readonly');
  const bare = await ax('#in-bare');
  t.check(bare.name === 'New channel name' && await ev(`return document.getElementById('in-bare').matches('input.input.input--primary[data-slot="input"]')`), 'a bare Input uses HeroUI\'s markup and takes aria-label', bare);

  // Text area: same wiring.
  await p.click('label[for="ta-bio"]');
  t.check(await focusedId() === 'ta-bio' && await ev(`return document.getElementById('ta-bio').rows`) === 3, 'text area: label focuses it, 3 rows by default');
  await p.type('short');
  await p.key('Tab');
  t.check(await attr('#ta-bio', 'aria-invalid') === 'true' && await ev(`return document.getElementById('ta-bio-error').textContent`) === 'Use at least 10 characters', 'text area validates on blur');

  // ---- search field ----

  const sb = await ax('#sf-basic');
  t.check(sb.role === 'searchbox' && sb.name === 'Search messages' && await attr('#sf-basic', 'role') === 'searchbox', 'search field has role="searchbox" and its label', sb);
  t.check(await ev(`return document.getElementById('sf-basic').closest('.search-field').dataset.empty === 'true'`), 'empty search field is marked data-empty (clear button hidden)');
  await p.click('#sf-basic');
  await p.type('hello');
  t.check(await ev(`return !document.getElementById('sf-basic').closest('.search-field').dataset.empty`), 'typing shows the clear button');
  await p.key('Enter');
  t.check(await logText('search-field') === 'submit "hello"', 'Enter calls onSubmit', await logText('search-field'));
  await p.key('Escape');
  t.check(await value('#sf-basic') === '' && await logText('search-field') === 'clear' && await focusedId() === 'sf-basic', 'Escape clears the search field and keeps focus', await logText('search-field'));
  await p.type('again');
  await p.click('#sf-basic ~ .search-field__clear-button');
  t.check(await value('#sf-basic') === '' && await focusedId() === 'sf-basic', 'the clear button clears it and focus stays in the field');
  t.check(await attr('#sf-basic ~ button', 'aria-label') === 'Clear search' && await attr('#sf-basic ~ button', 'tabindex') === '-1', 'the clear button is named and out of the tab order');
  // Inside an overlay, Escape clears first and only closes when empty.
  await ev(`window.__dismissed = 0; window.__rm = YapUI.pushLayer({ el: document.getElementById('search-field'), onDismiss: () => { __dismissed++; __rm(); } });`);
  await p.type('x');
  await p.key('Escape');
  t.check(await value('#sf-basic') === '' && await ev('return __dismissed') === 0, 'in a layer, Escape clears a non-empty search instead of closing the layer');
  await p.key('Escape');
  t.check(await ev('return __dismissed') === 1, 'Escape on an empty search field closes the layer');

  // ---- checkbox ----

  await p.click('label[for="cb-basic"]');
  t.check(await ev(`return document.getElementById('cb-basic').checked`) && await logText('checkbox') === 'change true', 'clicking the label toggles the checkbox (onChange true)', await logText('checkbox'));
  await p.click('#cb-basic + .checkbox__control');
  t.check(!(await ev(`return document.getElementById('cb-basic').checked`)), 'clicking the box toggles it back');
  t.check(await focusedId() === 'cb-basic', 'clicking focuses the checkbox');
  await p.key(' ');
  const cb = await ax('#cb-basic');
  t.check(cb.checked === 'true' && cb.role === 'checkbox' && cb.name === 'Email me product updates' && await logText('checkbox') === 'change true', 'Space toggles it; aria-checked is true', cb);
  t.check(await ev(`return document.getElementById('cb-basic').closest('.checkbox').dataset.selected === 'true'`), 'data-selected follows the state');
  await p.key('Tab');
  t.check(await focusedId() === 'cb-desc' && await ev(`return document.querySelector('label[for="cb-desc"]').dataset.focusVisible === 'true'`), 'keyboard focus shows HeroUI\'s focus ring (data-focus-visible)');
  t.check((await ax('#cb-desc')).description === 'Applies to messages you send', 'checkbox description is wired through aria-describedby');
  const ind = await ax('#cb-indeterminate');
  t.check(ind.checked === 'mixed' && await ev(`return document.getElementById('cb-indeterminate').indeterminate && !document.getElementById('cb-indeterminate').hasAttribute('aria-checked')`), 'indeterminate gives aria-checked="mixed" through the native property', ind);
  t.check(await ev(`const r = document.getElementById('cb-indeterminate').closest('.checkbox'); return r.dataset.indeterminate === 'true' && getComputedStyle(r.querySelector('[data-slot="checkbox-default-indicator--indeterminate"]')).opacity === '1'`), 'indeterminate shows the dash');
  t.check((await ax('#cb-invalid')).invalid === 'true' && await ev(`return document.getElementById('cb-invalid-error').textContent`) === 'Agree to the terms to continue', 'invalid checkbox: aria-invalid and its error');
  // Select all.
  t.check((await ax('#cb-all')).checked === 'mixed', 'select all starts mixed when some are selected');
  await p.click('label[for="cb-all"]');
  t.check(await ev(`return ['mentions','replies','dms'].every((v) => document.getElementById('cb-all-' + v).checked)`) && (await ax('#cb-all')).checked === 'true', 'checking select all selects every option');
  await p.click('label[for="cb-all-replies"]');
  t.check((await ax('#cb-all')).checked === 'mixed' && await logText('checkbox', 1) === 'mentions, dms', 'unchecking one makes select all mixed', await logText('checkbox', 1));
  await p.click('label[for="cb-all"]');
  t.check(await ev(`return ['mentions','replies','dms'].every((v) => document.getElementById('cb-all-' + v).checked)`), 'checking a mixed select all selects all');
  await p.click('label[for="cb-all"]');
  t.check(await ev(`return ['mentions','replies','dms'].every((v) => !document.getElementById('cb-all-' + v).checked)`) && (await ax('#cb-all')).checked === 'false', 'unchecking select all clears every option');
  // Read-only.
  await p.click('label[for="cb-readonly"]');
  t.check(await ev(`return document.getElementById('cb-readonly').checked`), 'a read-only checkbox ignores clicks');

  // Checkbox group.
  const grp = await ax('#cbg-topics');
  t.check(grp.role === 'group' && grp.name === 'Topics', 'checkbox group is a named group', grp);
  await p.click('label[for="cbg-topics-0"]');
  t.check(await attr('#cbg-topics', 'data-invalid') === null, 'group: no error while still inside it');
  await focus('#cbg-topics-2');
  await p.key('Tab');
  t.check(await attr('#cbg-topics', 'data-invalid') === 'true' && (await attr('#cbg-topics', 'aria-describedby')).includes('cbg-topics-error') && await attr('#cbg-topics-1', 'aria-invalid') === 'true' && await ev(`return document.getElementById('cbg-topics-error').textContent`) === 'Select at least one topic', 'group: leaving it with nothing selected shows the error on the group and its options');
  await p.click('label[for="cbg-topics-1"]');
  t.check(await attr('#cbg-topics', 'data-invalid') === null && await attr('#cbg-topics-1', 'aria-invalid') === null, 'group: selecting one clears the error live');

  // ---- switch ----

  const s0 = await ax('#sw-sounds');
  t.check(s0.role === 'switch' && s0.name === 'Sounds' && s0.checked === 'false' && await attr('#sw-sounds', 'role') === 'switch', 'switch has role="switch", its label, and aria-checked false', s0);
  await p.click('label[for="sw-sounds"]');
  t.check((await ax('#sw-sounds')).checked === 'true' && await logText('switch') === 'Sounds on', 'clicking the label switches it on and onChange fires at once', await logText('switch'));
  t.check(await focusedId() === 'sw-sounds', 'clicking focuses the switch');
  await p.key(' ');
  t.check((await ax('#sw-sounds')).checked === 'false' && await logText('switch') === 'Sounds off', 'Space toggles it, onChange fires immediately', await logText('switch'));
  t.check(await ev(`return !document.getElementById('sw-sounds').closest('.switch').dataset.selected`), 'data-selected follows the state');
  t.check(await ev(`return document.querySelector('label[for="sw-sounds"] .label').textContent`) === 'Sounds', 'the label does not change with state');
  t.check((await ax('#sw-desktop')).description === 'Show a notification for mentions and direct messages', 'switch description is wired through aria-describedby');
  await p.click('label[for="sw-readonly"]');
  t.check(await ev(`return document.getElementById('sw-readonly').checked`), 'a read-only switch ignores clicks');

  // ---- disabled ----

  await focus('#tf-invalid');
  await p.click('#tf-disabled');
  t.check(await focusedId() !== 'tf-disabled', 'a disabled field cannot be focused by clicking', await focusedId());
  await focus('#tf-invalid');
  await p.key('Tab');
  t.check(await focusedId() === 'tf-readonly', 'Tab skips a disabled field (read-only stays focusable)', await focusedId());
  t.check((await ax('#tf-disabled')).disabled === true, 'the disabled field is reported disabled');
  await p.click('label[for="cb-disabled"]');
  t.check(!(await ev(`return document.getElementById('cb-disabled').checked`)) && await focusedId() !== 'cb-disabled', 'a disabled checkbox ignores clicks and takes no focus');
  await p.click('label[for="sw-disabled"]');
  t.check(!(await ev(`return document.getElementById('sw-disabled').checked`)) && await focusedId() !== 'sw-disabled', 'a disabled switch ignores clicks and takes no focus');
  await focus('#sw-readonly');
  await p.key('Tab');
  t.check(!['sw-disabled', 'sw-disabled-on'].includes(await focusedId()), 'Tab skips disabled switches', await focusedId());
  await p.click('#sf-disabled');
  t.check(await focusedId() !== 'sf-disabled', 'a disabled search field takes no focus');

  // ---- form example ----

  await p.click('#form-signup button[type="submit"]');
  const sum = await ev(`const s = document.querySelector('#form-signup .yui-form__summary'); return { hidden: s.hidden, role: s.getAttribute('role'), title: s.querySelector('.alert__title').textContent, items: [...s.querySelectorAll('li')].map((li) => li.textContent), index: [...s.parentNode.children].indexOf(s) }`);
  t.check(await focusedId() === 'su-username', 'submitting with errors focuses the first invalid field', await focusedId());
  t.check(!sum.hidden && sum.index === 0 && sum.role === 'alert' && sum.title === 'Fix 2 fields to continue' && sum.items.length === 2 && sum.items[0] === 'Username: Required' && sum.items[1] === 'Password: Required', 'the summary at the top lists each error', sum);
  t.check(await attr('#su-username', 'aria-invalid') === 'true' && await attr('#su-password', 'aria-invalid') === 'true' && await attr('#su-invite', 'aria-invalid') === null, 'field errors show alongside the summary; the optional field passes');
  t.check(await ev(`return document.querySelector('label[for="su-invite"]').textContent`) === 'Invite code (optional)', 'necessityIndicator "label" marks the optional field');
  await t.axe('#form-example', 'form-example with errors (light)');
  await p.click('#form-signup .yui-form__summary li:nth-child(2) a');
  t.check(await focusedId() === 'su-password', 'a summary link focuses its field');
  await p.type('short');
  t.check(await ev(`return document.getElementById('su-password-error').textContent`) === 'Use 8–72 characters', 'the error updates live while invalid');
  await p.type('-enough');
  t.check(await attr('#su-password', 'aria-invalid') === null, 'and clears once the value is valid');
  await focus('#su-username');
  await p.type('taken');
  await p.key('Enter');
  t.check(await ev(`const b = document.querySelector('#form-signup button[type="submit"]'); return b.getAttribute('aria-disabled') === 'true' && b.dataset.pending === 'true' && b.textContent === 'Creating account…'`), 'submit is disabled while the request runs');
  await p.key('Enter');
  await p.waitFor(`document.querySelector('#form-signup button[type="submit"]').getAttribute('aria-disabled') !== 'true'`, 'sign-up to finish');
  t.check(await ev(`return document.getElementById('su-username-error').textContent`) === 'That username is taken. Try another.' && await focusedId() === 'su-username', 'a server field error shows on the field and focuses it');
  t.check(await ev(`return document.querySelector('#form-signup .alert__title').textContent`) === 'Fix 1 field to continue', 'the summary reflects the server error');
  await ev(`document.getElementById('su-username').select()`);
  await p.type('alex');
  await p.key('Enter');
  await p.waitFor(`document.querySelector('#form-signup .yui-form__status').textContent`, 'sign-up status');
  t.check(await ev(`return document.querySelector('#form-signup .yui-form__status').textContent`) === 'Welcome, alex.' && await ev(`return document.querySelector('#form-signup .yui-form__summary').hidden`) && await logText('form-example') === 'sign-up alex', 'a valid submit runs onSubmit with the values and clears the summary', await logText('form-example'));
  t.check(await ev(`return document.querySelectorAll('#form-signup button[disabled]').length === 0 && document.getElementById('form-signup').noValidate`), 'the form uses aria validation (novalidate), never native bubbles');

  // Change password: a server error goes in the summary.
  await focus('#pw-current');
  await p.type('wrong');
  await p.key('Tab');
  await p.type('new-password-1');
  await p.key('Enter');
  await p.waitFor(`!document.querySelector('#form-password .yui-form__summary').hidden`, 'server error');
  t.check(await ev(`return document.querySelector('#form-password .alert__title').textContent`) === 'Current password is incorrect.', 'a server error appears in the summary on submit');
  t.check(await ev(`return getComputedStyle(document.querySelector('label[for="pw-current"]'), '::after').content`) === 'none' && await attr('#pw-current', 'aria-required') === 'true', 'with every field required, no asterisks, but aria-required stays');
  t.check(await ev(`return document.querySelector('#form-password input[autocomplete="username"]') !== null`), 'change-password keeps a username field for password managers');

  // ---- quality ----

  for (const theme of ['light', 'dark']) {
    await p.theme(theme);
    await sleep(400); // let field color transitions finish
    for (const id of SECTIONS) await t.axe('#' + id, `${id} (${theme})`);
  }

  // Put some fields in focus/invalid states for the pictures.
  await p.theme('light');
  await ev(`document.getElementById('su-password').value = ''; document.getElementById('su-password').closest('.textfield').yui.validate();`);
  for (const theme of ['light', 'dark']) {
    await p.theme(theme);
    await sleep(400); // let field color transitions finish
    for (const id of SECTIONS) await shot(id, `forms-${id}-${theme}.png`);
  }
  await p.theme('light');
  await p.viewport(390, 800, true);
  await sleep(200);
  const overflow = await ev(`return [${SECTIONS.map((s) => JSON.stringify(s)).join(',')}].filter((id) => { const el = document.getElementById(id); return el.scrollWidth > el.clientWidth + 1; })`);
  t.check(Array.isArray(overflow) && overflow.length === 0, 'no section overflows horizontally at 390px', overflow);
  for (const id of ['text-field', 'checkbox', 'switch', 'form-example']) await shot(id, `forms-${id}-390.png`);
  await p.theme('dark');
  await shot('form-example', 'forms-form-example-390-dark.png');
  await p.viewport(1280, 900);
  await p.theme('light');

  // An off switch must be visible: track and thumb at 3:1 or more (WCAG 1.4.11).
  for (const theme of ['light', 'dark']) {
    await p.theme(theme);
    await new Promise((r) => setTimeout(r, 400));
    const c = await p.eval(`
      const ctx = Object.assign(document.createElement('canvas'), { width: 1, height: 1 }).getContext('2d', { willReadFrequently: true });
      const rgb = (css) => { ctx.clearRect(0,0,1,1); ctx.fillStyle = '#000'; ctx.fillStyle = css; ctx.fillRect(0,0,1,1); return [...ctx.getImageData(0,0,1,1).data].slice(0,3); };
      const L = (c) => c.map(x => x/255).map(x => x <= 0.04045 ? x/12.92 : ((x+0.055)/1.055)**2.4).reduce((s,x,i) => s + x*[0.2126,0.7152,0.0722][i], 0);
      const cr = (a,b) => { const [h,l] = [L(a),L(b)].sort((x,y)=>y-x); return (h+0.05)/(l+0.05); };
      const off = [...document.querySelectorAll('#switch .switch')].find(s => !s.querySelector('input').checked && !s.querySelector('input').disabled);
      const page = rgb(getComputedStyle(document.body).backgroundColor);
      const track = rgb(getComputedStyle(off.querySelector('.switch__control')).backgroundColor);
      const thumb = rgb(getComputedStyle(off.querySelector('.switch__thumb')).backgroundColor);
      return { track: cr(track, page), thumb: Math.max(cr(thumb, track), cr(thumb, page)) };`);
    t.check(c.track >= 3 || c.thumb >= 3, `an off switch is visible against the page (${theme})`, c);
    t.check(c.thumb >= 3, `an off switch's thumb stands out (${theme})`, c);
  }
  await p.theme('light');
}
