'use strict';

// toast components: the Toast region and the imperative YapUI.toast() API.
// See ui-build/docs/toast.md.
//
// Markup follows HeroUI v3's Toast (toast.css): a .toast-region landmark
// holding .toast elements stacked with the CSS variables HeroUI's stylesheet
// reads (--offset-collapsed, --offset-expanded, --scale-collapsed,
// --front-height, --toast-height, --gap, --toast-width) and its data
// attributes (data-frontmost, data-index, data-expanded, data-hidden,
// data-placement, data-entering, data-exiting).
//
// Announcements go through two visually hidden live regions (polite status,
// assertive alert for danger) rather than role="alertdialog": toasts never
// take focus, and a live region announces reliably without it.
(() => {
  const YapUI = window.YapUI;
  const { h, icons, uid, reducedMotion } = YapUI;

  const PLACEMENTS = ['top start', 'top', 'top end', 'bottom start', 'bottom', 'bottom end'];
  const VARIANTS = ['default', 'accent', 'success', 'warning', 'danger'];
  // Screen-reader prefixes, so the variant isn't conveyed by color and icon alone.
  const PREFIX = { success: 'Success: ', warning: 'Warning: ', danger: 'Error: ' };

  const config = {
    placement: 'bottom end', // desktop placement
    narrowPlacement: 'top', // below 640px (HeroUI's sm breakpoint)
    maxVisible: 3,
    timeout: 8000, // PatternFly's 8s, not HeroUI's 4s
    gap: 8, // space between expanded toasts (PatternFly)
    peek: 12, // how far each collapsed toast shows behind the front one
    scaleFactor: 0.05,
    width: 460,
    offset: 16, // distance from the viewport edge, px
    hotkey: true, // Alt+T (Option+T on Mac) and F6
  };

  const narrowMedia = window.matchMedia('(max-width: 639.98px)');
  const toasts = []; // newest first; includes exiting toasts until removed
  let region = null, list = null, overflowBtn = null, statusEl = null, alertEl = null;
  let pointerWithin = false, focusWithin = false, showAll = false, externalPause = false;
  let returnFocus = null;

  const slug = (placement) => placement.replace(/\s+/g, '-');
  const currentPlacement = () => (narrowMedia.matches ? config.narrowPlacement : config.placement);
  const active = () => toasts.filter((t) => !t.exiting);

  // ---- motion ----
  // HeroUI's toast moves with CSS transitions keyed on data-entering="true" /
  // "false" (an explicit false, not a missing attribute), so these set the
  // attribute values toast.css expects rather than using YapUI.enter/exit.
  function enterT(el) {
    el.dataset.entering = 'true';
    // Two frames, as HeroUI does, so the entering position paints first.
    requestAnimationFrame(() => requestAnimationFrame(() => { el.dataset.entering = 'false'; }));
  }

  function exitT(el, done) {
    el.dataset.entering = 'false';
    el.dataset.exiting = 'true';
    let finished = false;
    const finish = () => { if (finished) return; finished = true; done(); };
    if (reducedMotion()) { finish(); return; }
    el.addEventListener('transitionend', (e) => { if (e.target === el) finish(); });
    setTimeout(finish, 320);
  }

  // ---- the region ----

  function ensureRegion() {
    if (region && region.isConnected) return region;
    list = h('div', { class: 'yui-toast-list' });
    overflowBtn = h('button', { type: 'button', class: 'button button--sm button--tertiary yui-toast-overflow', hidden: true, on: { click: () => { showAll = !showAll; render(); } } });
    statusEl = h('div', { class: 'yui-visually-hidden', role: 'status' });
    alertEl = h('div', { class: 'yui-visually-hidden', role: 'alert' });
    region = h('section', {
      class: 'toast-region', 'data-slot': 'toast-region', tabindex: '-1',
      // Stay live while a modal is open (YapUI.isolate skips it), so toasts
      // raised then are still announced and reachable.
      'data-yui-keep-live': true,
      aria: { label: 'Notifications', keyshortcuts: 'Alt+T' },
      on: {
        pointerenter: (e) => { if (e.pointerType !== 'touch') { pointerWithin = true; render(); } },
        pointermove: (e) => { if (e.pointerType !== 'touch' && !pointerWithin) { pointerWithin = true; render(); } },
        pointerleave: () => { pointerWithin = false; if (!focusWithin) showAll = false; render(); },
        focusin: (e) => {
          if (e.relatedTarget && !region.contains(e.relatedTarget)) returnFocus = e.relatedTarget;
          if (!focusWithin) { focusWithin = true; render(); }
        },
        focusout: (e) => {
          if (e.relatedTarget && region.contains(e.relatedTarget)) return;
          // Focus moving to an element being removed is handled by close().
          setTimeout(() => {
            if (region.contains(document.activeElement)) return;
            focusWithin = false;
            if (!pointerWithin) showAll = false;
            render();
          }, 0);
        },
        keydown: onRegionKey,
      },
    }, list, overflowBtn, statusEl, alertEl);
    YapUI.portal().append(region);
    applyConfig();
    return region;
  }

  function applyConfig() {
    if (!region) return;
    const p = currentPlacement();
    region.className = 'toast-region toast-region--' + slug(p);
    region.dataset.placement = p;
    region.style.setProperty('--gap', config.gap + 'px');
    region.style.setProperty('--scale-factor', String(config.scaleFactor));
    region.style.setProperty('--toast-width', typeof config.width === 'number' ? config.width + 'px' : config.width);
    region.style.setProperty('--yui-toast-offset', typeof config.offset === 'number' ? config.offset + 'px' : config.offset);
    for (const t of toasts) t.el.className = toastClass(t);
    render();
  }

  narrowMedia.addEventListener('change', applyConfig);
  window.addEventListener('resize', () => { if (toasts.length) render(); });
  document.addEventListener('visibilitychange', syncTimers);
  // A pointer that left while a toast under it was removed gets no pointerleave.
  document.addEventListener('pointerover', (e) => {
    if (pointerWithin && region && !region.contains(e.target)) { pointerWithin = false; if (!focusWithin) showAll = false; render(); }
  }, true);

  function onRegionKey(e) {
    if (e.key === 'Escape' && !e.defaultPrevented) {
      // Collapse the stack and give focus back to where it came from.
      e.preventDefault();
      showAll = false;
      leaveRegion();
    } else if (e.key === 'F6' && config.hotkey) {
      e.preventDefault();
      leaveRegion();
    }
  }

  function leaveRegion() {
    const back = returnFocus && returnFocus.isConnected && !region.contains(returnFocus) ? returnFocus : null;
    if (back) back.focus({ preventScroll: true });
    else if (region.contains(document.activeElement)) document.activeElement.blur();
    focusWithin = false;
    render();
  }

  // Alt+T (HeroUI's hotkey; Option+T on Mac, matched by key code) and F6 move
  // focus to the newest toast. They do nothing when no toast is showing, so
  // the keys keep their usual meaning then.
  document.addEventListener('keydown', (e) => {
    if (!config.hotkey || !region || e.defaultPrevented) return;
    const alt = e.code === 'KeyT' && e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey;
    const f6 = e.key === 'F6' && !e.altKey && !e.ctrlKey && !e.metaKey;
    if (!alt && !f6) return;
    if (region.contains(document.activeElement)) { if (alt) { e.preventDefault(); } return; }
    const front = active().find((t) => !t.hidden);
    if (!front) return;
    e.preventDefault();
    returnFocus = document.activeElement !== document.body ? document.activeElement : null;
    front.el.focus({ preventScroll: true });
  });

  // ---- layout ----

  function naturalHeight(el) {
    const prev = el.style.height;
    el.style.height = 'auto';
    const hgt = el.offsetHeight;
    el.style.height = prev;
    return hgt;
  }

  // render recomputes the stack: indexes, hidden/frontmost/expanded state,
  // the CSS variables HeroUI's stylesheet reads, tab stops and timers.
  function render() {
    if (!region) return;
    const live = active();
    const max = showAll ? Infinity : Math.max(1, config.maxVisible);
    const expanded = (pointerWithin || focusWithin || showAll) && live.length > 1;
    region.dataset.expanded = String(expanded);

    const heights = live.map((t) => naturalHeight(t.el));
    const frontHeight = heights[0] || 0;
    const visibleCount = Math.min(live.length, max);
    let before = 0;
    live.forEach((t, i) => {
      const el = t.el;
      t.index = i;
      t.hidden = i >= max;
      el.dataset.index = String(i);
      el.dataset.frontmost = String(i === 0);
      el.dataset.hidden = String(t.hidden);
      el.dataset.expanded = String(expanded);
      el.dataset.placement = currentPlacement();
      el.style.setProperty('--offset-collapsed', Math.min(i, visibleCount - 1) * config.peek + 'px');
      el.style.setProperty('--offset-expanded', before + i * config.gap + 'px');
      el.style.setProperty('--scale-collapsed', String(Math.max(0, 1 - Math.min(i, visibleCount - 1) * config.scaleFactor)));
      el.style.setProperty('--front-height', frontHeight + 'px');
      el.style.setProperty('--toast-height', heights[i] + 'px');
      el.style.zIndex = String(live.length - i);
      before += heights[i];
      // Hidden toasts are out of reach until they come forward (or "N more" is pressed).
      el.inert = t.hidden;
      if (t.hidden) el.setAttribute('aria-hidden', 'true'); else el.removeAttribute('aria-hidden');
      // Collapsed toasts behind the front one show only their edge, so they
      // aren't tab stops until the stack expands (which focus in it does).
      const reachable = !t.hidden && (i === 0 || expanded);
      el.tabIndex = reachable ? 0 : -1;
      for (const b of el.querySelectorAll('button')) b.tabIndex = reachable ? 0 : -1;
    });
    for (const t of toasts) if (t.exiting) t.el.style.zIndex = '0';

    // Overflow count (PatternFly): "N more" beyond the visible stack.
    const extra = live.length - Math.min(live.length, Math.max(1, config.maxVisible));
    if (extra > 0) {
      overflowBtn.hidden = false;
      overflowBtn.textContent = showAll ? 'Show fewer' : `${extra} more notification${extra === 1 ? '' : 's'}`;
      overflowBtn.setAttribute('aria-expanded', String(showAll));
      let extent;
      if (expanded) extent = heights.slice(0, visibleCount).reduce((a, b) => a + b, 0) + (visibleCount - 1) * config.gap;
      else {
        extent = 0;
        for (let i = 0; i < visibleCount; i++) extent = Math.max(extent, i * config.peek + frontHeight * (1 - i * config.scaleFactor));
      }
      overflowBtn.style.setProperty('--yui-overflow-offset', Math.round(extent + config.gap) + 'px');
      overflowBtn.dataset.placement = currentPlacement().startsWith('top') ? 'top' : 'bottom';
    } else {
      overflowBtn.hidden = true;
      showAll = false;
    }
    syncTimers();
  }

  // ---- timers ----
  // A toast's timer runs only while it's visible (not hidden behind the stack)
  // and nothing pauses toasts: pointer or focus in the region, a hidden tab,
  // or pauseAll(). So a toast never disappears unseen or under the pointer.

  const paused = () => pointerWithin || focusWithin || document.hidden || externalPause;

  function syncTimers() {
    const now = Date.now();
    const stop = paused();
    for (const t of toasts) {
      const run = !t.exiting && t.timeout > 0 && !t.hidden && !stop;
      if (run && !t.timer) {
        t.startedAt = now;
        t.timer = setTimeout(() => { t.timer = null; close(t, 'timeout'); }, Math.max(0, t.remaining));
      } else if (!run && t.timer) {
        clearTimeout(t.timer);
        t.timer = null;
        t.remaining -= now - t.startedAt;
      }
    }
  }

  function setTimeoutMs(t, ms) {
    if (t.timer) { clearTimeout(t.timer); t.timer = null; }
    t.timeout = ms;
    t.remaining = ms;
  }

  // ---- announcements ----

  function announce(t) {
    if (!statusEl) return;
    const o = t.opts;
    let text = (PREFIX[o.variant] || '') + (o.title || '');
    if (o.description) text += (text && !/[.!?…:]$/.test(text) ? '. ' : ' ') + o.description;
    if (o.action && o.action.label && config.hotkey) text += ` Press Alt+T to reach ${o.action.label}.`;
    const target = o.variant === 'danger' ? alertEl : statusEl;
    // Added after a beat, so a live region created a moment ago is registered
    // with the accessibility tree before its content changes.
    setTimeout(() => {
      const p = h('p', { text });
      target.append(p);
      setTimeout(() => p.remove(), 10000);
    }, 100);
  }

  // ---- toasts ----

  function toastClass(t) {
    return `toast toast--${slug(currentPlacement())} toast--${t.opts.variant}`;
  }

  function spinner() {
    return h('span', { class: 'spinner spinner--current spinner--sm', 'data-slot': 'spinner', aria: { hidden: 'true' },
      html: '<svg data-slot="spinner-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-opacity="0.25" stroke-width="3"/><path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" stroke-width="3" stroke-linecap="round"/></svg>' });
  }

  function indicatorContent(o) {
    if (o.isLoading) return spinner();
    if (o.indicator instanceof Node) return o.indicator;
    const wrap = h('span', { html: icons[o.variant] || icons.info });
    const svg = wrap.firstElementChild;
    svg.setAttribute('data-slot', 'toast-default-icon');
    return svg;
  }

  // fill (re)builds a toast's parts from its options, in place.
  function fill(t, swapped) {
    const o = t.opts, el = t.el;
    el.className = toastClass(t);
    el.replaceChildren();
    if (o.indicator !== null) {
      el.append(h('div', { class: 'toast__indicator', 'data-slot': 'toast-indicator', data: { swapped: swapped ? 'true' : 'false' } }, indicatorContent(o)));
    }
    const titleId = t.id + '-title', descId = t.id + '-desc';
    el.append(h('div', { class: 'toast__content', 'data-slot': 'toast-content' },
      o.title && h('div', { class: 'toast__title', 'data-slot': 'toast-title', id: titleId },
        PREFIX[o.variant] && h('span', { class: 'yui-visually-hidden', text: PREFIX[o.variant] }), o.title),
      o.description && h('div', { class: 'toast__description', 'data-slot': 'toast-description', id: descId, text: o.description })));
    if (o.title) el.setAttribute('aria-labelledby', titleId); else el.removeAttribute('aria-labelledby');
    if (o.description) el.setAttribute('aria-describedby', descId); else el.removeAttribute('aria-describedby');
    el.setAttribute('aria-busy', String(!!o.isLoading));
    if (o.action && o.action.label) {
      el.append(h('button', {
        type: 'button', class: `button button--sm button--${o.action.variant || 'tertiary'} toast__action`, 'data-slot': 'toast-action-button', text: o.action.label,
        on: { click: (e) => {
          if (typeof o.action.onPress === 'function') o.action.onPress(e, controller(t));
          // An action settles the toast unless the handler says otherwise.
          if (!e.defaultPrevented) close(t, 'action');
        } },
      }));
    }
    el.append(h('button', {
      type: 'button', class: 'close-button close-button--default toast__close-button', 'data-slot': 'toast-close',
      aria: { label: 'Close notification' }, html: icons.close,
      on: { click: () => close(t, 'close') },
    }));
    el.querySelector('.toast__close-button svg').setAttribute('data-slot', 'close-button-icon');
  }

  function defaultTimeout(o) {
    if (o.isLoading) return 0;
    if (o.action && o.action.label) return 0; // PatternFly: actions don't auto-dismiss
    if (o.variant === 'danger') return 0; // errors stay until dismissed (NN/g)
    return config.timeout;
  }

  function normalize(titleOrOpts, more) {
    const o = typeof titleOrOpts === 'string' || titleOrOpts instanceof Node ? { ...(more || {}), title: titleOrOpts } : { ...(titleOrOpts || {}), ...(more || {}) };
    if (!VARIANTS.includes(o.variant)) o.variant = 'default';
    if (o.title != null && !(o.title instanceof Node)) o.title = String(o.title);
    if (o.description != null && !(o.description instanceof Node)) o.description = String(o.description);
    return o;
  }

  function controller(t) {
    return {
      id: t.id,
      close: () => close(t, 'api'),
      update: (opts) => { update(t, opts); return controller(t); },
      get isOpen() { return !t.exiting && toasts.includes(t); },
    };
  }

  function add(o) {
    ensureRegion();
    const t = { id: uid('yui-toast'), opts: o, el: null, exiting: false, timer: null, hidden: false, index: 0 };
    t.el = h('div', { 'data-slot': 'toast', role: 'group', id: t.id });
    setTimeoutMs(t, o.timeout != null ? Number(o.timeout) || 0 : defaultTimeout(o));
    fill(t, false);
    toasts.unshift(t);
    list.prepend(t.el);
    enterT(t.el);
    render();
    announce(t);
    return controller(t);
  }

  function update(t, patch) {
    if (!t || t.exiting) return;
    const wasLoading = !!t.opts.isLoading;
    const p = normalize(patch);
    if (!patch || !patch.variant) p.variant = t.opts.variant;
    const changedText = (p.title !== undefined && p.title !== t.opts.title) || (p.description !== undefined && p.description !== t.opts.description) || p.variant !== t.opts.variant;
    t.opts = { ...t.opts, ...p };
    if (patch && 'timeout' in patch) setTimeoutMs(t, Number(patch.timeout) || 0);
    else if (wasLoading && !t.opts.isLoading) setTimeoutMs(t, defaultTimeout(t.opts));
    else if (patch && ('action' in patch || 'variant' in patch) && defaultTimeout(t.opts) === 0) setTimeoutMs(t, 0);
    const hadFocus = t.el.contains(document.activeElement) && document.activeElement !== t.el;
    fill(t, wasLoading && !t.opts.isLoading);
    if (hadFocus) t.el.focus({ preventScroll: true });
    render();
    if (changedText) announce(t);
  }

  function close(t, reason = 'api') {
    if (!t || t.exiting || !toasts.includes(t)) return;
    const hadFocus = t.el.contains(document.activeElement);
    t.exiting = true;
    if (t.timer) { clearTimeout(t.timer); t.timer = null; }
    t.el.setAttribute('aria-hidden', 'true');
    for (const b of t.el.querySelectorAll('button')) b.tabIndex = -1;
    render();
    if (hadFocus) {
      // Focus moves to the toast that takes this one's place (the next older
      // one), else the next newer one, else back to where it came from.
      const live = active().filter((x) => !x.hidden);
      const next = live.find((x) => x.index >= t.index) || live[live.length - 1];
      if (next) next.el.focus({ preventScroll: true });
      else leaveRegion();
    }
    t.el.inert = true;
    if (typeof t.opts.onClose === 'function') {
      try { t.opts.onClose(reason); } catch (err) { setTimeout(() => { throw err; }); }
    }
    exitT(t.el, () => {
      t.el.remove();
      const i = toasts.indexOf(t);
      if (i >= 0) toasts.splice(i, 1);
      render();
    });
  }

  const byId = (id) => toasts.find((t) => t.id === (id && id.id ? id.id : id));

  // toast(title, opts?) or toast(opts) shows a toast and returns
  // { id, close(), update(opts), isOpen }.
  // opts: title, description, variant ('default' | 'accent' | 'success' |
  // 'warning' | 'danger'), timeout (ms; 0 = until closed; default 8000, or 0
  // for danger, action and loading toasts), action {label, onPress(event,
  // toast), variant}, isLoading, indicator (a Node, or null for none),
  // onClose(reason) with reason 'timeout' | 'close' | 'action' | 'api' | 'clear'.
  function toast(titleOrOpts, opts) { return add(normalize(titleOrOpts, opts)); }

  for (const v of ['default', 'accent', 'success', 'warning', 'danger']) {
    toast[v] = (titleOrOpts, opts) => add({ ...normalize(titleOrOpts, opts), variant: v });
  }
  toast.info = toast.accent; // HeroUI's toast.info uses the accent variant

  // promise(promiseOrFn, {loading, success, error}) shows a loading toast and
  // updates it when the promise settles. Each message is a string or options;
  // success and error may also be functions of the result or the error.
  // Returns the controller, plus .promise (the original promise).
  toast.promise = (promiseOrFn, msgs = {}) => {
    const asOpts = (m, arg) => {
      const v = typeof m === 'function' ? m(arg) : m;
      return v == null ? {} : typeof v === 'string' || v instanceof Node ? { title: v } : v;
    };
    const ctl = add({ ...normalize(asOpts(msgs.loading || 'Loading…')), isLoading: true });
    const promise = Promise.resolve(typeof promiseOrFn === 'function' ? promiseOrFn() : promiseOrFn);
    promise.then(
      (res) => update(byId(ctl.id), { variant: 'success', ...asOpts(msgs.success || 'Done', res), isLoading: false }),
      (err) => update(byId(ctl.id), { variant: 'danger', ...asOpts(msgs.error || ((e) => (e && e.message) || 'Something went wrong'), err), isLoading: false }),
    );
    return { ...ctl, promise };
  };

  // update(id, opts) changes a toast in place; close(id) dismisses it.
  toast.update = (id, opts) => { const t = byId(id); if (t) update(t, opts); };
  toast.close = (id) => close(byId(id), 'api');
  // clear() dismisses every toast.
  toast.clear = () => { for (const t of [...toasts]) close(t, 'clear'); };
  // pauseAll() / resumeAll() hold every timer, e.g. while a modal is open.
  toast.pauseAll = () => { externalPause = true; syncTimers(); };
  toast.resumeAll = () => { externalPause = false; syncTimers(); };
  // configure({placement, narrowPlacement, maxVisible, timeout, gap, width,
  // offset, hotkey}) changes the region's settings; returns the settings.
  toast.configure = (opts = {}) => {
    for (const [k, v] of Object.entries(opts)) {
      if (!(k in config) || v == null) continue;
      if ((k === 'placement' || k === 'narrowPlacement') && !PLACEMENTS.includes(v)) throw new Error(`toast: unknown placement "${v}"`);
      config[k] = v;
    }
    applyConfig();
    return { ...config };
  };
  // getToasts() lists the open toasts' controllers, newest first.
  toast.getToasts = () => active().map(controller);

  YapUI.toast = toast;
})();
