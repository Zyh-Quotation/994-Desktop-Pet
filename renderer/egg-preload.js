const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('egg', {
  get: () => ipcRenderer.invoke('egg:get'),
  hatch: () => ipcRenderer.invoke('egg:hatch'),
  close: () => ipcRenderer.send('egg:close')
});
