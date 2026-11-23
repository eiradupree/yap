'use strict';

// dialogs components: Modal and AlertDialog. See ui-build/docs/dialogs.md.
//
// Both render HeroUI's markup (modal.css / alert-dialog.css):
//   .modal__backdrop > .modal__container > .modal__dialog[role=dialog]
//     > .modal__close-trigger, .modal__header (> .modal__icon, .modal__heading),
//       .modal__body, .modal__footer
// and follow the WAI-ARIA APG Dialog (Modal) and Alert Dialog patterns.
(() => {
  const YapUI = window.YapUI;
  const { h, uid, icons } = YapUI;

  const SIZES = ['xs', 'sm', 'md', 'lg', 'cover', 'full'];
  const PLACEMENTS = ['auto', 'center', 'top', 'bottom'];
  const BACKDROPS = ['opaque', 'blur', 'transparent'];
  const STATUSES = ['default', 'accent', 'success', 'warning', 'danger'];
  const DANGER_VARIANTS = ['danger', 'danger-soft'];

  const pick = (value, allowed, fallback) => (allowed.includes(value) ? value : fallback);

  // A HeroUI button (button.css). The actions family owns YapUI.Button; this
  // stays local so dialogs don't depend on it.
  function button({ label, variant = 'tertiary', size, isDisabled, class: extra, ...rest }) {
    const b = h('button', {
      type: 'button',
      class: ['button', 'button--' + variant, size && 'button--' + size, extra],
      'data-slot': 'button',
      aria: { disabled: isDisabled ? 'true' : null },
      ...rest,
    }, label);
    return b;
  }

  const isDisabled = (el) => el.getAttribute('aria-disabled') === 'true' || el.disabled || el.dataset.pending === 'true';

  // Where focus should go back to on close. The opener may be a menu item
  // whose menu has closed by then, so also remember the controls that own the
  // overlay it sits in (the menu button), and fall back to those.
  function returnTargets(explicit) {
    const out = [];
    if (explicit) out.push(explicit);
    const active = document.activeElement;
    if (active && active !== document.body) {
      out.push(active);
      for (let el = active.parentElement; el && el !== document.body; el = el.parentElement) {
        if (el.id) {
          const id = CSS.escape(el.id);
          for (const owner of document.querySelectorAll(`[aria-controls~="${id}"], [aria-owns~="${id}"]`)) out.push(owner);
        }
        const by = el.getAttribute('aria-labelledby');
        if (by && /^(menu|listbox|dialog|tree|grid)$/.test(el.getAttribute('role') || '')) {
          for (const id of by.split(/\s+/)) { const t = document.getElementById(id); if (t) out.push(t); }
        }
      }
    }
    return out;
  }

  function restoreFocus(targets) {
    for (const t of targets) {
      if (!t.isConnected || t.closest('[inert]') || t.getClientRects().length === 0) continue;
      t.focus({ preventScroll: true });
      if (document.activeElement === t) return t;
    }
    return null;
  }

  // Open dialogs, bottom to top.
  const stack = [];

  // The shared engine behind Modal.open and AlertDialog.
  function openDialog(o, kind) {
    const b = kind; // BEM block: 'modal' or 'alert-dialog'
    const title = o.title;
    const ariaLabel = o['aria-label'] || o.ariaLabel;
    if (!title && !ariaLabel) throw new TypeError(`YapUI.${b === 'modal' ? 'Modal.open' : 'AlertDialog'}: pass a title, or an aria-label when there's no visible title`);

    const size = pick(o.size, b === 'modal' ? SIZES : SIZES.slice(0, 5), 'md');
    const placement = pick(o.placement, PLACEMENTS, 'auto');
    const scroll = b === 'modal' ? pick(o.scroll, ['inside', 'outside'], 'inside') : 'inside';
    const backdropVariant = pick(o.backdrop, BACKDROPS, 'opaque');
    const isDismissable = o.isDismissable ?? (b === 'modal');
    const isKeyboardDismissDisabled = o.isKeyboardDismissDisabled ?? false;
    const showClose = o.showCloseButton ?? (b === 'modal');

    const headingId = uid(b + '-heading');
    const descId = uid(b + '-desc');

    // Header
    let header = null;
    if (title || o.icon) {
      let icon = null;
      if (o.icon) {
        icon = h('div', { class: [b + '__icon', o.status && b === 'alert-dialog' && `${b}__icon--${o.status}`], 'data-slot': b + '-icon', aria: { hidden: 'true' } });
        if (typeof o.icon === 'string') icon.innerHTML = o.icon; // static markup from our own code (icons)
        else icon.append(o.icon);
        const svg = icon.querySelector('svg');
        if (svg && b === 'alert-dialog') svg.setAttribute('data-slot', 'alert-dialog-default-icon');
      }
      header = h('div', { class: b + '__header', 'data-slot': b + '-header' },
        icon,
        title && h('h2', { id: headingId, class: b + '__heading', 'data-slot': b + '-heading' }, title));
    }

    // Body
    const bodyNodes = [];
    if (o.description) bodyNodes.push(h('p', { id: descId, class: 'yui-dialog-description' }, o.description));
    if (o.body) bodyNodes.push(o.body);
    const body = bodyNodes.length ? h('div', {
      class: [b + '__body', b === 'modal' && `modal__body--scroll-${scroll}`],
      'data-slot': b + '-body',
    }, ...bodyNodes) : null;

    // Footer
    let ctrl; // assigned below; actions refer to it
    const actionButtons = [];
    let footer = null;
    if (o.actions && o.actions.length) {
      for (const a of o.actions) {
        const btn = button({ label: a.label, variant: a.variant || 'tertiary', isDisabled: a.isDisabled, data: a.data });
        btn._yuiAction = a;
        actionButtons.push(btn);
      }
      footer = h('div', { class: b + '__footer', 'data-slot': b + '-footer' }, actionButtons);
    } else if (o.footer) {
      footer = h('div', { class: b + '__footer', 'data-slot': b + '-footer' }, o.footer);
    }

    const closeBtn = showClose ? h('button', {
      type: 'button',
      class: ['close-button', 'close-button--default', b + '__close-trigger'],
      'data-slot': b + '-close-trigger',
      aria: { label: 'Close' },
      html: icons.close,
    }) : null;

    const dialog = h('section', {
      class: [b + '__dialog', `${b}__dialog--${size}`, b === 'modal' && `modal__dialog--scroll-${scroll}`, o.class],
      'data-slot': b + '-dialog',
      'data-placement': placement,
      role: b === 'alert-dialog' ? 'alertdialog' : 'dialog',
      tabindex: '-1',
      aria: {
        modal: 'true',
        labelledby: title ? headingId : null,
        label: title ? null : ariaLabel,
        describedby: o.description ? descId : (o['aria-describedby'] || null),
      },
    }, closeBtn, header, body, footer);

    const container = h('div', {
      class: [b + '__container', b === 'modal' && scroll === 'outside' && 'modal__container--scroll-outside', size === 'full' && 'modal__container--full', `yui-dialog-container--${size}`],
      'data-slot': b + '-container',
      'data-placement': placement,
    }, dialog);

    const backdrop = h('div', {
      class: [b + '__backdrop', `${b}__backdrop--${backdropVariant}`],
      'data-slot': b + '-backdrop',
    }, container);

    // ---- state ----
    let state = 'open'; // open → closing → closed
    let resolveClosed;
    const closed = new Promise((r) => { resolveClosed = r; });
    const returnTo = returnTargets(o.returnFocus);

    // Mount, then isolate the rest of the page and trap focus.
    YapUI.portal().append(backdrop);
    const vv = window.visualViewport;
    const setVh = () => backdrop.style.setProperty('--visual-viewport-height', (vv ? vv.height : window.innerHeight) + 'px');
    setVh();
    if (vv) vv.addEventListener('resize', setVh);
    const undoIsolate = YapUI.isolate(backdrop);
    const releaseTrap = YapUI.trapFocus(dialog);
    const removeLayer = YapUI.pushLayer({
      el: dialog,
      dismissOnOutside: false, // the backdrop handles its own clicks below
      dismissOnEscape: !isKeyboardDismissDisabled,
      onDismiss: (reason) => close(undefined, reason),
    });
    const entry = { dialog, backdrop };
    stack.push(entry);

    // Backdrop presses: dismiss when both press and release land outside the
    // dialog (so a text selection dragged out of the dialog doesn't close it).
    // Keep focus where it is either way.
    let pressedOutside = false;
    backdrop.addEventListener('pointerdown', (e) => {
      pressedOutside = !dialog.contains(e.target);
      if (pressedOutside && e.target === backdrop && e.offsetX >= backdrop.clientWidth) return; // scrollbar
      if (pressedOutside) e.preventDefault();
    });
    backdrop.addEventListener('click', (e) => {
      const outside = pressedOutside && !dialog.contains(e.target);
      pressedOutside = false;
      if (outside && isDismissable && stack[stack.length - 1] === entry) close(undefined, 'backdrop');
    });

    // Activation: action buttons, slot="close" buttons and the X.
    dialog.addEventListener('click', async (e) => {
      const t = e.target instanceof Element ? e.target : null;
      if (!t || state !== 'open') return;
      if (closeBtn && closeBtn.contains(t)) { close(undefined, 'close-button'); return; }
      const actionBtn = t.closest('button');
      if (actionBtn && actionBtn._yuiAction) {
        e.preventDefault();
        if (isDisabled(actionBtn)) return;
        const a = actionBtn._yuiAction;
        const value = 'value' in a ? a.value : a.label;
        let keep = false;
        if (a.onPress) {
          let r = a.onPress(e, ctrl);
          if (r && typeof r.then === 'function') {
            actionBtn.dataset.pending = 'true';
            actionBtn.setAttribute('aria-busy', 'true');
            try { r = await r; } catch { r = false; }
            delete actionBtn.dataset.pending;
            actionBtn.removeAttribute('aria-busy');
          }
          keep = r === false;
        }
        if (!keep && a.closes !== false) close(value, 'action');
        return;
      }
      const slotted = t.closest('[slot="close"]');
      if (slotted && dialog.contains(slotted)) {
        if (isDisabled(slotted)) { e.preventDefault(); return; }
        close(slotted.value || undefined, 'close-button');
      }
    });

    // ---- initial focus ----
    function initialTarget() {
      const q = (sel) => (typeof sel === 'string' ? dialog.querySelector(sel) : sel instanceof Element ? sel : null);
      if (o.initialFocus) { const t = q(o.initialFocus); if (t) return t; }
      const auto = actionButtons.find((btn) => btn._yuiAction.autoFocus);
      if (auto) return auto;
      const marked = dialog.querySelector('[autofocus], [data-autofocus]');
      if (marked) return marked;
      // Destructive confirmations start on the least destructive action (PF).
      const destructive = o.isDestructive ?? actionButtons.some((btn) => DANGER_VARIANTS.includes(btn._yuiAction.variant));
      if (destructive) {
        const safe = actionButtons.find((btn) => !DANGER_VARIANTS.includes(btn._yuiAction.variant) && !isDisabled(btn));
        if (safe) return safe;
      }
      if (body) { const f = YapUI.focusables(body)[0]; if (f) return f; }
      if (footer) {
        const items = YapUI.focusables(footer);
        if (items.length) return items[items.length - 1]; // primary action is last
      }
      return dialog;
    }
    const focusInitial = () => {
      const t = initialTarget();
      t.focus({ preventScroll: true });
      if (document.activeElement !== t) dialog.focus({ preventScroll: true });
    };
    focusInitial();
    // Something that closes after us (a menu returning focus to its button)
    // can't move focus out, since the page is inert; but if focus ended up on
    // <body>, put it back.
    requestAnimationFrame(() => { if (state === 'open' && !dialog.contains(document.activeElement) && stack[stack.length - 1] === entry) focusInitial(); });

    YapUI.enter(backdrop);
    YapUI.enter(container);

    // ---- closing ----
    function close(result, reason = 'api') {
      if (state !== 'open') return closed;
      state = 'closing';
      // Close anything stacked above this dialog first.
      for (let i = stack.length - 1; i >= 0 && stack[i] !== entry; i--) stack[i].ctrl.close(undefined, 'parent');
      releaseTrap();
      removeLayer();
      if (vv) vv.removeEventListener('resize', setVh);
      stack.splice(stack.indexOf(entry), 1);
      undoIsolate();
      backdrop.inert = true; // no more input while it animates out
      restoreFocus(returnTo);
      if (o.onClose) { try { o.onClose(reason, result); } catch (err) { setTimeout(() => { throw err; }); } }
      let pending = 2;
      const done = () => {
        if (--pending) return;
        backdrop.remove();
        state = 'closed';
        resolveClosed(result);
      };
      YapUI.exit(container, done);
      YapUI.exit(backdrop, done);
      return closed;
    }

    ctrl = { el: dialog, root: backdrop, close: (result) => close(result, 'api'), closed };
    entry.ctrl = { close };
    if (o.onOpen) o.onOpen(ctrl);
    return ctrl;
  }

  // Modal.open(options) → { el, root, close(result), closed: Promise<result> }
  //   title          visible heading (string or node). Without it, aria-label is required.
  //   aria-label     accessible name when there's no visible title.
  //   description    short text under the heading; becomes aria-describedby.
  //   body           node(s) for the body.
  //   actions        [{ label, variant = 'tertiary', onPress(event, ctrl), autoFocus,
  //                    closes = true, value = label, isDisabled }]. onPress may return
  //                    false (or a Promise of false) to keep the modal open; a Promise
  //                    marks the button pending until it settles.
  //   footer         node(s) for the footer instead of actions. Buttons with
  //                    slot="close" close the modal.
  //   icon           node or static icon markup (YapUI.icons.x) in the header.
  //   size           'xs' | 'sm' | 'md' | 'lg' | 'cover' | 'full'   (md)
  //   placement      'auto' | 'center' | 'top' | 'bottom'           (auto)
  //   scroll         'inside' | 'outside'                           (inside)
  //   backdrop       'opaque' | 'blur' | 'transparent'              (opaque)
  //   isDismissable  close on a backdrop click                      (true)
  //   isKeyboardDismissDisabled  ignore Escape                      (false)
  //   showCloseButton  the X in the corner                          (true)
  //   initialFocus   selector or element to focus first.
  //   isDestructive  start focus on the least destructive action (default: when an
  //                    action has a danger variant).
  //   returnFocus    element to focus on close (default: whatever was focused).
  //   onClose(reason, result)  reason: 'escape' | 'backdrop' | 'close-button' |
  //                    'action' | 'api' | 'parent'.
  const Modal = { open: (options) => openDialog(options || {}, 'modal') };

  // The body of a type-to-confirm AlertDialog: a labelled text field.
  function typeToConfirmField(text, onMatch, onSubmit) {
    const id = uid('yui-confirm-input');
    const input = h('input', {
      id, class: ['input', 'input--secondary', 'input--full-width'], 'data-slot': 'input',
      type: 'text', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false',
    });
    input.addEventListener('input', () => onMatch(input.value === text));
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); onSubmit(); } });
    const label = h('label', { class: 'label', for: id, 'data-slot': 'label' }, 'Type ', h('strong', { class: 'yui-confirm-text' }, text), ' to confirm');
    return { el: h('div', { class: ['textfield', 'textfield--full-width', 'yui-type-to-confirm'], 'data-slot': 'textfield' }, label, input), input };
  }

  // AlertDialog.confirm(options) → Promise<boolean>. A drop-in for confirm().
  //   title          the question, e.g. 'Delete this message?' (required, or aria-label)
  //   description    one to three lines of consequences.
  //   status         'default' | 'accent' | 'success' | 'warning' | 'danger'  (default)
  //   confirmLabel   action verb matching the title ('Delete')   (required in spirit; 'Confirm')
  //   cancelLabel    ('Cancel')
  //   typeToConfirm  text the person must type before confirm is enabled.
  //   isDestructive  focus Cancel first (default: status === 'danger').
  //   size, placement, backdrop, isDismissable (false), isKeyboardDismissDisabled (false)
  function confirm(options = {}) {
    const status = pick(options.status, STATUSES, 'default');
    const danger = status === 'danger';
    const destructive = options.isDestructive ?? danger;
    let field = null, confirmBtn = null, ctrl = null;
    const submit = () => { if (confirmBtn && !isDisabled(confirmBtn)) confirmBtn.click(); };
    if (options.typeToConfirm) {
      field = typeToConfirmField(String(options.typeToConfirm), (ok) => {
        if (ok) confirmBtn.removeAttribute('aria-disabled'); else confirmBtn.setAttribute('aria-disabled', 'true');
      }, submit);
    }
    const actions = [
      { label: options.cancelLabel || 'Cancel', variant: 'tertiary', value: false },
      { label: options.confirmLabel || 'Confirm', variant: danger ? 'danger' : 'primary', value: true, isDisabled: !!field },
    ];
    ctrl = openDialog({
      ...options,
      status,
      icon: options.icon ?? icons[status],
      body: field ? field.el : options.body,
      actions,
      // Destructive confirmations start on Cancel; type-to-confirm starts in its field.
      isDestructive: field ? false : destructive,
      initialFocus: options.initialFocus || (field ? field.input : null),
      onOpen(c) {
        const btns = c.el.querySelectorAll('.alert-dialog__footer .button');
        confirmBtn = btns[btns.length - 1];
      },
    }, 'alert-dialog');
    return ctrl.closed.then((v) => v === true);
  }

  // AlertDialog.alert(options) → Promise<void>. One acknowledgement button.
  //   title, description, status, actionLabel ('Close'), size, placement, backdrop.
  function alert(options = {}) {
    const status = pick(options.status, STATUSES, 'default');
    const ctrl = openDialog({
      ...options,
      status,
      icon: options.icon ?? icons[status],
      actions: [{ label: options.actionLabel || 'Close', variant: 'primary' }],
    }, 'alert-dialog');
    return ctrl.closed.then(() => undefined);
  }

  // AlertDialog.open(options) → the same controller as Modal.open, with
  // HeroUI's alert-dialog markup and role="alertdialog", for custom footers.
  const AlertDialog = {
    confirm, alert,
    open: (options = {}) => openDialog({ ...options, status: pick(options.status, STATUSES, 'default'), icon: options.icon ?? icons[pick(options.status, STATUSES, 'default')] }, 'alert-dialog'),
  };

  Object.assign(YapUI, { Modal, AlertDialog });
})();
