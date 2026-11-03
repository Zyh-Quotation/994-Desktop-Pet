const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('report', {
  get: () => ipcRenderer.invoke('report:get'),
  save: () => ipcRenderer.invoke('report:save'),
  close: () => ipcRenderer.send('report:close')
});
