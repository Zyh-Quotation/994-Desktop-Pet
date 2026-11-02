const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('cfg', {
  get: () => ipcRenderer.invoke('cfg:get'),
  setSpecies: dex => ipcRenderer.invoke('cfg:setSpecies', dex),
  setLogin: on => ipcRenderer.invoke('cfg:setLogin', on),
  setSize: k => ipcRenderer.invoke('cfg:setSize', k),
  random: () => ipcRenderer.invoke('cfg:random'),
  setSound: on => ipcRenderer.invoke('cfg:setSound', on),
  checkUpdate: () => ipcRenderer.invoke('cfg:checkUpdate'),
  close: () => ipcRenderer.send('cfg:close')
});
