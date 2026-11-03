const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('cfg', {
  get: () => ipcRenderer.invoke('cfg:get'),
  setSpecies: dex => ipcRenderer.invoke('cfg:setSpecies', dex),
  setLogin: on => ipcRenderer.invoke('cfg:setLogin', on),
  setSize: k => ipcRenderer.invoke('cfg:setSize', k),
  random: () => ipcRenderer.invoke('cfg:random'),
  setSound: on => ipcRenderer.invoke('cfg:setSound', on),
  checkUpdate: () => ipcRenderer.invoke('cfg:checkUpdate'),
  setOpt: (key, value) => ipcRenderer.invoke('cfg:setOpt', key, value),
  setFav: (dex, on) => ipcRenderer.invoke('cfg:setFav', dex, on),
  readNotices: ids => ipcRenderer.invoke('cfg:readNotices', ids),
  clearNotices: () => ipcRenderer.invoke('cfg:clearNotices'),
  claimTask: (freq, id) => ipcRenderer.invoke('cfg:claimTask', freq, id),
  rename: name => ipcRenderer.invoke('cfg:rename', name),
  setLook: look => ipcRenderer.invoke('cfg:setLook', look),
  transformForm: (kind, file) => ipcRenderer.invoke('cfg:transform', kind, file),
  switchPet: dex => ipcRenderer.invoke('cfg:switchPet', dex),
  removePet: dex => ipcRenderer.invoke('cfg:removePet', dex),
  action: name => ipcRenderer.invoke('cfg:action', name),
  dexPulse: () => ipcRenderer.invoke('cfg:dexPulse'),
  onChanged: fn => ipcRenderer.on('cfg:changed', () => fn()),
  onLang: fn => ipcRenderer.on('lang', (_e, l) => fn(l)),
  onSkin: fn => ipcRenderer.on('skin', (_e, s) => fn(s)),
  onAccess: fn => ipcRenderer.on('access', (_e, a) => fn(a)),
  close: () => ipcRenderer.send('cfg:close')
});

// 当前语言（i18n 用）
try { contextBridge.exposeInMainWorld('PET_LANG', ipcRenderer.sendSync('lang:sync') || 'zh'); } catch (_) {}
try { contextBridge.exposeInMainWorld('PET_SKIN', ipcRenderer.sendSync('skin:sync') || 'default'); } catch (_) {}
try { contextBridge.exposeInMainWorld('PET_ACCESS', ipcRenderer.sendSync('access:sync') || {}); } catch (_) {}
