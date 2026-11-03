const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('share', {
  onData: cb => ipcRenderer.on('share-data', (_e, d) => cb(d)),
  ready: () => ipcRenderer.send('share-ready')
});
