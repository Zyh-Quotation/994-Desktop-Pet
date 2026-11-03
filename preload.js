const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('pet', {
  reportSprite: (w, h) => ipcRenderer.send('sprite-loaded', w, h),
  overPet: v => ipcRenderer.send('over-pet', v),
  grab: () => ipcRenderer.send('grab'),
  release: (vx, vy) => ipcRenderer.send('release', vx, vy),
  click: () => ipcRenderer.send('click'),
  pet: () => ipcRenderer.send('pet'),
  context: () => ipcRenderer.send('context'),
  onInit: cb => ipcRenderer.on('init', (_e, d) => cb(d)),
  onSize: cb => ipcRenderer.on('size', (_e, h) => cb(h)),
  onState: cb => ipcRenderer.on('state', (_e, s) => cb(s)),
  onBubble: cb => ipcRenderer.on('bubble', (_e, b) => cb(b)),
  onSprite: cb => ipcRenderer.on('sprite', (_e, d) => cb(d)),
  onEvolve: cb => ipcRenderer.on('evolve', (_e, d) => cb(d)),
  onFeedFx: cb => ipcRenderer.on('feed-fx', () => cb()),
  onPlayFx: cb => ipcRenderer.on('play-fx', () => cb()),
  contextMenu: () => ipcRenderer.send('context-menu'),
  onEgg: cb => ipcRenderer.on('egg', (_e, d) => cb(d)),
  onEggGone: cb => ipcRenderer.on('egg-gone', () => cb()),
  hatch: () => ipcRenderer.send('hatch'),
  onFace: cb => ipcRenderer.on('face', (_e, d) => cb(d)),
  onCry: cb => ipcRenderer.on('cry', (_e, u) => cb(u)),
  onAct: cb => ipcRenderer.on('act', (_e, a) => cb(a)),
  onAlt: cb => ipcRenderer.on('alt', (_e, r) => cb(r)),
  onFx: cb => ipcRenderer.on('fx', (_e, d) => cb(d)),
  onLang: cb => ipcRenderer.on('lang', (_e, l) => cb(l)),
  onLook: cb => ipcRenderer.on('look', (_e, d) => cb(d)),
  onForm: cb => ipcRenderer.on('form', (_e, d) => cb(d)),
  onSkin: cb => ipcRenderer.on('skin', (_e, s) => cb(s)),
  onAccess: cb => ipcRenderer.on('access', (_e, a) => cb(a)),
  syncAccess: () => ipcRenderer.sendSync('access:sync') || {},
  syncSkin: () => ipcRenderer.sendSync('skin:sync') || 'default'
});

// 当前语言（i18n 用）
try { contextBridge.exposeInMainWorld('PET_LANG', ipcRenderer.sendSync('lang:sync') || 'zh'); } catch (_) {}
try { contextBridge.exposeInMainWorld('PET_SKIN', ipcRenderer.sendSync('skin:sync') || 'default'); } catch (_) {}
