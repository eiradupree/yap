'use strict';

// Gallery sections for forms.
(() => {
  const { h, gallery } = YapUI;
  const { section, example, log } = gallery;
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  // Demos sit in a readable column; set through the CSSOM (CSP-safe).
  const col = (width, ...nodes) => h('div', { class: 'yui-demo-col', style: { display: 'grid', gap: '16px', width: '100%', maxWidth: width } }, ...nodes);
  const row = (...nodes) => h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: '24px', alignItems: 'flex-start', width: '100%' } }, ...nodes);
  const cell = (...nodes) => h('div', { style: { flex: '1 1 220px', minWidth: '0', maxWidth: '320px' } }, ...nodes);

  const USERNAME_HINT = "3–32 letters, digits, '.', '_' or '-'";
  const usernameCheck = (v) => (/^[A-Za-z0-9_.-]{3,32}$/.test(v) ? null : `Use ${USERNAME_HINT}`);
  const passwordCheck = (v) => (v.length >= 8 && v.length <= 72 ? null : 'Use 8–72 characters');

  section('text-field', 'Text field', 'A label above the field, hints in a description below, and errors that appear when you leave the field and clear as soon as it is fixed.', (body) => {
    const out = log();
    body.append(
      example('Label, description and validation',
        col('320px',
          YapUI.TextField({ id: 'tf-username', label: 'Username', name: 'username', autocomplete: 'username', description: USERNAME_HINT, isRequired: true, maxLength: 32, spellcheck: false, autoCapitalize: 'none', validate: usernameCheck, onChange: (v) => out.set(`change "${v}"`), onBlur: () => out.set('blur') }),
          out)),
      example('States',
        row(
          cell(YapUI.TextField({ id: 'tf-required', label: 'Display name', isRequired: true, autocomplete: 'nickname' })),
          cell(YapUI.TextField({ id: 'tf-placeholder', label: 'Email', type: 'email', inputMode: 'email', autocomplete: 'email', placeholder: 'you@example.com' })),
          cell(YapUI.TextField({ id: 'tf-invalid', label: 'Channel name', value: 'General Chat', isInvalid: true, errorMessage: 'Use lowercase letters, digits, - or _', description: 'Lowercase letters, digits, - or _' })),
          cell(YapUI.TextField({ id: 'tf-disabled', label: 'Workspace', value: 'yap.example.com', isDisabled: true })),
          cell(YapUI.TextField({ id: 'tf-readonly', label: 'User ID', value: 'USR-12345', isReadOnly: true, description: 'Assigned when you signed up' })),
          cell(YapUI.TextField({ id: 'tf-secondary', label: 'Status', variant: 'secondary', placeholder: 'What are you up to?' })))),
      example('New channel name',
        col('320px', YapUI.TextField({ id: 'tf-channel', label: 'Channel name', name: 'name', maxLength: 32, autocomplete: 'off', spellcheck: false, description: 'Lowercase letters, digits, - or _', validate: (v) => (/^[a-z0-9_-]{1,32}$/.test(v) || !v ? null : 'Use lowercase letters, digits, - or _') }))),
      example('Input alone (label elsewhere, like the sidebar\'s new-channel box)',
        YapUI.Input({ id: 'in-bare', aria: { label: 'New channel name' }, placeholder: 'new-channel', maxLength: 32, autocomplete: 'off' })),
      example('Full width',
        YapUI.TextField({ id: 'tf-full', label: 'Topic', fullWidth: true, description: 'Shown under the channel name' })),
    );
  });

  section('text-area', 'Text area', 'For multi-line text. Three rows by default; it grows with a drag handle.', (body) => {
    body.append(
      example('With description and limit',
        col('420px', YapUI.TextArea({ id: 'ta-bio', label: 'About you', name: 'bio', maxLength: 280, description: 'Up to 280 characters', validate: (v) => (v.trim().length && v.trim().length < 10 ? 'Use at least 10 characters' : null) }))),
      example('States',
        row(
          cell(YapUI.TextArea({ id: 'ta-required', label: 'Reason', isRequired: true, placeholder: 'Tell us what happened' })),
          cell(YapUI.TextArea({ id: 'ta-invalid', label: 'Message', value: 'hi', isInvalid: true, errorMessage: 'Use at least 10 characters' })),
          cell(YapUI.TextArea({ id: 'ta-disabled', label: 'Notes', value: 'Locked by an admin', isDisabled: true })),
          cell(YapUI.TextArea({ id: 'ta-readonly', label: 'Channel purpose', value: 'Release coordination', isReadOnly: true })),
          cell(YapUI.TextArea({ id: 'ta-secondary', label: 'Draft', variant: 'secondary', rows: 2 })))),
    );
  });

  section('search-field', 'Search field', 'Escape or the clear button empties it. Enter submits.', (body) => {
    const out = log();
    body.append(
      example('Search messages',
        col('320px',
          YapUI.SearchField({ id: 'sf-basic', label: 'Search messages', name: 'q', placeholder: 'Search', onChange: (v) => out.set(`change "${v}"`), onSubmit: (v) => out.set(`submit "${v}"`), onClear: () => out.set('clear') }),
          out)),
      example('States',
        row(
          cell(YapUI.SearchField({ id: 'sf-desc', label: 'Find a channel', description: 'Search by name or topic', value: 'release' })),
          cell(YapUI.SearchField({ id: 'sf-secondary', label: 'Filter members', variant: 'secondary' })),
          cell(YapUI.SearchField({ id: 'sf-invalid', label: 'Search', value: 'a', isInvalid: true, errorMessage: 'Use at least 2 characters' })),
          cell(YapUI.SearchField({ id: 'sf-disabled', label: 'Search archive', isDisabled: true, value: 'old' })))),
    );
  });

  section('checkbox', 'Checkbox', 'For independent options. A lone checkbox is one on/off setting; opt-ins start unchecked. The whole label is clickable.', (body) => {
    const out = log();
    const groupOut = log();
    // "Select all" with an indeterminate parent.
    const kinds = [['mentions', 'Mentions'], ['replies', 'Replies to my threads'], ['dms', 'Direct messages']];
    let all;
    const children = kinds.map(([value, label], i) => YapUI.Checkbox({ id: 'cb-all-' + value, name: 'digest', value, label, isSelected: i === 0, onChange: () => syncAll() }));
    function syncAll() {
      const n = children.filter((c) => c.yui.isSelected).length;
      if (n === 0) all.yui.setSelected(false);
      else if (n === children.length) all.yui.setSelected(true);
      else { all.yui.setSelected(false); all.yui.setIndeterminate(true); }
      groupOut.set(children.filter((c) => c.yui.isSelected).map((c) => c.yui.input.value).join(', ') || 'none');
    }
    all = YapUI.Checkbox({ id: 'cb-all', label: 'All activity', onChange: (on) => { for (const c of children) c.yui.setSelected(on); syncAll(); } });
    const childList = h('div', { role: 'group', aria: { label: 'Activity types' }, style: { display: 'grid', gap: '12px', paddingInlineStart: '28px', marginTop: '12px' } }, children);

    body.append(
      example('Single setting',
        col('360px',
          YapUI.Checkbox({ id: 'cb-basic', name: 'updates', label: 'Email me product updates', onChange: (on) => out.set(`change ${on}`) }),
          YapUI.Checkbox({ id: 'cb-desc', label: 'Show link previews', description: 'Applies to messages you send', isSelected: true }),
          out)),
      example('States',
        row(
          cell(YapUI.Checkbox({ id: 'cb-selected', label: 'Selected', isSelected: true })),
          cell(YapUI.Checkbox({ id: 'cb-indeterminate', label: 'Indeterminate', isIndeterminate: true })),
          cell(YapUI.Checkbox({ id: 'cb-disabled', label: 'Disabled', isDisabled: true })),
          cell(YapUI.Checkbox({ id: 'cb-disabled-on', label: 'Disabled, selected', isDisabled: true, isSelected: true })),
          cell(YapUI.Checkbox({ id: 'cb-readonly', label: 'Read-only', isReadOnly: true, isSelected: true })),
          cell(YapUI.Checkbox({ id: 'cb-secondary', label: 'Secondary', variant: 'secondary' })),
          cell(YapUI.Checkbox({ id: 'cb-invalid', label: 'I agree to the terms', isRequired: true, isInvalid: true, errorMessage: 'Agree to the terms to continue' })))),
      example('Select all',
        col('360px', h('div', null, all, childList), groupOut)),
      example('Checkbox group',
        row(
          cell(YapUI.CheckboxGroup({ id: 'cbg-topics', label: 'Topics', name: 'topics', description: 'Pick the ones you follow', isRequired: true, errorMessage: 'Select at least one topic', defaultValue: ['design'], options: [{ value: 'design', label: 'Design' }, { value: 'eng', label: 'Engineering' }, { value: 'ops', label: 'Operations', description: 'On-call and incidents' }] })),
          cell(YapUI.CheckboxGroup({ id: 'cbg-invalid', label: 'Channels to join', isRequired: true, isInvalid: true, errorMessage: 'Select at least one channel', options: [{ value: 'general', label: 'general' }, { value: 'random', label: 'random' }] })),
          cell(YapUI.CheckboxGroup({ id: 'cbg-disabled', label: 'Exports', isDisabled: true, defaultValue: ['csv'], options: [{ value: 'csv', label: 'CSV' }, { value: 'json', label: 'JSON' }] })))),
    );
    syncAll();
  });

  section('switch', 'Switch', 'A switch takes effect immediately, with no Save button. Its label names the setting and never changes with the state.', (body) => {
    const out = log('Saved');
    const sw = (id, label, description, on) => YapUI.Switch({ id, label, description, isSelected: on, onChange: (v) => out.set(`${label} ${v ? 'on' : 'off'}`) });
    body.append(
      example('Notification settings',
        col('420px',
          YapUI.Fieldset({
            legend: 'Notifications',
            description: 'Changes save as you make them.',
            children: YapUI.SwitchGroup({ children: [
              sw('sw-desktop', 'Desktop notifications', 'Show a notification for mentions and direct messages', true),
              sw('sw-sounds', 'Sounds', null, false),
              sw('sw-email', 'Email digest', 'A daily summary of unread mentions', false),
            ] }),
          }),
          out)),
      example('Sizes',
        row(
          YapUI.Switch({ id: 'sw-sm', size: 'sm', label: 'Small' }),
          YapUI.Switch({ id: 'sw-md', label: 'Medium', isSelected: true }),
          YapUI.Switch({ id: 'sw-lg', size: 'lg', label: 'Large' }))),
      example('States',
        row(
          YapUI.Switch({ id: 'sw-disabled', label: 'Disabled', isDisabled: true }),
          YapUI.Switch({ id: 'sw-disabled-on', label: 'Disabled, on', isDisabled: true, isSelected: true }),
          YapUI.Switch({ id: 'sw-readonly', label: 'Read-only', isReadOnly: true, isSelected: true }))),
      example('Horizontal group',
        YapUI.SwitchGroup({ label: 'Show in sidebar', orientation: 'horizontal', children: [
          YapUI.Switch({ id: 'sw-h1', label: 'Unreads', isSelected: true }),
          YapUI.Switch({ id: 'sw-h2', label: 'Threads' }),
          YapUI.Switch({ id: 'sw-h3', label: 'Drafts' }),
        ] })),
    );
  });

  section('fieldset', 'Fieldset', 'Groups related fields under a legend.', (body) => {
    body.append(
      example('Profile',
        col('420px', YapUI.Fieldset({
          legend: 'Profile',
          description: 'Shown to people in your workspace.',
          children: [
            YapUI.TextField({ id: 'fs-name', label: 'Full name', autocomplete: 'name', fullWidth: true }),
            YapUI.TextField({ id: 'fs-title', label: 'Title', autocomplete: 'organization-title', fullWidth: true }),
            YapUI.TextArea({ id: 'fs-bio', label: 'Bio', fullWidth: true, description: 'Up to 280 characters', maxLength: 280 }),
          ],
          actions: [
            h('button', { type: 'button', class: 'button button--primary', 'data-slot': 'button' }, 'Save profile'),
            h('button', { type: 'button', class: 'button button--tertiary', 'data-slot': 'button' }, 'Cancel'),
          ],
        }))),
      example('Disabled',
        col('420px', YapUI.Fieldset({
          legend: 'Billing',
          description: 'Managed by your organization.',
          isDisabled: true,
          children: [YapUI.TextField({ id: 'fs-company', label: 'Company', value: 'Acme', fullWidth: true, isDisabled: true })],
        }))),
    );
  });

  section('form-example', 'Forms', "Yap's sign-up and change-password forms. Errors appear next to each field and in a summary at the top on submit; the submit button is disabled while the request runs.", (body) => {
    const out = log('Submitted');

    // Sign-up. Server rules: username ^[a-zA-Z0-9_.-]{3,32}$, password 8–72.
    // "taken" stands in for the server rejecting a username.
    const signup = YapUI.Form({
      id: 'form-signup',
      submitLabel: 'Create account',
      pendingLabel: 'Creating account…',
      aria: { label: 'Create your account' },
      children: [
        YapUI.TextField({ id: 'su-username', label: 'Username', name: 'username', autocomplete: 'username', isRequired: true, maxLength: 32, spellcheck: false, autoCapitalize: 'none', description: USERNAME_HINT, validate: usernameCheck, fullWidth: true }),
        YapUI.TextField({ id: 'su-password', label: 'Password', name: 'password', type: 'password', autocomplete: 'new-password', isRequired: true, minLength: 8, maxLength: 72, description: '8–72 characters', validate: passwordCheck, fullWidth: true }),
        YapUI.TextField({ id: 'su-invite', label: 'Invite code', name: 'invite', autocomplete: 'off', spellcheck: false, necessityIndicator: 'label', fullWidth: true }),
      ],
      actions: h('button', { type: 'button', class: 'button button--ghost', 'data-slot': 'button' }, 'Have an account? Sign in'),
      async onSubmit(values) {
        await wait(300);
        if (values.username.toLowerCase() === 'taken') throw { fields: { username: 'That username is taken. Try another.' } };
        out.set(`sign-up ${values.username}`);
        return `Welcome, ${values.username}.`;
      },
    });

    // Change password. "wrong" stands in for the server rejecting it.
    const pw = YapUI.Form({
      id: 'form-password',
      submitLabel: 'Change password',
      pendingLabel: 'Changing password…',
      description: 'All fields are required.',
      aria: { label: 'Change password' },
      children: [
        h('input', { type: 'text', name: 'username', autocomplete: 'username', value: 'alex', hidden: true }),
        YapUI.TextField({ id: 'pw-current', label: 'Current password', name: 'current_password', type: 'password', autocomplete: 'current-password', isRequired: true, necessityIndicator: null, fullWidth: true }),
        YapUI.TextField({ id: 'pw-new', label: 'New password', name: 'new_password', type: 'password', autocomplete: 'new-password', isRequired: true, necessityIndicator: null, minLength: 8, maxLength: 72, description: '8–72 characters', validate: passwordCheck, fullWidth: true }),
      ],
      async onSubmit(values) {
        await wait(300);
        if (values.current_password === 'wrong') throw new Error('Current password is incorrect.');
        out.set('password changed');
        pw.yui.reset();
        return 'Password changed. Your other devices have been signed out.';
      },
    });

    const card = (title, form) => h('div', { class: 'yui-demo-card', style: { flex: '1 1 300px', maxWidth: '380px', minWidth: '0', display: 'grid', gap: '12px' } },
      h('h4', { text: title, style: { fontSize: '1rem', fontWeight: '600' } }), form);

    body.append(
      example('Sign up and change password', row(card('Create your account', signup), card('Change password', pw))),
      out,
    );
  });
})();
