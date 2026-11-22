'use strict';

const $ = (id) => document.getElementById(id);

const state = {
  me: null,
  channels: [],
  current: null, // channel id
  unread: new Map(), // channel id -> unread message count
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

function showAuth() {
  $('app').hidden = true;
  $('auth').hidden = false;
  $('username').focus();
}

function setAuthMode(reg) {
  registering = reg;
  $('auth-sub').textContent = reg ? 'Create your account' : 'Sign in to continue';
  $('auth-submit').textContent = reg ? 'Create account' : 'Sign in';
  $('auth-toggle').textContent = reg ? 'Have an account? Sign in' : 'Need an account? Create one';
  $('password').autocomplete = reg ? 'new-password' : 'current-password';
  $('invite-row').hidden = !(reg && inviteOnly);
  $('invite').required = reg && inviteOnly;
  $('auth-error').textContent = '';
}

$('auth-toggle').addEventListener('click', () => setAuthMode(!registering));

$('auth-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  $('auth-error').textContent = '';
  try {
    const creds = { username: $('username').value.trim(), password: $('password').value };
    if (registering && inviteOnly) creds.invite = $('invite').value.trim();
    state.me = await api('POST', registering ? '/api/register' : '/api/login', creds);
    $('password').value = '';
    $('invite').value = '';
    setAuthMode(false); // so a later sign-out shows sign-in, not sign-up
    await startApp();
  } catch (err) {
    $('auth-error').textContent = err.message;
  }
});

$('logout').addEventListener('click', async () => {
  try { await api('POST', '/api/logout', {}); } catch {}
  signedOut();
});

function signedOut() {
  window.yapCalls?.hangUp();
  if (state.ws) { state.ws.onclose = null; state.ws.close(); state.ws = null; }
  state.me = null;
  state.current = null;
  state.unread.clear();
  for (const d of document.querySelectorAll('dialog[open]')) d.close();
  updateTitle();
  setAuthMode(false);
  showAuth();
}

// ---- account ----

$('account').addEventListener('click', () => {
  for (const f of $('account-dialog').querySelectorAll('form')) f.reset();
  for (const p of $('account-dialog').querySelectorAll('.error, .ok')) p.textContent = '';
  $('account-dialog').showModal();
});

$('password-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  $('password-error').textContent = '';
  $('password-ok').textContent = '';
  try {
    await api('POST', '/api/me/password', {
      current_password: $('current-password').value,
      new_password: $('new-password').value,
    });
    $('password-form').reset();
    $('password-ok').textContent = 'Password changed. Your other devices have been signed out.';
  } catch (err) {
    $('password-error').textContent = err.message;
  }
});

$('delete-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  $('delete-error').textContent = '';
  if (!confirm(`Delete the account ${state.me.username} and all its messages? This can't be undone.`)) return;
  try {
    await api('DELETE', '/api/me', { password: $('delete-password').value });
    signedOut();
  } catch (err) {
    $('delete-error').textContent = err.message;
  }
});

// ---- admin ----

$('members').addEventListener('click', async () => {
  $('members-error').textContent = '';
  $('members-dialog').showModal();
  await loadMembers();
});

async function loadMembers() {
  const ul = $('member-list');
  try {
    const users = await api('GET', '/api/admin/users');
    ul.replaceChildren(...users.map(memberRow));
  } catch (err) {
    $('members-error').textContent = err.message;
  }
}

function memberRow(u) {
  const li = document.createElement('li');
  const name = document.createElement('span');
  name.textContent = u.username;
  const info = document.createElement('span');
  info.className = 'muted';
  info.textContent = u.admin ? 'admin' : u.banned ? 'banned' : 'joined ' + new Date(u.created_at).toLocaleDateString();
  li.append(name, info);
  if (!u.admin) {
    li.append(actionButton(u.banned ? 'Unban' : 'Ban', async () => {
      $('members-error').textContent = '';
      try {
        if (u.banned) {
          await api('POST', `/api/admin/users/${u.id}/unban`, {});
        } else {
          if (!confirm(`Ban ${u.username}? They'll be signed out and can't sign in again until unbanned.`)) return;
          const purge = confirm(`Also delete everything ${u.username} has posted? Cancel keeps their messages.`);
          await api('POST', `/api/admin/users/${u.id}/ban`, { delete_messages: purge });
        }
        await loadMembers();
      } catch (err) {
        $('members-error').textContent = err.message;
      }
    }));
  }
  return li;
}

for (const d of document.querySelectorAll('dialog')) {
  d.querySelector('.close').addEventListener('click', () => d.close());
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
    const li = document.createElement('li');
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = '# ' + ch.name;
    if (ch.id === state.current) b.classList.add('active');
    if (!ch.joined) b.classList.add('not-joined');
    if (state.unread.get(ch.id)) b.classList.add('unread');
    b.addEventListener('click', () => openChannel(ch.id));
    li.append(b);
    ul.append(li);
  }
}

$('new-channel').addEventListener('submit', async (e) => {
  e.preventDefault();
  const name = $('new-channel-name').value.trim();
  if (!name) return;
  try {
    const ch = await api('POST', '/api/channels', { name });
    $('new-channel-name').value = '';
    await loadChannels();
    openChannel(ch.id);
  } catch (err) {
    alert(err.message);
  }
});

function currentChannel() {
  return state.channels.find((c) => c.id === state.current);
}

async function openChannel(id) {
  state.current = id;
  state.unread.delete(id);
  updateTitle();
  try { localStorage.setItem('yap.channel', String(id)); } catch {}
  renderChannels();
  const ch = currentChannel();
  $('channel-title').textContent = '# ' + (ch ? ch.name : '');
  $('messages').replaceChildren();
  shown = [];
  const joined = ch && ch.joined;
  $('join-banner').hidden = joined;
  $('composer').hidden = !joined;
  $('leave').hidden = !joined || (ch && ch.name === 'general');
  window.yapCalls?.channelOpened();
  if (!joined) return;
  try {
    const msgs = await api('GET', `/api/channels/${id}/messages`);
    if (state.current !== id) return;
    renderMessages(msgs);
    $('body').focus();
  } catch (err) {
    showEmpty(err.message);
  }
}

$('join').addEventListener('click', async () => {
  const id = state.current;
  await api('POST', `/api/channels/${id}/join`, {});
  await loadChannels();
  openChannel(id);
});

$('leave').addEventListener('click', async () => {
  const ch = currentChannel();
  if (!ch || !confirm(`Leave #${ch.name}?`)) return;
  await api('POST', `/api/channels/${ch.id}/leave`, {});
  await loadChannels();
  const general = state.channels.find((c) => c.name === 'general');
  openChannel(general ? general.id : state.channels[0]?.id);
});

// ---- messages ----

const timeFmt = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' });
const dayFmt = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

function formatTime(ms) {
  const d = new Date(ms);
  return d.toDateString() === new Date().toDateString() ? timeFmt.format(d) : dayFmt.format(d);
}

function showEmpty(text) {
  const li = document.createElement('li');
  li.className = 'empty';
  li.textContent = text;
  $('messages').replaceChildren(li);
}

// The current channel's messages, oldest first. Edits and deletes re-render
// the list from here.
let shown = [];

function renderMessages(msgs) {
  shown = msgs.slice();
  for (const m of shown) seen.add(m.id);
  redraw(true);
}

function redraw(toBottom) {
  const list = $('messages');
  const offset = list.scrollHeight - list.scrollTop;
  list.replaceChildren();
  lastAuthor = null;
  if (shown.length === 0) {
    showEmpty('No messages yet. Say hi!');
    return;
  }
  for (const m of shown) list.append(messageItem(m));
  list.scrollTop = toBottom ? list.scrollHeight : list.scrollHeight - offset;
}

let lastAuthor = null;
let lastTime = 0;

function messageItem(m) {
  const li = document.createElement('li');
  li.dataset.id = m.id;
  // Group consecutive messages from one person within 5 minutes.
  if (m.user_id !== lastAuthor || m.created_at - lastTime > 5 * 60 * 1000) {
    const meta = document.createElement('div');
    meta.className = 'meta';
    const who = document.createElement('span');
    who.className = 'author';
    who.textContent = m.username;
    const when = document.createElement('time');
    when.className = 'time';
    when.dateTime = new Date(m.created_at).toISOString();
    when.textContent = formatTime(m.created_at);
    meta.append(who, when);
    li.append(meta);
  }
  const text = document.createElement('div');
  text.className = 'text';
  text.textContent = m.body;
  if (m.edited_at) {
    const tag = document.createElement('span');
    tag.className = 'edited';
    tag.textContent = ' (edited)';
    tag.title = formatTime(m.edited_at);
    text.append(tag);
  }
  li.append(text);

  const mine = m.user_id === state.me.id;
  if (mine || state.me.admin) {
    const actions = document.createElement('div');
    actions.className = 'actions';
    if (mine) actions.append(actionButton('Edit', () => startEdit(li, m)));
    actions.append(actionButton('Delete', () => deleteMessage(m)));
    li.append(actions);
  }
  lastAuthor = m.user_id;
  lastTime = m.created_at;
  return li;
}

function actionButton(label, onClick) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'link';
  b.textContent = label;
  b.addEventListener('click', onClick);
  return b;
}

function appendMessage(m) {
  const list = $('messages');
  if (shown.length === 0) list.replaceChildren();
  const nearBottom = list.scrollHeight - list.scrollTop - list.clientHeight < 80;
  shown.push(m);
  list.append(messageItem(m));
  if (nearBottom || m.user_id === state.me.id) list.scrollTop = list.scrollHeight;
}

function startEdit(li, m) {
  const text = li.querySelector('.text');
  const actions = li.querySelector('.actions');
  const form = document.createElement('form');
  form.className = 'edit';
  const input = document.createElement('textarea');
  input.value = m.body;
  input.maxLength = 4000;
  input.setAttribute('aria-label', 'Edit message');
  const save = document.createElement('button');
  save.type = 'submit';
  save.textContent = 'Save';
  const cancel = actionButton('Cancel', () => redraw(false));
  form.append(input, save, cancel);
  text.replaceWith(form);
  actions.hidden = true;
  input.focus();
  input.setSelectionRange(input.value.length, input.value.length);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') redraw(false);
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); form.requestSubmit(); }
  });
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const body = input.value.trim();
    if (!body) return;
    if (body === m.body) return redraw(false);
    try {
      replaceMessage(await api('PATCH', `/api/messages/${m.id}`, { body }));
    } catch (err) {
      alert(err.message);
    }
  });
}

async function deleteMessage(m) {
  if (!confirm('Delete this message? This can\'t be undone.')) return;
  try {
    await api('DELETE', `/api/messages/${m.id}`, {});
    removeMessages((x) => x.id === m.id);
  } catch (err) {
    alert(err.message);
  }
}

function replaceMessage(m) {
  const i = shown.findIndex((x) => x.id === m.id);
  if (i < 0) return;
  shown[i] = m;
  redraw(false);
}

function removeMessages(match) {
  const before = shown.length;
  shown = shown.filter((x) => !match(x));
  if (shown.length !== before) redraw(false);
}

const seen = new Set();

$('composer').addEventListener('submit', async (e) => {
  e.preventDefault();
  const body = $('body').value.trim();
  if (!body || state.current == null) return;
  $('body').value = '';
  autosize();
  try {
    const m = await api('POST', `/api/channels/${state.current}/messages`, { body });
    // The websocket may have delivered it already.
    if (!seen.has(m.id) && m.channel_id === state.current) { seen.add(m.id); appendMessage(m); }
  } catch (err) {
    $('body').value = body;
    alert(err.message);
  }
});

function autosize() {
  const t = $('body');
  t.style.height = 'auto';
  t.style.height = t.scrollHeight + 'px';
}

$('body').addEventListener('input', autosize);
$('body').addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
    e.preventDefault();
    $('composer').requestSubmit();
  }
});

// ---- live updates ----

function connect() {
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  const ws = new WebSocket(`${proto}//${location.host}/api/ws`);
  state.ws = ws;
  ws.onopen = () => {
    $('conn').classList.add('live');
    // Catch up on anything missed while disconnected.
    if (state.wsRetry > 0 && state.current != null) openChannel(state.current);
    window.yapCalls?.start();
    state.wsRetry = 0;
  };
  ws.onmessage = (e) => {
    const ev = JSON.parse(e.data);
    if (ev.type === 'message') {
      const m = ev.message;
      if (seen.has(m.id)) return;
      seen.add(m.id);
      if (m.channel_id === state.current) appendMessage(m);
      if (m.user_id !== state.me.id && (m.channel_id !== state.current || document.hidden)) {
        state.unread.set(m.channel_id, (state.unread.get(m.channel_id) || 0) + 1);
        renderChannels();
        updateTitle();
        notify(m);
      }
    } else if (ev.type === 'message_edited') {
      if (ev.message.channel_id === state.current) replaceMessage(ev.message);
    } else if (ev.type === 'message_deleted') {
      if (ev.message.channel_id === state.current) removeMessages((x) => x.id === ev.message.id);
    } else if (ev.type === 'user_removed') {
      removeMessages((x) => x.user_id === ev.user_id);
    } else if (ev.type === 'call_update') {
      window.yapCalls?.update(ev.call);
    } else if (ev.type === 'channel_created') {
      loadChannels();
    }
  };
  ws.onclose = () => {
    $('conn').classList.remove('live');
    if (!state.me) return;
    const delay = Math.min(30000, 1000 * 2 ** state.wsRetry++);
    setTimeout(async () => {
      // Signed out elsewhere, password changed or banned.
      try { await api('GET', '/api/me'); } catch (err) { if (err.status === 401) return signedOut(); }
      connect();
    }, delay);
  };
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
  const n = new Notification(`${m.username} in #${ch ? ch.name : 'channel'}`, {
    body: m.body.length > 200 ? m.body.slice(0, 200) + '…' : m.body,
    tag: `yap-channel-${m.channel_id}`,
  });
  n.onclick = () => {
    window.focus();
    openChannel(m.channel_id);
  };
}

// ---- boot ----

async function startApp() {
  $('auth').hidden = true;
  $('app').hidden = false;
  $('me').textContent = 'Signed in as ' + state.me.username;
  $('members').hidden = !state.me.admin;
  renderNotifyButton();
  await loadChannels();
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
