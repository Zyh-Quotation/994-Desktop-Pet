const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('updateNotes', {
  get: () => ipcRenderer.invoke('update-notes:get'),
  install: () => ipcRenderer.invoke('update-notes:install'),
  close: () => ipcRenderer.send('update-notes:close')
});

try { contextBridge.exposeInMainWorld('PET_LANG', ipcRenderer.sendSync('lang:sync') || 'zh'); } catch (_) {}
