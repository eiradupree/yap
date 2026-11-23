'use strict';

// menus components: Dropdown (menu button + menu) and Tabs. See
// ui-build/docs/menus.md.
//
// Markup follows HeroUI v3's dropdown.css, menu.css, menu-item.css,
// menu-section.css, kbd.css and tabs.css. Behavior follows the WAI-ARIA APG
// Menu Button and Tabs patterns (React Aria's useMenu / useTabList).
(() => {
  const YapUI = window.YapUI;
  const { h, cx, uid, icons } = YapUI;

  // ---- shared helpers ----

  // Static markup from this file only.
  const CHECKMARK = '<svg aria-hidden="true" focusable="false" data-slot="menu-item-indicator--checkmark" fill="none" stroke="currentColor" stroke-dasharray="22" stroke-dashoffset="66" stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" viewBox="0 0 17 18"><polyline points="1 9 7 14 15 4"/></svg>';
  const DOT = '<svg aria-hidden="true" focusable="false" data-slot="menu-item-indicator--dot" fill="currentColor" viewBox="0 0 8 8"><circle cx="4" cy="4" r="4"/></svg>';

  function fromMarkup(markup) {
    const t = document.createElement('template');
    t.innerHTML = markup; // static markup from our own code (icons)
    return t.content.firstElementChild;
  }

  // A content option may be a string (text), a node, an array, or a function
  // returning one of those.
  const content = (v) => (typeof v === 'function' ? v() : v);

  // Tabbable/focusable content check that works on detached or hidden
  // elements (YapUI.focusables needs layout).
  const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"]), [contenteditable="true"], audio[controls], video[controls], summary';

  // ---- Kbd (HeroUI kbd.css), for menu item shortcuts ----

  const isMac = YapUI.isMac;
  // name → [symbol, title, aria-keyshortcuts name]
  const KEYS = {
    mod: isMac ? ['⌘', 'Command', 'Meta'] : ['Ctrl', 'Control', 'Control'],
    command: ['⌘', 'Command', 'Meta'],
    meta: ['⌘', 'Command', 'Meta'],
    ctrl: isMac ? ['⌃', 'Control', 'Control'] : ['Ctrl', 'Control', 'Control'],
    shift: ['⇧', 'Shift', 'Shift'],
    alt: isMac ? ['⌥', 'Option', 'Alt'] : ['Alt', 'Alt', 'Alt'],
    option: ['⌥', 'Option', 'Alt'],
    enter: ['↵', 'Enter', 'Enter'],
    delete: ['⌫', 'Delete', 'Backspace'],
    escape: ['Esc', 'Escape', 'Escape'],
    tab: ['⇥', 'Tab', 'Tab'],
    up: ['↑', 'Up', 'ArrowUp'],
    down: ['↓', 'Down', 'ArrowDown'],
    left: ['←', 'Left', 'ArrowLeft'],
    right: ['→', 'Right', 'ArrowRight'],
  };

  // shortcut: 'E' or ['mod', 'shift', 'E']. Named keys render as
  // <abbr class="kbd__abbr" title="Command">⌘</abbr>, the rest as
  // .kbd__content. Returns { el, keyshortcuts }.
  function shortcutKbd(shortcut, id) {
    const keys = Array.isArray(shortcut) ? shortcut : [shortcut];
    const parts = [], aria = [];
    for (const k of keys) {
      const named = KEYS[String(k).toLowerCase()];
      if (named) {
        parts.push(h('abbr', { class: 'kbd__abbr', title: named[1] }, named[0]));
        aria.push(named[2]);
      } else {
        parts.push(h('span', { class: 'kbd__content' }, String(k)));
        aria.push(String(k).length === 1 ? String(k).toUpperCase() : String(k));
      }
    }
    return { el: h('kbd', { class: 'kbd kbd--light', id, slot: 'keyboard', data: { slot: 'keyboard' } }, parts), keyshortcuts: aria.join('+') };
  }

  // HeroUI placements → core's "side align".
  function corePlacement(p) {
    const [side0, align0] = String(p || 'bottom').split(/[\s-]+/);
    const side = side0 === 'start' ? 'left' : side0 === 'end' ? 'right' : side0;
    const vertical = side === 'top' || side === 'bottom';
    const map = vertical ? { left: 'start', right: 'end', start: 'start', end: 'end' } : { top: 'start', bottom: 'end', start: 'start', end: 'end' };
    const align = map[align0];
    return align ? `${side} ${align}` : side;
  }

  // ---- Dropdown ----

  // Dropdown(trigger, options) turns an existing button into a menu button and
  // returns a controller { open(focus), close(), isOpen(), setSelectedKeys(keys),
  // selectedKeys(), setItems(items), update(), destroy() }. It is also stored
  // as trigger.yui.
  //
  // options:
  //   items: an array (or a function returning one, called on every open) of
  //     item:      { key, label, description, icon (static svg markup or a
  //                  node), shortcut ('E' or ['mod', 'E']), variant: 'default' |
  //                  'danger', isDisabled, textValue, indicator: 'checkmark' |
  //                  'dot', onAction(key), hidden,
  //                  items: [...] (a submenu), selectionMode (submenu's) }
  //     section:   { type: 'section', title, 'aria-label', items: [...] }
  //     separator: { type: 'separator' }
  //   selectionMode: 'none' | 'single' | 'multiple' ('none')
  //   selectedKeys / defaultSelectedKeys: iterable of keys
  //   disabledKeys: iterable of keys
  //   disallowEmptySelection: false; true keeps one item selected in single mode
  //   shouldCloseOnSelect: default true, false for multiple selection
  //   onAction(key), onSelectionChange(Set), onOpenChange(isOpen)
  //   placement: HeroUI placement ('bottom'), offset: 8
  //   trigger: 'press' | 'longPress' ('press')
  //   label: the menu's aria-label (default: labelled by the trigger)
  //   footer: a note under the menu (string or node), e.g. Yap's
  //     "You can also drag files…"
  //   class: extra classes on the popover
  function Dropdown(trigger, options = {}) {
    const o = { selectionMode: 'none', placement: 'bottom', offset: 8, trigger: 'press', ...options };
    let itemsOpt = o.items || [];
    let selected = new Set(o.selectedKeys || o.defaultSelectedKeys || []);
    const disabledKeys = new Set(o.disabledKeys || []);
    let root = null; // the open root level
    let cleanup = [];
    let lastPointerTarget = null;
    if (!trigger.id) trigger.id = uid('yui-dropdown-trigger');
    trigger.setAttribute('aria-haspopup', 'menu');
    trigger.setAttribute('aria-expanded', 'false');
    if (!trigger.classList.contains('button')) trigger.classList.add('dropdown__trigger');

    const triggerDisabled = () => trigger.disabled || trigger.getAttribute('aria-disabled') === 'true';

    // ---- building ----

    function buildLevel(defs, mode, parent, parentItem) {
      const level = { parent, parentItem, mode, items: [], sub: null, timers: {}, search: '', searchTimer: 0 };
      const menu = h('div', {
        role: 'menu', id: uid('yui-menu'), class: 'dropdown__menu', tabindex: -1,
        data: { slot: 'dropdown-menu' },
        aria: parentItem ? { labelledby: parentItem.el.id } : o.label ? { label: o.label } : { labelledby: trigger.id },
      });
      level.menu = menu;
      const addTo = (container, list) => {
        for (const def of list || []) {
          if (!def || def.hidden) continue;
          if (def.type === 'separator') {
            container.append(h('div', { role: 'separator', class: 'separator separator--horizontal', data: { slot: 'separator' } }));
          } else if (def.type === 'section') {
            const headerId = def.title ? uid('yui-menu-header') : null;
            const sec = h('div', {
              role: 'group', class: 'menu-section', data: { slot: 'menu-section' },
              aria: headerId ? { labelledby: headerId } : { label: def['aria-label'] },
            }, def.title && h('div', { class: 'header', id: headerId, data: { slot: 'header' }, aria: { hidden: 'true' } }, def.title));
            // The header is hidden from the accessibility tree because it
            // names the group; aria-labelledby still reads hidden elements.
            addTo(sec, def.items);
            container.append(sec);
          } else {
            const item = buildItem(def, level);
            level.items.push(item);
            container.append(item.el);
          }
        }
      };
      addTo(menu, defs);
      const pop = h('div', { class: ['dropdown__popover', parent ? 'yui-dropdown__submenu' : null, o.class], data: { slot: 'dropdown-popover' } }, menu);
      if (!parent && o.footer) {
        const id = uid('yui-menu-footer');
        pop.append(h('p', { class: 'description yui-dropdown__footer', id }, content(o.footer)));
        menu.setAttribute('aria-describedby', id);
      }
      level.pop = pop;
      menu.addEventListener('keydown', (e) => onKey(e, level));
      pop.addEventListener('pointerenter', () => { if (parent) clearTimeout(parent.timers.close); });
      return level;
    }

    function buildItem(def, level) {
      const key = def.key ?? def.id ?? def.label;
      const disabled = !!def.isDisabled || disabledKeys.has(key);
      const hasSub = Array.isArray(def.items) || typeof def.items === 'function';
      const mode = hasSub ? 'none' : level.mode;
      const role = mode === 'single' ? 'menuitemradio' : mode === 'multiple' ? 'menuitemcheckbox' : 'menuitem';
      const labelId = uid('yui-menu-label');
      const descId = def.description ? uid('yui-menu-desc') : null;
      const kbd = def.shortcut ? shortcutKbd(def.shortcut, uid('yui-menu-kbd')) : null;
      const label = h('span', { class: 'label', id: labelId, data: { slot: 'label' } }, def.label);
      const text = def.description
        ? h('div', { class: 'yui-menu-item__text' }, label, h('span', { class: 'description', id: descId, data: { slot: 'description' } }, def.description))
        : label;
      let icon = null;
      if (def.icon) {
        const node = typeof def.icon === 'string' ? fromMarkup(def.icon) : def.icon;
        icon = h('span', { class: 'yui-menu-item__icon', aria: { hidden: 'true' } }, node);
      }
      const indicator = mode !== 'none'
        ? h('span', { class: 'menu-item__indicator', data: { slot: 'menu-item-indicator' }, aria: { hidden: 'true' }, html: (def.indicator || o.indicator) === 'dot' ? DOT : CHECKMARK })
        : null;
      const subIndicator = hasSub
        ? h('span', { class: 'menu-item__indicator menu-item__indicator--submenu', data: { slot: 'submenu-indicator' }, aria: { hidden: 'true' }, html: icons.chevronRight })
        : null;
      const el = h('div', {
        role, id: uid('yui-menuitem'), tabindex: -1,
        class: cx('menu-item', { default: def.variant !== 'danger', danger: def.variant === 'danger' }),
        data: { slot: 'menu-item', key: String(key), selectionMode: mode !== 'none' ? mode : null, disabled: disabled || null, hasSubmenu: hasSub || null },
        aria: {
          labelledby: labelId,
          describedby: [descId, kbd && kbd.el.id].filter(Boolean).join(' ') || null,
          keyshortcuts: kbd ? kbd.keyshortcuts : null,
          disabled: disabled ? 'true' : null,
          haspopup: hasSub ? 'menu' : null,
          expanded: hasSub ? 'false' : null,
        },
      }, indicator, icon, text, kbd && kbd.el, subIndicator);
      const item = { el, def, key, disabled, hasSub, mode, level, text: String(def.textValue || def.label || '').toLowerCase() };
      if (mode !== 'none') paintSelected(item);
      el.addEventListener('click', (e) => { e.preventDefault(); activate(item, 'pointer'); });
      // React Aria's data-focused / data-focus-visible, so the keyboard ring
      // shows for keyboard users only (programmatic focus after a click would
      // otherwise depend on the browser's :focus-visible heuristics).
      el.addEventListener('focus', () => {
        el.dataset.focused = 'true';
        if (YapUI.isKeyboardFocus()) el.dataset.focusVisible = 'true'; else delete el.dataset.focusVisible;
      });
      el.addEventListener('blur', () => { delete el.dataset.focused; delete el.dataset.focusVisible; });
      // pointermove, not pointerenter: a menu that opens under a resting
      // cursor gets boundary events from layout alone, which mustn't steal focus.
      el.addEventListener('pointermove', (e) => {
        if (e.pointerType === 'touch' || level.hovered === item) return;
        level.hovered = item;
        onHover(item);
      });
      el.addEventListener('pointerleave', () => { if (level.hovered === item) level.hovered = null; });
      return item;
    }

    function paintSelected(item) {
      const on = selected.has(item.key);
      item.el.setAttribute('aria-checked', String(on));
      if (on) item.el.dataset.selected = 'true'; else delete item.el.dataset.selected;
      const check = item.el.querySelector('[data-slot="menu-item-indicator--checkmark"]');
      if (check) check.setAttribute('stroke-dashoffset', on ? '44' : '66');
    }

    function eachLevel(fn) { for (let l = root; l; l = l.sub) fn(l); }
    function repaint() { eachLevel((l) => l.items.forEach((it) => { if (it.mode !== 'none') paintSelected(it); })); }

    // ---- open / close ----

    function reposition() {
      if (!root) return;
      YapUI.position(root.pop, trigger, { placement: corePlacement(o.placement), offset: o.offset });
      for (let l = root.sub; l; l = l.sub) placeSub(l);
    }

    // Submenus are placed from layout values, not getBoundingClientRect(),
    // which is scaled while the parent's enter animation runs.
    function placeSub(level) {
      const pop = level.parent.pop, el = level.parentItem.el;
      let top = 0;
      for (let n = el; n && n !== pop; n = n.offsetParent) top += n.offsetTop;
      top += (parseFloat(pop.style.top) || 0) - pop.scrollTop;
      const left = parseFloat(pop.style.left) || 0;
      const pad = parseFloat(getComputedStyle(level.menu).paddingTop) || 0;
      YapUI.position(level.pop, new DOMRect(left, top - pad, pop.offsetWidth, el.offsetHeight), { placement: 'right start', offset: 4 });
    }

    function focusItem(level, i) {
      const n = level.items.length;
      if (!n) { level.menu.focus({ preventScroll: true }); return; }
      const item = level.items[((i % n) + n) % n];
      if (level.sub && level.sub.parentItem !== item) closeSub(level, false);
      item.el.focus({ preventScroll: false });
    }

    // open(focus): focus is 'first' (default), 'last', or false to leave
    // focus where it is.
    function open(focus = 'first') {
      if (triggerDisabled()) return;
      if (!root) {
        root = buildLevel(content(itemsOpt), o.selectionMode, null, null);
        YapUI.portal().append(root.pop);
        reposition();
        YapUI.enter(root.pop);
        trigger.setAttribute('aria-expanded', 'true');
        trigger.setAttribute('aria-controls', root.menu.id);
        const record = (e) => { lastPointerTarget = e.target; };
        window.addEventListener('pointerdown', record, true);
        cleanup = [
          YapUI.pushLayer({ el: root.pop, trigger, onDismiss: (reason) => close({ focusTrigger: reason === 'escape' }) }),
          YapUI.autoUpdate(reposition),
          () => window.removeEventListener('pointerdown', record, true),
        ];
        if (o.onOpenChange) o.onOpenChange(true);
      }
      // Like React Aria, a menu with a selection opens on its selected item.
      const sel = root.items.findIndex((it) => it.mode !== 'none' && selected.has(it.key));
      if (focus === 'first') focusItem(root, sel >= 0 ? sel : 0);
      else if (focus === 'last') focusItem(root, root.items.length - 1);
    }

    // close({focusTrigger = true}) closes the menu and its submenus.
    function close({ focusTrigger = true } = {}) {
      if (!root) return;
      closeSub(root, false);
      const pop = root.pop;
      root = null;
      for (const fn of cleanup) fn();
      cleanup = [];
      trigger.setAttribute('aria-expanded', 'false');
      trigger.removeAttribute('aria-controls');
      YapUI.exit(pop, () => pop.remove());
      if (focusTrigger) trigger.focus({ preventScroll: true });
      if (o.onOpenChange) o.onOpenChange(false);
    }

    function openSub(level, item, focus) {
      clearTimeout(level.timers.open);
      clearTimeout(level.timers.close);
      if (level.sub && level.sub.parentItem !== item) closeSub(level, false);
      if (!level.sub) {
        const defs = content(item.def.items);
        const sub = buildLevel(defs, item.def.selectionMode || 'none', level, item);
        level.sub = sub;
        YapUI.portal().append(sub.pop);
        placeSub(sub);
        YapUI.enter(sub.pop);
        item.el.setAttribute('aria-expanded', 'true');
        item.el.setAttribute('aria-controls', sub.menu.id);
        item.el.dataset.open = 'true';
        sub.removeLayer = YapUI.pushLayer({
          el: sub.pop, trigger: item.el,
          onDismiss: (reason) => {
            if (reason === 'escape') { closeSub(level, true); return; }
            // A press outside this submenu: inside the menu tree only this
            // submenu closes, anywhere else the whole menu does.
            const t = lastPointerTarget;
            let inside = false;
            eachLevel((l) => { if (t && l.pop.contains(t)) inside = true; });
            if (inside) closeSub(level, false); else close({ focusTrigger: false });
          },
        });
      }
      if (focus === 'first') focusItem(level.sub, 0);
    }

    // closeSub(level, refocus) closes level's open submenu (and deeper ones);
    // refocus moves focus back to the item that opened it.
    function closeSub(level, refocus) {
      clearTimeout(level.timers.open);
      clearTimeout(level.timers.close);
      const sub = level.sub;
      if (!sub) return;
      closeSub(sub, false);
      level.sub = null;
      sub.removeLayer();
      const item = sub.parentItem;
      item.el.setAttribute('aria-expanded', 'false');
      item.el.removeAttribute('aria-controls');
      delete item.el.dataset.open;
      const hadFocus = sub.pop.contains(document.activeElement);
      YapUI.exit(sub.pop, () => sub.pop.remove());
      if (refocus || hadFocus) item.el.focus({ preventScroll: true });
    }

    // ---- interaction ----

    function onHover(item) {
      const level = item.level;
      if (!root || item.disabled) return;
      if (document.activeElement !== item.el) item.el.focus({ preventScroll: true });
      clearTimeout(level.timers.open);
      if (level.sub && level.sub.parentItem !== item) {
        clearTimeout(level.timers.close);
        level.timers.close = setTimeout(() => closeSub(level, false), 200);
      } else if (level.sub) {
        clearTimeout(level.timers.close);
      }
      if (item.hasSub && !(level.sub && level.sub.parentItem === item)) {
        level.timers.open = setTimeout(() => openSub(level, item, false), 200);
      }
    }

    function activate(item, how) {
      if (item.disabled || !root) return;
      if (item.hasSub) { openSub(item.level, item, how === 'pointer' ? false : 'first'); return; }
      const mode = item.mode;
      if (mode === 'single') {
        const wasOn = selected.has(item.key);
        if (!(wasOn && o.disallowEmptySelection)) {
          for (const it of item.level.items) selected.delete(it.key);
          if (!wasOn || o.disallowEmptySelection) selected.add(item.key);
        }
      } else if (mode === 'multiple') {
        if (selected.has(item.key)) selected.delete(item.key); else selected.add(item.key);
      }
      if (mode !== 'none') {
        repaint();
        if (o.onSelectionChange) o.onSelectionChange(new Set(selected));
      }
      const shouldClose = o.shouldCloseOnSelect ?? mode !== 'multiple';
      if (shouldClose) close({ focusTrigger: true });
      if (item.def.onAction) item.def.onAction(item.key);
      if (o.onAction) o.onAction(item.key);
    }

    function typeahead(level, ch, current) {
      clearTimeout(level.searchTimer);
      level.search += ch.toLowerCase();
      level.searchTimer = setTimeout(() => { level.search = ''; }, 700);
      const n = level.items.length;
      const start = current < 0 ? 0 : level.search.length === 1 ? current + 1 : current;
      for (let k = 0; k < n; k++) {
        const it = level.items[(start + k) % n];
        if (!it.disabled && it.text.startsWith(level.search)) { focusItem(level, level.items.indexOf(it)); return true; }
      }
      return false;
    }

    function tabAway(back) {
      const list = YapUI.focusables(document.body).filter((el) => !el.closest('.yui-portal'));
      const i = list.indexOf(trigger);
      close({ focusTrigger: true });
      const next = i >= 0 ? list[i + (back ? -1 : 1)] : null;
      if (next) next.focus();
    }

    function onKey(e, level) {
      if (e.defaultPrevented || e.isComposing) return;
      const i = level.items.findIndex((it) => it.el === document.activeElement);
      const item = level.items[i];
      const stop = () => { e.preventDefault(); e.stopPropagation(); };
      switch (e.key) {
        case 'ArrowDown': stop(); focusItem(level, i + 1); return;
        case 'ArrowUp': stop(); focusItem(level, i < 0 ? -1 : i - 1); return;
        case 'Home': case 'PageUp': stop(); focusItem(level, 0); return;
        case 'End': case 'PageDown': stop(); focusItem(level, level.items.length - 1); return;
        case 'ArrowRight':
          stop();
          if (item && item.hasSub && !item.disabled) openSub(level, item, 'first');
          return;
        case 'ArrowLeft':
          stop();
          if (level.parent) closeSub(level.parent, true);
          return;
        case 'Enter':
          stop();
          if (item) activate(item, 'keyboard');
          return;
        case ' ':
          stop();
          if (level.search) typeahead(level, ' ', i);
          else if (item) activate(item, 'keyboard');
          return;
        case 'Tab':
          e.preventDefault();
          tabAway(e.shiftKey);
          return;
        default:
          if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
            if (typeahead(level, e.key, i) || level.search.length > 1) stop();
          }
      }
    }

    // ---- the trigger ----

    let longPressTimer = 0, longPressed = false;
    function onTriggerClick(e) {
      if (o.trigger === 'longPress') {
        if (longPressed) { longPressed = false; e.preventDefault(); e.stopImmediatePropagation(); }
        return;
      }
      if (root) close({ focusTrigger: true }); else open('first');
    }
    function onTriggerKey(e) {
      if (o.trigger === 'longPress') {
        if (e.altKey && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) { e.preventDefault(); open(e.key === 'ArrowUp' ? 'last' : 'first'); }
        return;
      }
      if (e.key === 'ArrowDown') { e.preventDefault(); open('first'); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); open('last'); }
      // Enter and Space reach onTriggerClick through the button's own click.
      else if ((e.key === 'Enter' || e.key === ' ') && trigger.tagName !== 'BUTTON') { e.preventDefault(); onTriggerClick(e); }
    }
    function onPointerDown(e) {
      if (o.trigger !== 'longPress' || e.button !== 0 || triggerDisabled()) return;
      clearTimeout(longPressTimer);
      longPressTimer = setTimeout(() => { longPressed = true; open('first'); }, 500);
    }
    const cancelLongPress = () => clearTimeout(longPressTimer);

    trigger.addEventListener('click', onTriggerClick, true);
    trigger.addEventListener('keydown', onTriggerKey);
    trigger.addEventListener('pointerdown', onPointerDown);
    trigger.addEventListener('pointerup', cancelLongPress);
    trigger.addEventListener('pointerleave', cancelLongPress);
    trigger.addEventListener('pointercancel', cancelLongPress);

    let hint = null;
    if (o.trigger === 'longPress') {
      hint = h('span', { class: 'yui-visually-hidden', id: uid('yui-longpress-hint') }, 'Long press or press Alt + Down Arrow to open the menu');
      trigger.after(hint);
      trigger.setAttribute('aria-describedby', [trigger.getAttribute('aria-describedby'), hint.id].filter(Boolean).join(' '));
    }

    const controller = {
      open,
      close: (opts) => close(opts),
      isOpen: () => !!root,
      // setSelectedKeys(keys) replaces the selection without calling onSelectionChange.
      setSelectedKeys(keys) { selected = new Set(keys || []); repaint(); },
      selectedKeys: () => new Set(selected),
      // setItems(items) takes effect on the next open.
      setItems(items) { itemsOpt = items; },
      update: reposition,
      destroy() {
        close({ focusTrigger: false });
        trigger.removeEventListener('click', onTriggerClick, true);
        trigger.removeEventListener('keydown', onTriggerKey);
        trigger.removeEventListener('pointerdown', onPointerDown);
        trigger.removeEventListener('pointerup', cancelLongPress);
        trigger.removeEventListener('pointerleave', cancelLongPress);
        trigger.removeEventListener('pointercancel', cancelLongPress);
        for (const a of ['aria-haspopup', 'aria-expanded', 'aria-controls']) trigger.removeAttribute(a);
        if (hint) {
          const rest = (trigger.getAttribute('aria-describedby') || '').split(/\s+/).filter((x) => x && x !== hint.id).join(' ');
          if (rest) trigger.setAttribute('aria-describedby', rest); else trigger.removeAttribute('aria-describedby');
          hint.remove();
        }
        trigger.classList.remove('dropdown__trigger');
        if (trigger.yui === controller) delete trigger.yui;
      },
    };
    trigger.yui = controller;
    return controller;
  }

  // ---- Tabs ----

  // Tabs(options) returns the .tabs root element, with el.yui =
  // { setSelectedKey(key), selectedKey(), setDisabledKeys(keys), destroy() }.
  //
  // options:
  //   tabs: [{ key, label, panel (string, node, array or function),
  //            isDisabled, tooltip (why it's disabled) }]
  //   variant: 'primary' | 'secondary' ('primary')
  //   orientation: 'horizontal' | 'vertical' ('horizontal')
  //   align: 'start' | 'center' | 'end' ('center')
  //   selectedKey / defaultSelectedKey (default: the first enabled tab)
  //   disabledKeys: iterable of keys
  //   keyboardActivation (alias activationMode): 'automatic' | 'manual'
  //     ('automatic': arrow keys select; 'manual': arrow keys move focus and
  //     Enter or Space selects)
  //   onSelectionChange(key)
  //   'aria-label' (or label): the tab list's name
  //   class, aria, data: passed to the root
  function Tabs(options = {}) {
    const o = { variant: 'primary', orientation: 'horizontal', align: 'center', ...options };
    const manual = (o.keyboardActivation || o.activationMode) === 'manual';
    const vertical = o.orientation === 'vertical';
    let disabledKeys = new Set(o.disabledKeys || []);
    const listLabel = o['aria-label'] || o.label;

    const list = h('div', {
      role: 'tablist', class: 'tabs__list', data: { slot: 'tabs-list', orientation: o.orientation },
      aria: { orientation: o.orientation, label: listLabel, labelledby: o['aria-labelledby'] },
    });
    const container = h('div', { class: 'tabs__list-container', data: { slot: 'tabs-list-container' } }, list);
    const el = h('div', {
      class: cx('tabs', { secondary: o.variant === 'secondary', 'align-start': o.align === 'start', 'align-end': o.align === 'end' }, o.class),
      data: { slot: 'tabs', orientation: o.orientation, ...(o.data || {}) },
      aria: o.aria,
    }, container);
    const indicator = h('span', { class: 'tabs__indicator', data: { slot: 'tabs-indicator', animationReady: 'false' }, aria: { hidden: 'true' } });

    const tabs = (o.tabs || []).map((def) => {
      const key = def.key ?? def.id ?? def.label;
      const tabId = uid('yui-tab'), panelId = uid('yui-tabpanel');
      const tab = h('div', {
        role: 'tab', id: tabId, class: 'tabs__tab', tabindex: -1,
        data: { slot: 'tabs-tab', key: String(key) },
        aria: { selected: 'false', controls: panelId },
      }, def.label);
      const panel = h('div', {
        role: 'tabpanel', id: panelId, class: 'tabs__panel', hidden: true,
        data: { slot: 'tabs-panel', orientation: o.orientation, key: String(key) },
        aria: { labelledby: tabId },
      }, content(def.panel));
      const t = { key, def, tab, panel, tipEl: null, tipUndo: null };
      tab.addEventListener('click', () => { if (!isDisabled(t)) { select(t, true); tab.focus(); } });
      list.append(tab);
      el.append(panel);
      return t;
    });

    const isDisabled = (t) => !!t.def.isDisabled || disabledKeys.has(t.key);
    const enabled = () => tabs.filter((t) => !isDisabled(t));

    function paintDisabled() {
      for (const t of tabs) {
        const off = isDisabled(t);
        if (off) { t.tab.setAttribute('aria-disabled', 'true'); t.tab.dataset.disabled = 'true'; }
        else { t.tab.removeAttribute('aria-disabled'); delete t.tab.dataset.disabled; }
        // A disabled tab explains itself: a description for screen readers and
        // a tooltip on hover (Tabs.tooltip hook).
        if (off && t.def.tooltip && !t.tipEl) {
          t.tipEl = h('span', { id: uid('yui-tab-why'), hidden: true }, t.def.tooltip);
          el.append(t.tipEl);
          t.tab.setAttribute('aria-describedby', t.tipEl.id);
          t.tab.dataset.explained = 'true';
          t.tipUndo = Tabs.tooltip(t.tab, t.def.tooltip);
        } else if (!off && t.tipEl) {
          t.tipEl.remove(); t.tipEl = null;
          t.tab.removeAttribute('aria-describedby');
          delete t.tab.dataset.explained;
          if (typeof t.tipUndo === 'function') t.tipUndo();
          t.tipUndo = null;
        }
      }
    }

    let current = null;
    let moveToken = 0;

    function placeIndicator(tab) {
      const from = current && indicator.isConnected && el.isConnected ? indicator.getBoundingClientRect() : null;
      tab.prepend(indicator);
      const token = ++moveToken;
      indicator.style.removeProperty('translate');
      indicator.style.removeProperty('width');
      indicator.style.removeProperty('height');
      if (!from || YapUI.reducedMotion()) { indicator.dataset.animationReady = 'false'; return; }
      const to = indicator.getBoundingClientRect();
      indicator.dataset.animationReady = 'false';
      indicator.style.translate = `${from.left - to.left}px ${from.top - to.top}px`;
      indicator.style.width = from.width + 'px';
      indicator.style.height = from.height + 'px';
      indicator.getBoundingClientRect(); // commit the start position
      indicator.dataset.animationReady = 'true';
      indicator.style.translate = '0px 0px';
      indicator.style.width = to.width + 'px';
      indicator.style.height = to.height + 'px';
      setTimeout(() => {
        if (token !== moveToken) return;
        indicator.dataset.animationReady = 'false';
        indicator.style.removeProperty('translate');
        indicator.style.removeProperty('width');
        indicator.style.removeProperty('height');
      }, 320);
    }

    function select(t, user) {
      if (!t || t === current) return;
      const prev = current;
      for (const x of tabs) {
        const on = x === t;
        x.tab.setAttribute('aria-selected', String(on));
        x.tab.tabIndex = on ? 0 : -1;
        if (on) x.tab.dataset.selected = 'true'; else delete x.tab.dataset.selected;
        x.panel.hidden = !on;
      }
      // A panel without focusable content is itself a tab stop (APG).
      if (t.panel.querySelector(FOCUSABLE)) t.panel.removeAttribute('tabindex'); else t.panel.tabIndex = 0;
      current = prev; // placeIndicator measures from the previous tab
      placeIndicator(t.tab);
      current = t;
      if (user && o.onSelectionChange) o.onSelectionChange(t.key);
    }

    list.addEventListener('keydown', (e) => {
      const i = tabs.findIndex((t) => t.tab === document.activeElement);
      if (i < 0) return;
      const rtl = getComputedStyle(el).direction === 'rtl';
      const next = vertical ? 'ArrowDown' : rtl ? 'ArrowLeft' : 'ArrowRight';
      const prev = vertical ? 'ArrowUp' : rtl ? 'ArrowRight' : 'ArrowLeft';
      const on = enabled();
      if (!on.length) return;
      let target = null;
      if (e.key === next || e.key === prev) {
        const step = e.key === next ? 1 : -1;
        for (let k = 1; k <= tabs.length; k++) {
          const t = tabs[(((i + step * k) % tabs.length) + tabs.length) % tabs.length];
          if (!isDisabled(t)) { target = t; break; }
        }
      } else if (e.key === 'Home') target = on[0];
      else if (e.key === 'End') target = on[on.length - 1];
      else if ((e.key === 'Enter' || e.key === ' ') && manual) {
        e.preventDefault();
        if (!isDisabled(tabs[i])) select(tabs[i], true);
        return;
      } else return;
      e.preventDefault();
      if (!target) return;
      target.tab.focus();
      if (!manual) select(target, true);
    });

    paintDisabled();
    const initialKey = o.selectedKey ?? o.defaultSelectedKey;
    const first = tabs.find((t) => t.key === initialKey && !isDisabled(t)) || enabled()[0];
    select(first, false);

    el.yui = {
      // setSelectedKey(key) selects a tab without calling onSelectionChange.
      setSelectedKey(key) { const t = tabs.find((x) => x.key === key); if (t && !isDisabled(t)) select(t, false); },
      selectedKey: () => current && current.key,
      setDisabledKeys(keys) {
        disabledKeys = new Set(keys || []);
        paintDisabled();
        if (current && isDisabled(current)) select(enabled()[0], true);
      },
      destroy() { for (const t of tabs) if (typeof t.tipUndo === 'function') t.tipUndo(); delete el.yui; },
    };
    return el;
  }

  // Tabs.tooltip(tab, text) shows why a disabled tab is disabled. It uses
  // YapUI.Tooltip (the overlays family) when that's loaded, and the native
  // title otherwise. Replace it to use something else. Returns an undo
  // function (or nothing).
  Tabs.tooltip = (tab, text) => {
    if (typeof YapUI.Tooltip === 'function') {
      const tip = YapUI.Tooltip(tab, { content: text });
      return () => tip && tip.destroy && tip.destroy();
    }
    tab.title = text;
    return () => tab.removeAttribute('title');
  };

  Object.assign(YapUI, { Dropdown, Tabs });
})();
