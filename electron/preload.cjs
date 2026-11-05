const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('mapleDesktop', Object.freeze({
  listSources: () => ipcRenderer.invoke('capture:list'),
  selectSource: (id) => ipcRenderer.invoke('capture:select', id),
  /** 받아 둔 새 버전 ({ version } 또는 null) */
  updateStatus: () => ipcRenderer.invoke('update:status'),
  onUpdateReady: (cb) => { if (typeof cb === 'function') ipcRenderer.on('update:ready', (_e, info) => cb({ version: String(info?.version ?? '') })); },
  installUpdate: () => ipcRenderer.invoke('update:install'),
}));
