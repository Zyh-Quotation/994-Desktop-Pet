const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('lore', {
  onData: cb => ipcRenderer.on('lore:data', (_e, d) => cb(d)),
  close: () => ipcRenderer.send('lore:close')
});

// 当前语言（i18n 用）
try { contextBridge.exposeInMainWorld('PET_LANG', ipcRenderer.sendSync('lang:sync') || 'zh'); } catch (_) {}
