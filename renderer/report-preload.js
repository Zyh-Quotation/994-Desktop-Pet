const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('report', {
  get: () => ipcRenderer.invoke('report:get'),
  save: () => ipcRenderer.invoke('report:save'),
  close: () => ipcRenderer.send('report:close')
});

// 当前语言（i18n 用）
try { contextBridge.exposeInMainWorld('PET_LANG', ipcRenderer.sendSync('lang:sync') || 'zh'); } catch (_) {}
