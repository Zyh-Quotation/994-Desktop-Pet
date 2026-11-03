const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('share', {
  onData: cb => ipcRenderer.on('share-data', (_e, d) => cb(d)),
  ready: () => ipcRenderer.send('share-ready')
});

// 当前语言（i18n 用）
try { contextBridge.exposeInMainWorld('PET_LANG', ipcRenderer.sendSync('lang:sync') || 'zh'); } catch (_) {}
try { contextBridge.exposeInMainWorld('PET_SKIN', ipcRenderer.sendSync('skin:sync') || 'default'); } catch (_) {}
try { contextBridge.exposeInMainWorld('PET_ACCESS', ipcRenderer.sendSync('access:sync') || {}); } catch (_) {}
