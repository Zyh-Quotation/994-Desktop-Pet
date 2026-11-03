const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('game', {
  done: score => ipcRenderer.send('game:done', Number(score) || 0),
  close: () => ipcRenderer.send('game:close')
});
