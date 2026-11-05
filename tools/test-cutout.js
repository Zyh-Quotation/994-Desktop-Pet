#!/usr/bin/env node
/*
 * 照片抠图的命令行自测（开发用，不进发布包）
 *
 *   env -u ELECTRON_RUN_AS_NODE ./node_modules/electron/dist/Electron.app/Contents/MacOS/Electron \
 *     tools/test-cutout.js [--engine onnx|vision|auto] [--max 1600] 图片1 [图片2 ...]
 *
 * macOS 上会默认走 Vision；想验证 Windows 走的那条 ONNX 路径，加 --engine onnx。
 * 输出写在图片同目录的 <名字>.cutout.png，并打印尺寸/体积/耗时。
 */
'use strict';
const { app } = require('electron');
const path = require('path');
const fs = require('fs');

const argv = process.argv.slice(2);
let engine = 'auto';
let maxSide = 1600;
const inputs = [];
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === '--engine') engine = argv[++i];
  else if (a === '--max') maxSide = Number(argv[++i]);
  else inputs.push(a);
}

const cutout = require('../cutout');

app.disableHardwareAcceleration();

app.whenReady().then(async () => {
  if (!cutout.available()) {
    console.error('❌ 没有可用的抠图引擎（tools/bin/ort 或 tools/bin/cutout 缺失）');
    app.exit(1);
    return;
  }
  console.log('引擎：' + cutout.engineName() + (engine === 'auto' ? '' : `（强制 ${engine}）`));

  let bad = 0;
  for (const input of inputs) {
    const abs = path.resolve(input);
    const out = abs.replace(/\.[^.]+$/, '') + '.cutout.png';
    const t0 = Date.now();
    const r = await cutout.cutout(abs, out, { maxSide, engine });
    const ms = Date.now() - t0;
    if (r.ok) {
      const kb = (fs.statSync(out).size / 1024).toFixed(0);
      console.log(`✅ ${path.basename(abs)} → ${path.basename(out)}  ${r.w}x${r.h}  ${kb}KB  ${ms}ms  [${r.engine}${r.fallback ? ' / 整图兜底' : ''}]`);
    } else {
      bad++;
      console.log(`❌ ${path.basename(abs)}  ${r.reason}  ${ms}ms`);
    }
  }
  cutout.destroy();
  app.exit(bad ? 1 : 0);
});
