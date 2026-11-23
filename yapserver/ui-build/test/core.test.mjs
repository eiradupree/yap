// The shared core: theme, positioning, layers, isolation, focus trap.
export default async function (t) {
  const p = t.page;
  await p.goto(t.url + '?theme=light');

  t.check(await p.eval(`return getComputedStyle(document.querySelector('.gallery-theme__btn')).cursor === 'pointer'`), 'gallery loads with HeroUI styles');
  t.check(await p.eval(`return getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() === '#5b4fd6'`), 'light theme uses Yap purple as the accent');
  await p.click('.gallery-theme__btn:nth-child(2)');
  t.check(await p.eval(`return document.documentElement.dataset.theme === 'dark' && document.documentElement.classList.contains('dark') && getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() === '#8a80ff'`), 'dark button switches HeroUI and Yap to dark');
  await p.theme('light');

  // position(): flips when there's no room, clamps to the viewport.
  const pos = await p.eval(`
    const a = YapUI.h('button', { text: 'anchor', style: { position: 'fixed', left: '20px', top: '10px' } });
    const f = YapUI.h('div', { text: 'floating', style: { width: '200px', height: '80px' } });
    document.body.append(a, f);
    const side1 = YapUI.position(f, a, { placement: 'top' });
    const r1 = f.getBoundingClientRect();
    a.style.top = '850px';
    const side2 = YapUI.position(f, a, { placement: 'bottom start' });
    const r2 = f.getBoundingClientRect();
    a.remove(); f.remove();
    return { side1, side2, left1: r1.left, top2: r2.top, origin: f.style.getPropertyValue('--trigger-anchor-point') };`);
  t.check(pos.side1 === 'bottom' && pos.side2 === 'top', 'position() flips to the side with room', pos);
  t.check(pos.left1 >= 8, 'position() keeps the element inside the viewport', pos);
  t.check(/px .*px/.test(pos.origin), 'position() sets --trigger-anchor-point', pos);

  // Layers: Escape dismisses only the top one.
  const esc = await p.eval(`
    window.__dismissed = [];
    const a = YapUI.h('div', { text: 'a' }), b = YapUI.h('div', { text: 'b' });
    document.body.append(a, b);
    window.__rmA = YapUI.pushLayer({ el: a, onDismiss: (r) => __dismissed.push('a:' + r) });
    window.__rmB = YapUI.pushLayer({ el: b, onDismiss: (r) => { __dismissed.push('b:' + r); __rmB(); } });
    return true;`);
  await p.key('Escape');
  t.check(JSON.stringify(await p.eval('return __dismissed')) === '["b:escape"]', 'Escape dismisses only the topmost layer');
  await p.clickAt(600, 600);
  t.check(JSON.stringify(await p.eval('return __dismissed')) === '["b:escape","a:outside"]', 'a click outside dismisses the next layer');
  await p.eval('__rmA()');

  // isolate(): background becomes inert; trapFocus keeps Tab inside.
  await p.eval(`
    const box = YapUI.h('div', { id: 'trap' }, YapUI.h('button', { id: 'in1', text: 'one' }), YapUI.h('button', { id: 'in2', text: 'two' }));
    YapUI.portal().append(box);
    window.__undo = YapUI.isolate(box);
    window.__release = YapUI.trapFocus(box);
    document.getElementById('in2').focus();`);
  await p.key('Tab');
  t.check((await p.focused()).startsWith('button#in1'), 'Tab wraps from the last to the first element');
  await p.key('Tab', { shift: true });
  t.check((await p.focused()).startsWith('button#in2'), 'Shift+Tab wraps from the first to the last element');
  t.check(await p.eval(`return document.querySelector('.gallery-main').inert && document.documentElement.dataset.yuiScrollLocked === 'true'`), 'isolate() makes the page inert and locks scrolling');
  await p.eval(`__release(); __undo(); document.getElementById('trap').remove();`);
  t.check(await p.eval(`return !document.querySelector('.gallery-main').inert && !document.documentElement.dataset.yuiScrollLocked`), 'undoing isolate() restores the page');

  await t.axe('.gallery-head', 'gallery header');
}
