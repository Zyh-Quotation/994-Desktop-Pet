const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('report', {
  get: () => ipcRenderer.invoke('report:get'),
  save: () => ipcRenderer.invoke('report:save'),
  close: () => ipcRenderer.send('report:close')
});

// 当前语言（i18n 用）
try { contextBridge.exposeInMainWorld('PET_LANG', ipcRenderer.sendSync('lang:sync') || 'zh'); } catch (_) {}
try { contextBridge.exposeInMainWorld('PET_SKIN', ipcRenderer.sendSync('skin:sync') || 'default'); } catch (_) {}
try { contextBridge.exposeInMainWorld('PET_ACCESS', ipcRenderer.sendSync('access:sync') || {}); } catch (_) {}
