const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('lore', {
  onData: cb => ipcRenderer.on('lore:data', (_e, d) => cb(d)),
  close: () => ipcRenderer.send('lore:close')
});
