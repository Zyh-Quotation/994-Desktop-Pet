const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('egg', {
  get: () => ipcRenderer.invoke('egg:get'),
  hatch: () => ipcRenderer.invoke('egg:hatch'),
  close: () => ipcRenderer.send('egg:close')
});

// 当前语言（i18n 用）
try { contextBridge.exposeInMainWorld('PET_LANG', ipcRenderer.sendSync('lang:sync') || 'zh'); } catch (_) {}
