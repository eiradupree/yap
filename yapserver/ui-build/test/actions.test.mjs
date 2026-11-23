// actions: Button, CloseButton, ButtonGroup, ToggleButton(+Group), Link, Kbd.
import { writeFile } from 'node:fs/promises';

const SECTIONS = ['button', 'close-button', 'button-group', 'toggle-button', 'link', 'kbd'];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export default async function (t) {
  const p = t.page;
  await p.goto(t.url + '?theme=light');
  await p.mouseAway();

  const q = (sel) => JSON.stringify(sel);
  const attr = (sel, name) => p.eval(`return document.querySelector(${q(sel)}).getAttribute(${q(name)})`);
  const logOf = (section, n = 0) => p.eval(`return document.querySelectorAll('#${section} .gallery-log')[${n}].textContent`);
  const resetLog = (section, n = 0) => p.eval(`document.querySelectorAll('#${section} .gallery-log')[${n}].textContent = '—'`);
  // Puts keyboard focus on sel by focusing the element before it in tab order
  // and pressing Tab, so :focus-visible applies as it would for a user.
  const tabTo = async (sel) => {
    await p.eval(`
      const el = document.querySelector(${q(sel)});
      const all = [...document.querySelectorAll('a[href], button, [tabindex]')].filter((x) => x.tabIndex >= 0 && x.getClientRects().length);
      const prev = all[all.indexOf(el) - 1];
      el.scrollIntoView({ block: 'center' });
      prev.focus();`);
    await p.key('Tab');
    await sleep(250); // let the focus ring's box-shadow transition finish
    return p.eval(`return document.activeElement === document.querySelector(${q(sel)})`);
  };
  const ring = (sel) => p.eval(`const el = document.querySelector(${q(sel)}); const cs = getComputedStyle(el);
    return { fv: el.matches(':focus-visible'), shadow: cs.boxShadow, outline: cs.outlineStyle };`);
  const hasRing = (r) => r.fv && /rgb/.test(r.shadow) && /\b2px\b|\b4px\b/.test(r.shadow);
  // The accessibility tree's view of an element: role, name, description.
  const ax = async (sel) => {
    const { result: { root } } = await p.send('DOM.getDocument', { depth: 0 });
    const { result: { nodeId } } = await p.send('DOM.querySelector', { nodeId: root.nodeId, selector: sel });
    const { result } = await p.send('Accessibility.getPartialAXTree', { nodeId, fetchRelatives: false });
    const n = result.nodes[0];
    const prop = (k) => (n.properties || []).find((x) => x.name === k)?.value?.value;
    return { role: n.role?.value, name: n.name?.value, description: n.description?.value, disabled: prop('disabled'), busy: prop('busy'), pressed: prop('pressed'), checked: prop('checked') };
  };

  // ---- Button: activation ----
  const save = '[data-demo="variant-primary"]';
  await p.click(save);
  t.check(await logOf('button') === 'Save (mouse)', 'Button: click fires onPress', await logOf('button'));
  t.check(await attr(save, 'type') === 'button' && await attr(save, 'data-slot') === 'button' && await p.eval(`return document.querySelector(${q(save)}).className === 'button button--md button--primary'`), 'Button: HeroUI markup (type, data-slot, classes)', await attr(save, 'class'));
  await resetLog('button');
  t.check(await tabTo(save), 'Button: reachable with Tab');
  const r1 = await ring(save);
  t.check(hasRing(r1), 'Button: focus-visible ring after keyboard focus (box-shadow)', r1);
  await p.key('Enter');
  t.check(await logOf('button') === 'Save (keyboard)', 'Button: Enter fires onPress', await logOf('button'));
  await resetLog('button');
  await p.key(' ');
  t.check(await logOf('button') === 'Save (keyboard)', 'Button: Space fires onPress', await logOf('button'));
  await p.eval('document.activeElement.blur()');
  await p.click(save);
  await sleep(250);
  const r2 = await ring(save);
  t.check(!r2.fv, 'Button: no focus ring after a mouse click', r2);

  // ---- Button: disabled ----
  const dis = '[data-demo="disabled"]';
  await resetLog('button');
  t.check(await attr(dis, 'aria-disabled') === 'true' && !(await p.eval(`return document.querySelector(${q(dis)}).disabled`)), 'Button: disabled uses aria-disabled, not the disabled attribute');
  await p.click(dis);
  t.check(await logOf('button') === '—', 'Button: disabled ignores the mouse');
  t.check(await tabTo(dis), 'Button: disabled stays focusable');
  await p.key('Enter');
  await p.key(' ');
  await p.eval(`document.querySelector(${q(dis)}).click()`);
  t.check(await logOf('button') === '—', 'Button: disabled ignores Enter, Space and .click()', await logOf('button'));
  const axDis = await ax(dis);
  t.check(axDis.disabled === true && axDis.name === 'Save', 'Button: disabled is announced as unavailable', axDis);
  const disOpacity = await p.eval(`return getComputedStyle(document.querySelector(${q(dis)})).opacity`);
  t.check(disOpacity === '0.5', 'Button: disabled is dimmed by HeroUI styles', disOpacity);

  // ---- Button: pending ----
  const pend = '[data-demo="pending"]';
  await resetLog('button');
  const w0 = await p.eval(`return [...document.querySelectorAll('#button .gallery-example')].find(e => /Pending/.test(e.textContent)).querySelectorAll('.button')[1].getBoundingClientRect().width`);
  const wIcon0 = await p.eval(`return [...document.querySelectorAll('#button .gallery-example')].find(e => /Pending/.test(e.textContent)).querySelectorAll('.button')[2].getBoundingClientRect().width`);
  await p.click(pend);
  t.check(await logOf('button') === 'Save (mouse)', 'Button: press before pending fires onPress');
  const st = await p.eval(`const b = document.querySelector(${q(pend)}); return { pending: b.dataset.pending, busy: b.getAttribute('aria-busy'), spinner: !!b.querySelector(':scope > .spinner.spinner--sm[data-slot="spinner"][aria-hidden="true"] > svg'), first: b.firstElementChild.classList.contains('spinner'), disabled: b.getAttribute('aria-disabled'), opacity: getComputedStyle(b).opacity, pe: getComputedStyle(b).pointerEvents };`);
  t.check(st.pending === 'true' && st.busy === 'true' && st.spinner && st.first, 'Button: pending sets data-pending, aria-busy and shows the spinner before the label', st);
  t.check(st.disabled === null && st.opacity === '1', 'Button: pending keeps the enabled look (not aria-disabled, full opacity)', st);
  const axP = await ax(pend);
  t.check(axP.name === 'Save' && axP.description === 'Loading' && !!axP.busy, 'Button: pending keeps the accessible name and is described as Loading', axP);
  await resetLog('button');
  await p.click(pend);
  t.check(await tabTo(pend), 'Button: pending stays focusable');
  await p.key('Enter');
  await p.key(' ');
  t.check(await logOf('button') === '—', 'Button: pending ignores mouse, Enter and Space', await logOf('button'));
  await p.waitFor(`!document.querySelector(${q(pend)}).dataset.pending`, 'pending to end', 3000);
  const after = await p.eval(`const b = document.querySelector(${q(pend)}); return { busy: b.hasAttribute('aria-busy'), spinner: !!b.querySelector('.spinner'), desc: b.hasAttribute('aria-describedby'), text: b.textContent };`);
  t.check(!after.busy && !after.spinner && !after.desc && after.text === 'Save', 'Button: pending ends cleanly (no aria-busy, spinner or description)', after);
  // Hold pending: icon buttons keep their width (the spinner replaces the icon).
  await p.click('[data-demo="pending-toggle"]');
  const holds = await p.eval(`const bs = [...document.querySelectorAll('#button .gallery-example')].find(e => /Pending/.test(e.textContent)).querySelectorAll('.button');
    return { all: [...bs].every(b => b.dataset.pending === 'true'), w: bs[1].getBoundingClientRect().width, wIcon: bs[2].getBoundingClientRect().width, iconHidden: getComputedStyle(bs[2].querySelector('svg[data-slot="icon"]')).display };`);
  t.check(holds.all, 'Button: el.yui.setPending(true) from a toggle holds every demo pending', holds);
  t.check(Math.abs(holds.w - w0) < 0.5 && Math.abs(holds.wIcon - wIcon0) < 0.5 && holds.iconHidden === 'none', 'Button: pending with an icon does not change the width', { w0, wIcon0, ...holds });
  await p.screenshot(t.shots + '/actions-pending-light.png');
  await p.click('[data-demo="pending-toggle"]');
  t.check(await p.eval(`return !document.querySelector('#button [data-pending]')`), 'Button: setPending(false) restores every button');

  // ---- Button: icon-only ----
  const io = await p.eval(`try { YapUI.Button({ isIconOnly: true, icon: YapUI.icons.close }); return 'no throw'; } catch (e) { return e.message; }`);
  t.check(/icon-only button needs an accessible name/.test(io) && /ariaLabel/.test(io), 'Button: icon-only without a label throws a clear error', io);
  const io2 = await p.eval(`try { YapUI.ToggleButton({ isIconOnly: true }); return 'no throw'; } catch (e) { return e.message; }`);
  t.check(/needs an accessible name/.test(io2), 'ToggleButton: icon-only without a label throws', io2);
  const ioAx = await ax('[data-demo="icon-only"]');
  t.check(ioAx.name === 'More actions' && await attr('[data-demo="icon-only"]', 'title') === null && await p.eval(`return document.querySelector('[data-demo="icon-only"]').classList.contains('button--icon-only')`), 'Button: icon-only has its aria-label as name, no title', ioAx);
  const sq = await p.eval(`const r = document.querySelector('[data-demo="icon-only"]').getBoundingClientRect(); return [r.width, r.height];`);
  t.check(sq[0] === sq[1], 'Button: icon-only is square', sq);
  const bad = await p.eval(`try { YapUI.Button({ variant: 'bogus' }); return 'no throw'; } catch (e) { return e.message; }`);
  t.check(/variant must be one of/.test(bad), 'Button: rejects unknown variants', bad);

  // ---- CloseButton ----
  const close = '[data-demo="close"]';
  await p.click(close);
  t.check(await logOf('close-button') === 'Close (mouse)', 'CloseButton: click fires onPress with default label "Close"', await logOf('close-button'));
  t.check(await p.eval(`const b = document.querySelector(${q(close)}); return b.className === 'close-button close-button--default' && b.dataset.slot === 'close-button' && !!b.querySelector('svg[data-slot="close-button-icon"]')`), 'CloseButton: HeroUI markup');
  t.check(await tabTo(close), 'CloseButton: reachable with Tab');
  t.check(hasRing(await ring(close)), 'CloseButton: focus-visible ring', await ring(close));
  await resetLog('close-button');
  await p.key('Enter');
  t.check(await logOf('close-button') === 'Close (keyboard)', 'CloseButton: Enter fires onPress');
  await resetLog('close-button');
  await p.key(' ');
  t.check(await logOf('close-button') === 'Close (keyboard)', 'CloseButton: Space fires onPress');
  await resetLog('close-button');
  await p.click('#close-button [aria-disabled="true"]');
  await tabTo('#close-button [aria-disabled="true"]');
  await p.key('Enter');
  t.check(await logOf('close-button') === '—', 'CloseButton: disabled ignores mouse and keyboard');

  // ---- ButtonGroup ----
  const grp = await p.eval(`const g = document.querySelector('#button-group .button-group');
    return { role: g.getAttribute('role'), label: g.getAttribute('aria-label'), slot: g.dataset.slot, cls: g.className, seps: g.querySelectorAll(':scope > .button > .button-group__separator[aria-hidden="true"][data-slot="button-group-separator"]').length, firstSep: !!g.children[0].querySelector('.button-group__separator'), variants: [...g.children].map(b => b.classList.contains('button--primary')) };`);
  t.check(grp.role === 'group' && grp.label === 'Range' && grp.slot === 'button-group' && grp.cls === 'button-group button-group--horizontal', 'ButtonGroup: role=group with a label and HeroUI classes', grp);
  t.check(grp.seps === 2 && !grp.firstSep, 'ButtonGroup: separators inside every button but the first', grp);
  t.check(grp.variants.every(Boolean), 'ButtonGroup: variant passes to child buttons', grp);
  const radii = await p.eval(`const bs = document.querySelectorAll('#button-group .button-group')[2].children; return [...bs].map(b => getComputedStyle(b).borderTopLeftRadius + '/' + getComputedStyle(b).borderTopRightRadius);`);
  t.check(radii[0] !== '0px/0px' && radii[1] === '0px/0px' && radii[2].startsWith('0px/') && !radii[2].endsWith('/0px'), 'ButtonGroup: only the outer corners are rounded', radii);
  await p.click('[data-demo="group-week"]');
  t.check(await logOf('button-group') === 'Week', 'ButtonGroup: buttons fire onPress');
  await resetLog('button-group');
  const gd = await p.eval(`const g = document.querySelector('[data-demo="group-disabled"]').parentElement; return [...g.children].map(b => b.getAttribute('aria-disabled'));`);
  t.check(gd[0] === 'true' && gd[1] === 'true' && gd[2] === null, 'ButtonGroup: isDisabled reaches children; a child can opt out with isDisabled: false', gd);
  await p.click('[data-demo="group-disabled"]');
  t.check(await logOf('button-group') === '—', 'ButtonGroup: disabled child ignores clicks');
  const vg = await p.eval(`const g = [...document.querySelectorAll('#button-group .button-group--vertical')][0]; const r = [...g.children].map(b => b.getBoundingClientRect()); return { stacked: r[1].top >= r[0].bottom - 1, sameWidth: r.every(x => x.left === r[0].left && x.width === r[0].width), r: r.map(x => [x.left, x.top, x.width]) };`);
  t.check(vg.stacked && vg.sameWidth, 'ButtonGroup: vertical orientation stacks buttons at one width', vg);

  // ---- ToggleButton ----
  const tog = '[data-demo="toggle"]';
  const tstate = () => p.eval(`const b = document.querySelector(${q(tog)}); return b.getAttribute('aria-pressed') + '|' + (b.dataset.selected || '') + '|' + b.textContent;`);
  t.check(await tstate() === 'false||Favorite' && await attr(tog, 'data-slot') === 'toggle-button', 'ToggleButton: starts unpressed with aria-pressed="false"', await tstate());
  await p.click(tog);
  t.check(await tstate() === 'true|true|Favorite' && await logOf('toggle-button') === 'Favorite: on', 'ToggleButton: click sets aria-pressed and data-selected; label unchanged', await tstate());
  const selBg = await p.eval(`return getComputedStyle(document.querySelector(${q(tog)})).backgroundColor`);
  t.check(await tabTo(tog), 'ToggleButton: reachable with Tab');
  t.check(hasRing(await ring(tog)), 'ToggleButton: focus-visible ring', await ring(tog));
  await p.key(' ');
  t.check(await tstate() === 'false||Favorite', 'ToggleButton: Space toggles', await tstate());
  await p.key('Enter');
  t.check(await tstate() === 'true|true|Favorite', 'ToggleButton: Enter toggles', await tstate());
  const unBg = await p.eval(`const b = document.querySelector('#toggle-button .toggle-button[aria-pressed="false"]'); return getComputedStyle(b).backgroundColor`);
  t.check(selBg !== unBg, 'ToggleButton: selected looks different from unselected', { selBg, unBg });
  const axT = await ax(tog);
  t.check(axT.role === 'button' && axT.pressed === 'true' && axT.name === 'Favorite', 'ToggleButton: announced as a pressed toggle button', axT);
  const td = '[data-demo="toggle-disabled"]';
  await resetLog('toggle-button');
  await p.click(td);
  await tabTo(td);
  await p.key(' ');
  await p.key('Enter');
  t.check(await attr(td, 'aria-pressed') === 'false' && await attr(td, 'aria-disabled') === 'true' && await logOf('toggle-button') === '—', 'ToggleButton: disabled stays unpressed and focusable');

  // ---- ToggleButtonGroup: multiple (toolbar) ----
  const gm = '[data-demo="group-multiple"]';
  const gmState = () => p.eval(`return [...document.querySelector(${q(gm)}).querySelectorAll('.toggle-button')].map(b => b.getAttribute('aria-pressed') + ':' + b.tabIndex).join(' ')`);
  t.check(await attr(gm, 'role') === 'toolbar' && await attr(gm, 'aria-label') === 'Text style', 'ToggleButtonGroup (multiple): role=toolbar with a label');
  t.check(await gmState() === 'true:0 false:-1 false:-1', 'ToggleButtonGroup (multiple): one tab stop on the selected button', await gmState());
  await tabTo(`${gm} .toggle-button`);
  await p.key('ArrowRight');
  t.check((await p.focused()).includes('"Italic"'), 'ToggleButtonGroup: ArrowRight moves focus', await p.focused());
  t.check(await gmState() === 'true:-1 false:0 false:-1', 'ToggleButtonGroup (multiple): arrows move focus without selecting', await gmState());
  await p.key(' ');
  t.check(await gmState() === 'true:-1 true:0 false:-1' && await logOf('toggle-button', 1) === 'bold, italic', 'ToggleButtonGroup (multiple): Space toggles and reports the selected keys', await logOf('toggle-button', 1));
  await p.key('End');
  t.check((await p.focused()).includes('"Underline"'), 'ToggleButtonGroup: End jumps to the last button');
  await p.key('ArrowRight');
  t.check((await p.focused()).includes('"Bold"'), 'ToggleButtonGroup: arrows wrap around');
  await p.key('Tab');
  t.check(!(await p.eval(`return document.querySelector(${q(gm)}).contains(document.activeElement)`)), 'ToggleButtonGroup: Tab leaves the group');

  // ---- ToggleButtonGroup: single (radio group) ----
  const gs = '[data-demo="group-single"]';
  const gsState = () => p.eval(`return [...document.querySelector(${q(gs)}).querySelectorAll('.toggle-button')].map(b => b.getAttribute('role') + ':' + b.getAttribute('aria-checked') + ':' + (b.hasAttribute('aria-pressed') ? 'P' : '-')).join(' ')`);
  t.check(await attr(gs, 'role') === 'radiogroup' && await gsState() === 'radio:true:- radio:false:- radio:false:-', 'ToggleButtonGroup (single): radiogroup of radios with aria-checked', await gsState());
  await tabTo(`${gs} .toggle-button`);
  await p.key('ArrowRight');
  t.check(await gsState() === 'radio:false:- radio:true:- radio:false:-' && (await p.focused()).includes('Center'), 'ToggleButtonGroup (single): arrows move focus and select', await gsState());
  await p.click(`${gs} .toggle-button:nth-child(3)`);
  t.check(await gsState() === 'radio:false:- radio:false:- radio:true:-' && await logOf('toggle-button', 1) === 'right', 'ToggleButtonGroup (single): click selects exactly one', await logOf('toggle-button', 1));
  await p.click(`${gs} .toggle-button:nth-child(3)`);
  t.check(await gsState() === 'radio:false:- radio:false:- radio:true:-', 'ToggleButtonGroup: disallowEmptySelection keeps the last selection');
  const axR = await ax(`${gs} .toggle-button:nth-child(3)`);
  t.check(axR.role === 'radio' && axR.checked === 'true' && axR.name === 'Right', 'ToggleButtonGroup (single): announced as a checked radio', axR);

  const tv = await p.eval(`const g = document.querySelector('#toggle-button .toggle-button-group--vertical'); const r = [...g.children].map(b => b.getBoundingClientRect()); return { stacked: r[1].top >= r[0].bottom - 1, sameWidth: r.every(x => x.left === r[0].left && x.width === r[0].width), orient: g.getAttribute('aria-orientation') };`);
  t.check(tv.stacked && tv.sameWidth && tv.orient === 'vertical', 'ToggleButtonGroup: vertical stacks at one width with aria-orientation', tv);
  const det = await p.eval(`const g = document.querySelector('#toggle-button .toggle-button-group--detached'); const r = [...g.children].map(b => b.getBoundingClientRect()); return { gap: r[1].left - r[0].right, sep: getComputedStyle(g.querySelector('.toggle-button-group__separator')).display };`);
  t.check(det.gap === 4 && det.sep === 'none', 'ToggleButtonGroup: detached has 4px gaps and no separators', det);

  // ---- Link ----
  const link = '[data-demo="link"]';
  t.check(await p.eval(`const a = document.querySelector(${q(link)}); return a.tagName === 'A' && a.className === 'link' && a.dataset.slot === 'link'`), 'Link: HeroUI markup');
  await p.click(link);
  t.check(await logOf('link') === 'Billing settings (mouse)', 'Link: click fires onPress', await logOf('link'));
  t.check(await tabTo(link), 'Link: reachable with Tab');
  t.check(hasRing(await ring(link)), 'Link: focus-visible ring', await ring(link));
  await resetLog('link');
  await p.key('Enter');
  t.check(await logOf('link') === 'Billing settings (keyboard)', 'Link: Enter fires onPress');
  const ext = await p.eval(`const a = document.querySelector('[data-demo="link-external"]'); return { target: a.target, rel: a.rel, icon: !!a.querySelector('.link__icon[data-default-icon="true"][data-slot="link-icon"] svg'), hidden: a.querySelector('.yui-visually-hidden')?.textContent };`);
  t.check(ext.target === '_blank' && ext.rel === 'noopener noreferrer' && ext.icon && /new tab/.test(ext.hidden), 'Link: isExternal opens a new tab safely, shows the icon and says so', ext);
  const ld = '[data-demo="link-disabled"]';
  await resetLog('link');
  const hash0 = await p.eval('return location.hash');
  t.check(await tabTo(ld), 'Link: disabled stays focusable');
  await p.key('Enter');
  await p.eval(`document.querySelector(${q(ld)}).click()`);
  t.check(await logOf('link') === '—' && await p.eval('return location.hash') === hash0 && await attr(ld, 'aria-disabled') === 'true', 'Link: disabled ignores activation and does not navigate');
  const ln = '[data-demo="link-nohref"]';
  t.check(await attr(ln, 'role') === 'link' && await attr(ln, 'tabindex') === '0', 'Link: without href is a span with role=link');
  await tabTo(ln);
  await p.key('Enter');
  t.check(await logOf('link') === 'Show older messages (keyboard)', 'Link: without href, Enter fires onPress', await logOf('link'));

  // ---- Kbd ----
  const mac = await p.eval(`const k = document.querySelector('[data-demo="kbd-mac"]'); return { tag: k.tagName, cls: k.className, abbr: [...k.querySelectorAll('.kbd__abbr')].map(a => a.title + '=' + a.querySelector('[aria-hidden]').textContent), content: [...k.querySelectorAll('.kbd__content')].map(c => c.textContent) };`);
  t.check(mac.tag === 'KBD' && mac.cls === 'kbd kbd--default' && mac.abbr.join() === 'Command=⌘' && mac.content.join() === 'K', 'Kbd: Mac mod+k renders <abbr title="Command">⌘</abbr> K', mac);
  const pc = await p.eval(`const k = document.querySelector('[data-demo="kbd-pc"]'); return { abbr: k.querySelectorAll('abbr').length, text: k.textContent };`);
  t.check(pc.abbr === 0 && pc.text === 'Ctrl+K', 'Kbd: off the Mac mod+k renders Ctrl+K', pc);
  const titles = await p.eval(`const out = {}; for (const [keys, mac] of [['mod+shift+p', true], ['option+up', true], ['ctrl+tab', true]]) { const k = YapUI.Kbd({ keys, isMac: mac }); out[keys] = [...k.querySelectorAll('abbr')].map(a => a.title + '=' + a.firstChild.textContent).join(' '); } return out;`);
  t.check(titles['mod+shift+p'] === 'Command=⌘ Shift=⇧' && titles['option+up'] === 'Option=⌥ Up=↑' && titles['ctrl+tab'] === 'Control=⌃ Tab=⇥', 'Kbd: modifier and named-key symbols and titles', titles);
  const fmt = await p.eval(`return [YapUI.Kbd.format('mod+shift+k', true), YapUI.Kbd.format('mod+shift+k', false), YapUI.Kbd.label('mod+k', true), YapUI.Kbd({ keys: 'mod+k' }).textContent.includes(YapUI.isMac ? '⌘' : 'Ctrl')]`);
  t.check(fmt[0] === '⌘⇧K' && fmt[1] === 'Ctrl+Shift+K' && fmt[2] === 'Command K' && fmt[3] === true, 'Kbd: format() and label(); default follows YapUI.isMac', fmt);
  const axK = await p.eval(`const k = document.querySelector('[data-demo="kbd-mac"]'); return [...k.querySelectorAll('abbr')].every(a => a.querySelector('.yui-visually-hidden').textContent === a.title)`);
  t.check(axK, 'Kbd: symbols have screen-reader text matching the title');

  // ---- axe, light and dark; screenshots ----
  await p.mouseAway();
  await p.eval('document.activeElement && document.activeElement.blur()');
  for (const theme of ['light', 'dark']) {
    await p.theme(theme);
    await sleep(500);
    for (const id of SECTIONS) await t.axe('#' + id, `#${id} (${theme})`);
    for (const id of SECTIONS) await shot(p, id, `${t.shots}/actions-${id}-${theme}.png`);
  }
  await p.theme('light');

  // Another family's gallery demo requests a missing avatar on purpose (to
  // show its fallback). That 404 isn't ours; drop it if the demo is present.
  if (await p.eval(`return !!document.querySelector('img[src*="no-such-avatar"]')`)) {
    const i = p.problems.findIndex((x) => /Failed to load resource: .*404/.test(x));
    if (i >= 0) p.problems.splice(i, 1);
  }
}

// A full-height screenshot of one section.
async function shot(p, id, path) {
  // The gallery nav is sticky; keep it out of full-page captures.
  await p.eval(`document.querySelector('.gallery-nav').style.position = 'static'`);
  const r = await p.eval(`const s = document.getElementById(${JSON.stringify(id)}); const r = s.getBoundingClientRect(); return { x: 0, y: r.top + window.scrollY, width: Math.ceil(document.documentElement.clientWidth), height: Math.ceil(r.height) };`);
  const { result } = await p.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip: { ...r, scale: 1 } });
  await writeFile(path, Buffer.from(result.data, 'base64'));
  await p.eval(`document.querySelector('.gallery-nav').style.removeProperty('position')`);
}
