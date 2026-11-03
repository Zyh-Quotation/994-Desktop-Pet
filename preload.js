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
  onFace: cb => ipcRenderer.on('face', (_e, d) => cb(d)),
  onCry: cb => ipcRenderer.on('cry', (_e, u) => cb(u)),
  onAct: cb => ipcRenderer.on('act', (_e, a) => cb(a)),
  onAlt: cb => ipcRenderer.on('alt', (_e, r) => cb(r)),
  onFx: cb => ipcRenderer.on('fx', (_e, d) => cb(d))
});
