const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('egg', {
  get: () => ipcRenderer.invoke('egg:get'),
  hatch: () => ipcRenderer.invoke('egg:hatch'),
  close: () => ipcRenderer.send('egg:close'),
  onSkin: cb => ipcRenderer.on('skin', (_e, s) => cb(s)),
  onAccess: cb => ipcRenderer.on('access', (_e, a) => cb(a))
});

// 当前语言（i18n 用）
try { contextBridge.exposeInMainWorld('PET_LANG', ipcRenderer.sendSync('lang:sync') || 'zh'); } catch (_) {}
try { contextBridge.exposeInMainWorld('PET_SKIN', ipcRenderer.sendSync('skin:sync') || 'default'); } catch (_) {}
try { contextBridge.exposeInMainWorld('PET_ACCESS', ipcRenderer.sendSync('access:sync') || {}); } catch (_) {}
