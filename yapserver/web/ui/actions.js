'use strict';

// actions components: Button, CloseButton, ButtonGroup, ToggleButton,
// ToggleButtonGroup, Link, Kbd. See ui-build/docs/actions.md.
//
// Markup follows HeroUI v3 (@heroui/styles components/button.css,
// button-group.css, close-button.css, toggle-button.css,
// toggle-button-group.css, link.css, kbd.css) and @heroui/react's DOM output
// (data-slot values, separators, Kbd key maps). Behavior follows the WAI-ARIA
// APG button, toggle button, toolbar and radio group patterns.
(() => {
  const YapUI = window.YapUI;
  const { h, append, uid } = YapUI;

  const SIZES = ['sm', 'md', 'lg'];
  const BUTTON_VARIANTS = ['primary', 'secondary', 'tertiary', 'outline', 'ghost', 'danger', 'danger-soft'];
  const TOGGLE_VARIANTS = ['default', 'ghost'];

  // ---- shared helpers ----

  function oneOf(name, value, allowed, fallback) {
    if (value == null) return fallback;
    if (!allowed.includes(value)) throw new Error(`YapUI: ${name} must be one of ${allowed.join(', ')} (got ${JSON.stringify(value)})`);
    return value;
  }

  // Attributes that pass straight through from options to the root element:
  // aria: {...}, data: {...}, 'aria-x' / 'data-x' keys, and a few plain ones.
  const PASS = ['id', 'name', 'value', 'form', 'tabindex', 'autofocus', 'lang', 'dir', 'role'];
  function passThrough(el, opts) {
    for (const [k, v] of Object.entries(opts)) {
      if (v == null || v === false) continue;
      if (k === 'aria') for (const [ak, av] of Object.entries(v)) { if (av != null) el.setAttribute('aria-' + ak, String(av)); }
      else if (k === 'data') for (const [dk, dv] of Object.entries(v)) { if (dv != null && dv !== false) el.dataset[dk] = dv === true ? 'true' : String(dv); }
      else if (/^(aria|data)-/.test(k) || PASS.includes(k.toLowerCase())) el.setAttribute(k.toLowerCase() === 'tabindex' ? 'tabindex' : k, v === true ? '' : String(v));
    }
    if (opts.class) for (const c of [].concat(opts.class).join(' ').split(/\s+/)) if (c) el.classList.add(c);
  }

  // The accessible-name options: ariaLabel, or aria: {label | labelledby},
  // or 'aria-label' / 'aria-labelledby'.
  const hasLabel = (o) => !!(o.ariaLabel || o.ariaLabelledby || o['aria-label'] || o['aria-labelledby'] || (o.aria && (o.aria.label || o.aria.labelledby)));
  function applyLabel(el, o) {
    if (o.ariaLabel) el.setAttribute('aria-label', o.ariaLabel);
    if (o.ariaLabelledby) el.setAttribute('aria-labelledby', o.ariaLabelledby);
    if (o.ariaDescribedby) el.setAttribute('aria-describedby', o.ariaDescribedby);
  }

  // A press event, close to React Aria's PressEvent.
  function pressEvent(el, e) {
    return {
      type: 'press', target: el, nativeEvent: e,
      pointerType: e.detail === 0 ? 'keyboard' : (e.pointerType || 'mouse'),
      shiftKey: e.shiftKey, ctrlKey: e.ctrlKey, metaKey: e.metaKey, altKey: e.altKey,
    };
  }

  // HeroUI's Spinner markup (display family owns YapUI.Spinner; this is a
  // local copy so actions doesn't depend on it). aria-hidden: the button
  // announces pending itself.
  function spinner(size = 'sm') {
    const id = uid('yui-spin');
    return h('span', {
      class: `spinner spinner--${size} spinner--current`, 'data-slot': 'spinner', aria: { hidden: 'true' },
      html: `<svg data-slot="spinner-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><defs><linearGradient id="${id}-a" x1="50%" x2="50%" y1="5.271%" y2="91.793%"><stop offset="0%" stop-color="currentColor"/><stop offset="100%" stop-color="currentColor" stop-opacity="0.55"/></linearGradient><linearGradient id="${id}-b" x1="50%" x2="50%" y1="15.24%" y2="87.15%"><stop offset="0%" stop-color="currentColor" stop-opacity="0"/><stop offset="100%" stop-color="currentColor" stop-opacity="0.55"/></linearGradient></defs><g fill="none"><path d="M8.749.021a1.5 1.5 0 0 1 .497 2.958A7.5 7.5 0 0 0 3 10.375a7.5 7.5 0 0 0 7.5 7.5v3c-5.799 0-10.5-4.7-10.5-10.5C0 5.23 3.726.865 8.749.021" fill="url(#${id}-a)" transform="translate(1.5 1.625)"/><path d="M15.392 2.673a1.5 1.5 0 0 1 2.119-.115A10.48 10.48 0 0 1 21 10.375c0 5.8-4.701 10.5-10.5 10.5v-3a7.5 7.5 0 0 0 5.007-13.084a1.5 1.5 0 0 1-.115-2.118" fill="url(#${id}-b)" transform="translate(1.5 1.625)"/></g></svg>`,
    });
  }

  // HeroUI's CloseIcon and ExternalLinkIcon (static markup).
  const CLOSE_ICON = '<svg aria-hidden="true" focusable="false" role="presentation" fill="none" width="16" height="16" viewBox="0 0 16 16" data-slot="close-button-icon"><path fill="currentColor" fill-rule="evenodd" clip-rule="evenodd" d="M3.47 3.47a.75.75 0 0 1 1.06 0L8 6.94l3.47-3.47a.75.75 0 1 1 1.06 1.06L9.06 8l3.47 3.47a.75.75 0 1 1-1.06 1.06L8 9.06l-3.47 3.47a.75.75 0 0 1-1.06-1.06L6.94 8 3.47 4.53a.75.75 0 0 1 0-1.06Z"/></svg>';
  const EXTERNAL_ICON = '<svg aria-hidden="true" focusable="false" role="presentation" fill="none" width="9" height="9" viewBox="0 0 7 7" data-slot="link-default-icon"><path fill="currentColor" d="M1.20592 6.84333L0.379822 6.01723L4.52594 1.8672H1.37819L1.38601 0.731812H6.48742V5.83714H5.34421L5.35203 2.6933L1.20592 6.84333Z"/></svg>';

  // Turns a string of static icon markup into a node; nodes pass through.
  const iconNode = (icon) => {
    if (icon == null || icon === false) return null;
    if (icon instanceof Node) return icon;
    const t = document.createElement('template');
    t.innerHTML = String(icon); // static markup from our own files only (CONVENTIONS rule 3)
    return t.content.firstElementChild;
  };

  // buttonClasses({variant, size, isIconOnly, fullWidth}) → HeroUI's
  // buttonVariants() class string, for styling a Link or other element as a
  // button.
  function buttonClasses({ variant, size, isIconOnly, fullWidth } = {}) {
    variant = oneOf('variant', variant, BUTTON_VARIANTS, 'primary');
    size = oneOf('size', size, SIZES, 'md');
    return ['button', 'button--' + size, 'button--' + variant, isIconOnly && 'button--icon-only', fullWidth && 'button--full-width'].filter(Boolean).join(' ');
  }

  // ---- Button ----

  // Button(options) → <button class="button …" data-slot="button">.
  //   children     string | Node | array. Put an icon (svg) first for a leading icon.
  //   icon         optional leading icon (static SVG string or Node).
  //   variant      'primary' (default) | 'secondary' | 'tertiary' | 'outline' | 'ghost' | 'danger' | 'danger-soft'
  //   size         'sm' | 'md' (default) | 'lg'
  //   isIconOnly   square button; requires ariaLabel (throws otherwise)
  //   ariaLabel    accessible name (required for icon-only)
  //   isPending    loading: spinner, aria-busy, presses ignored, still focusable
  //   pendingLabel text announced while pending (default 'Loading')
  //   isDisabled   aria-disabled="true": stays focusable, presses ignored
  //   fullWidth    stretch to the container
  //   type         'button' (default) | 'submit' | 'reset'
  //   onPress(e)   click, Enter or Space; e = {type, target, pointerType, shiftKey, ctrlKey, metaKey, altKey, nativeEvent}
  //   class, id, aria, data, 'aria-*', 'data-*' pass through.
  // Controller el.yui: setPending(b), setDisabled(b), setVariant(v),
  // setSize(s), isPending(), isDisabled(), destroy().
  function Button(opts = {}) {
    const isIconOnly = !!opts.isIconOnly;
    if (isIconOnly && !hasLabel(opts)) {
      throw new Error('YapUI.Button: an icon-only button needs an accessible name. Pass ariaLabel (e.g. "More actions") and attach a YapUI.Tooltip with the same text.');
    }
    const state = {
      variant: oneOf('variant', opts.variant, BUTTON_VARIANTS, 'primary'),
      size: oneOf('size', opts.size, SIZES, 'md'),
      fullWidth: !!opts.fullWidth,
      pending: false,
      disabled: false,
    };
    const el = h('button', { type: opts.type || 'button', 'data-slot': 'button' });
    const render = () => {
      const keep = [...el.classList].filter((c) => c !== 'button' && !c.startsWith('button--'));
      el.className = [buttonClasses({ variant: state.variant, size: state.size, isIconOnly, fullWidth: state.fullWidth }), ...keep].join(' ');
    };
    render();
    passThrough(el, opts);
    applyLabel(el, opts);
    append(el, [iconNode(opts.icon), opts.children]);

    // Which options the caller set, so a ButtonGroup only fills in the rest
    // (HeroUI: direct props win over group context).
    const explicit = { variant: opts.variant != null, size: opts.size != null, isDisabled: opts.isDisabled != null, fullWidth: opts.fullWidth != null };

    let spin = null, hiddenIcon = null, desc = null;
    function setPending(on) {
      on = !!on;
      if (on === state.pending) return;
      state.pending = on;
      if (on) {
        el.dataset.pending = 'true';
        el.setAttribute('aria-busy', 'true');
        spin = spinner('sm');
        // Replace a leading icon so the width doesn't change; otherwise the
        // spinner goes before the label, as in HeroUI's examples.
        const first = [...el.children].find((c) => c.dataset.slot !== 'button-group-separator');
        if (first && first.tagName.toLowerCase() === 'svg' && (isIconOnly || first === firstContentNode())) {
          hiddenIcon = first;
          hiddenIcon.classList.add('yui-button__hidden-icon');
          spin.classList.add('yui-button__spinner--icon');
          first.before(spin);
        } else {
          const sep = el.querySelector(':scope > [data-slot="button-group-separator"]');
          if (sep) sep.after(spin); else el.prepend(spin);
        }
        // The label stays the accessible name; the state is the description.
        desc = h('span', { id: uid('yui-pending'), class: 'yui-visually-hidden', aria: { hidden: 'true' }, text: opts.pendingLabel || 'Loading' });
        el.append(desc);
        const ids = (el.getAttribute('aria-describedby') || '').split(/\s+/).filter(Boolean);
        el.setAttribute('aria-describedby', [...ids, desc.id].join(' '));
      } else {
        delete el.dataset.pending;
        el.removeAttribute('aria-busy');
        if (spin) spin.remove();
        if (hiddenIcon) hiddenIcon.classList.remove('yui-button__hidden-icon');
        if (desc) {
          const ids = (el.getAttribute('aria-describedby') || '').split(/\s+/).filter((x) => x && x !== desc.id);
          if (ids.length) el.setAttribute('aria-describedby', ids.join(' ')); else el.removeAttribute('aria-describedby');
          desc.remove();
        }
        spin = hiddenIcon = desc = null;
      }
    }
    // The first meaningful child node (skipping whitespace and separators).
    function firstContentNode() {
      for (const n of el.childNodes) {
        if (n.nodeType === 3 && !n.textContent.trim()) continue;
        if (n.nodeType === 1 && n.dataset.slot === 'button-group-separator') continue;
        return n;
      }
      return null;
    }
    function setDisabled(on) {
      state.disabled = !!on;
      if (state.disabled) el.setAttribute('aria-disabled', 'true'); else el.removeAttribute('aria-disabled');
    }

    function onClick(e) {
      if (state.disabled || state.pending) { e.preventDefault(); e.stopImmediatePropagation(); return; }
      if (opts.onPress) opts.onPress(pressEvent(el, e));
    }
    el.addEventListener('click', onClick);

    setDisabled(opts.isDisabled);
    setPending(opts.isPending);

    el.yui = {
      setPending, setDisabled,
      setVariant(v) { state.variant = oneOf('variant', v, BUTTON_VARIANTS, 'primary'); render(); },
      setSize(s) { state.size = oneOf('size', s, SIZES, 'md'); render(); },
      setFullWidth(b) { state.fullWidth = !!b; render(); },
      isPending: () => state.pending,
      isDisabled: () => state.disabled,
      explicit,
      destroy() { el.removeEventListener('click', onClick); delete el.yui; },
    };
    return el;
  }
  Button.classes = buttonClasses;

  // ---- CloseButton ----

  // CloseButton(options) → <button class="close-button close-button--default" data-slot="close-button" aria-label="Close">.
  //   ariaLabel   default 'Close'; prefer something specific ('Close dialog', 'Dismiss alert')
  //   variant     'default'
  //   children    replaces the default × icon
  //   isDisabled, onPress(e), class, id, aria, data as for Button.
  // Controller el.yui: setDisabled(b), isDisabled(), destroy().
  function CloseButton(opts = {}) {
    const variant = oneOf('variant', opts.variant, ['default'], 'default');
    const el = h('button', { type: 'button', class: `close-button close-button--${variant}`, 'data-slot': 'close-button' });
    passThrough(el, opts);
    if (!opts.ariaLabelledby && !el.hasAttribute('aria-label') && !el.hasAttribute('aria-labelledby')) el.setAttribute('aria-label', opts.ariaLabel || 'Close');
    else applyLabel(el, opts);
    append(el, [opts.children != null ? opts.children : iconNode(CLOSE_ICON)]);
    let disabled = false;
    const setDisabled = (on) => { disabled = !!on; if (disabled) el.setAttribute('aria-disabled', 'true'); else el.removeAttribute('aria-disabled'); };
    setDisabled(opts.isDisabled);
    const onClick = (e) => {
      if (disabled) { e.preventDefault(); e.stopImmediatePropagation(); return; }
      if (opts.onPress) opts.onPress(pressEvent(el, e));
    };
    el.addEventListener('click', onClick);
    el.yui = { setDisabled, isDisabled: () => disabled, destroy() { el.removeEventListener('click', onClick); delete el.yui; } };
    return el;
  }

  // ---- ButtonGroup ----

  const separator = (block) => h('span', { class: `${block}__separator`, 'data-slot': `${block}-separator`, aria: { hidden: 'true' } });

  // ButtonGroup(options) → <div role="group" class="button-group button-group--horizontal" data-slot="button-group">.
  //   children       Button elements, or Button option objects (built for you)
  //   variant, size, isDisabled, fullWidth
  //                  applied to each child button that didn't set its own
  //   orientation    'horizontal' (default) | 'vertical'
  //   hideSeparator  no dividers between buttons (HeroUI: omit ButtonGroup.Separator)
  //   ariaLabel      name for the group (recommended)
  //   class, id, aria, data pass through.
  // Controller el.yui: setDisabled(b) (children that didn't set their own), destroy().
  function ButtonGroup(opts = {}) {
    const orientation = oneOf('orientation', opts.orientation, ['horizontal', 'vertical'], 'horizontal');
    const el = h('div', {
      role: 'group', 'data-slot': 'button-group',
      class: ['button-group', 'button-group--' + orientation, opts.fullWidth && 'button-group--full-width'],
    });
    passThrough(el, opts);
    applyLabel(el, opts);
    if (opts.variant != null) oneOf('variant', opts.variant, BUTTON_VARIANTS);
    if (opts.size != null) oneOf('size', opts.size, SIZES);
    const kids = [].concat(opts.children || []).flat(Infinity).filter(Boolean).map((c) =>
      c instanceof Node ? c : Button({ ...c, variant: c.variant ?? opts.variant, size: c.size ?? opts.size, isDisabled: c.isDisabled ?? opts.isDisabled, fullWidth: c.fullWidth ?? opts.fullWidth }));
    kids.forEach((b, i) => {
      const y = b.yui;
      if (y && y.explicit) {
        if (opts.variant != null && !y.explicit.variant) y.setVariant(opts.variant);
        if (opts.size != null && !y.explicit.size) y.setSize(opts.size);
        if (opts.isDisabled != null && !y.explicit.isDisabled) y.setDisabled(opts.isDisabled);
        if (opts.fullWidth != null && !y.explicit.fullWidth) y.setFullWidth(opts.fullWidth);
      }
      if (i > 0 && !opts.hideSeparator) b.prepend(separator('button-group'));
      el.append(b);
    });
    el.yui = {
      setDisabled(on) {
        for (const b of el.querySelectorAll(':scope > .button')) if (b.yui && !b.yui.explicit.isDisabled) b.yui.setDisabled(on);
      },
      destroy() { for (const b of el.querySelectorAll(':scope > .button')) if (b.yui) b.yui.destroy(); delete el.yui; },
    };
    return el;
  }

  // ---- ToggleButton ----

  // ToggleButton(options) → <button class="toggle-button …" data-slot="toggle-button" aria-pressed>.
  //   children        label: keep it the same in both states (the state is aria-pressed)
  //   icon            optional leading icon
  //   isSelected      initial state (alias: defaultSelected)
  //   onChange(sel)   after the state flips
  //   onPress(e)      every press
  //   variant         'default' (default) | 'ghost'
  //   size            'sm' | 'md' (default) | 'lg'
  //   isIconOnly      requires ariaLabel (throws otherwise)
  //   isDisabled, fullWidth, ariaLabel, class, id, aria, data.
  //   id              the key inside a ToggleButtonGroup (not set on the DOM; use domId)
  // Controller el.yui: setSelected(b) (no onChange), isSelected(), toggle(),
  // setDisabled(b), isDisabled(), setSize(s), destroy().
  function ToggleButton(opts = {}) {
    const isIconOnly = !!opts.isIconOnly;
    if (isIconOnly && !hasLabel(opts)) {
      throw new Error('YapUI.ToggleButton: an icon-only toggle button needs an accessible name. Pass ariaLabel (e.g. "Bold") and attach a YapUI.Tooltip.');
    }
    const variant = oneOf('variant', opts.variant, TOGGLE_VARIANTS, 'default');
    let size = oneOf('size', opts.size, SIZES, 'md');
    const el = h('button', { type: 'button', 'data-slot': 'toggle-button' });
    const render = () => {
      const keep = [...el.classList].filter((c) => c !== 'toggle-button' && !c.startsWith('toggle-button--'));
      el.className = ['toggle-button', 'toggle-button--' + size, 'toggle-button--' + variant, isIconOnly && 'toggle-button--icon-only', opts.fullWidth && 'toggle-button--full-width', ...keep].filter(Boolean).join(' ');
    };
    render();
    // id is the selection key (as in React Aria), not a DOM id; use domId for that.
    passThrough(el, { ...opts, id: opts.domId });
    applyLabel(el, opts);
    append(el, [iconNode(opts.icon), opts.children]);

    let selected = false, disabled = false;
    // In a single-selection ToggleButtonGroup the group switches this to
    // role="radio" + aria-checked (React Aria does the same).
    el.yuiStateAttr = 'aria-pressed';
    function setSelected(on) {
      selected = !!on;
      el.setAttribute(el.yuiStateAttr, String(selected));
      if (selected) el.dataset.selected = 'true'; else delete el.dataset.selected;
    }
    const setDisabled = (on) => { disabled = !!on; if (disabled) el.setAttribute('aria-disabled', 'true'); else el.removeAttribute('aria-disabled'); };
    setSelected(opts.isSelected ?? opts.defaultSelected);
    setDisabled(opts.isDisabled);

    function onClick(e) {
      if (disabled) { e.preventDefault(); e.stopImmediatePropagation(); return; }
      if (opts.onPress) opts.onPress(pressEvent(el, e));
      // A group decides selection itself (single mode, disallowEmptySelection).
      if (el.yuiGroupPress) { el.yuiGroupPress(e); return; }
      setSelected(!selected);
      if (opts.onChange) opts.onChange(selected);
    }
    el.addEventListener('click', onClick);

    el.yui = {
      setSelected, setDisabled,
      isSelected: () => selected,
      isDisabled: () => disabled,
      toggle() { setSelected(!selected); },
      setSize(s) { size = oneOf('size', s, SIZES, 'md'); render(); },
      explicit: { size: opts.size != null, isDisabled: opts.isDisabled != null },
      key: opts.id ?? opts.key,
      onChange: opts.onChange,
      destroy() { el.removeEventListener('click', onClick); delete el.yui; },
    };
    return el;
  }

  // ---- ToggleButtonGroup ----

  // ToggleButtonGroup(options) → <div class="toggle-button-group …" data-slot="toggle-button-group">.
  //   children               ToggleButton elements (each with an id), or ToggleButton option objects
  //   selectionMode          'single' (default; role="radiogroup", children role="radio") | 'multiple' (role="toolbar", aria-pressed)
  //   defaultSelectedKeys    iterable of ids selected at first (alias: selectedKeys)
  //   onSelectionChange(set) a new Set of selected ids after each change
  //   disallowEmptySelection the last selected button can't be turned off
  //   orientation            'horizontal' (default) | 'vertical'
  //   isDetached             gaps between buttons instead of attached
  //   hideSeparator          no dividers (attached mode)
  //   size, isDisabled       passed to children that didn't set their own
  //   fullWidth              stretch the group; buttons share the width
  //   ariaLabel              name for the group (required by ARIA for radiogroup/toolbar)
  // Keyboard: one Tab stop. Arrow keys move between buttons (wrapping), Home/End
  // jump to the ends. In single mode the arrows also select (APG radio group);
  // in multiple mode Space/Enter toggles (APG toolbar).
  // Controller el.yui: getSelectedKeys() → Set, setSelectedKeys(iterable) (no
  // onSelectionChange), setDisabled(b), destroy().
  function ToggleButtonGroup(opts = {}) {
    const mode = oneOf('selectionMode', opts.selectionMode, ['single', 'multiple'], 'single');
    const orientation = oneOf('orientation', opts.orientation, ['horizontal', 'vertical'], 'horizontal');
    if (opts.size != null) oneOf('size', opts.size, SIZES);
    if (!hasLabel(opts)) throw new Error('YapUI.ToggleButtonGroup: pass ariaLabel (e.g. "Text alignment") so the group has a name.');
    const el = h('div', {
      role: mode === 'single' ? 'radiogroup' : 'toolbar',
      'data-slot': 'toggle-button-group',
      class: ['toggle-button-group', 'toggle-button-group--' + orientation, opts.isDetached && 'toggle-button-group--detached', opts.fullWidth && 'toggle-button-group--full-width'],
      aria: { orientation },
    });
    passThrough(el, opts);
    applyLabel(el, opts);

    const items = [].concat(opts.children || []).flat(Infinity).filter(Boolean).map((c) =>
      c instanceof Node ? c : ToggleButton({ ...c, size: c.size ?? opts.size, isDisabled: c.isDisabled ?? opts.isDisabled }));
    const initial = new Set(opts.defaultSelectedKeys || opts.selectedKeys || []);
    items.forEach((b, i) => {
      const y = b.yui;
      if (!y) throw new Error('YapUI.ToggleButtonGroup: children must be YapUI.ToggleButton elements or option objects');
      if (y.key == null) throw new Error('YapUI.ToggleButtonGroup: every ToggleButton needs an id');
      if (opts.size != null && !y.explicit.size) y.setSize(opts.size);
      if (opts.isDisabled != null && !y.explicit.isDisabled) y.setDisabled(opts.isDisabled);
      if (mode === 'single') { b.removeAttribute('aria-pressed'); b.setAttribute('role', 'radio'); b.yuiStateAttr = 'aria-checked'; }
      y.setSelected(initial.has(y.key) || (initial.size === 0 && y.isSelected()));
      b.yuiGroupPress = () => press(b);
      if (i > 0 && !opts.hideSeparator) b.prepend(separator('toggle-button-group'));
      el.append(b);
    });
    if (mode === 'single') {
      // At most one selected.
      let seen = false;
      for (const b of items) if (b.yui.isSelected()) { if (seen) b.yui.setSelected(false); seen = true; }
    }

    const keys = () => new Set(items.filter((b) => b.yui.isSelected()).map((b) => b.yui.key));
    const enabled = () => items.filter((b) => !b.yui.isDisabled());

    function press(b) {
      const was = b.yui.isSelected();
      const selectedCount = items.filter((x) => x.yui.isSelected()).length;
      if (was && opts.disallowEmptySelection && selectedCount === 1) return;
      if (mode === 'single') {
        if (was && !opts.disallowEmptySelection) b.yui.setSelected(false);
        else if (!was) for (const x of items) x.yui.setSelected(x === b);
        else return;
      } else {
        b.yui.setSelected(!was);
      }
      if (b.yui.onChange) b.yui.onChange(b.yui.isSelected());
      if (opts.onSelectionChange) opts.onSelectionChange(keys());
    }

    // Roving tabindex: one tab stop, the selected button or the first enabled one.
    let current = null;
    function setCurrent(b) {
      current = b;
      for (const x of items) x.tabIndex = x === b ? 0 : -1;
    }
    const initialStop = () => items.find((b) => b.yui.isSelected() && !b.yui.isDisabled()) || enabled()[0] || items[0];
    setCurrent(initialStop());
    el.addEventListener('focusin', (e) => { const b = items.find((x) => x === e.target || x.contains(e.target)); if (b) setCurrent(b); });

    const nextKey = orientation === 'vertical' ? 'ArrowDown' : 'ArrowRight';
    const prevKey = orientation === 'vertical' ? 'ArrowUp' : 'ArrowLeft';
    function onKey(e) {
      const list = enabled();
      if (!list.length) return;
      const rtl = getComputedStyle(el).direction === 'rtl' && orientation === 'horizontal';
      let k = e.key;
      if (rtl && (k === 'ArrowLeft' || k === 'ArrowRight')) k = k === 'ArrowLeft' ? 'ArrowRight' : 'ArrowLeft';
      // Accept both axes, as React Aria does.
      const fwd = k === nextKey || (orientation === 'horizontal' ? k === 'ArrowDown' : k === 'ArrowRight');
      const back = k === prevKey || (orientation === 'horizontal' ? k === 'ArrowUp' : k === 'ArrowLeft');
      let i = list.indexOf(current);
      let target = null;
      if (fwd) target = list[(i + 1) % list.length];
      else if (back) target = list[(i - 1 + list.length) % list.length];
      else if (k === 'Home') target = list[0];
      else if (k === 'End') target = list[list.length - 1];
      if (!target) return;
      e.preventDefault();
      setCurrent(target);
      target.focus();
      if (mode === 'single' && !target.yui.isSelected()) press(target);
    }
    el.addEventListener('keydown', onKey);

    el.yui = {
      getSelectedKeys: keys,
      setSelectedKeys(iter) {
        const s = new Set(iter || []);
        let seen = false;
        for (const b of items) {
          const on = s.has(b.yui.key) && !(mode === 'single' && seen);
          if (on) seen = true;
          b.yui.setSelected(on);
        }
        if (mode === 'single') setCurrent(initialStop());
      },
      setDisabled(on) {
        for (const b of items) if (!b.yui.explicit.isDisabled) b.yui.setDisabled(on);
        if (current && current.yui.isDisabled()) setCurrent(initialStop());
      },
      destroy() { el.removeEventListener('keydown', onKey); for (const b of items) if (b.yui) b.yui.destroy(); delete el.yui; },
    };
    return el;
  }

  // ---- Link ----

  // Link(options) → <a class="link" data-slot="link" href>.
  //   href, target, rel, download  as on <a>
  //   children    link text: say where it goes ("Billing settings", not "click here")
  //   isExternal  target=_blank, rel="noopener noreferrer", the ↗ icon and a
  //               hidden "(opens in a new tab)"
  //   icon        true for HeroUI's default ↗ Link.Icon, or a Node / static SVG
  //   underline   'hover' (default, HeroUI) | 'always' (use for links inside running text)
  //   isDisabled  aria-disabled="true", navigation and onPress blocked, still focusable
  //   onPress(e)  activation by click or Enter. With no href the link renders as
  //               <span role="link" tabindex="0">.
  //   class, id, aria, data pass through. Style as a button with class: YapUI.Button.classes({...}).
  // Controller el.yui: setDisabled(b), isDisabled(), destroy().
  function Link(opts = {}) {
    const tag = opts.href != null ? 'a' : 'span';
    const el = h(tag, {
      class: ['link', opts.underline === 'always' && 'yui-link--underline'],
      'data-slot': 'link',
      href: opts.href,
      target: opts.target || (opts.isExternal ? '_blank' : null),
      rel: opts.rel || (opts.isExternal || opts.target === '_blank' ? 'noopener noreferrer' : null),
      download: opts.download === true ? true : opts.download || null,
    });
    if (tag === 'span') { el.setAttribute('role', 'link'); el.tabIndex = 0; }
    if (opts.underline != null) oneOf('underline', opts.underline, ['hover', 'always']);
    passThrough(el, opts);
    applyLabel(el, opts);
    append(el, [opts.children]);
    const iconOpt = opts.icon ?? (opts.isExternal ? true : null);
    if (iconOpt) el.append(LinkIcon(iconOpt === true ? null : iconOpt));
    if (opts.isExternal) el.append(h('span', { class: 'yui-visually-hidden', text: ' (opens in a new tab)' }));

    let disabled = false;
    const setDisabled = (on) => { disabled = !!on; if (disabled) el.setAttribute('aria-disabled', 'true'); else el.removeAttribute('aria-disabled'); };
    setDisabled(opts.isDisabled);
    const onClick = (e) => {
      if (disabled) { e.preventDefault(); e.stopImmediatePropagation(); return; }
      if (opts.onPress) opts.onPress(pressEvent(el, e));
    };
    // A span link needs Enter itself (native links only do it for <a href>).
    const onKey = (e) => { if (tag === 'span' && e.key === 'Enter') { e.preventDefault(); el.click(); } };
    el.addEventListener('click', onClick);
    el.addEventListener('keydown', onKey);
    el.yui = {
      setDisabled, isDisabled: () => disabled,
      destroy() { el.removeEventListener('click', onClick); el.removeEventListener('keydown', onKey); delete el.yui; },
    };
    return el;
  }

  // Link.Icon(icon?) → <span class="link__icon" data-slot="link-icon">; the
  // default is HeroUI's ↗ (data-default-icon="true").
  function LinkIcon(icon) {
    const node = iconNode(icon);
    return h('span', { class: 'link__icon', 'data-slot': 'link-icon', data: { defaultIcon: !node }, aria: { hidden: 'true' } }, node || iconNode(EXTERNAL_ICON));
  }
  Link.Icon = LinkIcon;

  // ---- Kbd ----

  // HeroUI's key maps (@heroui/react kbd.constants.js).
  const KEY_SYMBOLS = { command: '⌘', shift: '⇧', ctrl: '⌃', option: '⌥', enter: '↵', delete: '⌫', escape: '⎋', tab: '⇥', capslock: '⇪', up: '↑', right: '→', down: '↓', left: '←', pageup: '⇞', pagedown: '⇟', home: '↖', end: '↘', help: '?', space: '␣', fn: 'Fn', win: '⌘', alt: '⌥' };
  const KEY_TITLES = { command: 'Command', shift: 'Shift', ctrl: 'Control', option: 'Option', enter: 'Enter', delete: 'Delete', escape: 'Escape', tab: 'Tab', capslock: 'Caps Lock', up: 'Up', right: 'Right', down: 'Down', left: 'Left', pageup: 'Page Up', pagedown: 'Page Down', home: 'Home', end: 'End', help: 'Help', space: 'Space', fn: 'Fn', win: 'Win', alt: 'Alt' };
  // Aliases callers may write.
  const ALIASES = { cmd: 'command', meta: 'command', '⌘': 'command', control: 'ctrl', '⌃': 'ctrl', opt: 'option', '⌥': 'option', '⇧': 'shift', return: 'enter', esc: 'escape', backspace: 'delete', arrowup: 'up', arrowdown: 'down', arrowleft: 'left', arrowright: 'right', ' ': 'space', super: 'win' };
  const MODIFIERS = new Set(['command', 'ctrl', 'option', 'alt', 'shift', 'win', 'fn']);
  // Text names used off the Mac, where modifier symbols aren't printed on keys.
  const PC_TEXT = { command: 'Ctrl', ctrl: 'Ctrl', option: 'Alt', alt: 'Alt', shift: 'Shift', win: 'Win', enter: 'Enter', delete: 'Backspace', escape: 'Esc', tab: 'Tab', capslock: 'Caps Lock', pageup: 'PgUp', pagedown: 'PgDn', home: 'Home', end: 'End', space: 'Space', fn: 'Fn', help: 'Help' };

  // Normalizes one key: 'mod' is Command on the Mac and Ctrl elsewhere.
  function keyName(k, mac) {
    const low = String(k).toLowerCase();
    if (low === 'mod') return mac ? 'command' : 'ctrl';
    const name = ALIASES[low] || low;
    return KEY_SYMBOLS[name] ? name : null;
  }

  function parseKeys(keys) {
    if (Array.isArray(keys)) return keys;
    const s = String(keys);
    if (s === '+') return ['+'];
    return s.split(/\+(?!$)/).map((x) => x.trim() || '+'); // 'mod+shift+k', 'ctrl++'
  }

  // Kbd(options) → <kbd class="kbd">. Shows a keyboard shortcut.
  //   keys      'mod+shift+k' or ['command', 'K']. Named keys (command, shift,
  //             ctrl, option, alt, enter, delete, escape, tab, capslock, up,
  //             down, left, right, pageup, pagedown, home, end, help, space,
  //             fn, win, and 'mod') render as <abbr class="kbd__abbr"
  //             title="Command">⌘</abbr>; other keys as <span class="kbd__content">.
  //   isMac     platform override (default YapUI.isMac). Off the Mac, 'mod' is
  //             Ctrl and modifiers are written out and joined with '+'.
  //   variant   'default' | 'light' (transparent background)
  //   children  raw content instead of keys
  //   class, id, aria, data pass through.
  function Kbd(opts = {}) {
    if (typeof opts === 'string' || Array.isArray(opts)) opts = { keys: opts };
    const variant = oneOf('variant', opts.variant, ['default', 'light'], 'default');
    const mac = opts.isMac ?? YapUI.isMac;
    const el = h('kbd', { class: ['kbd', 'kbd--' + variant] });
    passThrough(el, opts);
    if (opts.keys == null) { append(el, [opts.children]); return el; }
    const list = parseKeys(opts.keys);
    list.forEach((k, i) => {
      const name = keyName(k, mac);
      if (!mac && i > 0) el.append(h('span', { class: 'kbd__content yui-kbd__plus', aria: { hidden: 'true' }, text: '+' }));
      if (name && (mac || !PC_TEXT[name])) {
        // The title is HeroUI's tooltip; the hidden text is what screen readers
        // read (most don't read abbr titles, and "⌘" reads as "place of interest").
        el.append(h('abbr', { class: 'kbd__abbr', title: KEY_TITLES[name] },
          h('span', { aria: { hidden: 'true' }, text: KEY_SYMBOLS[name] }),
          h('span', { class: 'yui-visually-hidden', text: KEY_TITLES[name] })));
      } else if (name) {
        el.append(h('span', { class: 'kbd__content', text: PC_TEXT[name] }));
      } else {
        el.append(h('span', { class: 'kbd__content', text: String(k).length === 1 ? String(k).toUpperCase() : String(k) }));
      }
    });
    return el;
  }

  // Kbd.format('mod+k') → '⌘K' on the Mac, 'Ctrl+K' elsewhere. Plain text,
  // for tooltips and menu hints.
  Kbd.format = (keys, isMac = YapUI.isMac) => {
    const parts = parseKeys(keys).map((k) => {
      const name = keyName(k, isMac);
      if (!name) return String(k).length === 1 ? String(k).toUpperCase() : String(k);
      return isMac ? KEY_SYMBOLS[name] : (PC_TEXT[name] || KEY_SYMBOLS[name]);
    });
    return parts.join(isMac ? '' : '+');
  };
  // Kbd.label('mod+k') → 'Command K' / 'Control K', for aria-keyshortcuts-style text.
  Kbd.label = (keys, isMac = YapUI.isMac) => parseKeys(keys).map((k) => {
    const name = keyName(k, isMac);
    return name ? KEY_TITLES[name] : (String(k).length === 1 ? String(k).toUpperCase() : String(k));
  }).join(' ');
  Kbd.symbols = KEY_SYMBOLS;
  Kbd.titles = KEY_TITLES;

  Object.assign(YapUI, { Button, CloseButton, ButtonGroup, ToggleButton, ToggleButtonGroup, Link, Kbd });
})();
