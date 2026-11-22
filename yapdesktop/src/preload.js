'use strict';

// Runs in every page of the window, but only the app's own bundled pages
// (file://) get the API. The server's pages get nothing, and the main process
// also rejects these calls from anything but a local page.
const { contextBridge, ipcRenderer } = require('electron');

if (location.protocol === 'file:') {
  contextBridge.exposeInMainWorld('yapDesktop', {
    connect: (url) => ipcRenderer.invoke('yap:connect', String(url)),
    retry: () => ipcRenderer.invoke('yap:retry'),
    changeServer: () => ipcRenderer.invoke('yap:change-server'),
  });
}
