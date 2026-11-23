// Dialogs: Modal and AlertDialog. Real keyboard and mouse through the harness.
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export default async function (t) {
  const p = t.page;
  await p.goto(t.url + '?theme=light');

  const count = () => p.eval(`return document.querySelectorAll('.yui-portal [role=dialog], .yui-portal [role=alertdialog]').length`);
  const portalEmpty = () => p.waitFor(`document.querySelector('.yui-portal') && document.querySelector('.yui-portal').children.length === 0`, 'portal to empty');
  const top = `(() => { const all = document.querySelectorAll('.yui-portal [role=dialog], .yui-portal [role=alertdialog]'); return all[all.length - 1]; })()`;
  const open = async (id, n = 1) => {
    await p.click('#' + id);
    await p.waitFor(`document.querySelectorAll('.yui-portal [role=dialog], .yui-portal [role=alertdialog]').length === ${n} && !document.querySelector('.yui-portal [data-entering]')`, 'dialog from #' + id);
  };
  const logText = (sec) => p.eval(`return document.querySelector('#${sec} .gallery-log').textContent`);

  // ---------- opening and focus ----------

  await open('modal-primary-focus');
  const aria = await p.eval(`
    const d = ${top};
    return { role: d.getAttribute('role'), modal: d.getAttribute('aria-modal'),
      label: document.getElementById(d.getAttribute('aria-labelledby'))?.textContent,
      desc: document.getElementById(d.getAttribute('aria-describedby'))?.textContent,
      close: d.querySelector('.modal__close-trigger').getAttribute('aria-label'),
      locked: document.documentElement.dataset.yuiScrollLocked,
      inert: document.querySelector('.gallery-main').inert && document.querySelector('.gallery-head').inert };`);
  t.check(aria.role === 'dialog' && aria.modal === 'true', 'modal has role="dialog" and aria-modal="true"', aria);
  t.check(aria.label === 'Rename channel?' && /Everyone in the channel/.test(aria.desc || ''), 'aria-labelledby names the heading, aria-describedby the description', aria);
  t.check(aria.close === 'Close', 'the X is labelled "Close"', aria);
  t.check(aria.locked === 'true' && aria.inert, 'opening makes the page inert and locks scroll', aria);
  t.check((await p.focused()).includes('"Rename"'), 'no body controls: focus starts on the primary action', await p.focused());
  await p.key('Escape');
  await portalEmpty();
  t.check((await p.focused()).startsWith('button#modal-primary-focus'), 'Escape closes and focus returns to the opener', await p.focused());
  t.check(/closed by escape/.test(await logText('modal')), 'onClose gets reason "escape"', await logText('modal'));

  await open('modal-initial');
  t.check((await p.focused()).startsWith('input#dlg-invite-user'), 'initialFocus selector gets focus', await p.focused());
  await p.key('Escape'); await portalEmpty();

  await open('modal-form');
  t.check((await p.focused()).startsWith('input#dlg-pw-current'), 'otherwise focus starts on the first control in the body', await p.focused());
  // Tab order: Close, current, new, Cancel, Change password, then wraps.
  const order = [];
  for (let i = 0; i < 5; i++) { await p.key('Tab'); order.push(await p.focused()); }
  t.check(order[0].startsWith('input#dlg-pw-new') && order[1].includes('"Cancel"') && order[2].includes('"Change password"') && order[3].includes('"Close"') && order[4].startsWith('input#dlg-pw-current'), 'Tab moves through the dialog and wraps from last to first', order);
  await p.key('Tab', { shift: true });
  await p.key('Tab', { shift: true });
  t.check((await p.focused()).includes('"Change password"'), 'Shift+Tab wraps from first to last', await p.focused());
  // Validation keeps it open (onPress returns false).
  await p.key('Enter');
  const invalid = await p.eval(`return { n: document.querySelectorAll('.yui-portal [role=dialog]').length, inv: document.getElementById('dlg-pw-new')?.getAttribute('aria-invalid'), err: document.getElementById('dlg-pw-error')?.textContent, log: document.querySelector('#modal .gallery-log').textContent }`);
  t.check(invalid.n === 1 && invalid.inv === 'true' && invalid.err, 'a form action that returns false keeps the modal open and shows the error', invalid);
  await p.click('#dlg-pw-current'); await p.type('old-secret');
  await p.click('#dlg-pw-new'); await p.type('new-secret-123');
  await p.key('Enter'); // submits the form → primary action
  t.check(await p.eval(`return document.querySelector('.modal__footer .button--primary').dataset.pending === 'true'`), 'an async action shows pending while it runs');
  await portalEmpty();
  t.check(/change password: closed by action → "changed"/.test(await logText('modal')), 'the async action closes with its value', await logText('modal'));
  t.check((await p.focused()).startsWith('button#modal-form'), 'focus returns to the opener after an action', await p.focused());

  await open('modal-destructive');
  t.check((await p.focused()).includes('"Cancel"'), 'destructive modal: focus starts on Cancel', await p.focused());
  await p.key('Escape'); await portalEmpty();

  // Inert background: a click on a page button does nothing.
  await p.eval(`window.__bgClicks = 0; document.getElementById('modal-size-xs').addEventListener('click', () => __bgClicks++);`);
  await open('modal-locked');
  await p.click('#modal-size-xs');
  await p.eval(`document.getElementById('modal-size-xs').focus()`);
  t.check(await p.eval('return __bgClicks') === 0 && await count() === 1, 'clicking a background button does nothing while a modal is open');
  t.check(await p.eval(`return ${top}.contains(document.activeElement)`), 'focus can\'t move to the page behind');
  await p.key('Escape');
  t.check(await count() === 1, 'isKeyboardDismissDisabled: Escape does not close');
  await p.clickAt(10, 450);
  t.check(await count() === 1, 'isDismissable: false: a backdrop click does not close');
  await p.click('.modal__footer .button--primary');
  await portalEmpty();

  // ---------- closing ----------

  await open('modal-size-md');
  await p.clickAt(10, 450);
  await portalEmpty();
  t.check(/closed by backdrop/.test(await logText('modal')), 'a backdrop click closes a dismissable modal', await logText('modal'));
  t.check((await p.focused()).startsWith('button#modal-size-md'), 'focus returns after a backdrop click', await p.focused());

  await open('modal-size-sm');
  await p.click('.modal__close-trigger');
  await portalEmpty();
  t.check(/closed by close-button/.test(await logText('modal')), 'the X closes the modal');

  await open('modal-slot');
  const slotAria = await p.eval(`const d = ${top}; return { label: d.getAttribute('aria-label'), by: d.getAttribute('aria-labelledby') }`);
  t.check(slotAria.label === 'Keyboard shortcuts' && !slotAria.by, 'without a title the dialog is named by aria-label', slotAria);
  await p.click('.yui-portal [slot="close"]');
  await portalEmpty();
  t.check(/slot close: closed by close-button → "got-it"/.test(await logText('modal')), 'a slot="close" button closes it with its value', await logText('modal'));

  const threw = await p.eval(`try { YapUI.Modal.open({ body: document.createElement('p') }); return 'no'; } catch (e) { return e instanceof TypeError ? 'yes' : String(e); }`);
  t.check(threw === 'yes' && await count() === 0, 'Modal.open without a title or aria-label throws', threw);

  // Nested
  await open('modal-nested');
  await p.click('#modal-nested-second');
  await p.waitFor(`document.querySelectorAll('.yui-portal [role=dialog]').length === 2`, 'second dialog');
  t.check(await p.eval(`const b = document.querySelectorAll('.yui-portal .modal__backdrop'); return b[0].inert && !b[1].inert`), 'nested: the lower modal is inert while another is on top');
  await p.click('#modal-nested-second'); // the lower one's button, now covered
  t.check(await count() === 2, 'nested: the lower modal ignores clicks');
  await p.key('Escape');
  await p.waitFor(`document.querySelectorAll('.yui-portal .modal__backdrop').length === 1`, 'top modal to go');
  t.check(await count() === 1 && await p.eval(`return !document.querySelector('.yui-portal .modal__backdrop').inert`), 'nested: Escape closes only the top one, and the lower one is live again');
  t.check((await p.focused()).startsWith('button#modal-nested-second'), 'nested: focus returns to the button in the first modal', await p.focused());
  await p.key('Escape');
  await portalEmpty();
  t.check((await p.focused()).startsWith('button#modal-nested'), 'nested: second Escape closes the first', await p.focused());

  // Opened from a menu that has since closed.
  await p.click('#modal-menu-trigger');
  await p.click('#modal-demo-menu-item');
  await p.waitFor(`document.querySelectorAll('.yui-portal [role=dialog]').length === 1 && !document.getElementById('modal-demo-menu')`, 'modal from menu');
  await p.key('Escape');
  await portalEmpty();
  t.check((await p.focused()).startsWith('button#modal-menu-trigger'), 'opened from a menu item: focus returns to the menu button', await p.focused());

  // ---------- AlertDialog ----------

  await open('ad-delete');
  const ad = await p.eval(`const d = ${top}; return { role: d.getAttribute('role'), modal: d.getAttribute('aria-modal'), title: document.getElementById(d.getAttribute('aria-labelledby'))?.textContent, desc: document.getElementById(d.getAttribute('aria-describedby'))?.textContent, x: !!d.querySelector('.alert-dialog__close-trigger'), icon: d.querySelector('.alert-dialog__icon--danger') !== null, confirm: d.querySelector('.alert-dialog__footer .button:last-child').className }`);
  t.check(ad.role === 'alertdialog' && ad.modal === 'true' && ad.title === 'Delete this message?' && ad.desc === 'This can\'t be undone.', 'alert dialog has role="alertdialog", aria-modal, label and description', ad);
  t.check(ad.icon && /button--danger/.test(ad.confirm), 'danger confirmation has the danger icon and a danger confirm button', ad);
  t.check((await p.focused()).includes('"Cancel"'), 'destructive confirm: focus starts on Cancel', await p.focused());
  await p.clickAt(10, 450);
  t.check(await count() === 1, 'an alert dialog is not dismissed by a backdrop click');
  await p.key('Tab');
  t.check((await p.focused()).includes('"Delete"'), 'Tab reaches Delete');
  await p.key('Enter');
  await portalEmpty();
  t.check(await logText('alert-dialog') === 'delete → true', 'confirm resolves true on the confirm button', await logText('alert-dialog'));
  t.check((await p.focused()).startsWith('button#ad-delete'), 'focus returns to the opener', await p.focused());

  await open('ad-leave');
  t.check((await p.focused()).includes('"Leave"'), 'non-destructive confirm: focus starts on the primary action', await p.focused());
  await p.key('Tab', { shift: true });
  await p.key('Enter');
  await portalEmpty();
  t.check(await logText('alert-dialog') === 'leave → false', 'confirm resolves false on Cancel', await logText('alert-dialog'));

  await open('ad-leave');
  await p.key('Escape');
  await portalEmpty();
  t.check(await logText('alert-dialog') === 'leave → false', 'confirm resolves false on Escape');

  await open('ad-ban');
  t.check((await p.focused()).startsWith('input#'), 'type-to-confirm: focus starts in the field', await p.focused());
  const banBtn = '.yui-portal .alert-dialog__footer .button:last-child';
  t.check(await p.eval(`return document.querySelector('${banBtn}').getAttribute('aria-disabled') === 'true'`), 'type-to-confirm: Ban starts aria-disabled');
  await p.click(banBtn);
  await p.key('Enter');
  t.check(await count() === 1, 'a disabled confirm button ignores clicks');
  await p.click('.yui-portal .yui-type-to-confirm input');
  await p.type('alic');
  t.check(await p.eval(`return document.querySelector('${banBtn}').getAttribute('aria-disabled') === 'true'`), 'type-to-confirm: still disabled with "alic"');
  await p.key('Enter');
  t.check(await count() === 1, 'Enter in the field does nothing until the text matches');
  await p.type('e');
  t.check(await p.eval(`return !document.querySelector('${banBtn}').hasAttribute('aria-disabled')`), 'type-to-confirm: enabled once "alice" matches');
  await p.key('Enter');
  await portalEmpty();
  t.check(await logText('alert-dialog') === 'ban → true', 'Enter in the matched field confirms', await logText('alert-dialog'));

  await open('ad-alert');
  t.check((await p.focused()).includes('"Close"'), 'alert(): focus on its one button', await p.focused());
  await p.key('Enter');
  await portalEmpty();
  t.check(await logText('alert-dialog') === 'alert → closed', 'alert() resolves (undefined) on close', await logText('alert-dialog'));

  // ---------- results ----------

  const once = await p.eval(`
    let calls = 0, thens = 0;
    const m = YapUI.Modal.open({ title: 'Once', onClose: () => calls++ });
    m.closed.then(() => thens++);
    const a = m.close('a'); const b = m.close('b');
    const r = await m.closed;
    await new Promise((res) => setTimeout(res, 50));
    return { r, calls, thens, same: a === b && a === m.closed };`);
  t.check(once.r === 'a' && once.calls === 1 && once.thens === 1 && once.same, 'closed resolves once, with the first result; onClose runs once', once);
  await portalEmpty();
  t.check(await p.eval(`return !document.documentElement.dataset.yuiScrollLocked && !document.querySelector('.gallery-main').inert && !document.querySelector('[inert]')`), 'after closing: no nodes in the portal, scroll unlocked, nothing inert');

  const anim = await p.eval(`
    const m = YapUI.Modal.open({ title: 'Anim' });
    await new Promise((r) => setTimeout(r, 350));
    m.close();
    const during = m.root.isConnected && m.root.dataset.exiting === 'true';
    await m.closed;
    return { during, after: m.root.isConnected };`);
  t.check(anim.during && !anim.after, 'the exit animation runs, then the DOM is removed', anim);

  await p.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  const reduced = await p.eval(`
    const m = YapUI.Modal.open({ title: 'Reduced' });
    m.close();
    return !m.root.isConnected;`);
  t.check(reduced, 'reduced motion: closing removes the dialog at once');
  await p.send('Emulation.setEmulatedMedia', { features: [] });

  // ---------- quality: axe and screenshots ----------

  for (const theme of ['light', 'dark']) {
    await p.theme(theme);
    await open('modal-form');
    await t.axe('.yui-portal', `open modal (${theme})`);
    await p.screenshot(`${t.shots}/dialogs-modal-${theme}.png`);
    await p.key('Escape'); await portalEmpty();

    await open('ad-ban');
    await t.axe('.yui-portal', `open alert dialog (${theme})`);
    await p.type('ali');
    await p.screenshot(`${t.shots}/dialogs-alert-${theme}.png`);
    await p.key('Escape'); await portalEmpty();

    await open('ad-delete');
    await p.screenshot(`${t.shots}/dialogs-alert-delete-${theme}.png`);
    await p.key('Escape'); await portalEmpty();
    await t.axe('#modal', `modal section (${theme})`);
    await t.axe('#alert-dialog', `alert-dialog section (${theme})`);
  }
  await p.theme('light');

  for (const [id, name] of [['modal-scroll-inside', 'scroll-inside'], ['modal-scroll-outside', 'scroll-outside'], ['modal-size-cover', 'cover'], ['modal-placement-top', 'top'], ['modal-backdrop-blur', 'blur']]) {
    await open(id);
    await p.screenshot(`${t.shots}/dialogs-${name}.png`);
    await p.key('Escape'); await portalEmpty();
  }

  await p.viewport(390, 800, true);
  await sleep(100);
  await open('modal-form');
  await p.screenshot(`${t.shots}/dialogs-mobile-modal.png`);
  await p.key('Escape'); await portalEmpty();
  await open('ad-delete');
  await p.screenshot(`${t.shots}/dialogs-mobile-alert.png`);
  await p.key('Escape'); await portalEmpty();
  await open('modal-scroll-inside');
  await p.screenshot(`${t.shots}/dialogs-mobile-scroll.png`);
  await p.key('Escape'); await portalEmpty();
  await p.viewport(1280, 900);

}
