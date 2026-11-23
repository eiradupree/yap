'use strict';

// Gallery sections for dialogs: Modal and AlertDialog.
(() => {
  const { h, gallery, Modal, AlertDialog } = YapUI;
  const { section, example, log } = gallery;

  // A HeroUI button (the actions family's YapUI.Button is built separately).
  const btn = (label, variant, id, onClick) => {
    const b = h('button', { type: 'button', class: ['button', 'button--' + variant], id }, label);
    b.addEventListener('click', onClick);
    return b;
  };

  const para = (text) => h('p', null, text);
  const lorem = 'Yap keeps every channel\'s history on the server you run. Messages, reactions and threads are stored in one SQLite file, so a backup is a copy of that file. ';
  const longBody = () => {
    const box = h('div', null, Array.from({ length: 14 }, (_, i) => para(`${i + 1}. ${lorem}${lorem}`)));
    box.style.display = 'grid';
    box.style.gap = '8px';
    return box;
  };

  const field = (id, label, type, autocomplete, extra) => h('div', { class: ['textfield', 'textfield--full-width'], 'data-slot': 'textfield' },
    h('label', { class: 'label', for: id, 'data-slot': 'label' }, label),
    h('input', { id, class: ['input', 'input--secondary'], 'data-slot': 'input', type, autocomplete, required: true, ...extra }));

  section('modal', 'Modal', 'A dialog that blocks the page until it is dealt with. Use it for input required to continue or short, direct decisions; not for nonessential information.', (body) => {
    const out = log();
    const record = (name) => (reason, result) => out.set(`${name}: closed by ${reason}${result !== undefined ? ' → ' + JSON.stringify(result) : ''}`);
    const basic = (name, opts = {}) => Modal.open({
      title: opts.title || 'Rename channel?',
      description: opts.description ?? 'Everyone in the channel sees the new name. Links to the old name keep working.',
      actions: [
        { label: 'Cancel', variant: 'tertiary' },
        { label: 'Rename', variant: 'primary' },
      ],
      onClose: record(name),
      ...opts,
    });

    body.append(example('Sizes',
      ...['xs', 'sm', 'md', 'lg', 'cover', 'full'].map((size) => btn(size, 'secondary', 'modal-size-' + size, () => basic('size ' + size, { size, title: `Size: ${size}` })))));

    body.append(example('Scroll with long content',
      btn('Scroll inside', 'secondary', 'modal-scroll-inside', () => Modal.open({ title: 'Server terms', body: longBody(), scroll: 'inside', actions: [{ label: 'Close', variant: 'tertiary' }, { label: 'Accept', variant: 'primary' }], onClose: record('scroll inside') })),
      btn('Scroll outside', 'secondary', 'modal-scroll-outside', () => Modal.open({ title: 'Server terms', body: longBody(), scroll: 'outside', actions: [{ label: 'Close', variant: 'tertiary' }, { label: 'Accept', variant: 'primary' }], onClose: record('scroll outside') }))));

    body.append(example('Placement',
      ...['auto', 'center', 'top', 'bottom'].map((placement) => btn(placement, 'secondary', 'modal-placement-' + placement, () => basic('placement ' + placement, { placement, title: `Placement: ${placement}` })))));

    body.append(example('Backdrop',
      ...['opaque', 'blur', 'transparent'].map((backdrop) => btn(backdrop, 'secondary', 'modal-backdrop-' + backdrop, () => basic('backdrop ' + backdrop, { backdrop, title: `Backdrop: ${backdrop}` })))));

    // Yap's "Change password" form, as a modal.
    body.append(example('Form: Change password',
      btn('Change password', 'primary', 'modal-form', () => {
        const error = h('p', { class: 'field-error', 'data-slot': 'field-error', role: 'alert', id: 'dlg-pw-error' });
        error.hidden = true; // so the empty error takes no grid gap
        const form = h('form', { class: 'yui-gallery-form', id: 'dlg-pw-form', novalidate: true },
          field('dlg-pw-current', 'Current password', 'password', 'current-password'),
          field('dlg-pw-new', 'New password', 'password', 'new-password', { minlength: '8', maxlength: '72', 'aria-describedby': 'dlg-pw-error' }),
          error);
        form.style.display = 'grid';
        form.style.gap = '12px';
        const m = Modal.open({
          title: 'Change password',
          description: 'Your other devices will be signed out.',
          body: form,
          actions: [
            { label: 'Cancel', variant: 'tertiary' },
            { label: 'Change password', variant: 'primary', value: 'changed', onPress: () => {
              const next = form.querySelector('#dlg-pw-new');
              if (!form.querySelector('#dlg-pw-current').value || next.value.length < 8) {
                error.hidden = false;
                error.textContent = 'Enter your current password and a new one of at least 8 characters.';
                error.dataset.visible = 'true';
                next.setAttribute('aria-invalid', 'true');
                return false; // keep the modal open
              }
              return new Promise((r) => setTimeout(r, 300)); // pretend to save
            } },
          ],
          onClose: record('change password'),
        });
        // Enter in a field runs the primary action (the form has no submit button of its own).
        form.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' && !e.isComposing && e.target.matches('input')) { e.preventDefault(); m.el.querySelector('.modal__footer .button--primary').click(); }
        });
      })));

    body.append(example('Nested',
      btn('Open nested', 'secondary', 'modal-nested', () => Modal.open({
        title: 'Channel settings',
        description: 'Opening another dialog from here stacks it on top. Escape closes only the top one.',
        body: btn('Open second', 'secondary', 'modal-nested-second', () => Modal.open({
          title: 'Second dialog',
          description: 'Press Escape: only this one closes.',
          actions: [{ label: 'Done', variant: 'primary' }],
          onClose: record('second'),
        })),
        actions: [{ label: 'Close', variant: 'tertiary' }],
        onClose: record('first'),
      }))));

    // Opened from a menu item: the menu is gone when the modal closes, so
    // focus goes back to the menu button.
    const menuBtn = h('button', { type: 'button', class: ['button', 'button--secondary'], id: 'modal-menu-trigger', aria: { haspopup: 'menu', expanded: 'false', controls: 'modal-demo-menu' } }, 'Menu');
    menuBtn.addEventListener('click', () => {
      const item = h('button', { type: 'button', role: 'menuitem', id: 'modal-demo-menu-item', class: 'menu-item', tabindex: '-1' }, 'Channel info…');
      const menu = h('div', { id: 'modal-demo-menu', role: 'menu', class: 'menu', aria: { labelledby: 'modal-menu-trigger' } }, item);
      menu.style.position = 'fixed';
      menu.style.padding = '4px';
      menu.style.background = 'var(--overlay)';
      menu.style.borderRadius = '12px';
      menu.style.boxShadow = 'var(--overlay-shadow)';
      YapUI.portal().append(menu);
      YapUI.position(menu, menuBtn, { placement: 'bottom start' });
      menuBtn.setAttribute('aria-expanded', 'true');
      item.addEventListener('click', () => {
        Modal.open({ title: 'Channel info', description: '#general · 12 members', actions: [{ label: 'Close', variant: 'primary' }], onClose: record('from menu') });
        menu.remove();
        menuBtn.setAttribute('aria-expanded', 'false');
      });
      item.focus();
    });

    body.append(example('Focus and dismissal',
      btn('initialFocus', 'secondary', 'modal-initial', () => Modal.open({
        title: 'Invite people',
        body: h('div', { class: ['textfield', 'textfield--full-width'] },
          h('label', { class: 'label', for: 'dlg-invite-note' }, 'Note'),
          h('input', { id: 'dlg-invite-note', class: ['input', 'input--secondary'], type: 'text' }),
          h('label', { class: 'label', for: 'dlg-invite-user' }, 'Username'),
          h('input', { id: 'dlg-invite-user', class: ['input', 'input--secondary'], type: 'text' })),
        initialFocus: '#dlg-invite-user',
        actions: [{ label: 'Cancel', variant: 'tertiary' }, { label: 'Invite', variant: 'primary' }],
        onClose: record('initial focus'),
      })),
      btn('No body controls', 'secondary', 'modal-primary-focus', () => basic('primary focus')),
      btn('Destructive actions', 'secondary', 'modal-destructive', () => Modal.open({
        title: 'Archive #random?',
        description: 'Archived channels are read-only for everyone.',
        actions: [{ label: 'Cancel', variant: 'tertiary' }, { label: 'Archive', variant: 'danger' }],
        onClose: record('destructive'),
      })),
      btn('Not dismissable', 'secondary', 'modal-locked', () => basic('not dismissable', { title: 'Finish setup', isDismissable: false, isKeyboardDismissDisabled: true, showCloseButton: false })),
      btn('slot="close" footer', 'secondary', 'modal-slot', () => Modal.open({
        'aria-label': 'Keyboard shortcuts',
        body: para('This dialog has no visible title, so it is named with aria-label.'),
        footer: [h('button', { type: 'button', class: ['button', 'button--primary'], slot: 'close', value: 'got-it' }, 'Got it')],
        onClose: record('slot close'),
      })),
      menuBtn));

    body.append(out);
  });

  section('alert-dialog', 'AlertDialog', 'A confirmation that interrupts on purpose: role="alertdialog", a question for a title, and a verb on the confirm button. AlertDialog.confirm() replaces window.confirm().', (body) => {
    const out = log();
    const run = (name, p) => p.then((v) => out.set(`${name} → ${v === undefined ? 'closed' : v}`));

    body.append(example('Confirmations',
      btn('Delete message', 'danger-soft', 'ad-delete', () => run('delete', AlertDialog.confirm({
        title: 'Delete this message?',
        description: 'This can\'t be undone.',
        status: 'danger',
        confirmLabel: 'Delete',
      }))),
      btn('Leave channel', 'secondary', 'ad-leave', () => run('leave', AlertDialog.confirm({
        title: 'Leave #general?',
        description: 'You can join again from the channel list.',
        confirmLabel: 'Leave',
      }))),
      btn('Ban user', 'danger-soft', 'ad-ban', () => run('ban', AlertDialog.confirm({
        title: 'Ban alice?',
        description: 'They\'ll be signed out and can\'t sign in again until unbanned.',
        status: 'danger',
        confirmLabel: 'Ban',
        typeToConfirm: 'alice',
      })))));

    body.append(example('Statuses',
      ...['default', 'accent', 'success', 'warning', 'danger'].map((status) => btn(status, 'secondary', 'ad-status-' + status, () => run(status, AlertDialog.confirm({
        title: { default: 'Mark all as read?', accent: 'Turn on notifications?', success: 'Publish the changes?', warning: 'Sign out everywhere?', danger: 'Delete the channel?' }[status],
        description: 'This is the ' + status + ' status.',
        status,
        confirmLabel: { default: 'Mark read', accent: 'Turn on', success: 'Publish', warning: 'Sign out', danger: 'Delete' }[status],
      }))))));

    body.append(example('Alert',
      btn('Show alert', 'secondary', 'ad-alert', () => run('alert', AlertDialog.alert({
        title: 'Couldn\'t delete the message',
        description: 'The server didn\'t respond. Check your connection and try again.',
        status: 'warning',
      })))));

    body.append(out);
  });
})();
