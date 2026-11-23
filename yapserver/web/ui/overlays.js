'use strict';

// overlays components: Tooltip and Popover. See ui-build/docs/overlays.md.
//
// Both attach to an existing trigger element and return a controller. They
// render HeroUI's markup (.tooltip, .popover > .popover__dialog) into
// YapUI.portal(), position it with YapUI.position / autoUpdate, and animate
// with YapUI.enter / exit. The overlay element exists only while it's open.
(() => {
  const YapUI = window.YapUI;
  const { h, uid } = YapUI;

  // ---- shared helpers ----

  // The arrow. HeroUI styles the <svg> by data-slot (fill, stroke, and a
  // rotation per data-placement); the wrapper places it on the right edge.
  // The path points down, which is right for placement "top".
  function arrow(slot) {
    return h('div', { class: 'yui-overlay-arrow', aria: { hidden: 'true' },
      html: `<svg data-slot="${slot}" width="12" height="6" viewBox="0 0 12 6" focusable="false"><path d="M0 0 L6 6 L12 0"/></svg>` });
  }

  // place positions the overlay and points its arrow at the trigger's center.
  function place(el, trigger, opts) {
    const side = YapUI.position(el, trigger, { placement: opts.placement, offset: opts.offset, flip: opts.flip });
    const arrowEl = el.querySelector(':scope > .yui-overlay-arrow');
    if (arrowEl) {
      const a = trigger.getBoundingClientRect(), f = el.getBoundingClientRect();
      const inset = 12; // keep the arrow clear of the rounded corners
      if (side === 'top' || side === 'bottom') {
        const x = Math.max(inset, Math.min(f.width - inset, a.left + a.width / 2 - f.left));
        el.style.setProperty('--yui-arrow-x', Math.round(x) + 'px');
      } else {
        const y = Math.max(inset, Math.min(f.height - inset, a.top + a.height / 2 - f.top));
        el.style.setProperty('--yui-arrow-y', Math.round(y) + 'px');
      }
    }
    return side;
  }

  const isDisabledEl = (el) => el.disabled === true || el.getAttribute('aria-disabled') === 'true';

  function addToken(el, attr, token) {
    const list = (el.getAttribute(attr) || '').split(/\s+/).filter(Boolean);
    if (!list.includes(token)) list.push(token);
    el.setAttribute(attr, list.join(' '));
  }
  function removeToken(el, attr, token) {
    const list = (el.getAttribute(attr) || '').split(/\s+/).filter((t) => t && t !== token);
    if (list.length) el.setAttribute(attr, list.join(' ')); else el.removeAttribute(attr);
  }

  // Does el have an accessible name apart from a tooltip? A good-enough check
  // for buttons and links: aria-label, aria-labelledby, title, text, img alt.
  function hasName(el) {
    if ((el.getAttribute('aria-label') || '').trim() || el.hasAttribute('aria-labelledby') || (el.getAttribute('title') || '').trim()) return true;
    if ((el.textContent || '').trim()) return true;
    return [...el.querySelectorAll('img[alt]')].some((img) => img.alt.trim());
  }

  function setChildren(el, content) {
    el.replaceChildren();
    YapUI.append(el, [content]);
  }

  // ---- Tooltip ----

  // One tooltip shows at a time. Once one has shown, the next one hovered
  // within WARM_MS of it closing shows without the delay (React Aria's warm-up).
  const WARM_MS = 500;
  let current = null; // the open tooltip's internal state
  let warm = false;
  let coolTimer = 0;

  function warmUp() { warm = true; clearTimeout(coolTimer); }
  function coolDown() { clearTimeout(coolTimer); coolTimer = setTimeout(() => { warm = false; }, WARM_MS); }

  // Tooltip(trigger, options) attaches a tooltip to trigger and returns
  // { open(), close(), update(), setContent(x), setDisabled(bool), isOpen(), destroy() }.
  // Options:
  //   content            string or Node (the caller builds nodes; never HTML strings)
  //   delay              ms before showing on hover (300; HeroUI's default is 1500)
  //   closeDelay         ms before hiding after the pointer leaves (500)
  //   trigger            'hover' (hover or keyboard focus) | 'focus' (keyboard focus only)
  //   placement          'top' | 'bottom' | 'left' | 'right', optionally + ' start' / ' end' ('top')
  //   offset             gap to the trigger in px (3, or 7 with the arrow)
  //   showArrow          draw HeroUI's arrow (false)
  //   shouldFlip         flip to the opposite side when there's no room (true)
  //   isDisabled         never show (false)
  //   showWhenDisabled   show even when the trigger is disabled / aria-disabled,
  //                      to explain why (false)
  //   class              extra classes on the .tooltip element
  //   onOpenChange(isOpen)
  // If the trigger has no accessible name, the tooltip's text becomes its
  // aria-label; otherwise the open tooltip is linked with aria-describedby.
  function Tooltip(trigger, options = {}) {
    const o = { content: '', delay: 300, closeDelay: 500, trigger: 'hover', placement: 'top', showArrow: false, shouldFlip: true, isDisabled: false, showWhenDisabled: false, ...options };
    const id = uid('yui-tooltip');
    const s = { el: null, openTimer: 0, closeTimer: 0, hoveringTrigger: false, hoveringTip: false, suppressed: false, cleanup: [] };
    let content = o.content;
    let labels = false; // the tooltip text is the trigger's aria-label

    function syncLabel() {
      if (labels || !hasName(trigger)) {
        const text = typeof content === 'string' ? content : (content && content.textContent) || '';
        if (text.trim()) { trigger.setAttribute('aria-label', text.trim()); labels = true; }
      }
    }
    syncLabel();
    if (o.showWhenDisabled) trigger.dataset.yuiTooltipDisabled = 'true';

    const canShow = () => !o.isDisabled && (o.showWhenDisabled || !isDisabledEl(trigger)) && trigger.isConnected && content !== '' && content != null;

    function clearTimers() { clearTimeout(s.openTimer); clearTimeout(s.closeTimer); s.openTimer = s.closeTimer = 0; }

    function update() {
      if (s.el) place(s.el, trigger, { placement: o.placement, offset: o.offset ?? (o.showArrow ? 7 : 3), flip: o.shouldFlip });
    }

    function show() {
      clearTimers();
      if (s.el || !canShow()) return;
      if (current && current !== s) current.hide(true);
      const el = h('div', { class: ['tooltip', o.class], role: 'tooltip', id },
        o.showArrow && arrow('overlay-arrow'),
        h('div', { class: 'yui-tooltip__content' }, content));
      el.addEventListener('pointerenter', () => { s.hoveringTip = true; clearTimeout(s.closeTimer); });
      el.addEventListener('pointerleave', () => { s.hoveringTip = false; scheduleClose(); });
      s.el = el;
      YapUI.portal().append(el);
      update();
      YapUI.enter(el);
      if (!labels) addToken(trigger, 'aria-describedby', id);
      current = s;
      warmUp();
      // Escape hides it. Outside presses are handled by onWindowDown below,
      // which runs first, so this layer never blocks one beneath it.
      const removeLayer = YapUI.pushLayer({ el, trigger, dismissOnOutside: false, onDismiss: () => hide() });
      // Scrolling hides it, once the trigger has actually moved (a scroll
      // event queued before it opened shouldn't close it).
      const at = trigger.getBoundingClientRect();
      const onScroll = (e) => {
        if (e.target instanceof Node && el.contains(e.target)) return;
        const r = trigger.getBoundingClientRect();
        if (Math.abs(r.top - at.top) > 1 || Math.abs(r.left - at.left) > 1) hide();
      };
      window.addEventListener('scroll', onScroll, true);
      const stopAuto = YapUI.autoUpdate(update); // resize keeps it attached
      s.cleanup = [removeLayer, () => window.removeEventListener('scroll', onScroll, true), stopAuto];
      if (o.onOpenChange) o.onOpenChange(true);
    }

    // hide(immediate): immediate skips the exit animation (another tooltip
    // is replacing this one).
    function hide(immediate = false) {
      clearTimers();
      const el = s.el;
      if (!el) return;
      s.el = null;
      s.hoveringTip = false;
      for (const fn of s.cleanup) fn();
      s.cleanup = [];
      if (!labels) removeToken(trigger, 'aria-describedby', id);
      if (current === s) { current = null; coolDown(); }
      if (immediate) el.remove(); else YapUI.exit(el, () => el.remove());
      if (o.onOpenChange) o.onOpenChange(false);
    }
    s.hide = hide;

    function scheduleOpen() {
      clearTimeout(s.closeTimer);
      if (s.el || s.openTimer) return;
      if (warm || (current && current !== s)) { show(); return; }
      s.openTimer = setTimeout(() => { s.openTimer = 0; show(); }, o.delay);
    }
    function scheduleClose() {
      clearTimeout(s.openTimer); s.openTimer = 0;
      if (!s.el || s.hoveringTrigger || s.hoveringTip) return;
      clearTimeout(s.closeTimer);
      s.closeTimer = setTimeout(() => hide(), o.closeDelay);
    }

    const on = (target, type, fn, opt) => { target.addEventListener(type, fn, opt); s.cleanupTrigger.push(() => target.removeEventListener(type, fn, opt)); };
    s.cleanupTrigger = [];
    on(trigger, 'pointerenter', (e) => {
      if (e.pointerType !== 'mouse' || o.trigger !== 'hover') return;
      s.hoveringTrigger = true;
      if (!s.suppressed) scheduleOpen();
    });
    on(trigger, 'pointerleave', (e) => {
      if (e.pointerType !== 'mouse') return;
      s.hoveringTrigger = false;
      s.suppressed = false;
      if (document.activeElement === trigger && s.el && YapUI.isKeyboardFocus()) return; // still focused by keyboard
      scheduleClose();
    });
    on(trigger, 'focus', () => { if (YapUI.isKeyboardFocus()) show(); });
    on(trigger, 'blur', () => hide());
    // Pressing the trigger hides it until the pointer leaves (React Aria).
    on(trigger, 'keydown', (e) => { if ((e.key === 'Enter' || e.key === ' ') && s.el) hide(true); });
    // Any press hides it. Capture on window runs before core's layer handler
    // on document, so a popover beneath this tooltip still sees the press.
    on(window, 'pointerdown', (e) => {
      if (e.target instanceof Node && trigger.contains(e.target)) { s.suppressed = true; hide(true); clearTimers(); return; }
      if (s.el && !(e.target instanceof Node && s.el.contains(e.target))) hide(true);
    }, true);

    return {
      open: show,
      close: () => hide(),
      update,
      isOpen: () => !!s.el,
      setContent(x) {
        content = x;
        syncLabel();
        if (s.el) { setChildren(s.el.querySelector('.yui-tooltip__content'), x); update(); }
        if (s.el && !canShow()) hide();
      },
      setDisabled(v) { o.isDisabled = !!v; if (v) hide(true); },
      destroy() {
        hide(true);
        for (const fn of s.cleanupTrigger) fn();
        s.cleanupTrigger = [];
        if (labels) trigger.removeAttribute('aria-label');
        delete trigger.dataset.yuiTooltipDisabled;
      },
    };
  }

  // ---- Popover ----

  const isCloseButton = (t) => t instanceof Element && t.closest('[slot="close"], [data-yui-close]');

  // Popover(trigger, options) attaches a click-to-open, non-modal dialog to
  // trigger and returns { open(), close(), toggle(), isOpen(), update(), destroy(), el, dialog }.
  // Options:
  //   children / content  the dialog's contents: string, Node or array. Use
  //                       Popover.Heading(text) for the title; it labels the dialog.
  //   heading             shortcut: a string rendered as Popover.Heading first
  //   aria-label          the dialog's name when there's no heading
  //   placement           'top' | 'bottom' | 'left' | 'right' (+ ' start' / ' end') ('bottom')
  //   offset              gap to the trigger in px (8)
  //   shouldFlip          flip when there's no room (true)
  //   showArrow           draw HeroUI's arrow (false)
  //   isOpen/defaultOpen  open once the trigger is in the page (false); doesn't move focus
  //   initialFocus        selector to focus on open (default: first focusable, else the dialog)
  //   class               extra classes on the .popover element
  //   onOpenChange(isOpen)
  // Any element inside with slot="close" (or data-yui-close) closes it.
  function Popover(trigger, options = {}) {
    const o = { placement: 'bottom', offset: 8, shouldFlip: true, showArrow: false, ...options };
    const dialogId = uid('yui-popover');
    const dialog = h('div', { class: 'popover__dialog', role: 'dialog', id: dialogId, tabindex: '-1', aria: { label: o['aria-label'] } },
      typeof o.heading === 'string' ? Popover.Heading(o.heading) : o.heading,
      o.children ?? o.content);
    const el = h('div', { class: ['popover', o.class] }, o.showArrow && arrow('popover-overlay-arrow'), dialog);
    const heading = dialog.querySelector('.popover__heading');
    if (heading) {
      if (!heading.id) heading.id = uid('yui-popover-heading');
      dialog.setAttribute('aria-labelledby', heading.id);
    }

    trigger.setAttribute('aria-haspopup', 'dialog');
    trigger.setAttribute('aria-expanded', 'false');

    let open = false;
    let cleanup = [];

    function update() {
      if (open) place(el, trigger, { placement: o.placement, offset: o.offset, flip: o.shouldFlip });
    }

    function show({ focus = true } = {}) {
      if (open || isDisabledEl(trigger) || !trigger.isConnected) return;
      open = true;
      // A previous close may still be animating out.
      el.remove();
      delete el.dataset.exiting;
      YapUI.portal().append(el);
      update();
      YapUI.enter(el);
      trigger.setAttribute('aria-expanded', 'true');
      trigger.setAttribute('aria-controls', dialogId);
      const removeLayer = YapUI.pushLayer({ el, trigger, onDismiss: (reason) => hide(reason) });
      const stopAuto = YapUI.autoUpdate(update);
      el.addEventListener('keydown', onKeydown);
      el.addEventListener('focusout', onFocusOut);
      el.addEventListener('click', onClick);
      cleanup = [removeLayer, stopAuto,
        () => el.removeEventListener('keydown', onKeydown),
        () => el.removeEventListener('focusout', onFocusOut),
        () => el.removeEventListener('click', onClick)];
      if (focus) YapUI.focusFirst(dialog, o.initialFocus);
      if (o.onOpenChange) o.onOpenChange(true);
    }

    // hide(reason): 'escape' and 'close' return focus to the trigger;
    // 'outside' does so only if the press didn't focus something else;
    // 'tab' and 'blur' leave focus where it went.
    function hide(reason = 'close') {
      if (!open) return;
      open = false;
      for (const fn of cleanup) fn();
      cleanup = [];
      const hadFocus = el.contains(document.activeElement);
      trigger.setAttribute('aria-expanded', 'false');
      trigger.removeAttribute('aria-controls');
      YapUI.exit(el, () => { if (!open) el.remove(); });
      if (reason === 'escape' || (reason === 'close' && (hadFocus || document.activeElement === document.body))) trigger.focus({ preventScroll: true });
      else if (reason === 'outside') {
        // The press hasn't moved focus yet; wait and see where it lands.
        setTimeout(() => {
          const a = document.activeElement;
          if (!a || a === document.body || el.contains(a)) trigger.focus({ preventScroll: true });
        }, 0);
      }
      if (o.onOpenChange) o.onOpenChange(false);
    }

    // Tab past the last element closes and moves on to whatever follows the
    // trigger; Shift+Tab before the first goes back to the trigger.
    function onKeydown(e) {
      if (e.key !== 'Tab' || e.defaultPrevented) return;
      const items = YapUI.focusables(dialog);
      const a = document.activeElement;
      const atEnd = items.length === 0 || a === items[items.length - 1];
      const atStart = items.length === 0 || a === items[0] || a === dialog;
      if (e.shiftKey && atStart) {
        e.preventDefault();
        hide('tab');
        trigger.focus();
      } else if (!e.shiftKey && atEnd) {
        e.preventDefault();
        hide('tab');
        const page = YapUI.focusables(document.body).filter((x) => !x.closest('.yui-portal'));
        const i = page.indexOf(trigger);
        (page[i + 1] || trigger).focus();
      }
    }

    function onFocusOut(e) {
      const to = e.relatedTarget;
      if (to instanceof Node && !el.contains(to) && !trigger.contains(to)) hide('blur');
    }

    function onClick(e) { if (isCloseButton(e.target)) hide('close'); }

    function onTriggerClick(e) {
      if (isDisabledEl(trigger)) return;
      e.preventDefault();
      if (open) hide('close'); else show();
    }
    trigger.addEventListener('click', onTriggerClick);

    if (o.isOpen || o.defaultOpen) requestAnimationFrame(() => show({ focus: false }));

    return {
      el, dialog,
      open: () => show(),
      close: () => hide('close'),
      toggle: () => (open ? hide('close') : show()),
      isOpen: () => open,
      update,
      destroy() {
        if (open) { open = false; for (const fn of cleanup) fn(); cleanup = []; }
        el.remove();
        trigger.removeEventListener('click', onTriggerClick);
        for (const a of ['aria-haspopup', 'aria-expanded', 'aria-controls']) trigger.removeAttribute(a);
      },
    };
  }

  // Popover.Heading(text or {children, level}) → <h3 class="popover__heading">.
  // The first heading inside a popover names its dialog.
  Popover.Heading = (x, level = 3) => h('h' + level, { class: 'popover__heading' }, x);

  // Popover.Dialog is the .popover__dialog element; Popover builds it for
  // you. Exposed so callers can match HeroUI's anatomy in their own markup.
  Popover.Dialog = (...children) => h('div', { class: 'popover__dialog' }, ...children);

  Object.assign(YapUI, { Tooltip, Popover });
})();
