'use strict';
/* 抠图窗口的桥：只暴露三件事，页面拿不到 Node */
const { contextBridge, ipcRenderer } = require('electron');

let handler = null;
const queue = [];

ipcRenderer.on('cutout:request', (_event, req) => {
  if (handler) handler(req);
  else queue.push(req);
});

contextBridge.exposeInMainWorld('cutoutApi', {
  onRequest(fn) {
    handler = fn;
    while (queue.length) {
      const req = queue.shift();
      try { fn(req); } catch (_) {}
    }
  },
  result(id, payload) { ipcRenderer.send('cutout:result', id, payload); },
  log(msg) { ipcRenderer.send('cutout:log', String(msg)); }
});
