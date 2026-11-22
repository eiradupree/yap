'use strict';

const $ = (id) => document.getElementById(id);

const state = {
  me: null,
  channels: [],
  current: null, // channel id
  thread: null, // id of the message whose thread is open
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
  if (state.ws) { state.ws.onclose = null; state.ws.close(); state.ws = null; }
  state.me = null;
  state.current = null;
  closeThread();
  closePicker();
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

function messageItem(m, view, group) {
  const li = document.createElement('li');
  li.dataset.id = m.id;
  // Group consecutive messages from one person within 5 minutes.
  if (m.user_id !== group.author || m.created_at - group.time > 5 * 60 * 1000) {
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
  const react = actionButton('React', (e) => openPicker(e.currentTarget, (emoji) => toggleReaction(m, emoji, true)));
  react.title = 'Add reaction';
  actions.append(react);
  if (view === views.main) actions.append(actionButton('Reply', () => openThread(m.id)));
  const mine = m.user_id === state.me.id;
  if (mine && m.body) actions.append(actionButton('Edit', () => startEdit(li, m, view)));
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
    b.title = r.users.map((u) => u.username).join(', ');
    b.setAttribute('aria-pressed', String(mine));
    b.setAttribute('aria-label', `${r.emoji} ${r.users.length}, from ${b.title}`);
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
  add.title = 'Add reaction';
  add.setAttribute('aria-label', 'Add reaction');
  add.addEventListener('click', (e) => openPicker(e.currentTarget, (emoji) => toggleReaction(m, emoji, true)));
  div.append(add);
  return div;
}

async function toggleReaction(m, emoji, add) {
  try {
    const update = await api(add ? 'POST' : 'DELETE', `/api/messages/${m.id}/reactions`, { emoji });
    updateReactions(update);
  } catch (err) {
    alert(err.message);
  }
}

function actionButton(label, onClick) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'link';
  b.textContent = label;
  b.addEventListener('click', onClick);
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
  hint.append('Escape to ', actionButton('cancel', cancel), ' · Enter to save');
  form.append(hint);
  text.replaceWith(form);
  actions.hidden = true;
  composer.focus();
}

async function deleteMessage(m) {
  const what = !m.parent_id && m.reply_count ? 'Delete this message and its replies?' : 'Delete this message?';
  if (!confirm(what + ' This can\'t be undone.')) return;
  try {
    await api('DELETE', `/api/messages/${m.id}`, {});
    messageDeleted(m);
  } catch (err) {
    alert(err.message);
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
    if (m.user_id !== state.me.id && m.parent_user_id === state.me.id && !watching) notify(m);
    return;
  }
  if (m.channel_id === state.current) appendMessage(views.main, m);
  if (m.user_id !== state.me.id && (m.channel_id !== state.current || document.hidden)) {
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

$('thread-close').addEventListener('click', closeThread);
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

let pickerCallback = null;

(() => {
  const grid = $('emoji-picker').querySelector('.emoji-grid');
  for (const e of pickerEmoji) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = e;
    b.setAttribute('aria-label', e);
    b.addEventListener('click', () => pick(e));
    grid.append(b);
  }
  const any = $('emoji-picker').querySelector('.emoji-any');
  any.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.isComposing) {
      e.preventDefault();
      const v = any.value.trim();
      if (v) pick(v);
    }
  });
})();

function openPicker(anchor, onPick) {
  const p = $('emoji-picker');
  pickerCallback = onPick;
  p.hidden = false;
  p.querySelector('.emoji-any').value = '';
  const r = anchor.getBoundingClientRect();
  const w = p.offsetWidth, h = p.offsetHeight;
  p.style.left = Math.max(8, Math.min(window.innerWidth - w - 8, r.right - w)) + 'px';
  p.style.top = (r.top - h - 6 > 8 ? r.top - h - 6 : Math.min(window.innerHeight - h - 8, r.bottom + 6)) + 'px';
  p.querySelector('.emoji-grid button').focus();
}

function closePicker() {
  $('emoji-picker').hidden = true;
  pickerCallback = null;
}

function pick(emoji) {
  const cb = pickerCallback;
  closePicker();
  if (cb) cb(emoji);
}

document.addEventListener('mousedown', (e) => {
  if (!$('emoji-picker').hidden && !$('emoji-picker').contains(e.target)) closePicker();
}, true);
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !$('emoji-picker').hidden) { e.stopPropagation(); closePicker(); }
}, true);
window.addEventListener('resize', closePicker);
for (const view of Object.values(views)) view.list.addEventListener('scroll', closePicker);

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

// ---- live updates ----

function connect() {
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  const ws = new WebSocket(`${proto}//${location.host}/api/ws`);
  state.ws = ws;
  ws.onopen = () => {
    $('conn').classList.add('live');
    // Catch up on anything missed while disconnected.
    if (state.wsRetry > 0) refresh();
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
