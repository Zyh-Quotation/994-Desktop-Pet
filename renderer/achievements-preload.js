const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('ach', {
  get: () => ipcRenderer.invoke('ach:get'),
  close: () => ipcRenderer.send('ach:close')
});
