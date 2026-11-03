const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('star', {
  go: () => ipcRenderer.send('star:go'),
  later: () => ipcRenderer.send('star:later')
});

// 当前语言（i18n 用）
try { contextBridge.exposeInMainWorld('PET_LANG', ipcRenderer.sendSync('lang:sync') || 'zh'); } catch (_) {}
