'use strict';

// forms components. See ui-build/docs/forms.md.
//
// Markup follows HeroUI v3's form components (textfield, input, textarea,
// search-field, checkbox, checkbox-group, switch, switch-group, fieldset,
// label, description, field-error). Native inputs carry the semantics:
// checkboxes and switches are visually hidden <input type="checkbox">
// elements inside HeroUI's control, the way React Aria renders them.
//
// Validation follows React Aria's validationBehavior "aria" (no native
// bubbles): a field validates when the user leaves it after editing, then
// live while it's invalid, and every field validates on submit.
(() => {
  const YapUI = window.YapUI;
  const { h, uid, icons } = YapUI;

  // svg turns static icon markup from our own code into an element.
  function svg(markup, attrs = {}) {
    const t = document.createElement('template');
    t.innerHTML = markup;
    const el = t.content.firstElementChild;
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
    return el;
  }

  const setFlag = (el, name, on) => { if (on) el.dataset[name] = 'true'; else delete el.dataset[name]; };
  const setAttr = (el, name, v) => { if (v == null || v === false) el.removeAttribute(name); else el.setAttribute(name, v === true ? '' : String(v)); };
  const messageOf = (r) => (r == null || r === true || r === false || r === '') ? null : Array.isArray(r) ? (r.filter(Boolean).join(' ') || null) : String(r);

  // ---- Label, Description, FieldError ----

  // necessity(isRequired, indicator) is the "(required)" / "(optional)" text
  // for necessityIndicator: 'label'. 'icon' uses HeroUI's CSS asterisk instead.
  function necessity(isRequired, indicator) {
    if (indicator !== 'label') return null;
    return h('span', { class: 'yui-necessity', text: isRequired ? ' (required)' : ' (optional)' });
  }

  // Label({ children, htmlFor, id, isRequired, isDisabled, isInvalid, necessityIndicator, as })
  // → <label class="label">. isRequired shows HeroUI's asterisk (or the
  // "(required)" text with necessityIndicator: 'label'). as: 'span' for group labels.
  function Label(o = {}) {
    const ind = o.necessityIndicator === undefined ? 'icon' : o.necessityIndicator;
    return h(o.as || 'label', {
      class: ['label', o.isRequired && ind === 'icon' && 'label--required', o.isDisabled && 'label--disabled', o.isInvalid && 'label--invalid', o.class],
      'data-slot': 'label', id: o.id, for: o.as && o.as !== 'label' ? null : o.htmlFor,
    }, o.children, necessity(o.isRequired, ind));
  }

  // Description({ children, id }) → help text for a field. Wire it to the
  // field with aria-describedby (the field factories do this for you).
  function Description(o = {}) {
    return h('div', { class: ['description', o.class], 'data-slot': 'description', id: o.id }, o.children);
  }

  // FieldError({ children, id }) → the error line: danger color plus an icon.
  // Hidden while empty. el.yui.set(message|null) shows or clears it.
  function FieldError(o = {}) {
    const text = h('span', { class: 'yui-field-error__text' });
    const el = h('div', { class: ['field-error', 'yui-field-error', o.class], 'data-slot': 'field-error', id: o.id },
      svg(icons.danger, { class: 'yui-field-error__icon' }), text);
    el.yui = {
      set(msg) {
        msg = messageOf(msg);
        text.textContent = msg || '';
        el.hidden = !msg;
        setFlag(el, 'visible', !!msg);
      },
    };
    el.yui.set(o.children);
    return el;
  }

  // ---- text fields ----

  // Checks, in order: isRequired → errorMessage or "Required"; pattern →
  // errorMessage; then options.validate(value) if given, otherwise minLength →
  // "Use at least N characters".
  function textField(kind, o) {
    const id = o.id || uid('yui-field');
    const descId = id + '-description', errId = id + '-error';
    const ind = o.necessityIndicator === undefined ? 'icon' : o.necessityIndicator;
    const variant = o.variant === 'secondary' ? 'secondary' : 'primary';
    const search = kind === 'search';
    const pattern = o.pattern == null ? null : o.pattern instanceof RegExp ? o.pattern : new RegExp('^(?:' + o.pattern + ')$', 'u');

    const attrs = {
      id, name: o.name, placeholder: o.placeholder,
      autocomplete: o.autocomplete ?? o.autoComplete, inputmode: o.inputMode, enterkeyhint: o.enterKeyHint,
      maxlength: o.maxLength, minlength: o.minLength,
      spellcheck: o.spellcheck == null ? null : String(o.spellcheck),
      autocapitalize: o.autoCapitalize, autocorrect: o.autoCorrect,
      readonly: !!o.isReadOnly, disabled: !!o.isDisabled, autofocus: !!o.autoFocus,
      aria: { ...(o.aria || {}), required: o.isRequired ? 'true' : null },
    };
    let control;
    if (kind === 'textarea') {
      control = h('textarea', { ...attrs, rows: o.rows ?? 3, cols: o.cols, wrap: o.wrap, class: ['textarea', 'textarea--' + variant, o.fullWidth && 'textarea--full-width'], 'data-slot': 'textarea' });
    } else if (search) {
      control = h('input', { ...attrs, type: 'search', role: 'searchbox', class: 'search-field__input', 'data-slot': 'search-field-input' });
    } else {
      control = h('input', { ...attrs, type: o.type || 'text', class: ['input', 'input--' + variant, o.fullWidth && 'input--full-width'], 'data-slot': 'input' });
    }
    control.value = o.value ?? o.defaultValue ?? '';

    const label = o.label != null ? Label({ children: o.label, htmlFor: id, isRequired: o.isRequired, necessityIndicator: ind }) : null;
    const desc = o.description != null ? Description({ id: descId, children: o.description }) : null;
    const err = FieldError({ id: errId });

    let group = null, clearBtn = null;
    if (search) {
      clearBtn = h('button', { type: 'button', class: 'close-button close-button--default search-field__clear-button', 'data-slot': 'search-field-clear-button', slot: 'clear', tabindex: '-1', aria: { label: o.clearLabel || 'Clear search' } },
        svg(icons.close, { 'data-slot': 'close-button-icon' }));
      group = h('div', { class: ['search-field__group', o.fullWidth && 'search-field__group--full-width'], 'data-slot': 'search-field-group' },
        svg(icons.search, { class: 'search-field__search-icon', 'data-slot': 'search-field-search-icon' }),
        control, clearBtn);
    }

    const root = h('div', {
      class: search
        ? ['search-field', 'search-field--' + variant, o.fullWidth && 'search-field--full-width', 'yui-field', o.class]
        : ['textfield', o.fullWidth && 'textfield--full-width', 'yui-field', o.class],
      'data-slot': search ? 'search-field' : 'textfield',
      data: { ...(o.data || {}), required: o.isRequired && ind === 'icon', disabled: !!o.isDisabled, readonly: !!o.isReadOnly },
    }, label, group || control, desc, err);

    let error = null, dirty = false;

    function wire() {
      const ids = [error && errId, desc && descId, o.aria && o.aria.describedby].filter(Boolean);
      setAttr(control, 'aria-describedby', ids.length ? ids.join(' ') : null);
    }

    function show(msg) {
      error = messageOf(msg);
      err.yui.set(error);
      setAttr(control, 'aria-invalid', error ? 'true' : null);
      setFlag(root, 'invalid', !!error);
      setFlag(control, 'invalid', !!error);
      if (group) setFlag(group, 'invalid', !!error);
      wire();
    }

    function check() {
      const v = control.value;
      if (o.isRequired && !v.trim()) return messageOf(o.errorMessage) || 'Required';
      if (v && pattern && !pattern.test(v)) return messageOf(o.errorMessage) || 'Use the format shown';
      if (o.validate) return messageOf(o.validate(v)); // validate owns every rule past required
      if (v && o.minLength && v.length < o.minLength) return `Use at least ${o.minLength} characters`;
      return null;
    }

    function validate() { dirty = true; const m = check(); show(m); return m; }
    const syncEmpty = () => { if (search) setFlag(root, 'empty', control.value === ''); };

    control.addEventListener('input', () => {
      dirty = true;
      syncEmpty();
      if (error) show(check()); // once invalid, re-validate as the user types
      o.onChange?.(control.value);
    });
    control.addEventListener('blur', (e) => {
      if (dirty) show(check());
      o.onBlur?.(e);
    });
    control.addEventListener('focus', (e) => o.onFocus?.(e));
    root.addEventListener('focusin', () => { setFlag(root, 'focusWithin', true); if (group) setFlag(group, 'focusWithin', true); });
    root.addEventListener('focusout', (e) => {
      if (root.contains(e.relatedTarget)) return;
      setFlag(root, 'focusWithin', false); if (group) setFlag(group, 'focusWithin', false);
    });

    function clear() {
      if (control.value === '') return;
      control.value = '';
      dirty = true;
      syncEmpty();
      if (error) show(check());
      o.onChange?.('');
      o.onClear?.();
    }

    if (search) {
      clearBtn.addEventListener('pointerdown', (e) => e.preventDefault()); // keep focus in the input
      clearBtn.addEventListener('click', () => {
        if (control.disabled || control.readOnly) return;
        clear();
        control.focus();
      });
      control.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && o.onSubmit) { e.preventDefault(); o.onSubmit(control.value); }
      });
      if (o.isDisabled) setFlag(group, 'disabled', true);
    }

    if (o.isInvalid) show(messageOf(o.errorMessage) || 'Check this field');
    else wire();
    syncEmpty();

    root.yui = {
      input: control,
      kind: search ? 'search-field' : kind === 'textarea' ? 'text-area' : 'text-field',
      get name() { return o.name; },
      get label() { return o.label != null ? String(o.label) : (o.aria && o.aria.label) || ''; },
      get value() { return control.value; },
      get isInvalid() { return !!error; },
      get isDisabled() { return control.disabled; },
      setValue(v) { control.value = v ?? ''; syncEmpty(); if (error) show(check()); },
      validate,
      setError(msg) { show(msg); },
      focus() { control.focus(); },
      setDisabled(on) { control.disabled = !!on; setFlag(root, 'disabled', !!on); if (group) setFlag(group, 'disabled', !!on); },
      clear,
    };
    return root;
  }

  // TextField({ label, description, type, name, id, value, defaultValue,
  //   placeholder, isRequired, isDisabled, isReadOnly, isInvalid, errorMessage,
  //   validate(value) → string|null, minLength, maxLength, pattern,
  //   autocomplete, inputMode, spellcheck, autoCapitalize, enterKeyHint,
  //   autoFocus, necessityIndicator: 'icon'|'label'|null, variant:
  //   'primary'|'secondary', fullWidth, onChange(value), onBlur(e), aria, data, class })
  // → .textfield root. el.yui = { input, value, setValue(v), validate() →
  // message|null, setError(message|null), focus(), setDisabled(bool), isInvalid }.
  const TextField = (o = {}) => textField('input', o);

  // TextArea(same options as TextField, plus rows (3), cols, wrap) → .textfield
  // root holding a <textarea class="textarea">. Same controller.
  const TextArea = (o = {}) => textField('textarea', o);

  // SearchField(TextField options, plus onSubmit(value) on Enter, onClear(),
  // clearLabel ('Clear search')) → .search-field root. Escape or the clear
  // button empties it. Same controller, plus clear().
  const SearchField = (o = {}) => textField('search', o);

  // Input({ type, variant, fullWidth, value, onChange(value), and the same
  // pass-through attributes as TextField }) → a bare <input class="input">,
  // for the rare field whose label lives elsewhere (pass aria: { label }).
  // Prefer TextField: it brings the label, description and errors.
  function Input(o = {}) {
    const el = h('input', {
      type: o.type || 'text', id: o.id, name: o.name, placeholder: o.placeholder,
      autocomplete: o.autocomplete ?? o.autoComplete, inputmode: o.inputMode, enterkeyhint: o.enterKeyHint,
      maxlength: o.maxLength, minlength: o.minLength, spellcheck: o.spellcheck == null ? null : String(o.spellcheck),
      autocapitalize: o.autoCapitalize, readonly: !!o.isReadOnly, disabled: !!o.isDisabled,
      class: ['input', 'input--' + (o.variant === 'secondary' ? 'secondary' : 'primary'), o.fullWidth && 'input--full-width', o.class],
      'data-slot': 'input', aria: o.aria || {}, data: o.data || {},
    });
    el.value = o.value ?? o.defaultValue ?? '';
    el.addEventListener('input', () => o.onChange?.(el.value));
    return el;
  }

  // Escape clears a non-empty search field. Core's layer handler listens on
  // document in the capture phase, so Escape would close an enclosing modal
  // before the input saw it; this listener runs earlier (on window) and marks
  // the event handled. An empty field lets Escape through to close the layer.
  window.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || e.defaultPrevented) return;
    const t = e.target;
    if (!(t instanceof HTMLInputElement) || !t.classList.contains('search-field__input')) return;
    if (t.value === '' || t.readOnly || t.disabled) return;
    const root = t.closest('.search-field');
    if (!root || !root.yui) return;
    e.preventDefault();
    root.yui.clear();
  }, true);

  // ---- checkbox ----

  const CHECKMARK = '<svg aria-hidden="true" focusable="false" role="presentation" data-slot="checkbox-default-indicator--checkmark" fill="none" stroke="currentColor" stroke-dasharray="22" stroke-dashoffset="66" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" viewBox="0 0 17 18"><polyline points="1 9 7 14 15 4"/></svg>';
  const DASH = '<svg aria-hidden="true" focusable="false" role="presentation" data-slot="checkbox-default-indicator--indeterminate" fill="none" stroke="currentColor" stroke-width="3" viewBox="0 0 24 24"><line x1="21" x2="3" y1="12" y2="12"/></svg>';

  // focusVisible mirrors the native input's :focus-visible onto HeroUI's
  // content slot, which is what its focus-ring selector reads.
  function focusVisible(input, content) {
    input.addEventListener('focus', () => setFlag(content, 'focusVisible', input.matches(':focus-visible')));
    input.addEventListener('blur', () => setFlag(content, 'focusVisible', false));
  }

  // Checkbox({ label, description, isSelected, defaultSelected, isIndeterminate,
  //   isDisabled, isInvalid, isReadOnly, isRequired, errorMessage, name, value,
  //   id, variant: 'primary'|'secondary', onChange(isSelected), aria, data, class })
  // → .checkbox root. The whole label is clickable. el.yui = { input,
  // isSelected, setSelected(bool), setIndeterminate(bool), setInvalid(bool),
  // setError(message|null), setDisabled(bool), validate(), focus() }.
  function Checkbox(o = {}) {
    const id = o.id || uid('yui-checkbox');
    const descId = id + '-description', errId = id + '-error';
    const input = h('input', {
      type: 'checkbox', id, name: o.name, value: o.value, class: 'yui-visually-hidden',
      disabled: !!o.isDisabled,
      aria: { ...(o.aria || {}), required: o.isRequired ? 'true' : null, readonly: o.isReadOnly ? 'true' : null },
    });
    input.checked = !!(o.isSelected ?? o.defaultSelected);
    input.indeterminate = !!o.isIndeterminate;
    const check = svg(CHECKMARK);
    const content = h('label', { class: 'checkbox__content', 'data-slot': 'checkbox-content', for: id },
      input,
      h('span', { class: 'checkbox__control', 'data-slot': 'checkbox-control' },
        h('span', { class: 'checkbox__indicator', 'data-slot': 'checkbox-indicator' }, check, svg(DASH))),
      o.label != null && h('span', { class: 'label', 'data-slot': 'label' }, o.label));
    const desc = o.description != null ? Description({ id: descId, children: o.description }) : null;
    const err = FieldError({ id: errId });
    const root = h('div', {
      class: ['checkbox', 'checkbox--' + (o.variant === 'secondary' ? 'secondary' : 'primary'), !o._inGroup && 'yui-field', o.class],
      'data-slot': 'checkbox', data: { ...(o.data || {}), required: !!o.isRequired, readonly: !!o.isReadOnly },
    }, content, desc, err);
    focusVisible(input, content);

    let invalid = !!o.isInvalid, error = null;
    function sync() {
      const ind = input.indeterminate;
      setFlag(root, 'selected', input.checked && !ind);
      setFlag(root, 'indeterminate', ind);
      setFlag(root, 'disabled', input.disabled);
      setFlag(root, 'invalid', invalid || !!error);
      setAttr(input, 'aria-invalid', invalid || error ? 'true' : null);
      check.setAttribute('stroke-dashoffset', input.checked && !ind ? '44' : '66');
      const ids = [error && errId, desc && descId, o.aria && o.aria.describedby].filter(Boolean);
      setAttr(input, 'aria-describedby', ids.length ? ids.join(' ') : null);
    }
    function show(msg) { error = messageOf(msg); err.yui.set(error); sync(); }
    const checkReq = () => (o.isRequired && !input.checked ? messageOf(o.errorMessage) || 'Required' : null);

    // Read-only: keep focus and the label, ignore toggling (native checkboxes
    // have no readonly).
    input.addEventListener('click', (e) => { if (o.isReadOnly) e.preventDefault(); });
    input.addEventListener('change', () => {
      sync();
      if (error) show(checkReq());
      o.onChange?.(input.checked);
    });
    if (o.isInvalid && o.errorMessage) show(o.errorMessage); else sync();

    root.yui = {
      input,
      kind: 'checkbox',
      get name() { return o.name; },
      get label() { return o.label != null ? String(o.label) : (o.aria && o.aria.label) || ''; },
      get isSelected() { return input.checked; },
      get value() { return input.checked; },
      get isInvalid() { return invalid || !!error; },
      get isDisabled() { return input.disabled; },
      setSelected(on) { input.checked = !!on; input.indeterminate = false; sync(); },
      setValue(on) { this.setSelected(on); },
      setIndeterminate(on) { input.indeterminate = !!on; sync(); },
      setInvalid(on) { invalid = !!on; sync(); },
      setError(msg) { show(msg); },
      setDisabled(on) { input.disabled = !!on; sync(); },
      validate() { const m = checkReq(); show(m); return m; },
      focus() { input.focus(); },
    };
    return root;
  }

  // CheckboxGroup({ label, description, options: [{ value, label, description,
  //   isDisabled }], value / defaultValue: string[], name, isRequired,
  //   isDisabled, isInvalid, errorMessage, validate(values) → string|null,
  //   necessityIndicator, variant, onChange(values), id, aria, class })
  // → .checkbox-group (role="group"). Validates when focus leaves the group
  // after a change, then live while invalid. el.yui = { value, setValue(arr),
  // validate(), setError(message|null), focus(), checkboxes }.
  function CheckboxGroup(o = {}) {
    const id = o.id || uid('yui-checkbox-group');
    const labelId = id + '-label', descId = id + '-description', errId = id + '-error';
    const ind = o.necessityIndicator === undefined ? 'icon' : o.necessityIndicator;
    const initial = new Set(o.value ?? o.defaultValue ?? []);
    let error = null, dirty = false;
    const values = () => boxes.filter((b) => b.yui.isSelected).map((b) => b.yui.input.value);

    const boxes = (o.options || []).map((opt, i) => Checkbox({
      _inGroup: true, id: id + '-' + i, name: o.name, value: opt.value, label: opt.label,
      description: opt.description, isDisabled: o.isDisabled || opt.isDisabled,
      isReadOnly: o.isReadOnly, variant: o.variant, isSelected: initial.has(opt.value),
      onChange: () => { dirty = true; if (error) show(check()); o.onChange?.(values()); },
    }));
    const label = o.label != null ? Label({ as: 'span', id: labelId, children: o.label, isRequired: o.isRequired, necessityIndicator: ind }) : null;
    const desc = o.description != null ? Description({ id: descId, children: o.description }) : null;
    const err = FieldError({ id: errId });
    const root = h('div', {
      class: ['checkbox-group', 'yui-field', o.class], 'data-slot': 'checkbox-group', role: 'group', id,
      aria: { ...(o.aria || {}), labelledby: label ? labelId : null },
      data: { required: o.isRequired && ind === 'icon', disabled: !!o.isDisabled },
    }, label, desc, boxes, err);
    if (o.isDisabled) root.setAttribute('aria-disabled', 'true');

    function show(msg) {
      error = messageOf(msg);
      err.yui.set(error);
      setFlag(root, 'invalid', !!error);
      for (const b of boxes) b.yui.setInvalid(!!error);
      const ids = [error && errId, desc && descId].filter(Boolean);
      setAttr(root, 'aria-describedby', ids.length ? ids.join(' ') : null);
    }
    function check() {
      const v = values();
      if (o.isRequired && v.length === 0) return messageOf(o.errorMessage) || 'Select at least one';
      if (o.validate) return messageOf(o.validate(v));
      return null;
    }
    root.addEventListener('focusout', (e) => { if (dirty && !root.contains(e.relatedTarget)) show(check()); });
    if (o.isInvalid) show(messageOf(o.errorMessage) || 'Check this field'); else show(null);

    root.yui = {
      kind: 'checkbox-group',
      checkboxes: boxes,
      get name() { return o.name; },
      get label() { return o.label != null ? String(o.label) : (o.aria && o.aria.label) || ''; },
      get value() { return values(); },
      get isInvalid() { return !!error; },
      get isDisabled() { return boxes.every((b) => b.yui.isDisabled); },
      setValue(arr) { const s = new Set(arr || []); for (const b of boxes) b.yui.setSelected(s.has(b.yui.input.value)); if (error) show(check()); },
      validate() { dirty = true; const m = check(); show(m); return m; },
      setError(msg) { show(msg); },
      focus() { (boxes.find((b) => !b.yui.isDisabled) || boxes[0])?.yui.focus(); },
    };
    return root;
  }

  // ---- switch ----

  // Switch({ label, description, isSelected, defaultSelected, isDisabled,
  //   isReadOnly, size: 'sm'|'md'|'lg', name, value, id, onChange(isSelected),
  //   aria, data, class }) → .switch root holding an
  // <input type="checkbox" role="switch">. A switch takes effect at once:
  // act in onChange, don't wait for a Save button. el.yui = { input,
  // isSelected, setSelected(bool), setDisabled(bool), focus() }.
  function Switch(o = {}) {
    const id = o.id || uid('yui-switch');
    const descId = id + '-description';
    const size = ['sm', 'lg'].includes(o.size) ? o.size : 'md';
    const input = h('input', {
      type: 'checkbox', role: 'switch', id, name: o.name, value: o.value, class: 'yui-visually-hidden',
      disabled: !!o.isDisabled,
      aria: { ...(o.aria || {}), readonly: o.isReadOnly ? 'true' : null },
    });
    input.checked = !!(o.isSelected ?? o.defaultSelected);
    const content = h('label', { class: 'switch__content', 'data-slot': 'switch-content', for: id },
      input,
      h('span', { class: 'switch__control', 'data-slot': 'switch-control' },
        h('span', { class: 'switch__thumb', 'data-slot': 'switch-thumb' })),
      o.label != null && h('span', { class: 'label', 'data-slot': 'label' }, o.label));
    const desc = o.description != null ? Description({ id: descId, children: o.description }) : null;
    if (desc) input.setAttribute('aria-describedby', [descId, o.aria && o.aria.describedby].filter(Boolean).join(' '));
    const root = h('div', { class: ['switch', 'switch--' + size, o.class], 'data-slot': 'switch', data: { ...(o.data || {}), readonly: !!o.isReadOnly } }, content, desc);
    focusVisible(input, content);

    const sync = () => { setFlag(root, 'selected', input.checked); setFlag(root, 'disabled', input.disabled); };
    input.addEventListener('click', (e) => { if (o.isReadOnly) e.preventDefault(); });
    input.addEventListener('change', () => { sync(); o.onChange?.(input.checked); });
    sync();

    root.yui = {
      input,
      kind: 'switch',
      get isSelected() { return input.checked; },
      setSelected(on) { input.checked = !!on; sync(); },
      setDisabled(on) { input.disabled = !!on; sync(); },
      focus() { input.focus(); },
    };
    return root;
  }

  // SwitchGroup({ label, orientation: 'vertical'|'horizontal', children, class })
  // → .switch-group. With a label it's a role="group" named by that label.
  function SwitchGroup(o = {}) {
    const labelId = uid('yui-switch-group') + '-label';
    const orientation = o.orientation === 'horizontal' ? 'horizontal' : 'vertical';
    return h('div', {
      class: ['switch-group', 'switch-group--' + orientation, o.class], 'data-slot': 'switch-group',
      role: o.label != null ? 'group' : null, aria: { labelledby: o.label != null ? labelId : null, ...(o.aria || {}) },
    },
    o.label != null && Label({ as: 'span', id: labelId, children: o.label }),
    h('div', { class: 'switch-group__items', 'data-slot': 'switch-group-items' }, o.children));
  }

  // ---- fieldset ----

  // Fieldset({ legend, description, children, actions, isDisabled, class })
  // → <fieldset class="fieldset"> with a legend, an optional description
  // (wired with aria-describedby), the fields, and an optional actions row.
  function Fieldset(o = {}) {
    const descId = uid('yui-fieldset') + '-description';
    return h('fieldset', {
      class: ['fieldset', o.class], 'data-slot': 'fieldset', disabled: !!o.isDisabled,
      aria: { describedby: o.description != null ? descId : null, ...(o.aria || {}) },
    },
    o.legend != null && h('legend', { class: 'fieldset__legend', 'data-slot': 'fieldset-legend' }, o.legend),
    o.description != null && h('p', { class: 'fieldset__description description', 'data-slot': 'fieldset-description', id: descId }, o.description),
    h('div', { class: 'fieldset__field-group', 'data-slot': 'fieldset-field-group' }, o.children),
    o.actions != null && h('div', { class: 'fieldset__actions', 'data-slot': 'fieldset-actions' }, o.actions));
  }

  // ---- form ----

  // Form({ children, onSubmit(values, form) → Promise, submitLabel,
  //   pendingLabel, actions, description, summaryTitle(count), id, class, aria })
  // → <form novalidate> with an error summary at the top, the children, a
  // status line and the actions at the bottom left.
  //
  // On submit every field (any .yui-field inside it) validates. If any fail,
  // the summary lists them as links and focus moves to the first one.
  // Otherwise the submit button is disabled while onSubmit runs. onSubmit can:
  //   - resolve with a string: shown as a success status;
  //   - throw an Error: its message goes in the summary (a server error);
  //   - throw { message, fields: { name: message } }: field errors from the server.
  // el.yui = { fields(), values(), validate(), setErrors(map, message),
  // setSummary(message|null), setStatus(message|null), setPending(bool), reset() }.
  function Form(o = {}) {
    const summaryTitle = h('p', { class: 'alert__title' });
    const summaryList = h('ul', { class: 'alert__description yui-form__summary-list' });
    const summary = h('div', { class: 'alert alert--danger yui-form__summary', 'data-slot': 'alert', role: 'alert', hidden: true },
      h('div', { class: 'alert__indicator', 'data-slot': 'alert-indicator' }, svg(icons.danger, { 'data-slot': 'alert-default-icon' })),
      h('div', { class: 'alert__content', 'data-slot': 'alert-content' }, summaryTitle, summaryList));
    const status = h('p', { class: 'yui-form__status', role: 'status' });
    const submit = o.submitLabel === null ? null
      : h('button', { type: 'submit', class: 'button button--primary', 'data-slot': 'button' }, o.submitLabel || 'Submit');
    const actions = h('div', { class: 'yui-form__actions', 'data-slot': 'form-actions' }, submit, o.actions);
    const form = h('form', { class: ['yui-form', o.class], novalidate: true, id: o.id, aria: o.aria || {} },
      summary,
      o.description != null && Description({ class: 'yui-form__description', children: o.description }),
      o.children, status, actions);

    let pending = false;
    const fields = () => [...form.querySelectorAll('.yui-field')].filter((f) => f.yui && f.yui.validate && !f.yui.isDisabled && !f.closest('fieldset:disabled'));
    const findField = (name) => fields().find((f) => f.yui.name === name);

    function values() {
      const out = {};
      for (const f of fields()) if (f.yui.name) out[f.yui.name] = f.yui.value;
      return out;
    }

    function setSummary(message, items = []) {
      summaryList.replaceChildren(...items.map(([f, msg]) => {
        const target = f.yui.input || f.querySelector('input');
        const a = h('a', { href: '#' + (target ? target.id : ''), class: 'link yui-form__summary-link' }, (f.yui.label ? f.yui.label + ': ' : '') + msg);
        a.addEventListener('click', (e) => { e.preventDefault(); f.yui.focus(); });
        return h('li', null, a);
      }));
      summaryTitle.textContent = message || '';
      summary.hidden = !message;
    }

    function setStatus(msg) { status.textContent = msg || ''; }

    function setPending(on) {
      pending = !!on;
      setAttr(form, 'aria-busy', pending ? 'true' : null);
      if (!submit) return;
      setAttr(submit, 'aria-disabled', pending ? 'true' : null);
      setFlag(submit, 'pending', pending);
      if (o.pendingLabel) submit.textContent = pending ? o.pendingLabel : (o.submitLabel || 'Submit');
    }

    const titleFor = (n) => (o.summaryTitle ? o.summaryTitle(n) : n === 1 ? 'Fix 1 field to continue' : `Fix ${n} fields to continue`);

    function validate() {
      const errs = [];
      for (const f of fields()) { const m = f.yui.validate(); if (m) errs.push([f, m]); }
      if (errs.length) setSummary(titleFor(errs.length), errs); else setSummary(null);
      return errs;
    }

    function setErrors(map = {}, message) {
      const errs = [];
      for (const [name, msg] of Object.entries(map)) {
        const f = findField(name);
        if (f) { f.yui.setError(msg); errs.push([f, msg]); }
      }
      setSummary(message || (errs.length ? titleFor(errs.length) : null), errs);
      if (errs.length) errs[0][0].yui.focus();
    }

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (pending) return;
      setStatus(null);
      const errs = validate();
      if (errs.length) { errs[0][0].yui.focus(); return; }
      if (!o.onSubmit) return;
      setPending(true);
      try {
        const r = await o.onSubmit(values(), form.yui);
        if (typeof r === 'string') setStatus(r);
      } catch (err) {
        if (err && err.fields) setErrors(err.fields, err.message);
        else setSummary((err && err.message) || String(err));
      } finally {
        setPending(false);
      }
    });

    form.yui = {
      fields, values, validate, setErrors, setSummary: (m) => setSummary(m), setStatus, setPending,
      submitButton: submit,
      get isPending() { return pending; },
      reset() {
        for (const f of fields()) { f.yui.setValue(f.yui.kind === 'checkbox' ? false : f.yui.kind === 'checkbox-group' ? [] : ''); f.yui.setError(null); }
        setSummary(null); setStatus(null);
      },
    };
    return form;
  }

  Object.assign(YapUI, { Label, Description, FieldError, TextField, Input, TextArea, SearchField, Checkbox, CheckboxGroup, Switch, SwitchGroup, Fieldset, Form });
})();
