const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('mapleDesktop', Object.freeze({
  listSources: () => ipcRenderer.invoke('capture:list'),
  selectSource: (id) => ipcRenderer.invoke('capture:select', id),
}));
