'use strict';

const $ = (id) => document.getElementById(id);

const state = {
  me: null,
  channels: [],
  current: null, // channel id
  unread: new Set(),
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
  $('auth-error').textContent = '';
}

$('auth-toggle').addEventListener('click', () => setAuthMode(!registering));

$('auth-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  $('auth-error').textContent = '';
  try {
    state.me = await api('POST', registering ? '/api/register' : '/api/login', {
      username: $('username').value.trim(),
      password: $('password').value,
    });
    $('password').value = '';
    await startApp();
  } catch (err) {
    $('auth-error').textContent = err.message;
  }
});

$('logout').addEventListener('click', async () => {
  try { await api('POST', '/api/logout', {}); } catch {}
  if (state.ws) { state.ws.onclose = null; state.ws.close(); state.ws = null; }
  state.me = null;
  state.current = null;
  showAuth();
});

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
    if (state.unread.has(ch.id)) b.classList.add('unread');
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
  try { localStorage.setItem('yap.channel', String(id)); } catch {}
  renderChannels();
  const ch = currentChannel();
  $('channel-title').textContent = '# ' + (ch ? ch.name : '');
  $('messages').replaceChildren();
  const joined = ch && ch.joined;
  $('join-banner').hidden = joined;
  $('composer').hidden = !joined;
  $('leave').hidden = !joined || (ch && ch.name === 'general');
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

function renderMessages(msgs) {
  $('messages').replaceChildren();
  if (msgs.length === 0) {
    showEmpty('No messages yet. Say hi!');
    return;
  }
  for (const m of msgs) { seen.add(m.id); appendMessage(m); }
}

let lastAuthor = null;
let lastTime = 0;

function appendMessage(m) {
  const list = $('messages');
  const empty = list.querySelector('.empty');
  if (empty) { empty.remove(); lastAuthor = null; }
  if (list.children.length === 0) lastAuthor = null;

  const nearBottom = list.scrollHeight - list.scrollTop - list.clientHeight < 80;
  const li = document.createElement('li');
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
  li.append(text);
  list.append(li);
  lastAuthor = m.user_id;
  lastTime = m.created_at;
  if (nearBottom || m.user_id === state.me.id) list.scrollTop = list.scrollHeight;
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
    state.wsRetry = 0;
  };
  ws.onmessage = (e) => {
    const ev = JSON.parse(e.data);
    if (ev.type === 'message') {
      const m = ev.message;
      if (seen.has(m.id)) return;
      seen.add(m.id);
      if (m.channel_id === state.current) {
        appendMessage(m);
      } else {
        state.unread.add(m.channel_id);
        renderChannels();
      }
    } else if (ev.type === 'channel_created') {
      loadChannels();
    }
  };
  ws.onclose = () => {
    $('conn').classList.remove('live');
    if (!state.me) return;
    const delay = Math.min(30000, 1000 * 2 ** state.wsRetry++);
    setTimeout(async () => {
      try { await api('GET', '/api/me'); } catch (err) { if (err.status === 401) return showAuth(); }
      connect();
    }, delay);
  };
}

// ---- boot ----

async function startApp() {
  $('auth').hidden = true;
  $('app').hidden = false;
  $('me').textContent = 'Signed in as ' + state.me.username;
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
