'use strict';

// Yap UI core: shared plumbing for the components in web/ui/.
//
// The components use HeroUI v3's stylesheet (vendor/heroui/heroui.css) and its
// BEM class names, data attributes and design tokens. HeroUI's own behavior
// layer is React Aria, which needs React 19; this file and the component files
// provide that behavior in plain JavaScript instead: positioning, focus
// management, dismissal, and enter/exit animation.
//
// Every file in web/ui/ is a classic script wrapped in an IIFE that adds to
// window.YapUI, so nothing else becomes a global (app.js and editor.js share
// the same global scope).
(() => {
  const YapUI = (window.YapUI = window.YapUI || {});

  // ---- elements ----

  // h builds an element. props: class (string or array), text, html (static
  // markup from our own code only, never user data), data: {…} → data-*,
  // aria: {…} → aria-*, on: {event: fn}, style: {prop: value} (applied via
  // CSSOM, which the Content-Security-Policy allows), and any other attribute.
  // Children may be nodes, strings (as text), arrays, or null/false (skipped).
  function h(tag, props, ...children) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(props || {})) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = Array.isArray(v) ? v.filter(Boolean).join(' ') : v;
      else if (k === 'text') el.textContent = v;
      else if (k === 'html') el.innerHTML = v;
      else if (k === 'data') for (const [dk, dv] of Object.entries(v)) { if (dv != null && dv !== false) el.dataset[dk] = dv === true ? 'true' : String(dv); }
      else if (k === 'aria') for (const [ak, av] of Object.entries(v)) { if (av != null) el.setAttribute('aria-' + ak, String(av)); }
      else if (k === 'on') for (const [ev, fn] of Object.entries(v)) el.addEventListener(ev, fn);
      else if (k === 'style') for (const [sk, sv] of Object.entries(v)) el.style.setProperty(sk.startsWith('--') ? sk : sk.replace(/[A-Z]/g, (c) => '-' + c.toLowerCase()), sv);
      else if (v === true) el.setAttribute(k, '');
      else el.setAttribute(k, String(v));
    }
    append(el, children);
    return el;
  }

  function append(el, children) {
    for (const c of children.flat(Infinity)) {
      if (c == null || c === false) continue;
      el.append(c instanceof Node ? c : document.createTextNode(String(c)));
    }
    return el;
  }

  // cx joins BEM classes: cx('button', {primary: true, sm: size === 'sm'})
  // → "button button--primary button--sm". Extra strings are appended as-is.
  function cx(block, mods, ...extra) {
    const out = [block];
    for (const [m, on] of Object.entries(mods || {})) if (on) out.push(`${block}--${m}`);
    for (const e of extra) if (e) out.push(e);
    return out.join(' ');
  }

  let nextId = 0;
  const uid = (prefix = 'yui') => `${prefix}-${++nextId}`;

  // ---- icons ----
  // Static markup from this file, 16px, stroke uses currentColor.
  const ico = (body, size = 16) => `<svg viewBox="0 0 24 24" width="${size}" height="${size}" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" data-slot="icon">${body}</svg>`;
  const icons = {
    close: ico('<path d="M6 6l12 12M18 6 6 18"/>'),
    check: ico('<path d="m5 12.5 4.5 4.5L19 7.5"/>'),
    minus: ico('<path d="M6 12h12"/>'),
    chevronDown: ico('<path d="m6 9 6 6 6-6"/>'),
    chevronRight: ico('<path d="m9 6 6 6-6 6"/>'),
    chevronLeft: ico('<path d="m15 6-6 6 6 6"/>'),
    search: ico('<circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.2-4.2"/>'),
    info: ico('<circle cx="12" cy="12" r="9"/><path d="M12 11v5.5M12 7.5v.01"/>'),
    success: ico('<circle cx="12" cy="12" r="9"/><path d="m8 12.5 3 3 5-6"/>'),
    warning: ico('<path d="M10.3 4.3 2.6 18a2 2 0 0 0 1.7 3h15.4a2 2 0 0 0 1.7-3L13.7 4.3a2 2 0 0 0-3.4 0z"/><path d="M12 9.5v4.5M12 17.5v.01"/>'),
    danger: ico('<circle cx="12" cy="12" r="9"/><path d="M12 7.5v5.5M12 16.5v.01"/>'),
  };
  icons.accent = icons.info;
  icons.default = icons.info;

  // ---- focus ----

  const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"]), [contenteditable="true"], audio[controls], video[controls], summary';

  function focusables(root) {
    return [...root.querySelectorAll(FOCUSABLE)].filter((el) =>
      !el.closest('[inert]') && !el.hidden && el.getClientRects().length > 0);
  }

  function focusFirst(root, preferred) {
    const target = (preferred && root.querySelector(preferred)) || focusables(root)[0] || root;
    if (target === root && !root.hasAttribute('tabindex')) root.tabIndex = -1;
    target.focus({ preventScroll: true });
  }

  // trapFocus keeps Tab and Shift+Tab inside root. Returns a release function.
  function trapFocus(root) {
    function onKey(e) {
      if (e.key !== 'Tab') return;
      const items = focusables(root);
      if (items.length === 0) { e.preventDefault(); return; }
      const first = items[0], last = items[items.length - 1];
      if (e.shiftKey && (document.activeElement === first || !root.contains(document.activeElement))) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
    root.addEventListener('keydown', onKey);
    return () => root.removeEventListener('keydown', onKey);
  }

  // Keyboard modality, for showing tooltips on keyboard focus but not on click.
  let lastInputWasKeyboard = false;
  document.addEventListener('keydown', (e) => { if (!e.metaKey && !e.altKey && !e.ctrlKey) lastInputWasKeyboard = true; }, true);
  document.addEventListener('pointerdown', () => { lastInputWasKeyboard = false; }, true);
  const isKeyboardFocus = () => lastInputWasKeyboard;

  // ---- the portal and modal isolation ----

  function portal() {
    let root = document.querySelector('.yui-portal');
    if (!root) {
      root = h('div', { class: 'yui-portal' });
      document.body.append(root);
    }
    return root;
  }

  // isolate makes everything except keep inert (unreachable by focus, clicks
  // and screen readers) and locks page scroll. Returns a function that undoes
  // it. Nested modals stack: only the topmost one's content is reachable.
  // Elements marked data-yui-keep-live (the toast region) are left alone so
  // their live regions keep announcing while a modal is open.
  const isolations = [];
  const keepLive = (el) => el.hasAttribute('data-yui-keep-live');
  function isolate(keep) {
    const touched = [];
    for (const el of document.body.children) {
      if (el === keep || el.contains(keep) || el.inert || keepLive(el)) continue;
      el.inert = true;
      touched.push(el);
    }
    // Inside the portal, siblings of keep (other overlays) go inert too.
    if (keep.parentElement && keep.parentElement.classList.contains('yui-portal')) {
      for (const el of keep.parentElement.children) {
        if (el === keep || el.inert || keepLive(el)) continue;
        el.inert = true;
        touched.push(el);
      }
    }
    const html = document.documentElement;
    const first = isolations.length === 0;
    if (first) {
      const gap = window.innerWidth - html.clientWidth;
      html.dataset.yuiScrollLocked = 'true';
      if (gap > 0) html.style.setProperty('--yui-scrollbar-gap', gap + 'px');
    }
    const entry = { touched };
    isolations.push(entry);
    return () => {
      for (const el of entry.touched) el.inert = false;
      isolations.splice(isolations.indexOf(entry), 1);
      if (isolations.length === 0) {
        delete html.dataset.yuiScrollLocked;
        html.style.removeProperty('--yui-scrollbar-gap');
      }
    };
  }

  // ---- dismissable layers ----
  // Every open overlay registers a layer. Escape dismisses only the topmost
  // layer, and a pointer press outside the topmost layer (and its trigger)
  // dismisses it unless the layer opts out.

  const layers = [];

  // pushLayer({el, trigger, onDismiss, dismissOnOutside = true,
  // dismissOnEscape = true}) → remove(). onDismiss(reason, event) gets
  // 'escape' or 'outside' and the keydown or pointerdown event.
  //
  // Limits: only the topmost layer is considered, so one outside press closes
  // one layer, and a top layer with dismissOnOutside: false shields the ones
  // beneath. Overlays that stack (a tooltip over a popover) dismiss their own
  // layer from a window capture listener first; see overlays.js.
  function pushLayer(layer) {
    const entry = { dismissOnOutside: true, dismissOnEscape: true, ...layer };
    layers.push(entry);
    return () => {
      const i = layers.indexOf(entry);
      if (i >= 0) layers.splice(i, 1);
    };
  }

  const topLayer = () => layers[layers.length - 1];

  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || e.defaultPrevented) return;
    const top = topLayer();
    if (!top || !top.dismissOnEscape) return;
    e.preventDefault();
    e.stopPropagation();
    top.onDismiss('escape', e);
  }, true);

  document.addEventListener('pointerdown', (e) => {
    const top = topLayer();
    if (!top || !top.dismissOnOutside) return;
    const t = e.target;
    if (top.el.contains(t) || (top.trigger && top.trigger.contains(t))) return;
    top.onDismiss('outside', e);
  }, true);

  // ---- positioning ----
  // position(floating, anchor, {placement, offset, shift, flip, matchWidth})
  // places a fixed-position floating element next to anchor (an element or a
  // DOMRect), flipping to the opposite side when it doesn't fit and shifting
  // to stay inside the viewport. It measures with getBoundingClientRect, so
  // an anchor inside an overlay that's still scaling in measures scaled; pass
  // a DOMRect built from layout values instead (menus.js does for submenus). Sets data-placement to the final side and
  // --trigger-anchor-point for HeroUI's transform-origin. placement is
  // 'top' | 'bottom' | 'left' | 'right', optionally with ' start' / ' end'.

  const OPPOSITE = { top: 'bottom', bottom: 'top', left: 'right', right: 'left' };

  function position(floating, anchor, opts = {}) {
    const { placement = 'bottom', offset = 8, padding = 8, flip = true, matchWidth = false } = opts;
    const [side0, align = 'center'] = placement.split(/[\s-]+/);
    const a = anchor instanceof Element ? anchor.getBoundingClientRect() : anchor;
    floating.style.position = 'fixed';
    floating.style.top = '0px';
    floating.style.left = '0px';
    if (matchWidth) floating.style.minWidth = a.width + 'px';
    const f = floating.getBoundingClientRect();
    const vw = document.documentElement.clientWidth, vh = document.documentElement.clientHeight;

    const fits = (side) => side === 'top' ? a.top - offset - f.height >= padding
      : side === 'bottom' ? a.bottom + offset + f.height <= vh - padding
        : side === 'left' ? a.left - offset - f.width >= padding
          : a.right + offset + f.width <= vw - padding;
    let side = side0;
    if (flip && !fits(side) && fits(OPPOSITE[side])) side = OPPOSITE[side];

    let x, y;
    if (side === 'top' || side === 'bottom') {
      y = side === 'top' ? a.top - offset - f.height : a.bottom + offset;
      x = align === 'start' ? a.left : align === 'end' ? a.right - f.width : a.left + a.width / 2 - f.width / 2;
      x = Math.max(padding, Math.min(vw - f.width - padding, x));
    } else {
      x = side === 'left' ? a.left - offset - f.width : a.right + offset;
      y = align === 'start' ? a.top : align === 'end' ? a.bottom - f.height : a.top + a.height / 2 - f.height / 2;
      y = Math.max(padding, Math.min(vh - f.height - padding, y));
    }
    floating.style.left = Math.round(x) + 'px';
    floating.style.top = Math.round(y) + 'px';
    floating.dataset.placement = side;
    // Where the anchor is relative to the floating element, for transform-origin.
    const ox = Math.max(0, Math.min(f.width, a.left + a.width / 2 - x));
    const oy = Math.max(0, Math.min(f.height, a.top + a.height / 2 - y));
    floating.style.setProperty('--trigger-anchor-point', `${Math.round(ox)}px ${Math.round(oy)}px`);
    return side;
  }

  // autoUpdate re-runs update while the anchor scrolls or the window resizes.
  function autoUpdate(update) {
    let frame = 0;
    const schedule = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(update); };
    window.addEventListener('scroll', schedule, true);
    window.addEventListener('resize', schedule);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('scroll', schedule, true);
      window.removeEventListener('resize', schedule);
    };
  }

  // ---- enter and exit animation ----

  const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // HeroUI moves most overlays with @keyframes animations, and some (Toast)
  // with transitions on data-entering / data-exiting. These handle both.
  const hasAnimation = (el) => getComputedStyle(el).animationName.split(',').some((n) => n.trim() !== 'none');
  const hasTransition = (el) => getComputedStyle(el).transitionDuration.split(',').some((d) => parseFloat(d) > 0);

  // enter sets data-entering for HeroUI's enter motion, then clears it: when
  // the animation ends, or two frames later for a transition, so the
  // transition runs from the data-entering styles to the resting ones.
  function enter(el) {
    el.dataset.entering = 'true';
    const done = () => { delete el.dataset.entering; };
    if (reducedMotion()) { requestAnimationFrame(done); return; }
    if (!hasAnimation(el)) { requestAnimationFrame(() => requestAnimationFrame(done)); return; }
    el.addEventListener('animationend', done, { once: true });
    setTimeout(done, 400);
  }

  // exit sets data-exiting, waits for the exit animation or transition (400ms
  // at most), then calls done. Safe to call twice; the second does nothing.
  function exit(el, done) {
    if (el.dataset.exiting === 'true') return;
    delete el.dataset.entering;
    el.dataset.exiting = 'true';
    let finished = false;
    const finish = () => { if (finished) return; finished = true; done(); };
    if (reducedMotion()) { finish(); return; }
    if (hasAnimation(el)) el.addEventListener('animationend', finish, { once: true });
    else if (hasTransition(el)) el.addEventListener('transitionend', (e) => { if (e.target === el) finish(); });
    else { finish(); return; }
    setTimeout(finish, 400);
  }

  // ---- theme ----
  // HeroUI switches themes with class="dark" / data-theme on <html>. Yap
  // follows the operating system unless a page sets one explicitly.

  const theme = {
    media: window.matchMedia('(prefers-color-scheme: dark)'),
    current() { return document.documentElement.dataset.theme || (this.media.matches ? 'dark' : 'light'); },
    apply(name) {
      const html = document.documentElement;
      html.dataset.theme = name;
      html.classList.toggle('dark', name === 'dark');
      html.classList.toggle('light', name === 'light');
      html.style.colorScheme = name;
    },
    // follow keeps the theme in step with the OS setting.
    follow() {
      this.apply(this.media.matches ? 'dark' : 'light');
      this.media.addEventListener('change', (e) => this.apply(e.matches ? 'dark' : 'light'));
    },
  };

  // ---- platform ----

  const isMac = /Mac|iPhone|iPad/.test(navigator.platform);

  Object.assign(YapUI, {
    h, append, cx, uid, icons,
    focusables, focusFirst, trapFocus, isKeyboardFocus,
    portal, isolate, pushLayer, topLayer,
    position, autoUpdate,
    enter, exit, reducedMotion,
    theme, isMac,
  });
})();
