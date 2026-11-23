// Overlays: Tooltip and Popover, with real mouse and keyboard input.
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export default async function (t) {
  const p = t.page;
  const q = (s) => JSON.stringify(s);
  const demo = (name) => `[data-demo="${name}"]`;

  // Mouse moves that don't scroll (the harness's hover() scrolls the target
  // into view, and a scroll closes tooltips by design).
  const move = (x, y) => p.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
  const rect = (sel) => p.eval(`const el = document.querySelector(${q(sel)}); if (!el) return null; const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height };`);
  const reveal = (sel) => p.eval(`document.querySelector(${q(sel)}).scrollIntoView({ block: 'center' })`);
  const hoverAt = async (sel) => { const r = await rect(sel); await move(r.x, r.y); return r; };
  const tips = () => p.eval(`return [...document.querySelectorAll('.yui-portal .tooltip')].filter(el => el.dataset.exiting !== 'true').map(el => el.textContent)`);
  const tipCount = () => p.eval(`return document.querySelectorAll('.yui-portal .tooltip').length`);
  const popOpen = () => p.eval(`return !!document.querySelector('.yui-portal .popover:not([data-exiting])')`);
  const reset = async () => {
    await move(1, 300);
    await p.eval(`document.activeElement && document.activeElement.blur(); window.scrollTo(0, 0);`);
    await sleep(1200); // closeDelay + warm-up cooldown + exit animation
  };
  const logText = (id) => p.eval(`return document.querySelector('#${id} .gallery-log').textContent`);

  await p.goto(t.url + '?theme=light');
  t.check(await p.eval(`return typeof YapUI.Tooltip === 'function' && typeof YapUI.Popover === 'function'`), 'YapUI.Tooltip and YapUI.Popover exist');

  // ---- Tooltip: hover ----
  await reveal(demo('tip-top'));
  await move(1, 300);
  await hoverAt(demo('tip-top'));
  await sleep(150);
  t.check((await tips()).length === 0, 'tooltip is not shown before the 300ms delay');
  await sleep(300);
  const shown = await tips();
  t.check(shown.length === 1 && shown[0] === 'Placed top', 'hover shows the tooltip after the delay', shown);
  const tipInfo = await p.eval(`
    const tip = document.querySelector('.yui-portal .tooltip'), b = document.querySelector('[data-demo="tip-top"]');
    return { role: tip.getAttribute('role'), id: tip.id, described: b.getAttribute('aria-describedby'), placement: tip.dataset.placement,
      above: tip.getBoundingClientRect().bottom <= b.getBoundingClientRect().top };`);
  t.check(tipInfo.role === 'tooltip' && tipInfo.id && tipInfo.described === tipInfo.id, 'role="tooltip" with an id, linked by aria-describedby while open', tipInfo);
  t.check(tipInfo.placement === 'top' && tipInfo.above, 'placement top puts it above the trigger', tipInfo);
  t.check(await logText('tooltip') === 'Top opened', 'onOpenChange(true) is logged');

  // Hovering the tooltip itself keeps it open (WCAG 1.4.13).
  const tr = await rect('.yui-portal .tooltip');
  await move(tr.x, tr.bottom + 1); // the gap
  await move(tr.x, tr.y);
  await sleep(800);
  t.check((await tips()).length === 1, 'moving onto the tooltip keeps it open past closeDelay');

  // Leaving hides it after closeDelay, with the exit animation.
  await move(1, 300);
  await sleep(300);
  t.check((await tips()).length === 1, 'tooltip stays during the 500ms closeDelay');
  await sleep(260);
  const exiting = await p.eval(`const el = document.querySelector('.yui-portal .tooltip'); return el ? el.dataset.exiting : 'gone'`);
  await sleep(250);
  t.check((await tipCount()) === 0 && (exiting === 'true' || exiting === 'gone'), 'leaving hides it after closeDelay, and the node is removed after the exit animation', exiting);
  t.check(await p.eval(`return !document.querySelector('[data-demo="tip-top"]').hasAttribute('aria-describedby')`), 'aria-describedby is removed on close');
  t.check(await logText('tooltip') === 'Top closed', 'onOpenChange(false) is logged');
  await reset();

  // ---- Warm-up: a neighbor shows immediately ----
  await reveal(demo('tip-bold'));
  await hoverAt(demo('tip-bold'));
  await sleep(450);
  t.check((await tips()).join() === `Bold${await p.eval('return YapUI.isMac ? "⌘B" : "Ctrl+B"')}`, 'toolbar tooltip shows the label and shortcut', await tips());
  await hoverAt(demo('tip-italic'));
  await sleep(60);
  let now = await tips();
  t.check(now.length === 1 && now[0].startsWith('Italic'), 'warm-up: the neighbor shows without the delay, and only one is visible', now);
  t.check((await tipCount()) === 1, 'the previous tooltip is removed at once (only one at a time)');
  // After leaving for longer than closeDelay + cooldown, the delay applies again.
  await move(1, 300);
  await sleep(1100);
  await hoverAt(demo('tip-link'));
  await sleep(100);
  t.check((await tips()).length === 0, 'after the cooldown the delay applies again');
  await sleep(300);
  t.check((await tips()).length === 1, '... and the tooltip then shows');
  await reset();

  // ---- Keyboard focus shows at once; mouse click doesn't ----
  await reveal(demo('tip-top'));
  await p.eval(`document.querySelector('[data-demo="tip-top"]').focus()`); // focus the one before
  await p.key('Tab');
  now = await tips();
  const desc = await p.eval(`const b = document.querySelector('[data-demo="tip-bottom"]'); return { focused: document.activeElement === b, described: b.getAttribute('aria-describedby'), id: document.querySelector('.yui-portal .tooltip:not([data-exiting])')?.id }`);
  t.check(now.length === 1 && now[0] === 'Placed bottom' && desc.focused, 'Tab focus shows the tooltip immediately', { now, desc });
  t.check(desc.described && desc.described === desc.id, 'keyboard focus sets aria-describedby', desc);
  await p.key('Escape');
  await sleep(200);
  t.check((await tipCount()) === 0, 'Escape hides the tooltip');
  t.check(await p.eval(`return document.activeElement === document.querySelector('[data-demo="tip-bottom"]')`), 'Escape leaves focus on the trigger');
  await p.key('Tab');
  t.check((await tips()).join() === 'Placed left', 'Tab to the next trigger shows its tooltip');
  await p.key('Tab', { shift: true });
  t.check((await tips()).join() === 'Placed bottom', 'Shift+Tab back shows the previous one, still only one visible');
  await p.eval(`document.activeElement.blur()`);
  await sleep(200);
  t.check((await tipCount()) === 0, 'blur hides the tooltip');
  await reset();

  await reveal(demo('tip-right'));
  await move(1, 300);
  await p.click(demo('tip-right'));
  await sleep(600);
  t.check(await p.eval(`return document.activeElement === document.querySelector('[data-demo="tip-right"]')`) && (await tips()).length === 0, 'a mouse click focuses the trigger but shows no tooltip (pointerdown hides, mouse focus doesn\'t show)');
  await reset();

  // focus-only trigger ignores hover.
  await reveal(demo('tip-focus'));
  await hoverAt(demo('tip-focus'));
  await sleep(500);
  t.check((await tips()).length === 0, "trigger: 'focus' doesn't show on hover");
  await reset();

  // ---- Names and disabled triggers ----
  t.check(await p.eval(`return document.querySelector('[data-demo="tip-nameless"]').getAttribute('aria-label') === 'Channel settings'`), 'an icon button with no name gets aria-label from the tooltip text');
  await reveal(demo('tip-nameless'));
  await hoverAt(demo('tip-nameless'));
  await sleep(450);
  t.check((await tips()).join() === 'Channel settings' && await p.eval(`return !document.querySelector('[data-demo="tip-nameless"]').hasAttribute('aria-describedby')`), 'a labelling tooltip shows but adds no duplicate aria-describedby');
  await reset();

  await reveal(demo('tip-disabled'));
  await hoverAt(demo('tip-disabled'));
  await sleep(450);
  t.check((await tips()).join() === 'Only channel admins can delete a channel', 'showWhenDisabled: an aria-disabled button explains itself on hover');
  await move(1, 300);
  await sleep(1100);
  await hoverAt(demo('tip-disabled-off'));
  await sleep(450);
  t.check((await tips()).length === 0, 'an aria-disabled trigger shows no tooltip without the opt-in');
  await p.eval(`document.querySelector('[data-demo="tip-disabled-off"]').focus()`);
  await p.key('Tab', { shift: true });
  t.check((await tips()).join() === 'Only channel admins can delete a channel', 'the aria-disabled trigger stays focusable, and keyboard focus shows its explanation');
  await reset();

  // ---- Scroll hides; pointerdown hides ----
  await reveal(demo('tip-left'));
  await p.eval(`document.querySelector('[data-demo="tip-top"]').focus()`);
  await p.key('Tab'); await p.key('Tab');
  t.check((await tips()).join() === 'Placed left', 'placement left (keyboard)');
  t.check(await p.eval(`return document.querySelector('.yui-portal .tooltip:not([data-exiting])').dataset.placement === 'left'`), 'placement left is applied');
  await p.eval(`window.scrollBy(0, 40)`);
  await sleep(250);
  t.check((await tipCount()) === 0, 'scrolling hides the tooltip');
  await reset();

  // ---- Flip near the edges ----
  await reveal(demo('tip-edge-left'));
  await hoverAt(demo('tip-edge-left'));
  await sleep(450);
  const flipL = await p.eval(`const tip = document.querySelector('.yui-portal .tooltip'); return tip && { placement: tip.dataset.placement, left: tip.getBoundingClientRect().left }`);
  t.check(flipL && flipL.placement === 'right', 'placement left flips to the right at the page edge', flipL);
  await reset();
  // Put the bottom-placed trigger 20px above the viewport's bottom edge.
  await p.eval(`const b = document.querySelector('[data-demo="tip-edge-bottom"]'); window.scrollBy(0, b.getBoundingClientRect().bottom - (document.documentElement.clientHeight - 20));`);
  await sleep(100);
  await hoverAt(demo('tip-edge-bottom'));
  await sleep(450);
  const flipB = await p.eval(`const tip = document.querySelector('.yui-portal .tooltip'), b = document.querySelector('[data-demo="tip-edge-bottom"]'); return tip && { placement: tip.dataset.placement, above: tip.getBoundingClientRect().bottom <= b.getBoundingClientRect().top }`);
  t.check(flipB && flipB.placement === 'top' && flipB.above, 'placement bottom flips to the top near the viewport bottom', flipB);
  await reset();

  // ---- Arrow ----
  await reveal(demo('tip-arrow-bottom'));
  await hoverAt(demo('tip-arrow-bottom'));
  await sleep(450);
  const arrow = await p.eval(`
    const tip = document.querySelector('.yui-portal .tooltip'), b = document.querySelector('[data-demo="tip-arrow-bottom"]');
    const svg = tip.querySelector('[data-slot="overlay-arrow"]'), ar = svg.getBoundingClientRect(), br = b.getBoundingClientRect(), tr = tip.getBoundingClientRect();
    return { rotate: getComputedStyle(svg).rotate, gap: Math.round(tr.top - br.bottom), centered: Math.abs((ar.left + ar.width / 2) - (br.left + br.width / 2)) < 2, touches: ar.bottom >= tr.top - 1 && ar.top < tr.top };`);
  t.check(arrow.rotate === '180deg' && arrow.gap === 7 && arrow.centered && arrow.touches, 'showArrow: arrow points at the trigger, offset 7 with the arrow', arrow);
  await reset();

  // ---- Popover ----
  await reveal(demo('pop-help'));
  await p.click(demo('pop-help'));
  await sleep(200);
  const pop = await p.eval(`
    const b = document.querySelector('[data-demo="pop-help"]'), d = document.querySelector('.yui-portal .popover__dialog');
    const hd = d && document.getElementById(d.getAttribute('aria-labelledby'));
    return d && { expanded: b.getAttribute('aria-expanded'), haspopup: b.getAttribute('aria-haspopup'), controls: b.getAttribute('aria-controls') === d.id,
      role: d.getAttribute('role'), label: hd && hd.textContent, focusInside: d.contains(document.activeElement), focused: document.activeElement.getAttribute('aria-label'),
      placement: d.parentElement.dataset.placement, below: d.parentElement.getBoundingClientRect().top >= b.getBoundingClientRect().bottom };`);
  t.check(pop && pop.expanded === 'true' && pop.haspopup === 'dialog' && pop.controls, 'click opens it: aria-expanded="true", aria-haspopup="dialog", aria-controls', pop);
  t.check(pop && pop.role === 'dialog' && pop.label === 'Channel roles', 'role="dialog" labelled by its heading', pop);
  t.check(pop && pop.focusInside && pop.focused === 'Close', 'focus moves into the popover (first focusable)', pop);
  t.check(pop && pop.placement === 'bottom' && pop.below, 'opens below the trigger by default', pop);
  t.check(await logText('popover') === 'Channel roles opened', 'onOpenChange(true) is logged');
  await p.key('Escape');
  await sleep(50);
  const afterEsc = await p.eval(`const b = document.querySelector('[data-demo="pop-help"]'); return { expanded: b.getAttribute('aria-expanded'), focus: document.activeElement === b, exiting: document.querySelector('.yui-portal .popover')?.dataset.exiting }`);
  t.check(afterEsc.expanded === 'false' && afterEsc.focus, 'Escape closes it and focus returns to the trigger', afterEsc);
  t.check(afterEsc.exiting === 'true', 'the exit animation runs (data-exiting)', afterEsc);
  await sleep(300);
  t.check(await p.eval(`return document.querySelector('.yui-portal').children.length === 0`), 'no nodes are left in the portal after closing');
  t.check(await logText('popover') === 'Channel roles closed', 'onOpenChange(false) is logged');

  // Close button.
  await p.click(demo('pop-help'));
  await sleep(150);
  await p.key('Enter'); // focus is on the close button
  await sleep(50);
  t.check(!(await popOpen()) && await p.eval(`return document.activeElement === document.querySelector('[data-demo="pop-help"]')`), 'the close button (slot="close") closes it and returns focus');
  await sleep(300);

  // Keyboard open with Enter, then outside click.
  await p.key('Enter');
  await sleep(150);
  t.check(await popOpen(), 'Enter on the trigger opens it');
  await p.clickAt(900, 200);
  await sleep(100);
  const afterOut = await p.eval(`const b = document.querySelector('[data-demo="pop-help"]'); return { expanded: b.getAttribute('aria-expanded'), focus: document.activeElement === b }`);
  t.check(!(await popOpen()) && afterOut.expanded === 'false' && afterOut.focus, 'an outside click closes it and focus returns to the trigger', afterOut);
  await sleep(300);

  // Clicking the trigger again toggles it closed.
  await p.click(demo('pop-help'));
  await sleep(150);
  await p.click(demo('pop-help'));
  await sleep(100);
  t.check(!(await popOpen()), 'clicking the trigger again closes it');
  await sleep(300);

  // Tab past the end closes it and moves on to the next control after the trigger.
  await p.click(demo('pop-help'));
  await sleep(150);
  await p.key('Tab'); // close → link
  t.check(await p.eval(`return document.activeElement.classList.contains('link')`), 'Tab moves within the popover');
  await p.key('Tab'); // past the end
  await sleep(50);
  const tabOut = await p.eval(`return { open: !!document.querySelector('.yui-portal .popover:not([data-exiting])'), next: document.activeElement.dataset.demo }`);
  t.check(!tabOut.open && tabOut.next === 'pop-form', 'Tab past the end closes it and focus moves on to the next control after the trigger', tabOut);
  await sleep(300);

  // The form popover: focus goes to the first field; submit closes.
  await p.key('Enter');
  await sleep(150);
  t.check(await p.eval(`return document.activeElement.id === 'yui-demo-status'`), 'the form popover focuses its first field');
  await p.type('Lunch');
  await p.key('Enter');
  await sleep(100);
  t.check(!(await popOpen()) && (await logText('popover')) === 'Saved status "Lunch"', 'submitting the form closes it and logs the value', await logText('popover'));
  t.check(await p.eval(`return document.activeElement.dataset.demo === 'pop-form'`), 'focus returns to the trigger after the form closes it');
  await sleep(300);

  // Repositions after the page scrolls.
  await p.eval(`window.__spacer = YapUI.h('div', { style: { height: '2000px' } }); document.body.append(__spacer);`);
  await reveal(demo('pop-top'));
  await p.click(demo('pop-top'));
  await sleep(200);
  const before = await p.eval(`const b = document.querySelector('[data-demo="pop-top"]').getBoundingClientRect(), f = document.querySelector('.yui-portal .popover').getBoundingClientRect(); return { b: b.top, f: f.top, placement: document.querySelector('.yui-portal .popover').dataset.placement }`);
  await p.eval(`window.scrollBy(0, 60)`);
  await sleep(100);
  const after = await p.eval(`const b = document.querySelector('[data-demo="pop-top"]').getBoundingClientRect(), f = document.querySelector('.yui-portal .popover').getBoundingClientRect(); return { b: b.top, f: f.top }`);
  t.check(before.placement === 'top' && Math.abs((before.f - before.b) - (after.f - after.b)) < 1 && after.b !== before.b, 'the popover follows its trigger when the page scrolls', { before, after });
  await p.key('Escape');
  await sleep(300);

  // Popover flips near the bottom edge.
  await p.eval(`const b = document.querySelector('[data-demo="pop-edge"]'); window.scrollBy(0, b.getBoundingClientRect().bottom - (document.documentElement.clientHeight - 30));`);
  await sleep(50);
  const er = await rect(demo('pop-edge'));
  await move(er.x, er.y);
  await p.clickAt(er.x, er.y);
  await sleep(200);
  const flipP = await p.eval(`const f = document.querySelector('.yui-portal .popover'), b = document.querySelector('[data-demo="pop-edge"]'); return f && { placement: f.dataset.placement, above: f.getBoundingClientRect().bottom <= b.getBoundingClientRect().top, rotate: getComputedStyle(f.querySelector('[data-slot="popover-overlay-arrow"]')).rotate }`);
  t.check(flipP && flipP.placement === 'top' && flipP.above, 'the popover flips above its trigger near the viewport bottom', flipP);
  await p.key('Escape');
  await sleep(300);
  await p.eval(`__spacer.remove(); window.scrollTo(0, 0)`);

  // A tooltip on a popover trigger: an outside click with both open closes both.
  await p.eval(`
    const b = YapUI.h('button', { type: 'button', class: 'button button--secondary', id: 'combo', text: 'Combo' });
    document.querySelector('#popover .gallery-example__demo').append(b);
    window.__combo = { tip: YapUI.Tooltip(b, { content: 'Combo tip' }), pop: YapUI.Popover(b, { heading: 'Combo', children: YapUI.h('button', { type: 'button', class: 'button button--sm', id: 'combo-inner', text: 'Inner' }) }) };
    const inner = __combo.pop.dialog.querySelector('#combo-inner'); window.__innerTip = YapUI.Tooltip(inner, { content: 'Inner tip' });`);
  await reveal('#combo');
  await p.click('#combo');
  await sleep(150);
  t.check(await popOpen() && await p.eval(`return document.activeElement.id === 'combo-inner'`), 'popover with a tooltip on its trigger opens on click');
  await p.eval(`__innerTip.open()`);
  await p.clickAt(900, 120);
  await sleep(350);
  t.check(!(await popOpen()) && (await tipCount()) === 0, 'one outside click closes both a tooltip and the popover beneath it');
  await p.eval(`__combo.tip.destroy(); __combo.pop.destroy(); __innerTip.destroy(); document.getElementById('combo').remove();`);
  t.check(await p.eval(`const b = document.querySelector('#combo'); return !b && document.querySelector('.yui-portal').children.length === 0`), 'destroy() cleans up');

  // Controller API.
  const api = await p.eval(`
    const b = document.querySelector('[data-demo="pop-form"]');
    const c = YapUI.Popover(document.body.appendChild(YapUI.h('button', { type: 'button', id: 'api', text: 'API' })), { heading: 'API' });
    const events = [];
    const c2 = YapUI.Popover(document.body.appendChild(YapUI.h('button', { type: 'button', id: 'api2', text: 'API 2' })), { heading: 'API 2', onOpenChange: (o) => events.push(o) });
    c2.open(); const a = c2.isOpen(); c2.toggle(); const b2 = c2.isOpen(); c2.toggle(); c2.close();
    const tip = YapUI.Tooltip(document.getElementById('api'), { content: 'one' });
    tip.open(); tip.setContent('two'); const text = document.querySelector('.yui-portal .tooltip').textContent; tip.close();
    c.destroy(); c2.destroy(); tip.destroy();
    document.getElementById('api').remove(); document.getElementById('api2').remove();
    await new Promise(r => setTimeout(r, 300));
    return { a, b2, events, text, left: document.querySelector('.yui-portal').children.length };`);
  t.check(api.a === true && api.b2 === false && JSON.stringify(api.events) === '[true,false,true,false]', 'Popover controller: open/toggle/close/isOpen and onOpenChange', api);
  t.check(api.text === 'two' && api.left === 0, 'Tooltip controller: open/setContent/close; nothing left in the portal', api);

  // ---- Reduced motion ----
  await p.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  const rm = await p.eval(`
    const b = document.querySelector('[data-demo="tip-top"]');
    const tip = YapUI.Tooltip(b, { content: 'reduced' });
    tip.open();
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    const el = document.querySelector('.yui-portal .tooltip:last-child');
    const entering = el.dataset.entering;
    tip.close();
    const removedAtOnce = !el.isConnected;
    tip.destroy();
    return { entering: entering ?? null, removedAtOnce };`);
  t.check(rm.entering === null && rm.removedAtOnce, 'reduced motion skips the enter and exit animations', rm);
  await p.send('Emulation.setEmulatedMedia', { features: [] });
  await reset();

  // ---- axe and screenshots, light and dark, with overlays open ----
  for (const theme of ['light', 'dark']) {
    await p.theme(theme);
    await reset();
    await t.axe('#tooltip', `tooltip section (${theme})`);
    await t.axe('#popover', `popover section (${theme})`);

    // Tooltip open with arrow, via keyboard.
    await reveal(demo('tip-arrow-top'));
    await p.eval(`document.querySelector('[data-demo="tip-top"]').focus()`);
    for (let i = 0; i < 4; i++) await p.key('Tab'); // → tip-arrow-top
    await sleep(250);
    t.check((await tips()).length === 1, `tooltip open for audit (${theme})`);
    await t.axe('.yui-portal', `open tooltip (${theme})`);
    await t.axe('#tooltip', `tooltip section with a tooltip open (${theme})`);
    await p.screenshot(`${t.shots}/overlays-tooltip-${theme}.png`);
    await p.key('Escape');

    // Toolbar shortcut tooltip.
    await reveal(demo('tip-bold'));
    await hoverAt(demo('tip-bold'));
    await sleep(450);
    await p.screenshot(`${t.shots}/overlays-tooltip-shortcut-${theme}.png`);
    await reset();
    await reveal(demo('tip-disabled'));
    await hoverAt(demo('tip-disabled'));
    await sleep(450);
    await p.screenshot(`${t.shots}/overlays-tooltip-disabled-${theme}.png`);
    await reset();

    // Popovers.
    await reveal(demo('pop-help'));
    await p.click(demo('pop-help'));
    await sleep(250);
    await t.axe('.yui-portal', `open popover (${theme})`);
    await t.axe('#popover', `popover section with a popover open (${theme})`);
    await p.screenshot(`${t.shots}/overlays-popover-${theme}.png`);
    await p.key('Escape');
    await sleep(250);
    await p.click(demo('pop-form'));
    await sleep(250);
    await t.axe('.yui-portal', `open form popover (${theme})`);
    await p.screenshot(`${t.shots}/overlays-popover-form-${theme}.png`);
    await p.key('Escape');
    await sleep(250);
    await p.click(demo('pop-left'));
    await sleep(250);
    await p.screenshot(`${t.shots}/overlays-popover-left-${theme}.png`);
    await p.key('Escape');
    await sleep(250);
  }
  await p.theme('light');
}
