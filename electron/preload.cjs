const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('mapleDesktop', Object.freeze({
  listSources: () => ipcRenderer.invoke('capture:list'),
  selectSource: (id) => ipcRenderer.invoke('capture:select', id),
  appInfo: () => ipcRenderer.invoke('app:info'),
  settings: Object.freeze({
    read: key => ipcRenderer.sendSync('settings:read', key),
    write: (key,value) => ipcRenderer.sendSync('settings:write', key,value),
  }),
  updateStatus: () => ipcRenderer.invoke('update:status'),
  checkForUpdates: () => ipcRenderer.invoke('update:check'),
  onUpdateState: cb => {
    if(typeof cb!=='function')return ()=>{};
    const listener=(_event,state)=>cb(state);ipcRenderer.on('update:state',listener);
    return ()=>ipcRenderer.removeListener('update:state',listener);
  },
  installUpdate: () => ipcRenderer.invoke('update:install'),
}));
