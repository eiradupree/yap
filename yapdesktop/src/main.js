'use strict';

const { app, BrowserWindow, Menu, ipcMain, net, session, shell, dialog, desktopCapturer, systemPreferences } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { normalizeServerUrl, unreadFromTitle, isServerUrl, isSafeExternal } = require('./server-url');

const DEFAULT_SERVER = 'https://yap-chat-712e13.fly.dev';

// Keep data apart from the old Mattermost-based build, which also used "Yap".
// In development, YAP_USER_DATA points a test run at a throwaway folder.
const devData = !app.isPackaged && process.env.YAP_USER_DATA;
app.setPath('userData', devData || path.join(app.getPath('appData'), 'Yap Desktop'));

if (!app.requestSingleInstanceLock()) {
  app.quit();
  process.exit(0);
}

// ---- settings ----

const settingsFile = () => path.join(app.getPath('userData'), 'settings.json');

function loadSettings() {
  try {
    return JSON.parse(fs.readFileSync(settingsFile(), 'utf8'));
  } catch {
    return {};
  }
}

function saveSettings(patch) {
  const next = { ...loadSettings(), ...patch };
  fs.mkdirSync(path.dirname(settingsFile()), { recursive: true });
  fs.writeFileSync(settingsFile(), JSON.stringify(next, null, 2));
  return next;
}

let serverOrigin = null;
let win = null;

// ---- window ----

function createWindow() {
  const saved = loadSettings().bounds || {};
  win = new BrowserWindow({
    width: saved.width || 1100,
    height: saved.height || 720,
    x: saved.x,
    y: saved.y,
    minWidth: 420,
    minHeight: 400,
    title: 'Yap',
    show: false,
    backgroundColor: '#1b1c20',
    webPreferences: {
      // The preload only exposes its API to the app's own file:// pages, never
      // to the server's pages, and the IPC handlers check the sender too.
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      webSecurity: true,
      spellcheck: true,
    },
  });
  if (saved.maximized) win.maximize();
  win.once('ready-to-show', () => win.show());

  const remember = () => {
    if (!win || win.isDestroyed()) return;
    saveSettings({ bounds: { ...win.getNormalBounds(), maximized: win.isMaximized() } });
  };
  win.on('close', remember);

  // The web client puts the unread count in its title, e.g. "(3) Yap".
  win.webContents.on('page-title-updated', (_e, title) => {
    if (process.platform === 'darwin') {
      const n = unreadFromTitle(title);
      app.dock.setBadge(n > 0 ? String(n) : '');
    }
  });

  // Stay on the server; send every other link to the system browser.
  win.webContents.on('will-navigate', (e, url) => {
    if (isLocalPage(url) || (serverOrigin && isServerUrl(url, serverOrigin))) return;
    e.preventDefault();
    if (isSafeExternal(url)) shell.openExternal(url);
  });
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (isSafeExternal(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-attach-webview', (e) => e.preventDefault());

  win.webContents.on('did-fail-load', (_e, code, desc, url, isMainFrame) => {
    // -3 is ERR_ABORTED, which happens on ordinary redirects and reloads.
    if (!isMainFrame || code === -3 || isLocalPage(url)) return;
    showLocal('offline.html', { server: serverOrigin || '', error: desc });
  });

  win.on('closed', () => {
    win = null;
  });
}

function isLocalPage(url) {
  return url.startsWith('file://');
}

function showLocal(page, query = {}) {
  win.loadFile(path.join(__dirname, 'pages', page), { query });
}

function openServer(origin) {
  serverOrigin = origin;
  win.loadURL(origin + '/');
}

function start() {
  const { serverUrl } = loadSettings();
  if (serverUrl) {
    openServer(serverUrl);
  } else {
    showLocal('connect.html', { suggested: DEFAULT_SERVER });
  }
}

// ---- IPC from the local pages only ----

function fromLocalPage(event) {
  const url = event.senderFrame?.url || '';
  return isLocalPage(url);
}

// Checks that the address is a Yap server before saving it.
ipcMain.handle('yap:connect', async (event, input) => {
  if (!fromLocalPage(event)) throw new Error('not allowed');
  let origin;
  try {
    origin = normalizeServerUrl(input);
  } catch (err) {
    return { ok: false, error: err.message };
  }
  try {
    const res = await net.fetch(origin + '/api/ping', { signal: AbortSignal.timeout(10000) });
    const body = res.ok ? await res.json() : null;
    if (!body || body.app !== 'yap') {
      return { ok: false, error: "That server isn't a Yap server." };
    }
  } catch (err) {
    console.error(`Server check for ${origin} failed:`, err);
    return { ok: false, error: "Couldn't reach that server. Check the address and your connection." };
  }
  saveSettings({ serverUrl: origin });
  openServer(origin);
  return { ok: true };
});

ipcMain.handle('yap:retry', (event) => {
  if (!fromLocalPage(event)) throw new Error('not allowed');
  start();
});

ipcMain.handle('yap:change-server', (event) => {
  if (!fromLocalPage(event)) throw new Error('not allowed');
  changeServer();
});

function changeServer() {
  if (!win) return;
  const { serverUrl } = loadSettings();
  showLocal('connect.html', { suggested: serverUrl || DEFAULT_SERVER, current: serverUrl || '' });
}

// On macOS, also ask the system for camera and microphone access; the first
// time, this shows the macOS prompt.
async function askForMedia(types) {
  if (process.platform !== 'darwin') return true;
  for (const type of types) {
    const kind = type === 'video' ? 'camera' : type === 'audio' ? 'microphone' : null;
    if (!kind) continue;
    if (systemPreferences.getMediaAccessStatus(kind) === 'granted') continue;
    if (!(await systemPreferences.askForMediaAccess(kind))) return false;
  }
  return true;
}

// ---- menu ----

function buildMenu() {
  const isMac = process.platform === 'darwin';
  const template = [
    ...(isMac ? [{
      label: app.name,
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { label: 'Change Server…', click: changeServer },
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' },
      ],
    }] : [{
      label: 'File',
      submenu: [{ label: 'Change Server…', click: changeServer }, { type: 'separator' }, { role: 'quit' }],
    }]),
    { role: 'editMenu' },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
    { role: 'windowMenu' },
    {
      role: 'help',
      submenu: [{
        label: 'Open in Browser',
        click: () => serverOrigin && shell.openExternal(serverOrigin),
      }],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// ---- lifecycle ----

app.on('second-instance', () => {
  if (!win) return;
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
});

app.whenReady().then(() => {
  // Only the connected server may show notifications and, for calls, use the
  // camera and microphone. Everything else (location, MIDI, ...) is refused.
  const fromServer = (url) => !!serverOrigin && !!url && isServerUrl(url, serverOrigin);
  session.defaultSession.setPermissionRequestHandler((wc, permission, callback, details) => {
    if (!fromServer(details.requestingUrl || wc.getURL())) return callback(false);
    if (permission === 'notifications') return callback(true);
    if (permission === 'media') {
      askForMedia(details.mediaTypes || []).then(callback, () => callback(false));
      return;
    }
    callback(false);
  });
  session.defaultSession.setPermissionCheckHandler((wc, permission, requestingOrigin) =>
    (permission === 'notifications' || permission === 'media') && fromServer(requestingOrigin));
  // Screen sharing: macOS 15+ shows its own picker; elsewhere share the
  // main screen.
  session.defaultSession.setDisplayMediaRequestHandler((request, callback) => {
    if (!fromServer(request.securityOrigin || request.frame?.url)) return callback({});
    desktopCapturer.getSources({ types: ['screen'] })
      .then((sources) => callback(sources[0] ? { video: sources[0] } : {}), () => callback({}));
  }, { useSystemPicker: true });

  // Defense in depth: never let any page load a preload other than ours.
  app.on('web-contents-created', (_e, contents) => {
    contents.on('will-attach-webview', (ev) => ev.preventDefault());
  });

  buildMenu();
  createWindow();
  start();

  app.on('activate', () => {
    if (win) {
      win.show();
    } else {
      createWindow();
      start();
    }
  });
});

// A chat app keeps running in the dock on macOS when its window closes.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

process.on('uncaughtException', (err) => {
  dialog.showErrorBox('Yap hit an unexpected error', String(err && err.stack || err));
});
