const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('star', {
  go: () => ipcRenderer.send('star:go'),
  later: () => ipcRenderer.send('star:later')
});
