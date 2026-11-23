# Forms

`web/ui/forms.js` and `web/ui/forms.css`. Gallery sections: `text-field`, `text-area`,
`search-field`, `checkbox`, `switch`, `fieldset`, `form-example`.
Tests: `PORT=9370 node test/run.mjs forms`.

The markup is HeroUI v3's: `.textfield`, `.input`, `.textarea`, `.search-field`, `.checkbox`,
`.checkbox-group`, `.switch`, `.switch-group`, `.fieldset`, `.label`, `.description` and
`.field-error`, with HeroUI's `data-slot` values and state attributes (`data-invalid`,
`data-disabled`, `data-required`, `data-selected`, `data-indeterminate`, `data-empty`,
`data-focus-within`, `data-focus-visible`). Native inputs carry the semantics. Checkboxes and
switches are visually hidden `<input type="checkbox">` elements inside HeroUI's control, and a
switch adds `role="switch"`. This is how React Aria renders them.

## Rules for every field

These rules come from NN/g ("Website Forms Usability", "Placeholders in Form Fields Are
Harmful", "10 Design Guidelines for Reporting Errors in Forms") and PatternFly ("Forms",
"Errors and validation").

**Labels**

- Always give a field a visible `label`. A placeholder is not a label: it disappears when the user types, has low contrast, and some screen readers skip it (NN/g).
- Keep labels above the field, under five words, and unique within the form (PatternFly).

**Hints**

- Put format hints in `description`, below the field, not in the placeholder (NN/g).

**Required fields**

- `isRequired` marks a field with HeroUI's asterisk and sets `aria-required="true"`. The asterisk is CSS with empty alt text, so screen readers hear "required" rather than "star".
- When every field in a form is required, set `necessityIndicator: null` on each field and say it once, with `Form({ description: 'All fields are required.' })` (PatternFly).
- `necessityIndicator: 'label'` adds the text "(required)" or "(optional)". Use it to mark the one optional field in a form of required ones.

**Validation timing**

- A field validates when the user leaves it after editing it (NN/g). It does not validate while the user types, and tabbing past an untouched field shows nothing.
- Once a field is invalid, it re-validates on every keystroke, so the error clears as soon as the value is fixed.
- Every field validates on submit.
- Server errors appear on submit (PatternFly).

**Error messages**

- An error appears below its field in danger red with an icon. It is linked to the field with `aria-describedby`, and the field gets `aria-invalid="true"`.
- Say what's expected ("Use 8–72 characters", "Required"), never "Invalid input" (NN/g).
- While a text field is invalid, HeroUI hides its description (`.textfield[data-invalid] [data-slot=description]`). The description is still in `aria-describedby`, after the error. So write errors that stand on their own.

**Autofill and password managers**

- `type`, `name`, `autocomplete`, `inputMode`, `minLength`, `maxLength`, `spellcheck`, `autoCapitalize` and `enterKeyHint` pass through to the native input. Always set `autocomplete`:
  - `username`, `current-password` and `new-password` for account fields;
  - `email` and `name` for contact details;
  - `off` for one-time codes.
- A change-password form should include a hidden `<input autocomplete="username">` so password managers know which account it is.

**Validation mode**

- Validation uses React Aria's `validationBehavior: 'aria'`. The browser never shows its own validation bubbles: `Form` sets `novalidate`, and `required` is set only as `aria-required`.

## Label, Description, FieldError

Low-level parts. The field factories build them for you. Use them directly only for custom
controls.

| Factory | Options | Returns |
| --- | --- | --- |
| `Label` | `children`, `htmlFor`, `id`, `isRequired`, `isDisabled`, `isInvalid`, `necessityIndicator` (`'icon'`), `as` (`'label'`; use `'span'` for group labels) | `<label class="label">` |
| `Description` | `children`, `id` | `<div class="description" data-slot="description">` |
| `FieldError` | `children`, `id` | `<div class="field-error" data-slot="field-error">` with an icon. It is hidden while empty. `el.yui.set(message \| null)` changes it. |

## TextField (and Input)

**Use it when**

- You need a single line of free text: names, emails, passwords, codes.

**Don't use it**

- For long text. Use TextArea.
- For choosing from a known set. Use checkboxes, or a select from the menus family.

### Options

| Option | Default | Notes |
| --- | --- | --- |
| `label` | – | Visible label. If you leave it out, pass `aria: { label }`. |
| `description` | – | Hint below the field. |
| `type` | `'text'` | `email`, `password`, `url`, `tel`… |
| `name`, `id` | –, generated | `id` goes on the `<input>`. |
| `value` / `defaultValue` | `''` | |
| `placeholder` | – | An example value, never the label. |
| `isRequired` | `false` | Shows the asterisk and sets `aria-required`. An empty value fails with `errorMessage` or "Required". |
| `necessityIndicator` | `'icon'` | `'icon'`, `'label'` or `null`. |
| `isDisabled` | `false` | Native `disabled`: it can't be focused or edited. |
| `isReadOnly` | `false` | Native `readonly`: it can be focused and copied, and shows an outline with no fill. |
| `isInvalid`, `errorMessage` | `false`, – | Starts invalid, showing `errorMessage`. `errorMessage` also replaces "Required" and is used for `pattern` failures. |
| `validate(value)` | – | Returns an error string, or `null` / `true` when valid. It runs after the required and pattern checks. When it's given, it owns every other rule. |
| `minLength`, `maxLength`, `pattern` | – | Set natively. If there's no `validate`, `minLength` fails with "Use at least N characters". `pattern` is a string or RegExp and must match the whole value. |
| `autocomplete`, `inputMode`, `spellcheck`, `autoCapitalize`, `enterKeyHint`, `autoFocus` | – | Passed through. |
| `variant` | `'primary'` | `'secondary'` is for fields on a Surface. |
| `fullWidth` | `false` | |
| `onChange(value)` | – | Runs on every input, with a string. |
| `onBlur(event)`, `onFocus(event)` | – | |
| `aria`, `data`, `class` | – | `aria` goes on the input; `data` and `class` go on the root. |

### Controller

| Member | What it is |
| --- | --- |
| `el.yui.input` | The `<input>`. |
| `value` | The current string. |
| `setValue(v)` | Sets the value without calling `onChange`. If the field is invalid, it re-validates. |
| `validate()` | Runs every check, shows the result, and returns the message or `null`. |
| `setError(message \| null)` | Shows a server error, or clears it. It also clears once the user edits the field into a valid value. |
| `focus()` | Focuses the input. |
| `setDisabled(bool)` | |
| `isInvalid` | |

`YapUI.Input({...})` returns a bare `<input class="input">`, with the same pass-through
options plus `variant`, `fullWidth` and `onChange`. Use it only when the label lives elsewhere,
like the sidebar's new-channel box, and give it `aria: { label }`.

### Keyboard and ARIA

- Clicking the label focuses the field (`<label for>`).
- `aria-describedby` lists the error first, then the description.
- `aria-invalid` and `aria-required` are set as described above.
- The `data-invalid`, `data-disabled`, `data-required` and `data-focus-within` attributes on the root drive HeroUI's styles.

```js
const username = YapUI.TextField({
  label: 'Username', name: 'username', autocomplete: 'username', isRequired: true,
  maxLength: 32, spellcheck: false, autoCapitalize: 'none',
  description: "3–32 letters, digits, '.', '_' or '-'",
  validate: (v) => /^[A-Za-z0-9_.-]{3,32}$/.test(v) ? null : "Use 3–32 letters, digits, '.', '_' or '-'",
});
```

## TextArea

**Use it when**

- The text can run to several lines: a bio, a reason, a message.

**Don't use it**

- For one-line values. Use TextField.

It takes the same options and controller as TextField, plus `rows` (default `3`), `cols` and
`wrap`. The root is `.textfield` and holds a `<textarea class="textarea" data-slot="textarea">`.

## SearchField

**Use it when**

- The user filters or searches a list or the messages.

**Don't use it**

- For data entry. Use TextField.

It takes TextField's options, plus:

| Option | Default | Notes |
| --- | --- | --- |
| `onSubmit(value)` | – | Runs on Enter, and stops the enclosing form from submitting. |
| `onClear()` | – | Runs after Escape or the clear button empties the field. |
| `clearLabel` | `'Clear search'` | The clear button's accessible name. |

The controller adds `clear()`.

**Keyboard and ARIA**

- The input is `type="search"` with `role="searchbox"`.
- Escape clears a non-empty field and keeps focus in it. On an empty field, Escape passes through, so the enclosing popover or modal closes. Inside a layer, the first Escape clears and the second closes.
- The clear button is `tabindex="-1"`, as in React Aria, and keeps focus in the input. It is hidden by HeroUI's `data-empty` style while the field is empty.

## Checkbox

**Use it when**

- The options are independent of each other (NN/g, "Checkboxes vs. Radio Buttons").
- A lone checkbox is a single on/off setting that applies when the form is submitted.

**Don't use it**

- For mutually exclusive choices. Use radio buttons.
- For a setting that takes effect at once. Use Switch.

**Wording**

- Label it positively: "Email me product updates", not "Don't email me".
- Opt-ins start unchecked.
- The whole label is clickable.

### Options

| Option | Default | Notes |
| --- | --- | --- |
| `label`, `description` | – | `description` is wired with `aria-describedby`. |
| `isSelected` / `defaultSelected` | `false` | |
| `isIndeterminate` | `false` | Sets the native `indeterminate` property, which gives `aria-checked="mixed"`. Clicking it selects the box, as natively. |
| `isDisabled` | `false` | Native `disabled`. |
| `isReadOnly` | `false` | The box stays focusable but ignores toggles, and gets `aria-readonly`. |
| `isInvalid`, `isRequired`, `errorMessage` | – | Required fails with "Required" or `errorMessage`. |
| `name`, `value`, `id` | | |
| `variant` | `'primary'` | `'secondary'` is for checkboxes on a Surface. |
| `onChange(isSelected)` | – | |

### Controller

| Member | What it is |
| --- | --- |
| `input` | The native checkbox. |
| `isSelected` | |
| `setSelected(bool)` | Also clears indeterminate. |
| `setIndeterminate(bool)` | |
| `setInvalid(bool)` | |
| `setError(message \| null)` | |
| `setDisabled(bool)` | |
| `validate()` | |
| `focus()` | |

### Select all

Compose a parent checkbox with the children. When some children are selected, set the parent to
`setSelected(false)` and then `setIndeterminate(true)`. See the gallery's "Select all" demo.

### Keyboard and ARIA

- Space toggles the box (native).
- Keyboard focus sets `data-focus-visible` on `.checkbox__content`, which draws HeroUI's focus ring.

## CheckboxGroup

**Use it when**

- Several related, independent options share one label: topics, notification types.

**Don't use it**

- When only one option can be picked. Use radio buttons.

### Options

| Option | Default | Notes |
| --- | --- | --- |
| `label`, `description` | – | The label names the `role="group"` through `aria-labelledby`. |
| `options` | `[]` | `[{ value, label, description, isDisabled }]` |
| `value` / `defaultValue` | `[]` | An array of the selected values. |
| `name` | – | Every box gets this name. |
| `isRequired`, `errorMessage` | | Required means at least one is selected. It fails with "Select at least one" or `errorMessage`. |
| `validate(values)` | – | |
| `isDisabled`, `isReadOnly`, `isInvalid`, `variant`, `necessityIndicator` | | |
| `onChange(values)` | – | |

### Behavior and controller

- The group validates when focus leaves it after a change, then live while it's invalid.
- The error goes on the group's `aria-describedby`, and every box gets `aria-invalid`.
- `el.yui` has `value`, `setValue(arr)`, `validate()`, `setError(message | null)`, `focus()` (the first enabled box) and `checkboxes`.

## Switch and SwitchGroup

**Use it when**

- A setting takes effect immediately, with no Save button: notifications, sounds (NN/g, "Toggle-Switch Guidelines"; PatternFly, "Switch").
- Act in `onChange`.

**Don't use it**

- Inside a form with a Save or Submit button. Use a checkbox there.

**Wording**

- The label names the setting and never changes with the state: "Notifications", not "Notifications on".

### Options

| Option | Default | Notes |
| --- | --- | --- |
| `label`, `description` | – | |
| `isSelected` / `defaultSelected` | `false` | |
| `size` | `'md'` | `'sm'`, `'md'` or `'lg'`. |
| `isDisabled`, `isReadOnly` | `false` | |
| `name`, `value`, `id` | | |
| `onChange(isSelected)` | – | Runs as soon as the switch is toggled. |

**Controller:** `el.yui` has `input`, `isSelected`, `setSelected(bool)`, `setDisabled(bool)` and `focus()`.

**Keyboard and ARIA**

- The control is `<input type="checkbox" role="switch">`, so `aria-checked` follows the native checked state.
- Space toggles it, and the whole label is clickable.

**SwitchGroup**

- Options: `label` (optional; it makes the group a named `role="group"`), `orientation` (`'vertical'` or `'horizontal'`) and `children`.
- For a titled settings block, put it in a Fieldset.

## Fieldset

**Use it when**

- Related fields need a group name, such as Profile, Billing or Notifications. Screen readers announce the legend when focus enters the group.

**Don't use it**

- Around a single field.

| Option | Default | Notes |
| --- | --- | --- |
| `legend` | – | A `<legend class="fieldset__legend">`. |
| `description` | – | Wired with `aria-describedby`. |
| `children` | – | Goes in `.fieldset__field-group`. |
| `actions` | – | Goes in `.fieldset__actions`, bottom left. |
| `isDisabled` | `false` | Native `fieldset disabled`. It disables every native control inside. Also pass `isDisabled` to the fields so their labels dim. |

## Form

A small helper that ties the parts together. It returns `<form novalidate>`, laid out top to
bottom as follows:

1. An error summary, HeroUI's danger alert with `role="alert"`, hidden until needed.
2. `description`.
3. The `children`.
4. A status line, `role="status"`.
5. The actions, at the bottom left (PatternFly).

| Option | Default | Notes |
| --- | --- | --- |
| `children` | – | Fields: any `.yui-field` inside the form, which every factory above produces. |
| `onSubmit(values, form)` | – | `values` maps each field's `name` to its value: a string, a boolean for a checkbox, or an array for a group. It may return a promise. |
| `submitLabel` | `'Submit'` | Use a specific verb: "Create account", "Change password". `null` means no built-in button. |
| `pendingLabel` | – | The button text while the request runs, such as "Creating account…". |
| `actions` | – | More buttons after the submit button. |
| `description` | – | For example, "All fields are required." |
| `summaryTitle(count)` | "Fix N fields to continue" | |
| `id`, `class`, `aria` | | |

**On submit**

1. Every enabled field validates.
2. If any fail:
   - the summary at the top lists each one as a link that focuses its field;
   - focus moves to the first invalid field;
   - the field errors stay too. The summary is in addition to them, never instead (PatternFly).
3. If none fail, the submit button gets `aria-disabled="true"` and `data-pending` (HeroUI's disabled style), and repeat submits are ignored until `onSubmit` settles.

**What `onSubmit` can do**

- Resolve with a string, which shows in the status line.
- Throw an `Error`, whose message goes in the summary as a server error.
- Throw `{ message?, fields: { name: message } }` to put server errors on fields. The first of those fields gets focus.

**Controller:** `el.yui` has `fields()`, `values()`, `validate()`, `setErrors(map, message)`,
`setSummary(message | null)`, `setStatus(message | null)`, `setPending(bool)`, `reset()`,
`submitButton` and `isPending`.

```js
const form = YapUI.Form({
  submitLabel: 'Change password',
  pendingLabel: 'Changing password…',
  description: 'All fields are required.',
  children: [
    YapUI.h('input', { type: 'text', name: 'username', autocomplete: 'username', value: me.username, hidden: true }),
    YapUI.TextField({ label: 'Current password', name: 'current_password', type: 'password', autocomplete: 'current-password', isRequired: true, necessityIndicator: null }),
    YapUI.TextField({ label: 'New password', name: 'new_password', type: 'password', autocomplete: 'new-password', isRequired: true, necessityIndicator: null, minLength: 8, maxLength: 72, description: '8–72 characters', validate: (v) => v.length >= 8 && v.length <= 72 ? null : 'Use 8–72 characters' }),
  ],
  async onSubmit(values) {
    await api('POST', '/api/me/password', values); // throws Error(message) on failure → summary
    form.yui.reset();
    return 'Password changed. Your other devices have been signed out.';
  },
});
```

## Where this differs from HeroUI

**Additions in `forms.css`**

- **Checkbox and switch group styles.** HeroUI's `checkbox-group.css` and `switch-group.css` aren't in the compiled `heroui.css`, so `forms.css` repeats their rules.
- **Silent asterisk.** The required asterisk uses `content: "*" / ""`, so it isn't read as part of the label.
- **Error icon and color.** Field errors get an icon. Under checkboxes and switches they stay danger red; HeroUI mutes them there.
- **Unchecked checkbox edge.** An unchecked checkbox gets a 1px edge for 3:1 non-text contrast. HeroUI's borderless white box nearly disappears on Yap's near-white background.
- **Read-only style.** Read-only text fields get an outline and no fill. HeroUI has no read-only style.

**Differences in behavior**

- **When validation runs.** Fields validate on blur after an edit, then live while invalid. React Aria's `aria` mode validates live from the first keystroke.
- **Disabled submit button.** The submit button uses `aria-disabled` while pending, not `disabled`, so focus isn't lost.
