'use strict';

const $ = (id) => document.getElementById(id);

// The UI library (web/ui/) loads first; follow the OS light/dark setting.
YapUI.theme.follow();
const h = YapUI.h;

// Modals open right now, so signing out can close them.
const openModals = new Set();
function openModal(options, id) {
  const m = YapUI.Modal.open(options);
  if (id) m.el.id = id;
  openModals.add(m);
  m.closed.then(() => openModals.delete(m));
  return m;
}

const state = {
  me: null,
  channels: [],
  current: null, // channel id
  thread: null, // id of the message whose thread is open
  unread: new Map(), // channel id -> unread message count
  mutedUsers: new Map(), // user id -> username, people this person muted (mutes)
  revealed: new Set(), // ids of muted people's messages shown with "Show"
  ws: null,
  wsRetry: 0,
};

async function api(method, path, body) {
  const opts = { method, headers: {}, credentials: 'same-origin' };
  if (body !== undefined) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }
  const res = await fetch(path, opts);
  if (res.status === 204) return null;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || `Request failed (${res.status})`);
    err.status = res.status;
    throw err;
  }
  return data;
}

// ---- auth ----

let registering = false;
let inviteOnly = false;

api('GET', '/api/config').then((cfg) => {
  inviteOnly = cfg.signup === 'invite';
  setAuthMode(registering);
}).catch(() => {});

// The sign-in form. Fields validate when you leave them and on submit; the
// stricter sign-up rules (the server's) apply only when creating an account.
const authFields = {
  username: YapUI.TextField({
    label: 'Username', id: 'username', name: 'username', autocomplete: 'username', isRequired: true,
    necessityIndicator: null, maxLength: 32, spellcheck: false, autoCapitalize: 'none', fullWidth: true, variant: 'secondary',
    validate: (v) => !registering || /^[A-Za-z0-9_.-]{3,32}$/.test(v.trim()) ? null : "Use 3–32 letters, digits, '.', '_' or '-'",
  }),
  password: YapUI.TextField({
    label: 'Password', id: 'password', name: 'password', type: 'password', autocomplete: 'current-password',
    isRequired: true, necessityIndicator: null, maxLength: 72, fullWidth: true, variant: 'secondary',
    validate: (v) => !registering || (v.length >= 8 && v.length <= 72) ? null : 'Use 8–72 characters',
  }),
  invite: YapUI.TextField({
    label: 'Invite code', id: 'invite', name: 'invite', autocomplete: 'off', isRequired: true,
    necessityIndicator: null, spellcheck: false, autoCapitalize: 'none', fullWidth: true, variant: 'secondary',
  }),
};
authFields.invite.id = 'invite-row';

const authToggle = h('button', { type: 'button', id: 'auth-toggle', class: YapUI.Button.classes({ variant: 'ghost', fullWidth: true }), 'data-slot': 'button' });
authToggle.addEventListener('click', () => setAuthMode(!registering));

const authForm = YapUI.Form({
  id: 'auth-form',
  class: 'auth-form',
  submitLabel: 'Sign in',
  children: [authFields.username, authFields.password, authFields.invite],
  actions: authToggle,
  async onSubmit(values) {
    const creds = { username: values.username.trim(), password: values.password };
    if (registering && inviteOnly) creds.invite = values.invite.trim();
    state.me = await api('POST', registering ? '/api/register' : '/api/login', creds);
    authFields.password.yui.setValue('');
    authFields.invite.yui.setValue('');
    setAuthMode(false); // so a later sign-out shows sign-in, not sign-up
    await startApp();
  },
});
authForm.yui.submitButton.id = 'auth-submit';
authForm.yui.submitButton.classList.add('button--full-width');
document.querySelector('#auth .auth-card').append(authForm);

function showAuth() {
  $('app').hidden = true;
  $('auth').hidden = false;
  authFields.username.yui.focus();
}

function setAuthMode(reg) {
  registering = reg;
  $('auth-sub').textContent = reg ? 'Create your account' : 'Sign in to continue';
  $('auth-submit').textContent = reg ? 'Create account' : 'Sign in';
  authToggle.textContent = reg ? 'Have an account? Sign in' : 'Need an account? Create one';
  authFields.password.yui.input.autocomplete = reg ? 'new-password' : 'current-password';
  const invite = reg && inviteOnly;
  authFields.invite.hidden = !invite;
  authFields.invite.yui.setDisabled(!invite); // the form skips disabled fields
  for (const f of authForm.yui.fields()) f.yui.setError(null);
  authForm.yui.setSummary(null);
}

$('logout').addEventListener('click', async () => {
  try { await api('POST', '/api/logout', {}); } catch {}
  signedOut();
});

function signedOut() {
  window.yapCalls?.hangUp();
  if (state.ws) { state.ws.onclose = null; state.ws.close(); state.ws = null; }
  state.me = null;
  state.current = null;
  closeThread();
  closePicker();
  state.unread.clear();
  state.mutedUsers.clear();
  state.revealed.clear();
  for (const m of [...openModals]) m.close();
  updateTitle();
  setAuthMode(false);
  showAuth();
}

// ---- account ----

// The account dialog is built fresh each time it opens, so it starts empty.
$('account').addEventListener('click', () => {
  const passwordForm = YapUI.Form({
    id: 'password-form',
    class: 'account-form',
    submitLabel: 'Change password',
    children: [
      // Tells password managers which account this is.
      h('input', { type: 'text', name: 'username', autocomplete: 'username', value: state.me.username, hidden: true }),
      YapUI.TextField({ label: 'Current password', id: 'current-password', name: 'current_password', type: 'password', autocomplete: 'current-password', isRequired: true, necessityIndicator: null, fullWidth: true, variant: 'secondary' }),
      YapUI.TextField({
        label: 'New password', id: 'new-password', name: 'new_password', type: 'password', autocomplete: 'new-password',
        isRequired: true, necessityIndicator: null, maxLength: 72, fullWidth: true, variant: 'secondary', description: '8–72 characters',
        validate: (v) => v.length >= 8 && v.length <= 72 ? null : 'Use 8–72 characters',
      }),
    ],
    async onSubmit(v) {
      await api('POST', '/api/me/password', { current_password: v.current_password, new_password: v.new_password });
      passwordForm.yui.reset();
      return 'Password changed. Your other devices have been signed out.';
    },
  });

  const deleteForm = YapUI.Form({
    id: 'delete-form',
    class: 'account-form',
    submitLabel: 'Delete my account',
    description: "Deletes your account and every message you've posted.",
    children: [
      YapUI.TextField({ label: 'Password', id: 'delete-password', name: 'password', type: 'password', autocomplete: 'current-password', isRequired: true, necessityIndicator: null, fullWidth: true, variant: 'secondary' }),
    ],
    async onSubmit(v) {
      const ok = await YapUI.AlertDialog.confirm({
        title: `Delete the account ${state.me.username}?`,
        description: "Your account and all its messages will be deleted. This can't be undone.",
        status: 'danger',
        confirmLabel: 'Delete account',
      });
      if (!ok) return;
      try {
        await api('DELETE', '/api/me', { password: v.password });
      } catch (err) {
        throw { fields: { password: err.message } }; // shown under the field
      }
      signedOut();
      YapUI.toast.success('Account deleted.');
    },
  });
  deleteForm.yui.submitButton.className = YapUI.Button.classes({ variant: 'danger' });

  // Muted people, with Unmute. The list redraws when mutes change.
  const mutedList = h('ul', { id: 'muted-list', class: 'member-list muted-list', 'aria-labelledby': 'muted-heading' });
  const renderMuted = () => {
    const rows = [...state.mutedUsers].sort((a, b) => a[1].localeCompare(b[1])).map(([id, name]) => h('li', null,
      YapUI.Avatar({ name, alt: '', size: 'sm', variant: 'soft', color: avatarColor(name) }),
      h('span', { class: 'member-name', text: name }),
      h('span', { class: 'member-end' }, YapUI.Button({
        children: 'Unmute', variant: 'secondary', size: 'sm', ariaLabel: `Unmute ${name}`,
        onPress: () => setUserMuted(id, name, false),
      }))));
    mutedList.replaceChildren(...(rows.length ? rows : [h('li', { class: 'muted muted-none', text: "You haven't muted anyone." })]));
  };
  renderMuted();
  mutesListeners.add(renderMuted);

  const dialog = openModal({
    title: 'Account',
    class: 'account-dialog',
    body: [
      h('section', { class: 'account-section', 'aria-labelledby': 'muted-heading' },
        h('h3', { id: 'muted-heading', text: 'Muted people' }),
        h('p', { class: 'muted account-note', text: "Their messages are collapsed and never notify you. They aren't told, and only you can see this list." }),
        mutedList),
      h('section', { class: 'account-section', 'aria-labelledby': 'password-heading' },
        h('h3', { id: 'password-heading', text: 'Change password' }), passwordForm),
      h('section', { class: 'account-section danger-zone', 'aria-labelledby': 'delete-heading' },
        h('h3', { id: 'delete-heading', text: 'Delete account' }), deleteForm),
    ],
  }, 'account-dialog');
  dialog.closed.then(() => mutesListeners.delete(renderMuted));
});

// ---- admin ----

const members = { list: null, error: null };

$('members').addEventListener('click', async () => {
  members.error = h('div', { id: 'members-error', class: 'members-error' });
  members.list = h('ul', { id: 'member-list', class: 'member-list', 'aria-label': 'Members', 'aria-busy': 'true' });
  openModal({ title: 'Members', class: 'members-dialog', body: [members.error, members.list] }, 'members-dialog');
  await loadMembers();
});

function showMembersError(message) {
  members.error.replaceChildren(message
    ? YapUI.Alert({ status: 'danger', role: 'alert', title: message })
    : '');
}

async function loadMembers() {
  try {
    const users = await api('GET', '/api/admin/users');
    members.list.replaceChildren(...users.map(memberRow));
    members.list.removeAttribute('aria-busy');
  } catch (err) {
    showMembersError(err.message);
  }
}

function memberRow(u) {
  const li = h('li', null,
    YapUI.Avatar({ name: u.username, alt: '', size: 'sm', variant: 'soft', color: avatarColor(u.username) }),
    h('span', { class: 'member-name', text: u.username }),
    h('span', { class: 'member-end' },
      u.admin ? YapUI.Chip({ children: 'Admin', color: 'accent', variant: 'soft', size: 'sm' })
        : u.banned ? YapUI.Chip({ children: 'Banned', color: 'danger', variant: 'soft', size: 'sm' })
          : h('span', { class: 'muted member-info', text: 'Joined ' + new Date(u.created_at).toLocaleDateString() })));
  if (!u.admin) {
    const b = YapUI.Button({
      children: u.banned ? 'Unban' : 'Ban',
      variant: u.banned ? 'secondary' : 'danger-soft',
      size: 'sm',
      ariaLabel: `${u.banned ? 'Unban' : 'Ban'} ${u.username}`,
      onPress: () => (u.banned ? unban(u) : ban(u)),
    });
    li.lastChild.append(b);
  }
  return li;
}

async function unban(u) {
  showMembersError(null);
  try {
    await api('POST', `/api/admin/users/${u.id}/unban`, {});
    await loadMembers();
    YapUI.toast.success(`${u.username} unbanned.`);
  } catch (err) {
    showMembersError(err.message);
  }
}

// One dialog for both questions: ban, and whether to delete their messages.
async function ban(u) {
  showMembersError(null);
  const purge = YapUI.Checkbox({
    label: `Also delete everything ${u.username} has posted`,
    description: "Their messages, replies and reactions. This can't be undone.",
  });
  const ok = await YapUI.AlertDialog.confirm({
    title: `Ban ${u.username}?`,
    description: "They'll be signed out and can't sign in again until unbanned.",
    status: 'danger',
    confirmLabel: 'Ban',
    body: purge,
  });
  if (!ok) return;
  try {
    await api('POST', `/api/admin/users/${u.id}/ban`, { delete_messages: purge.yui.isSelected });
    await loadMembers();
    YapUI.toast.success(purge.yui.isSelected ? `${u.username} banned and their messages deleted.` : `${u.username} banned.`);
  } catch (err) {
    showMembersError(err.message);
  }
}

// A stable avatar color for each name.
const avatarColors = ['accent', 'success', 'warning', 'danger', 'default'];
function avatarColor(name) {
  let n = 0;
  for (const c of name) n = (n * 31 + c.codePointAt(0)) >>> 0;
  return avatarColors[n % avatarColors.length];
}

// ---- channels ----

async function loadChannels() {
  state.channels = await api('GET', '/api/channels');
  renderChannels();
}

function renderChannels() {
  const ul = $('channels');
  ul.replaceChildren();
  for (const ch of state.channels) {
    const b = h('button', { type: 'button', class: 'channel', data: { channelId: ch.id } }, '# ' + ch.name);
    if (ch.id === state.current) { b.classList.add('active'); b.setAttribute('aria-current', 'page'); }
    if (!ch.joined) b.classList.add('not-joined');
    if (ch.muted) {
      b.classList.add('channel--muted');
      b.append(h('span', { class: 'channel-muted-icon', 'aria-hidden': 'true', html: bellOffIcon }),
        h('span', { class: 'yui-visually-hidden', text: ', muted' }));
    }
    const unread = state.unread.get(ch.id);
    if (unread) {
      b.classList.add('unread');
      b.append(YapUI.Badge({ children: unread > 99 ? '99+' : String(unread), label: unread === 1 ? '1 unread message' : `${unread} unread messages`, color: 'accent', size: 'sm', class: 'channel-badge' }));
    }
    b.addEventListener('click', () => openChannel(ch.id));
    ul.append(h('li', null, b));
  }
}

// Creating a channel: errors show under the box, not in a dialog.
$('new-channel-submit').innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>'; // static markup
YapUI.Tooltip($('new-channel-submit'), { content: 'Create channel' });
const newChannelError = YapUI.FieldError({ id: 'new-channel-error' });
$('new-channel').append(newChannelError);
function setNewChannelError(message) {
  newChannelError.yui.set(message);
  const input = $('new-channel-name');
  if (message) input.setAttribute('aria-invalid', 'true'); else input.removeAttribute('aria-invalid');
}
$('new-channel-name').addEventListener('input', () => setNewChannelError(null));

$('new-channel').addEventListener('submit', async (e) => {
  e.preventDefault();
  const name = $('new-channel-name').value.trim();
  if (!name) {
    setNewChannelError('Enter a name for the channel');
    $('new-channel-name').focus();
    return;
  }
  setNewChannelError(null);
  try {
    const ch = await api('POST', '/api/channels', { name });
    $('new-channel-name').value = '';
    await loadChannels();
    openChannel(ch.id);
  } catch (err) {
    setNewChannelError(sentence(err.message));
    $('new-channel-name').focus();
  }
});

function currentChannel() {
  return state.channels.find((c) => c.id === state.current);
}

async function openChannel(id, { keepThread = false } = {}) {
  if (!keepThread) closeThread();
  state.current = id;
  state.unread.delete(id);
  updateTitle();
  try { localStorage.setItem('yap.channel', String(id)); } catch {}
  renderChannels();
  const ch = currentChannel();
  $('channel-title').textContent = '# ' + (ch ? ch.name : '');
  composers.main.setPlaceholder(ch ? `Message #${ch.name}` : 'Message');
  views.main.items = [];
  views.main.list.replaceChildren();
  const joined = ch && ch.joined;
  $('join-banner').hidden = joined;
  $('composer').hidden = !joined;
  $('leave').hidden = !joined || (ch && ch.name === 'general');
  renderMuteChannel();
  placeToasts();
  window.yapCalls?.channelOpened();
  if (!joined) return;
  try {
    const msgs = await api('GET', `/api/channels/${id}/messages`);
    if (state.current !== id) return;
    renderMessages(views.main, msgs);
    if (!keepThread) composers.main.focus();
  } catch (err) {
    showEmpty(views.main, err.message);
  }
}

$('join').addEventListener('click', async () => {
  const id = state.current;
  try {
    await api('POST', `/api/channels/${id}/join`, {});
  } catch (err) {
    YapUI.toast.danger({ title: "Couldn't join the channel.", description: sentence(err.message) });
    return;
  }
  await loadChannels();
  openChannel(id);
});

$('leave').addEventListener('click', async () => {
  const ch = currentChannel();
  if (!ch) return;
  const ok = await YapUI.AlertDialog.confirm({
    title: `Leave #${ch.name}?`,
    description: "You'll stop getting its messages. You can join again from the channel list.",
    confirmLabel: 'Leave',
  });
  if (!ok) return;
  try {
    await api('POST', `/api/channels/${ch.id}/leave`, {});
  } catch (err) {
    YapUI.toast.danger({ title: "Couldn't leave the channel.", description: sentence(err.message) });
    return;
  }
  await loadChannels();
  const general = state.channels.find((c) => c.name === 'general');
  openChannel(general ? general.id : state.channels[0]?.id);
});

// ---- muting ----
// Private: muting someone or a channel is only ever known to the person who
// did it (see mutes.go). A muted person's messages show collapsed, with Show;
// muted people and channels don't count as unread and don't notify.

const bellOffIcon = '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 4.6A6 6 0 0 1 18 9v4l1.5 3H8M6 9v4l-1.5 3H13M10 20a2 2 0 0 0 4 0M3 3l18 18"/></svg>'; // static markup

// Called whenever mutes change (here or on another device).
const mutesListeners = new Set();

async function loadMutedUsers() {
  const users = await api('GET', '/api/me/muted-users');
  state.mutedUsers = new Map(users.map((u) => [u.id, u.username]));
}

// mutesKey sums up the current mutes, to tell whether a reload changed any.
function mutesKey() {
  return [...state.mutedUsers.keys()].sort().join() + '|' + state.channels.filter((c) => c.muted).map((c) => c.id).join();
}

function isMutedMessage(m) {
  const ch = state.channels.find((c) => c.id === m.channel_id);
  return state.mutedUsers.has(m.user_id) || !!ch?.muted;
}

function mutesChanged() {
  for (const view of Object.values(views)) if (view.items.length) redraw(view, false);
  renderChannels();
  renderMuteChannel();
  updateTitle();
  for (const f of mutesListeners) f();
}

async function setUserMuted(id, name, mute) {
  try {
    await api(mute ? 'PUT' : 'DELETE', `/api/me/muted-users/${id}`, {});
  } catch (err) {
    YapUI.toast.danger({ title: mute ? `Couldn't mute ${name}.` : `Couldn't unmute ${name}.`, description: sentence(err.message) });
    return false;
  }
  if (mute) state.mutedUsers.set(id, name); else state.mutedUsers.delete(id);
  for (const view of Object.values(views)) for (const m of view.items) if (m.user_id === id) state.revealed.delete(m.id);
  mutesChanged();
  YapUI.toast.success(mute
    ? { title: `${name} muted.`, description: "Their messages are collapsed and won't notify you. They aren't told." }
    : `${name} unmuted.`);
  return true;
}

// The Mute/Unmute button in the channel header.
const muteChannelTip = YapUI.Tooltip($('mute-channel'), { content: '' });
function renderMuteChannel() {
  const ch = currentChannel();
  const b = $('mute-channel');
  b.hidden = !ch || !ch.joined;
  if (!ch) return;
  b.textContent = ch.muted ? 'Unmute' : 'Mute';
  b.setAttribute('aria-label', `${ch.muted ? 'Unmute' : 'Mute'} #${ch.name}`);
  muteChannelTip.setContent(ch.muted
    ? `Get notifications and unread counts for #${ch.name} again`
    : `No notifications or unread counts from #${ch.name}. Only you can see this.`);
}

$('mute-channel').addEventListener('click', async () => {
  const ch = currentChannel();
  if (!ch) return;
  const mute = !ch.muted;
  try {
    await api(mute ? 'PUT' : 'DELETE', `/api/me/muted-channels/${ch.id}`, {});
  } catch (err) {
    YapUI.toast.danger({ title: mute ? "Couldn't mute the channel." : "Couldn't unmute the channel.", description: sentence(err.message) });
    return;
  }
  ch.muted = mute;
  if (mute) state.unread.delete(ch.id);
  mutesChanged();
  YapUI.toast.success(mute
    ? { title: `#${ch.name} muted.`, description: "It won't notify you or show unread counts." }
    : `#${ch.name} unmuted.`);
});

// ---- messages ----

const timeFmt = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' });
const dayFmt = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

function formatTime(ms) {
  const d = new Date(ms);
  return d.toDateString() === new Date().toDateString() ? timeFmt.format(d) : dayFmt.format(d);
}

function formatSize(n) {
  if (n < 1024) return n + ' B';
  if (n < 1024 * 1024) return Math.round(n / 1024) + ' KB';
  return (n / 1024 / 1024).toFixed(1) + ' MB';
}

// Both message lists render from an array of messages, oldest first. Edits,
// deletes and reactions update the array and redraw. The thread view's first
// item is the message that started the thread.
const views = {
  main: { list: $('messages'), items: [], atBottom: true, empty: 'No messages yet. Say hi!' },
  thread: { list: $('thread-messages'), items: [], atBottom: true, empty: '' },
};

for (const view of Object.values(views)) {
  view.list.addEventListener('scroll', () => {
    const l = view.list;
    view.atBottom = l.scrollHeight - l.scrollTop - l.clientHeight < 80;
  });
}

function showEmpty(view, text) {
  const li = document.createElement('li');
  li.className = 'empty';
  li.textContent = text;
  view.list.replaceChildren(li);
}

function renderMessages(view, msgs) {
  view.items = msgs.slice();
  for (const m of msgs) seen.add(m.id);
  redraw(view, true);
}

function redraw(view, toBottom) {
  const list = view.list;
  const offset = list.scrollHeight - list.scrollTop;
  // Keep focus on the same message (and button, if it's still there) when a
  // redraw replaces the one that had it, e.g. after muting its author.
  const active = document.activeElement;
  const focusLi = list.contains(active) ? active.closest('li[data-id]') : null;
  const keep = focusLi && { id: focusLi.dataset.id, label: active.getAttribute('aria-label'), self: active === focusLi };
  list.replaceChildren();
  if (view.items.length === 0) {
    showEmpty(view, view.empty);
    return;
  }
  const group = { author: null, time: 0 };
  view.items.forEach((m, i) => {
    list.append(messageItem(m, view, group));
    if (view === views.thread && i === 0) {
      group.author = null; // replies start a new group
      const sep = document.createElement('li');
      sep.className = 'thread-sep';
      list.append(sep);
      updateSep();
    }
  });
  view.group = group;
  list.scrollTop = toBottom ? list.scrollHeight : list.scrollHeight - offset;
  view.atBottom = toBottom || view.atBottom;
  const li = keep && list.querySelector(`li[data-id="${keep.id}"]`);
  if (li) {
    const same = !keep.self && keep.label && [...li.querySelectorAll('[aria-label]')].find((el) => el.getAttribute('aria-label') === keep.label);
    (same || li.querySelector('.collapsed-row .button') || li).focus({ preventScroll: true });
  }
}

function repliesLabel(n) {
  return n === 1 ? '1 reply' : `${n} replies`;
}

function updateSep() {
  const sep = views.thread.list.querySelector('.thread-sep');
  const n = views.thread.items.length - 1;
  if (sep) sep.textContent = n === 0 ? 'No replies yet' : repliesLabel(n);
}

// The grouping state just before item i, so one item can be redrawn alone.
function groupBefore(view, i) {
  const prev = view.items[i - 1];
  if (!prev || (view === views.thread && i === 1)) return { author: null, time: 0 };
  return { author: prev.user_id, time: prev.created_at };
}

// rerender swaps in a changed message without redrawing the whole list.
function rerender(view, m) {
  const i = view.items.findIndex((x) => x.id === m.id);
  if (i < 0) return;
  view.items[i] = m;
  const li = view.list.querySelector(`li[data-id="${m.id}"]`);
  if (li) li.replaceWith(messageItem(m, view, groupBefore(view, i)));
  if (i === view.items.length - 1) view.group = { author: m.user_id, time: m.created_at };
  if (view.atBottom) view.list.scrollTop = view.list.scrollHeight;
}

// collapsedItem stands in for a message from someone the reader muted.
function collapsedItem(m, view, group) {
  const show = actionButton('Show', () => {
    state.revealed.add(m.id);
    rerender(view, m);
    view.list.querySelector(`li[data-id="${m.id}"]`)?.focus();
  });
  show.setAttribute('aria-label', `Show message from ${m.username}`);
  const li = h('li', { class: 'first collapsed', data: { id: m.id } },
    h('div', { class: 'collapsed-row' },
      h('span', { class: 'collapsed-icon', 'aria-hidden': 'true', html: bellOffIcon }),
      h('span', { class: 'muted', text: `Message from ${m.username}, who you muted` }),
      show));
  if (view === views.main && m.reply_count) {
    const b = actionButton(`${repliesLabel(m.reply_count)} · last ${formatTime(m.last_reply_at)}`, () => openThread(m.id));
    b.classList.add('replies');
    li.append(b);
  }
  // The next message gets its own name and avatar.
  group.author = null;
  group.time = 0;
  return li;
}

function messageItem(m, view, group) {
  if (state.mutedUsers.has(m.user_id) && !state.revealed.has(m.id)) return collapsedItem(m, view, group);
  const li = document.createElement('li');
  li.dataset.id = m.id;
  li.tabIndex = -1; // so "Show" can move focus to the message
  // Group consecutive messages from one person within 5 minutes.
  if (m.user_id !== group.author || m.created_at - group.time > 5 * 60 * 1000) {
    li.classList.add('first');
    const meta = document.createElement('div');
    meta.className = 'meta';
    // The name is printed next to it, so the avatar is decorative.
    const avatar = YapUI.Avatar({ name: m.username, alt: '', size: 'sm', variant: 'soft', color: avatarColor(m.username), class: 'msg-avatar' });
    const who = document.createElement('span');
    who.className = 'author';
    who.textContent = m.username;
    const when = document.createElement('time');
    when.className = 'time';
    when.dateTime = new Date(m.created_at).toISOString();
    when.textContent = formatTime(m.created_at);
    meta.append(avatar, who, when);
    li.append(meta);
  }
  if (m.body) {
    const text = document.createElement('div');
    text.className = 'text';
    text.append(md.render(m.body));
    if (m.edited_at) {
      const tag = document.createElement('span');
      tag.className = 'edited';
      tag.textContent = ' (edited)';
      tag.title = formatTime(m.edited_at);
      // On the last line when it's text, otherwise under the list or quote.
      const last = text.lastElementChild;
      (last && last.tagName === 'DIV' ? last : text).append(tag);
    }
    li.append(text);
  }
  if (m.attachments?.length) li.append(attachmentList(m.attachments, view));
  if (m.reactions?.length) li.append(reactionBar(m));
  if (view === views.main && m.reply_count) {
    const b = actionButton(
      `${repliesLabel(m.reply_count)} · last ${formatTime(m.last_reply_at)}`,
      () => openThread(m.id));
    b.classList.add('replies');
    li.append(b);
  }

  const actions = document.createElement('div');
  actions.className = 'actions';
  actions.setAttribute('role', 'toolbar');
  actions.setAttribute('aria-label', 'Message actions');
  const react = actionButton('React', null);
  attachPicker(react, (emoji) => toggleReaction(m, emoji, true));
  actions.append(react);
  if (view === views.main) actions.append(actionButton('Reply', () => openThread(m.id)));
  const mine = m.user_id === state.me.id;
  if (mine && m.body) actions.append(actionButton('Edit', () => startEdit(li, m, view)));
  if (!mine) {
    const muted = state.mutedUsers.has(m.user_id);
    const b = actionButton(muted ? 'Unmute' : 'Mute', async () => {
      if (!await setUserMuted(m.user_id, m.username, !muted)) return;
      // Move focus to where the message now is (collapsed after muting).
      for (const v of Object.values(views)) {
        const el = v.list.querySelector(`li[data-id="${m.id}"]`);
        if (el) { (el.querySelector('.collapsed-row .button') || el).focus(); break; }
      }
    });
    b.setAttribute('aria-label', `${muted ? 'Unmute' : 'Mute'} ${m.username}`);
    YapUI.Tooltip(b, { content: muted ? `Unmute ${m.username}` : `Mute ${m.username}. Only you will know.` });
    actions.append(b);
  }
  if (mine || state.me.admin) actions.append(actionButton('Delete', () => deleteMessage(m)));
  li.append(actions);

  group.author = m.user_id;
  group.time = m.created_at;
  return li;
}

// Images and GIFs show inline; anything else is a download link.
const inlineTypes = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp']);

function attachmentList(atts, view) {
  const div = document.createElement('div');
  div.className = 'attachments';
  for (const a of atts) {
    const link = document.createElement('a');
    link.href = a.url;
    link.title = `${a.name} (${formatSize(a.size)})`;
    if (inlineTypes.has(a.content_type)) {
      link.className = 'image';
      link.target = '_blank';
      link.rel = 'noopener';
      const img = document.createElement('img');
      img.src = a.url;
      img.alt = a.name;
      img.loading = 'lazy';
      // Images load after layout; keep the list pinned to the newest message.
      img.addEventListener('load', () => {
        if (view.atBottom) view.list.scrollTop = view.list.scrollHeight;
      });
      link.append(img);
    } else {
      link.className = 'file';
      link.download = a.name;
      const name = document.createElement('span');
      name.textContent = a.name;
      const size = document.createElement('span');
      size.className = 'muted';
      size.textContent = formatSize(a.size);
      link.append(name, size);
    }
    div.append(link);
  }
  return div;
}

function reactionBar(m) {
  const div = document.createElement('div');
  div.className = 'reactions';
  for (const r of m.reactions) {
    const mine = r.users.some((u) => u.id === state.me.id);
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'reaction' + (mine ? ' mine' : '');
    b.dataset.emoji = r.emoji;
    const who = r.users.map((u) => u.username).join(', ');
    b.setAttribute('aria-pressed', String(mine));
    b.setAttribute('aria-label', `${r.emoji} ${r.users.length}, from ${who}`);
    YapUI.Tooltip(b, { content: who });
    const e = document.createElement('span');
    e.textContent = r.emoji;
    const n = document.createElement('span');
    n.className = 'count';
    n.textContent = r.users.length;
    b.append(e, n);
    b.addEventListener('click', () => toggleReaction(m, r.emoji, !mine));
    div.append(b);
  }
  const add = document.createElement('button');
  add.type = 'button';
  add.className = 'reaction add';
  add.textContent = '+';
  add.setAttribute('aria-label', 'Add reaction');
  attachPicker(add, (emoji) => toggleReaction(m, emoji, true));
  YapUI.Tooltip(add, { content: 'Add reaction' });
  div.append(add);
  return div;
}

async function toggleReaction(m, emoji, add) {
  try {
    const update = await api(add ? 'POST' : 'DELETE', `/api/messages/${m.id}/reactions`, { emoji });
    updateReactions(update);
    // Redrawing the message replaced the button that had focus: move focus
    // to the reaction, so keyboard users keep their place.
    if (document.activeElement === document.body) {
      for (const view of Object.values(views)) {
        const b = [...view.list.querySelectorAll(`li[data-id="${m.id}"] .reaction`)].find((x) => x.dataset.emoji === emoji)
          || view.list.querySelector(`li[data-id="${m.id}"] .reaction.add`);
        if (b) { b.focus(); break; }
      }
    }
  } catch (err) {
    YapUI.toast.danger({ title: add ? "Couldn't add the reaction." : "Couldn't remove the reaction.", description: sentence(err.message) });
  }
}

function actionButton(label, onClick, size = 'sm') {
  const b = h('button', { type: 'button', class: YapUI.Button.classes({ variant: 'ghost', size }), 'data-slot': 'button', text: label });
  if (onClick) b.addEventListener('click', onClick);
  return b;
}

function appendMessage(view, m) {
  const stick = view.atBottom || m.user_id === state.me.id;
  view.items.push(m);
  if (view.items.length === 1) return redraw(view, true);
  view.list.append(messageItem(m, view, view.group));
  if (view === views.thread) updateSep();
  if (stick) {
    view.list.scrollTop = view.list.scrollHeight;
    view.atBottom = true;
  }
}

function startEdit(li, m, view) {
  const text = li.querySelector('.text');
  const actions = li.querySelector('.actions');
  const form = document.createElement('form');
  form.className = 'edit';
  const cancel = () => rerender(view, m);
  const composer = createComposer(form, {
    placeholder: 'Edit message',
    attachments: false,
    submitLabel: 'Save',
    send: async (body) => {
      if (body === m.body) return cancel();
      if (!body) throw new Error('A message can\'t be empty. Delete it instead.');
      replaceMessage(await api('PATCH', `/api/messages/${m.id}`, { body }));
    },
  });
  composer.editor.setMarkdown(m.body);
  composer.editor.el.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); cancel(); }
  });
  const hint = document.createElement('p');
  hint.className = 'edit-hint muted';
  const cancelBtn = h('button', { type: 'button', class: 'link edit-cancel', 'data-slot': 'link', text: 'cancel' });
  cancelBtn.addEventListener('click', cancel);
  hint.append('Escape to ', cancelBtn, ' · Enter to save');
  form.append(hint);
  text.replaceWith(form);
  actions.hidden = true;
  composer.focus();
}

async function deleteMessage(m) {
  const ok = await YapUI.AlertDialog.confirm({
    title: !m.parent_id && m.reply_count ? 'Delete this message and its replies?' : 'Delete this message?',
    description: 'This can\'t be undone.',
    status: 'danger',
    confirmLabel: 'Delete',
  });
  if (!ok) return;
  try {
    await api('DELETE', `/api/messages/${m.id}`, {});
    messageDeleted(m);
    YapUI.toast.success('Message deleted.');
  } catch (err) {
    YapUI.toast.danger({ title: 'Message not deleted.', description: sentence(err.message) });
  }
}

// replaceMessage applies an edit wherever the message is shown.
function replaceMessage(m) {
  for (const view of Object.values(views)) rerender(view, m);
}

function updateReactions(update) {
  for (const view of Object.values(views)) {
    const m = view.items.find((x) => x.id === update.id);
    if (m) rerender(view, { ...m, reactions: update.reactions || [] });
  }
}

function messageDeleted(m) {
  if (state.thread === m.id) closeThread();
  for (const view of Object.values(views)) {
    const before = view.items.length;
    view.items = view.items.filter((x) => x.id !== m.id);
    if (view.items.length !== before) redraw(view, false);
  }
  if (m.parent_id) bumpReplies(m.parent_id, -1);
}

// bumpReplies changes the reply count shown on a thread's first message.
function bumpReplies(parentId, delta, at) {
  for (const view of Object.values(views)) {
    const p = view.items.find((x) => x.id === parentId);
    if (!p) continue;
    const count = Math.max(0, (p.reply_count || 0) + delta);
    rerender(view, { ...p, reply_count: count, last_reply_at: at || p.last_reply_at });
  }
}

const seen = new Set();

// A message from the server, via the websocket or our own post.
function received(m) {
  if (seen.has(m.id)) return;
  seen.add(m.id);
  if (m.parent_id) {
    if (state.thread === m.parent_id) appendMessage(views.thread, m);
    bumpReplies(m.parent_id, 1, m.created_at);
    // Replies count as unread only for the person who started the thread.
    const watching = state.thread === m.parent_id && !document.hidden;
    if (m.user_id !== state.me.id && m.parent_user_id === state.me.id && !watching && !isMutedMessage(m)) notify(m);
    return;
  }
  if (m.channel_id === state.current) appendMessage(views.main, m);
  if (m.user_id !== state.me.id && !isMutedMessage(m) && (m.channel_id !== state.current || document.hidden)) {
    state.unread.set(m.channel_id, (state.unread.get(m.channel_id) || 0) + 1);
    renderChannels();
    updateTitle();
    notify(m);
  }
}

// ---- threads ----

async function openThread(id) {
  state.thread = id;
  $('thread').hidden = false;
  $('app').classList.add('thread-open');
  views.thread.items = [];
  views.thread.list.replaceChildren();
  try {
    const t = await api('GET', `/api/messages/${id}/thread`);
    if (state.thread !== id) return;
    renderMessages(views.thread, [t.parent, ...t.replies]);
    composers.thread.focus();
  } catch (err) {
    if (state.thread === id) showEmpty(views.thread, err.message);
  }
}

function closeThread() {
  state.thread = null;
  views.thread.items = [];
  $('thread').hidden = true;
  $('app').classList.remove('thread-open');
}

$('thread-close').innerHTML = YapUI.icons.close; // static markup
YapUI.Tooltip($('thread-close'), { content: 'Close thread' });
$('thread-close').addEventListener('click', () => { closeThread(); composers.main.focus(); });
// Escape in the thread panel closes it. Escape in an edit or the emoji
// picker is handled there first.
$('thread').addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !e.defaultPrevented) {
    closeThread();
    composers.main.focus();
  }
});

// ---- emoji picker ----

const pickerEmoji = [
  '👍', '❤️', '😂', '🎉', '😮', '😢', '🙏', '👀',
  '🔥', '✅', '👏', '🙌', '💯', '🤔', '😅', '😍',
  '🚀', '👋', '😎', '🥳', '😬', '🙃', '💀', '🤝',
  '✨', '⭐', '☕', '🍕', '👎', '❌', '⚠️', '➕',
];

// attachPicker makes trigger open the reaction picker, a YapUI.Popover. The
// popover is made on the first click, since most buttons are never pressed.
let openPicker = null;

function attachPicker(trigger, onPick) {
  trigger.setAttribute('aria-haspopup', 'dialog');
  trigger.setAttribute('aria-expanded', 'false');
  trigger.addEventListener('click', () => {
    if (trigger.yuiPicker) return; // the popover handles later clicks itself
    const pop = YapUI.Popover(trigger, {
      'aria-label': 'Add reaction',
      placement: 'top end',
      class: 'emoji-popover',
      children: pickerContent((emoji) => { pop.close(); onPick(emoji); }),
      onOpenChange: (open) => {
        if (open) openPicker = pop;
        else if (openPicker === pop) openPicker = null;
      },
    });
    trigger.yuiPicker = pop;
    pop.open();
  });
}

function pickerContent(pick) {
  const grid = h('div', { class: 'emoji-grid' });
  for (const e of pickerEmoji) {
    grid.append(h('button', { type: 'button', class: 'emoji', 'aria-label': e, text: e, on: { click: () => pick(e) } }));
  }
  const any = YapUI.Input({ variant: 'secondary', fullWidth: true, placeholder: 'Or type any emoji', maxLength: 16, aria: { label: 'Any emoji' }, class: 'emoji-any' });
  any.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.isComposing) {
      e.preventDefault();
      const v = any.value.trim();
      if (v) pick(v);
    }
  });
  return [grid, any];
}

function closePicker() {
  if (openPicker) openPicker.close();
}

// ---- message boxes ----

const composers = {
  main: createComposer($('composer'), {
    placeholder: 'Message',
    dropZone: document.querySelector('.chat'),
    send: async (body, ids) => {
      if (state.current == null) return;
      received(await api('POST', `/api/channels/${state.current}/messages`, { body, attachment_ids: ids }));
    },
  }),
  thread: createComposer($('thread-composer'), {
    placeholder: 'Reply',
    submitLabel: 'Reply',
    dropZone: $('thread'),
    send: async (body, ids) => {
      const parent = views.thread.items[0];
      if (!parent) return;
      received(await api('POST', `/api/channels/${parent.channel_id}/messages`, {
        body, attachment_ids: ids, parent_id: parent.id,
      }));
    },
  }),
};

// Toasts sit at the bottom, in the corner on wide screens and centered on
// phones (the top of a phone screen holds the channel list and Sign out),
// clear of the message box.
YapUI.toast.configure({ narrowPlacement: 'bottom' });
function placeToasts() {
  const box = $('composer');
  YapUI.toast.configure({ offset: box.hidden ? 16 : box.offsetHeight + 8 });
}
window.addEventListener('resize', placeToasts);

// ---- live updates ----

function connect() {
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  const ws = new WebSocket(`${proto}//${location.host}/api/ws`);
  state.ws = ws;
  ws.onopen = () => {
    setConn(true);
    // Catch up on anything missed while disconnected.
    if (state.wsRetry > 0) refresh();
    window.yapCalls?.start();
    state.wsRetry = 0;
  };
  ws.onmessage = (e) => {
    const ev = JSON.parse(e.data);
    if (ev.type === 'message') {
      received(ev.message);
    } else if (ev.type === 'message_edited') {
      replaceMessage(ev.message);
    } else if (ev.type === 'message_deleted') {
      messageDeleted(ev.message);
    } else if (ev.type === 'reactions') {
      updateReactions(ev.message);
    } else if (ev.type === 'user_removed') {
      refresh(); // their messages, replies and reactions are gone
    } else if (ev.type === 'call_update') {
      window.yapCalls?.update(ev.call);
    } else if (ev.type === 'channel_created') {
      loadChannels();
    } else if (ev.type === 'mutes_changed') {
      // Muted or unmuted on another device. This device hears about its own
      // changes too; it has already applied them, so only redraw on news.
      const before = mutesKey();
      Promise.all([loadMutedUsers(), loadChannels()]).then(() => { if (mutesKey() !== before) mutesChanged(); }).catch(() => {});
    }
  };
  ws.onclose = () => {
    setConn(false);
    if (!state.me) return;
    const delay = Math.min(30000, 1000 * 2 ** state.wsRetry++);
    setTimeout(async () => {
      // Signed out elsewhere, password changed or banned.
      try { await api('GET', '/api/me'); } catch (err) { if (err.status === 401) return signedOut(); }
      connect();
    }, delay);
  };
}

// The live-updates dot in the channel header: a Badge with spoken text.
const conn = YapUI.Badge({ label: 'Connecting to live updates', color: 'default', size: 'sm', id: 'conn', class: 'conn' });
$('conn').replaceWith(conn);
const connTip = YapUI.Tooltip(conn, { content: 'Connecting…' });
function setConn(live) {
  conn.classList.toggle('live', live);
  conn.classList.toggle('badge--success', live);
  conn.classList.toggle('badge--default', !live);
  conn.yui.setContent(null, live ? 'Live updates on' : 'Live updates off, reconnecting');
  connTip.setContent(live ? 'Live updates on' : 'Reconnecting…');
}

// refresh reloads what's on screen.
function refresh() {
  const thread = state.thread;
  if (state.current != null) openChannel(state.current, { keepThread: true });
  if (thread != null) openThread(thread);
}

// ---- unread count and notifications ----

// The count in the title doubles as the dock badge in the desktop app.
function updateTitle() {
  let total = 0;
  for (const n of state.unread.values()) total += n;
  document.title = total > 0 ? `(${total}) Yap` : 'Yap';
}

document.addEventListener('visibilitychange', () => {
  if (!document.hidden && state.current != null && state.unread.has(state.current)) {
    state.unread.delete(state.current);
    renderChannels();
    updateTitle();
  }
});

function notificationsSupported() {
  return 'Notification' in window;
}

function renderNotifyButton() {
  $('notify').hidden = !(notificationsSupported() && Notification.permission === 'default');
}

$('notify').addEventListener('click', async () => {
  await Notification.requestPermission();
  renderNotifyButton();
});

function notify(m) {
  if (!notificationsSupported() || Notification.permission !== 'granted') return;
  if (!document.hidden && document.hasFocus() && m.channel_id === state.current) return;
  const ch = state.channels.find((c) => c.id === m.channel_id);
  const where = `#${ch ? ch.name : 'channel'}`;
  const files = m.attachments?.length || 0;
  const text = (m.body && md.plain(m.body)) || (files === 1 ? 'Sent a file' : `Sent ${files} files`);
  const n = new Notification(m.parent_id ? `${m.username} replied in ${where}` : `${m.username} in ${where}`, {
    body: text.length > 200 ? text.slice(0, 200) + '…' : text,
    tag: m.parent_id ? `yap-thread-${m.parent_id}` : `yap-channel-${m.channel_id}`,
  });
  n.onclick = async () => {
    window.focus();
    if (state.current !== m.channel_id) await openChannel(m.channel_id);
    if (m.parent_id) openThread(m.parent_id);
  };
}

// ---- boot ----

async function startApp() {
  $('auth').hidden = true;
  $('app').hidden = false;
  $('me').textContent = 'Signed in as ' + state.me.username;
  $('members').hidden = !state.me.admin;
  renderNotifyButton();
  await Promise.all([loadChannels(), loadMutedUsers().catch(() => {})]);
  let saved = null;
  try { saved = Number(localStorage.getItem('yap.channel')); } catch {}
  const pick = state.channels.find((c) => c.id === saved && c.joined)
    || state.channels.find((c) => c.name === 'general')
    || state.channels[0];
  if (pick) openChannel(pick.id);
  connect();
}

(async () => {
  try {
    state.me = await api('GET', '/api/me');
    await startApp();
  } catch {
    setAuthMode(false);
    showAuth();
  }
})();
