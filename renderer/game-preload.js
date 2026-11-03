const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('game', {
  done: score => ipcRenderer.send('game:done', Number(score) || 0),
  close: () => ipcRenderer.send('game:close')
});

// 当前语言（i18n 用）
try { contextBridge.exposeInMainWorld('PET_LANG', ipcRenderer.sendSync('lang:sync') || 'zh'); } catch (_) {}
try { contextBridge.exposeInMainWorld('PET_SKIN', ipcRenderer.sendSync('skin:sync') || 'default'); } catch (_) {}
try { contextBridge.exposeInMainWorld('PET_ACCESS', ipcRenderer.sendSync('access:sync') || {}); } catch (_) {}
