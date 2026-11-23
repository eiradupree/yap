'use strict';

// display components: Avatar, AvatarGroup, Badge, Chip, Card, Surface,
// Separator, Spinner, Skeleton, ProgressBar, Alert, EmptyState.
// Markup follows HeroUI v3's stylesheet (classes, data-slot values). See
// ui-build/docs/display.md for options, guidance and accessibility notes.
(() => {
  const YapUI = window.YapUI;
  const { h, cx, uid, icons } = YapUI;

  // ---- local helpers ----

  // pass copies the options every factory forwards: id, style, class,
  // aria: {…}, data: {…}, and flat 'aria-*' / 'data-*' keys.
  function pass(el, o) {
    if (o.id) el.id = o.id;
    if (o.class) for (const c of (Array.isArray(o.class) ? o.class : String(o.class).split(/\s+/))) if (c) el.classList.add(c);
    if (o.style) for (const [k, v] of Object.entries(o.style)) el.style.setProperty(k.startsWith('--') ? k : k.replace(/[A-Z]/g, (c) => '-' + c.toLowerCase()), v);
    if (o.aria) for (const [k, v] of Object.entries(o.aria)) if (v != null) el.setAttribute('aria-' + k, String(v));
    if (o.data) for (const [k, v] of Object.entries(o.data)) if (v != null && v !== false) el.dataset[k] = v === true ? 'true' : String(v);
    for (const [k, v] of Object.entries(o)) if ((k.startsWith('aria-') || k.startsWith('data-')) && v != null) el.setAttribute(k, String(v));
    return el;
  }

  // An icon option: a node, or static SVG markup from our own code (never user data).
  function iconNode(icon) {
    if (icon == null || icon === false) return null;
    if (icon instanceof Node) return icon;
    const wrap = document.createElement('span');
    wrap.innerHTML = String(icon);
    return wrap.firstElementChild || null;
  }

  const hidden = (text) => h('span', { class: 'yui-visually-hidden' }, text);

  // initials('Ana María Ruiz') → 'AR'; initials('Cher') → 'C'. First letters of
  // the first and last word (PatternFly), one letter for a single name.
  function initials(name) {
    const words = String(name || '').trim().split(/\s+/).filter(Boolean)
      .map((w) => w.replace(/^[^\p{L}\p{N}]+/u, '')).filter(Boolean);
    if (!words.length) return '';
    const first = (w) => Array.from(w)[0].toLocaleUpperCase();
    return words.length === 1 ? first(words[0]) : first(words[0]) + first(words[words.length - 1]);
  }

  const personIcon = '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" data-slot="icon"><circle cx="12" cy="8" r="4"/><path d="M4.5 20a7.5 7.5 0 0 1 15 0"/></svg>';

  // ---- Avatar ----

  // Avatar({ name, src, alt, size: 'sm'|'md'|'lg' = 'md', color: 'default'|
  // 'accent'|'success'|'warning'|'danger' = 'default', variant: 'default'|'soft'
  // = 'default', fallback, delayMs, class, aria, data }) → span.avatar.
  // The fallback (initials from name, or `fallback` text/node) shows until the
  // image loads and stays if it fails. alt defaults to name; alt: '' marks the
  // avatar decorative (use when the name is printed right next to it).
  // el.yui: setSrc(src), setName(name), status() → 'none'|'loading'|'loaded'|'error'.
  function Avatar(o = {}) {
    const size = o.size || 'md', color = o.color || 'default', variant = o.variant || 'default';
    const el = h('span', { class: cx('avatar', { [size]: true, soft: variant === 'soft' }), 'data-slot': 'avatar' });
    const fb = h('span', { class: cx('avatar__fallback', { [color]: true }), 'data-slot': 'avatar-fallback', 'aria-hidden': 'true' });
    el.append(fb);
    let name = o.name || '', img = null, status = 'none', alt = o.alt;

    function label() {
      const text = alt != null ? alt : name;
      if (text) { el.setAttribute('role', 'img'); el.setAttribute('aria-label', text); el.removeAttribute('aria-hidden'); }
      else { el.removeAttribute('role'); el.removeAttribute('aria-label'); el.setAttribute('aria-hidden', 'true'); }
    }
    function fill() {
      fb.replaceChildren();
      if (o.fallback instanceof Node) fb.append(o.fallback);
      else if (o.fallback) fb.textContent = String(o.fallback);
      else if (initials(name)) fb.textContent = initials(name);
      else fb.append(iconNode(personIcon));
    }
    function setSrc(src) {
      if (img) { img.remove(); img = null; }
      el.dataset.status = status = src ? 'loading' : 'none';
      fb.hidden = false;
      if (!src) return;
      img = h('img', { class: 'avatar__image', 'data-slot': 'avatar-image', alt: '', src, loading: o.loading, crossorigin: o.crossOrigin, draggable: 'false' });
      if (o.delayMs) {
        fb.hidden = true;
        setTimeout(() => { if (status !== 'loaded') fb.hidden = false; }, o.delayMs);
      }
      const mine = img;
      img.addEventListener('load', () => {
        if (img !== mine) return;
        el.dataset.status = status = 'loaded';
        img.dataset.loaded = 'true';
        if (o.onLoad) o.onLoad();
      });
      img.addEventListener('error', () => {
        if (img !== mine) return;
        img.remove(); img = null;
        el.dataset.status = status = 'error';
        fb.hidden = false;
        if (o.onError) o.onError();
      });
      el.append(img);
    }
    fill(); label(); setSrc(o.src);
    pass(el, o);
    el.yui = {
      setSrc,
      setName(n) { name = n || ''; fill(); label(); },
      status: () => status,
    };
    return el;
  }

  // AvatarGroup({ children: [Avatar element | Avatar options], max, total,
  // isGrid = false, overlap: 'clip'|'ring' = 'clip', size, color, variant,
  // label }) → div.avatar-group. Options objects inherit size/color/variant.
  // With max, extra avatars collapse into a "+N" count; total (e.g. from the
  // server) sets N explicitly. label gives the group role="group" and a name.
  function AvatarGroup(o = {}) {
    const isGrid = !!o.isGrid, overlap = o.overlap || 'clip';
    const el = h('div', { class: cx('avatar-group', { grid: isGrid, [overlap]: !isGrid }), 'data-slot': 'avatar-group' });
    const items = [o.children || []].flat(Infinity).filter(Boolean);
    const shown = o.max != null ? items.slice(0, o.max) : items;
    const make = (it) => (it instanceof Node ? it : Avatar({ size: o.size, color: o.color, variant: o.variant, ...it }));
    for (const it of shown) el.append(make(it));
    const extra = o.total != null ? o.total - shown.length : items.length - shown.length;
    if (extra > 0) {
      const count = Avatar({ size: o.size, color: o.color, variant: o.variant, fallback: '+' + extra, alt: `${extra} more` });
      count.classList.add('avatar-group__count');
      count.dataset.slot = 'avatar-group-count';
      el.append(count);
    }
    if (o.label) { el.setAttribute('role', 'group'); el.setAttribute('aria-label', o.label); }
    return pass(el, o);
  }

  // ---- Badge ----

  // Badge({ children, label, color = 'default', variant: 'primary'|'secondary'|
  // 'soft' = 'primary', size = 'md', placement: 'top-right'|'top-left'|
  // 'bottom-right'|'bottom-left' = 'top-right' }) → span.badge.
  // No children renders a dot. label is the text equivalent for screen readers
  // ("3 unread messages", "Online"); the visible content is then hidden from
  // them. Without a label the badge is treated as decorative.
  // el.yui: setContent(children, label).
  function Badge(o = {}) {
    const el = h('span', {
      class: cx('badge', { [o.color || 'default']: true, [o.variant || 'primary']: true, [o.size || 'md']: true, [o.placement || 'top-right']: true }),
      'data-slot': 'badge',
    });
    function setContent(children, label) {
      el.replaceChildren();
      const has = children != null && children !== '' && !(Array.isArray(children) && !children.length);
      if (has) el.append(h('span', { class: 'badge__label', 'data-slot': 'badge-label', 'aria-hidden': label ? 'true' : null }, children));
      el.dataset.dot = has ? 'false' : 'true';
      if (label) { el.append(hidden(label)); el.removeAttribute('aria-hidden'); }
      else if (!has) el.setAttribute('aria-hidden', 'true');
      else el.removeAttribute('aria-hidden');
    }
    setContent(o.children, o.label);
    pass(el, o);
    el.yui = { setContent };
    return el;
  }

  // Badge.Anchor({ children }) → span.badge-anchor: wraps the element a badge
  // sits on, plus the badge. Badge.Anchor(target, badge) also works.
  function BadgeAnchor(o, badge) {
    if (o instanceof Node) return h('span', { class: 'badge-anchor', 'data-slot': 'badge-anchor' }, o, badge);
    return pass(h('span', { class: 'badge-anchor', 'data-slot': 'badge-anchor' }, o.children), o);
  }
  Badge.Anchor = BadgeAnchor;

  // ---- Chip ----

  // Chip({ children, color = 'default', variant: 'primary'|'secondary'|
  // 'tertiary'|'soft' = 'secondary', size = 'md', icon, onRemove, removeLabel,
  // onPress, isDisabled }) → span.chip (or button.chip with onPress).
  // icon: a node or static SVG markup, e.g. YapUI.icons.success; status chips
  // should always have one. onRemove adds a remove button named
  // "Remove <label>" (removeLabel overrides). onPress makes the whole chip a
  // button; don't combine it with onRemove.
  // el.yui: remove() (same as pressing the remove button), setLabel(text).
  function Chip(o = {}) {
    const interactive = typeof o.onPress === 'function';
    const el = h(interactive ? 'button' : 'span', {
      class: cx('chip', { [o.color || 'default']: true, [o.variant || 'secondary']: true, [o.size || 'md']: true }, interactive && 'yui-chip--interactive'),
      'data-slot': 'chip',
      type: interactive ? 'button' : null,
    });
    const ic = iconNode(o.icon);
    if (ic) { ic.setAttribute('aria-hidden', 'true'); ic.classList.add('yui-chip__icon'); el.append(ic); }
    const lab = h('span', { class: 'chip__label', 'data-slot': 'chip-label' }, o.children);
    el.append(lab);
    const text = () => lab.textContent.trim();
    if (interactive) {
      if (o.isDisabled) el.setAttribute('aria-disabled', 'true');
      el.addEventListener('click', (e) => { if (el.getAttribute('aria-disabled') !== 'true') o.onPress(e); });
    }
    let btn = null;
    if (typeof o.onRemove === 'function' && !interactive) {
      el.classList.add('yui-chip--removable');
      btn = h('button', { type: 'button', class: 'yui-chip__remove', 'data-slot': 'chip-remove', 'aria-label': o.removeLabel || `Remove ${text()}`, html: icons.close });
      if (o.isDisabled) btn.setAttribute('aria-disabled', 'true');
      btn.addEventListener('click', (e) => { if (btn.getAttribute('aria-disabled') !== 'true') o.onRemove(e, el); });
      // Delete and Backspace remove too, as in tag groups.
      btn.addEventListener('keydown', (e) => { if ((e.key === 'Delete' || e.key === 'Backspace') && btn.getAttribute('aria-disabled') !== 'true') { e.preventDefault(); o.onRemove(e, el); } });
      el.append(btn);
    }
    pass(el, o);
    el.yui = {
      remove() { if (o.onRemove) o.onRemove(null, el); },
      setLabel(t) { lab.textContent = t; if (btn && !o.removeLabel) btn.setAttribute('aria-label', `Remove ${t}`); },
    };
    return el;
  }

  // ---- Card ----

  const part = (tag, cls, slot) => (o = {}) => {
    const opts = o instanceof Node || typeof o === 'string' || Array.isArray(o) ? { children: o } : o;
    return pass(h(opts.as || tag, { class: cls, 'data-slot': slot }, opts.children), opts);
  };

  // Card({ variant: 'transparent'|'default'|'secondary'|'tertiary' = 'default',
  // title, description, children (content), footer, header (extra header
  // nodes), href, onPress, headingLevel = 3 }) → the card.
  // A plain card is role="article" labelled by its title (aria-labelledby).
  // href makes the card a link, onPress a button: the whole card is the
  // control, so put no other controls inside it.
  // Parts for custom layouts: Card.Header, Card.Title, Card.Description,
  // Card.Content, Card.Footer ({ children } or children directly).
  function Card(o = {}) {
    const variant = o.variant || 'default';
    const link = o.href != null, button = !link && typeof o.onPress === 'function';
    const tag = link ? 'a' : button ? 'button' : 'div';
    const el = h(tag, { class: cx('card', { [variant]: true }, (link || button) && 'yui-card--interactive'), 'data-slot': 'card', href: link ? o.href : null, type: button ? 'button' : null });
    // Buttons can only hold phrasing content, so a button card's parts are spans.
    const inline = button;
    let titleEl = null;
    if (o.title != null || o.description != null || o.header) {
      const header = h(inline ? 'span' : 'div', { class: 'card__header', 'data-slot': 'card-header' });
      if (o.title != null) {
        titleEl = h(inline ? 'span' : 'h' + (o.headingLevel || 3), { class: 'card__title', 'data-slot': 'card-title', id: uid('yui-card-title') }, o.title);
        header.append(titleEl);
      }
      if (o.description != null) header.append(h(inline ? 'span' : 'p', { class: 'card__description', 'data-slot': 'card-description' }, o.description));
      if (o.header) YapUI.append(header, [o.header]);
      el.append(header);
    }
    if (o.children != null) {
      const kids = [o.children].flat(Infinity);
      // Already-built parts go in as they are; anything else is content.
      if (kids.every((k) => k instanceof Element && /\bcard__/.test(k.className))) YapUI.append(el, kids);
      else el.append(h(inline ? 'span' : 'div', { class: 'card__content', 'data-slot': 'card-content' }, kids));
    }
    if (o.footer != null) el.append(h(inline ? 'span' : 'div', { class: 'card__footer', 'data-slot': 'card-footer' }, o.footer));
    if (button) {
      if (o.isDisabled) el.setAttribute('aria-disabled', 'true');
      el.addEventListener('click', (e) => { if (el.getAttribute('aria-disabled') !== 'true') o.onPress(e); });
    }
    if (!link && !button && o.role !== false) {
      el.setAttribute('role', o.role || 'article');
      titleEl = titleEl || el.querySelector('.card__title');
      if (titleEl) { if (!titleEl.id) titleEl.id = uid('yui-card-title'); el.setAttribute('aria-labelledby', titleEl.id); }
    }
    return pass(el, o);
  }
  Card.Header = part('div', 'card__header', 'card-header');
  Card.Title = part('h3', 'card__title', 'card-title');
  Card.Description = part('p', 'card__description', 'card-description');
  Card.Content = part('div', 'card__content', 'card-content');
  Card.Footer = part('div', 'card__footer', 'card-footer');

  // ---- Surface ----

  // Surface({ variant: 'transparent'|'default'|'secondary'|'tertiary' =
  // 'default', children, as = 'div' }) → a plain container on a surface color.
  function Surface(o = {}) {
    return pass(h(o.as || 'div', { class: cx('surface', { [o.variant || 'default']: true }), 'data-slot': 'surface' }, o.children), o);
  }

  // ---- Separator ----

  // Separator({ orientation: 'horizontal'|'vertical' = 'horizontal', variant:
  // 'default'|'secondary'|'tertiary' = 'default', isDecorative = false }).
  // Horizontal renders <hr> (implicit role separator); vertical renders a div
  // with role="separator" aria-orientation="vertical". isDecorative renders
  // an aria-hidden div with no semantics.
  function Separator(o = {}) {
    const orientation = o.orientation || 'horizontal';
    const cls = cx('separator', { [orientation]: true, [o.variant || 'default']: true });
    let el;
    if (o.isDecorative) el = h('div', { class: cls, 'aria-hidden': 'true' });
    else if (orientation === 'horizontal') el = h('hr', { class: cls });
    else el = h('div', { class: cls, role: 'separator', 'aria-orientation': 'vertical' });
    el.dataset.slot = 'separator';
    el.dataset.orientation = orientation;
    return pass(el, o);
  }

  // ---- Spinner ----

  const spinnerSvg = '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false" data-slot="spinner-icon"><circle cx="12" cy="12" r="9.5" stroke="currentColor" stroke-width="3" opacity="0.22"/><path d="M21.5 12A9.5 9.5 0 0 0 12 2.5" stroke="currentColor" stroke-width="3" stroke-linecap="round"/></svg>';

  // Spinner({ size: 'sm'|'md'|'lg'|'xl' = 'md', color: 'current'|'accent'|
  // 'success'|'warning'|'danger' = 'accent', label = 'Loading',
  // isDecorative = false }) → span.spinner with role="status" and the label
  // as screen-reader text. isDecorative (e.g. inside a button that already
  // says "Saving…") makes it aria-hidden with no role. Stops spinning under
  // prefers-reduced-motion. el.yui: setLabel(text).
  function Spinner(o = {}) {
    const el = h('span', { class: cx('spinner', { [o.size || 'md']: true, [o.color || 'accent']: true }), 'data-slot': 'spinner', html: spinnerSvg });
    const text = hidden(o.label || 'Loading');
    if (o.isDecorative) el.setAttribute('aria-hidden', 'true');
    else { el.setAttribute('role', 'status'); el.append(text); }
    pass(el, o);
    el.yui = { setLabel(t) { text.textContent = t; } };
    return el;
  }

  // ---- Skeleton ----

  // Skeleton({ animationType: 'shimmer'|'pulse'|'none' = 'shimmer', shape:
  // 'rect'|'circle'|'text' = 'rect', width, height }) → an aria-hidden
  // placeholder. width/height take CSS lengths (numbers are px). Build it to
  // match the layout that will load, inside a Skeleton.Region.
  function Skeleton(o = {}) {
    const el = h('div', { class: cx('skeleton', { [o.animationType || 'shimmer']: true }, o.shape && o.shape !== 'rect' && 'yui-skeleton--' + o.shape), 'data-slot': 'skeleton', 'aria-hidden': 'true' });
    const len = (v) => (typeof v === 'number' ? v + 'px' : v);
    if (o.width != null) el.style.width = len(o.width);
    if (o.height != null) el.style.height = len(o.height);
    return pass(el, o);
  }

  // Skeleton.Region({ children, label = 'Loading' }) → div with aria-busy="true"
  // and a status message for screen readers. el.yui.resolve(...nodes) swaps
  // the skeletons for the loaded content and clears aria-busy.
  function SkeletonRegion(o = {}) {
    const status = h('span', { class: 'yui-visually-hidden', role: 'status' }, o.label || 'Loading');
    const el = h('div', { class: 'yui-skeleton-region', 'data-slot': 'skeleton-region', 'aria-busy': 'true' }, status, o.children);
    pass(el, o);
    el.yui = {
      resolve(...nodes) {
        el.replaceChildren(...nodes.flat(Infinity).filter(Boolean));
        el.removeAttribute('aria-busy');
      },
    };
    return el;
  }
  Skeleton.Region = SkeletonRegion;

  // ---- ProgressBar ----

  // ProgressBar({ label, value = 0, minValue = 0, maxValue = 100,
  // isIndeterminate = false, size = 'md', color: 'default'|'accent'|'success'|
  // 'warning'|'danger' = 'accent', formatOptions = {style: 'percent'},
  // valueLabel: string | ({value, percentage, valueText}) => string,
  // showValueLabel = true, isDisabled, aria-label }) → div.progress-bar with
  // role="progressbar", aria-valuemin/max/now/valuetext. Indeterminate drops
  // aria-valuenow (HeroUI's CSS keys the animation off that).
  // el.yui: setValue(n), setIndeterminate(bool), setLabel(text),
  // setValueLabel(v), value().
  function ProgressBar(o = {}) {
    const min = o.minValue ?? 0, max = o.maxValue ?? 100;
    let value = o.value ?? 0, indeterminate = !!o.isIndeterminate, valueLabel = o.valueLabel;
    const fmt = new Intl.NumberFormat(undefined, o.formatOptions || { style: 'percent' });
    const percentStyle = !o.formatOptions || o.formatOptions.style === 'percent';
    const el = h('div', { class: cx('progress-bar', { [o.size || 'md']: true, [o.color || 'accent']: true }), 'data-slot': 'progress-bar', role: 'progressbar' });
    const labelId = uid('yui-progress-label');
    const labelEl = h('span', { 'data-slot': 'label', class: 'yui-progress-bar__label', id: labelId }, o.label);
    const output = h('span', { class: 'progress-bar__output', 'data-slot': 'progress-bar-output' });
    const fill = h('div', { class: 'progress-bar__fill', 'data-slot': 'progress-bar-fill' });
    const track = h('div', { class: 'progress-bar__track', 'data-slot': 'progress-bar-track' }, fill);
    if (o.label != null) { el.append(labelEl); el.setAttribute('aria-labelledby', labelId); }
    if (o.showValueLabel !== false) el.append(output);
    el.append(track);
    el.setAttribute('aria-valuemin', String(min));
    el.setAttribute('aria-valuemax', String(max));
    if (o.isDisabled) el.setAttribute('aria-disabled', 'true');

    function render() {
      const v = Math.min(max, Math.max(min, value));
      const percentage = max > min ? ((v - min) / (max - min)) * 100 : 0;
      el.dataset.indeterminate = String(indeterminate);
      if (indeterminate) {
        el.removeAttribute('aria-valuenow');
        el.removeAttribute('aria-valuetext');
        fill.style.removeProperty('width');
        output.textContent = '';
        return;
      }
      const valueText = percentStyle ? fmt.format(percentage / 100) : fmt.format(v);
      const text = typeof valueLabel === 'function' ? valueLabel({ value: v, percentage, valueText }) : valueLabel != null ? String(valueLabel) : valueText;
      el.setAttribute('aria-valuenow', String(v));
      el.setAttribute('aria-valuetext', text);
      fill.style.width = percentage + '%';
      output.textContent = text;
    }
    render();
    pass(el, o);
    el.yui = {
      setValue(n) { value = Number(n); indeterminate = false; render(); },
      setIndeterminate(b) { indeterminate = !!b; render(); },
      setLabel(t) { labelEl.textContent = t; if (!labelEl.isConnected) { el.prepend(labelEl); el.setAttribute('aria-labelledby', labelId); } },
      setValueLabel(v) { valueLabel = v; render(); },
      value: () => value,
    };
    return el;
  }

  // ---- Alert ----

  const STATUS_TEXT = { default: 'Note', accent: 'Info', success: 'Success', warning: 'Warning', danger: 'Error' };

  // Alert({ status: 'default'|'accent'|'success'|'warning'|'danger' =
  // 'default', title, description, children (actions or extra content),
  // icon (node / static SVG; false hides it), statusLabel, role: 'alert'|
  // 'status'|null = null, onClose, closeLabel = 'Close' }) → div.alert.
  // Each status has its own icon, and a screen-reader prefix ("Error:") on
  // the title, so meaning never rests on color. role: 'alert' only for urgent
  // alerts inserted at runtime; 'status' for polite updates; none for alerts
  // present on page load. onClose adds a close button; el.yui.close() removes
  // the alert and calls onClose().
  function Alert(o = {}) {
    const status = o.status || 'default';
    const el = h('div', { class: cx('alert', { [status]: true }), 'data-slot': 'alert', role: o.role || null });
    if (o.icon !== false) {
      const ic = iconNode(o.icon || icons[status] || icons.info);
      if (ic) { ic.setAttribute('aria-hidden', 'true'); if (!o.icon) ic.dataset.slot = 'alert-default-icon'; }
      el.append(h('div', { class: 'alert__indicator', 'data-slot': 'alert-indicator' }, ic));
    }
    const content = h('div', { class: 'alert__content', 'data-slot': 'alert-content' });
    const prefix = o.statusLabel === false ? null : hidden((o.statusLabel || STATUS_TEXT[status]) + ': ');
    if (o.title != null) content.append(h('div', { class: 'alert__title', 'data-slot': 'alert-title' }, prefix, o.title));
    if (o.description != null) content.append(h('div', { class: 'alert__description', 'data-slot': 'alert-description' }, o.title == null && prefix, o.description));
    if (o.children != null) content.append(h('div', { class: 'yui-alert__actions', 'data-slot': 'alert-actions' }, o.children));
    el.append(content);
    let closed = false;
    function close() {
      if (closed) return;
      closed = true;
      YapUI.exit(el, () => { el.remove(); if (o.onClose) o.onClose(); });
    }
    if (typeof o.onClose === 'function') {
      const btn = h('button', { type: 'button', class: 'close-button close-button--default yui-alert__close', 'data-slot': 'close-button', 'aria-label': o.closeLabel || 'Close', html: icons.close });
      btn.addEventListener('click', close);
      el.append(btn);
    }
    pass(el, o);
    el.yui = { close };
    return el;
  }

  // ---- EmptyState ----

  // EmptyState({ size: 'sm'|'lg' = 'lg', icon (node / static SVG), title,
  // description, children (one primary action, optionally a secondary
  // link), headingLevel = 3 }) → div.empty-state. sm for "no results" inside
  // a list or panel, lg for first-use, setup and error states.
  function EmptyState(o = {}) {
    const size = o.size || 'lg';
    const el = h('div', { class: cx('empty-state', {}, 'yui-empty-state', 'yui-empty-state--' + size), 'data-slot': 'empty-state' });
    const ic = iconNode(o.icon);
    if (ic) { ic.setAttribute('aria-hidden', 'true'); el.append(h('div', { class: 'yui-empty-state__icon', 'data-slot': 'empty-state-icon' }, ic)); }
    if (o.title != null) el.append(h('h' + (o.headingLevel || 3), { class: 'yui-empty-state__title', 'data-slot': 'empty-state-title' }, o.title));
    if (o.description != null) el.append(h('p', { class: 'yui-empty-state__description', 'data-slot': 'empty-state-description' }, o.description));
    if (o.children != null) el.append(h('div', { class: 'yui-empty-state__actions', 'data-slot': 'empty-state-actions' }, o.children));
    return pass(el, o);
  }

  Object.assign(YapUI, { initials, Avatar, AvatarGroup, Badge, BadgeAnchor, Chip, Card, Surface, Separator, Spinner, Skeleton, ProgressBar, Alert, EmptyState });
})();
