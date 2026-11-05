'use strict';
/*
 * 隐藏窗口里的抠图工人：ONNX Runtime(wasm) + u2netp
 *
 * 流程：照片 → 缩到 320×320 喂模型 → 取显著度遮罩 → 放回原图尺寸做 alpha
 *       → 按遮罩边界裁掉空白 → 回传 PNG。全程离线。
 *
 * 尺寸/归一化和 rembg 的 u2netp 会话一致（用的同一个权重）。
 */
(function () {
  const SIZE = 320;                              // u2netp 固定输入
  const MEAN = [0.485, 0.456, 0.406];
  const STD = [0.229, 0.224, 0.225];
  const MODEL_URL = '/tools/bin/ort/u2netp.onnx';
  const BBOX_ALPHA = 32;                         // 低于这个值算透明，找边界时忽略
  const MAX_COVERAGE = 0.97;                     // 遮罩几乎盖满整张图 → 认为没找到主体
  const MIN_RANGE = 0.05;                        // 输出几乎是常数 → 同上

  const api = window.cutoutApi;
  const log = (m) => { try { api.log(m); } catch (_) {} };

  ort.env.wasm.numThreads = 1;                   // 单线程：不用 SharedArrayBuffer，Windows 上更稳
  ort.env.wasm.wasmPaths = '/tools/bin/ort/';

  let sessionPromise = null;
  function getSession() {
    if (!sessionPromise) {
      sessionPromise = ort.InferenceSession.create(MODEL_URL, {
        executionProviders: ['wasm'],
        graphOptimizationLevel: 'all'
      }).catch((err) => {
        sessionPromise = null;
        throw err;
      });
    }
    return sessionPromise;
  }

  function canvas2d(w, h) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    return c;
  }

  async function decode(buffer) {
    try {
      return await createImageBitmap(new Blob([buffer]));
    } catch (_) {
      const err = new Error('decode failed');
      err.reason = 'decode';
      throw err;
    }
  }

  // 原图 → 320×320 的归一化 CHW 张量
  function toTensor(bitmap) {
    const c = canvas2d(SIZE, SIZE);
    const ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(bitmap, 0, 0, SIZE, SIZE);
    const px = ctx.getImageData(0, 0, SIZE, SIZE).data;
    const data = new Float32Array(3 * SIZE * SIZE);
    const plane = SIZE * SIZE;
    for (let i = 0; i < plane; i++) {
      const o = i * 4;
      data[i] = (px[o] / 255 - MEAN[0]) / STD[0];
      data[plane + i] = (px[o + 1] / 255 - MEAN[1]) / STD[1];
      data[2 * plane + i] = (px[o + 2] / 255 - MEAN[2]) / STD[2];
    }
    return data;
  }

  // 模型输出 → 0..1 遮罩 + 质量控制
  function readMask(raw) {
    let min = Infinity, max = -Infinity;
    for (let i = 0; i < raw.length; i++) {
      const v = raw[i];
      if (v < min) min = v;
      if (v > max) max = v;
    }
    const range = max - min;
    if (!isFinite(range) || range < MIN_RANGE) return { ok: false, reason: 'no-subject' };

    const mask = new Float32Array(raw.length);
    let covered = 0;
    for (let i = 0; i < raw.length; i++) {
      const v = (raw[i] - min) / range;
      const clamped = v < 0 ? 0 : (v > 1 ? 1 : v);
      mask[i] = clamped;
      if (clamped > 0.5) covered++;
    }
    if (covered / raw.length > MAX_COVERAGE) return { ok: false, reason: 'no-subject' };
    if (covered / raw.length < 0.002) return { ok: false, reason: 'no-subject' };
    return { ok: true, mask };
  }

  function maskCanvas(mask) {
    const c = canvas2d(SIZE, SIZE);
    const ctx = c.getContext('2d');
    const img = ctx.createImageData(SIZE, SIZE);
    for (let i = 0; i < mask.length; i++) {
      const o = i * 4;
      img.data[o] = 255;
      img.data[o + 1] = 255;
      img.data[o + 2] = 255;
      img.data[o + 3] = Math.round(mask[i] * 255);
    }
    ctx.putImageData(img, 0, 0);
    return c;
  }

  // 原图 + 遮罩 → 裁剪好的透明 PNG
  async function compose(bitmap, mask, W, H) {
    const full = canvas2d(W, H);
    const fctx = full.getContext('2d');
    fctx.imageSmoothingQuality = 'high';
    fctx.drawImage(bitmap, 0, 0, W, H);
    fctx.globalCompositeOperation = 'destination-in';
    fctx.drawImage(maskCanvas(mask), 0, 0, W, H);
    fctx.globalCompositeOperation = 'source-over';

    const alpha = fctx.getImageData(0, 0, W, H).data;
    let x0 = W, y0 = H, x1 = -1, y1 = -1;
    for (let y = 0; y < H; y++) {
      const row = y * W * 4;
      for (let x = 0; x < W; x++) {
        if (alpha[row + x * 4 + 3] > BBOX_ALPHA) {
          if (x < x0) x0 = x;
          if (x > x1) x1 = x;
          if (y < y0) y0 = y;
          if (y > y1) y1 = y;
        }
      }
    }
    if (x1 < x0 || y1 < y0) return null;   // 全透明

    const pad = Math.max(4, Math.round(Math.max(x1 - x0, y1 - y0) * 0.02));
    x0 = Math.max(0, x0 - pad); y0 = Math.max(0, y0 - pad);
    x1 = Math.min(W - 1, x1 + pad); y1 = Math.min(H - 1, y1 + pad);
    const cw = x1 - x0 + 1, ch = y1 - y0 + 1;

    const out = canvas2d(cw, ch);
    out.getContext('2d').drawImage(full, x0, y0, cw, ch, 0, 0, cw, ch);
    return { canvas: out, w: cw, h: ch };
  }

  function fallbackWholeImage(bitmap, W, H) {
    const out = canvas2d(W, H);
    out.getContext('2d').drawImage(bitmap, 0, 0, W, H);
    return { canvas: out, w: W, h: H, fallback: true };
  }

  async function toPng(canvas) {
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
    if (!blob) throw new Error('toBlob failed');
    return blob.arrayBuffer();
  }

  async function handle(req) {
    const t0 = performance.now();
    const id = req && req.id;
    try {
      const maxSide = Math.max(240, Math.min(4096, Number(req.maxSide) || 1600));
      const bitmap = await decode(req.buffer);
      // 1 像素的图也能"抠"，但放到桌面上就是个看不出来的色块，不如直接说清楚
      if (Math.min(bitmap.width, bitmap.height) < 16) {
        const err = new Error('image too small');
        err.reason = 'too-small';
        throw err;
      }
      // 超大图解码就要吃掉几百 MB，先挡掉
      if (bitmap.width * bitmap.height > 80e6) {
        const err = new Error('image too large');
        err.reason = 'too-big';
        throw err;
      }
      const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
      const W = Math.max(1, Math.round(bitmap.width * scale));
      const H = Math.max(1, Math.round(bitmap.height * scale));
      log(`image ${bitmap.width}x${bitmap.height} → ${W}x${H}`);

      const session = await getSession();
      const input = new ort.Tensor('float32', toTensor(bitmap), [1, 3, SIZE, SIZE]);
      const tRun = performance.now();
      const outputs = await session.run({ [session.inputNames[0]]: input });
      const raw = outputs[session.outputNames[0]];
      if (!raw || !raw.data) throw new Error('empty model output');
      log(`inference ${Math.round(performance.now() - tRun)}ms`);

      const read = readMask(raw.data);
      let out;
      if (read.ok) {
        out = await compose(bitmap, read.mask, W, H);
        if (!out) log('mask empty after threshold, fallback');
      }
      if (!out) {
        // 没认出主体（比如纯风景照）：整张图先用着，总比报错强
        out = fallbackWholeImage(bitmap, W, H);
      }
      const png = await toPng(out.canvas);
      log(`done ${out.w}x${out.h} ${(png.byteLength / 1024).toFixed(0)}KB ${Math.round(performance.now() - t0)}ms`);
      api.result(id, { ok: true, png, w: out.w, h: out.h, fallback: !!out.fallback });
    } catch (err) {
      const reason = err && err.reason ? err.reason : ('error: ' + (err && (err.message || err)));
      log('failed: ' + reason);
      api.result(id, { ok: false, reason });
    }
  }

  // 同一个隐藏窗口可能连着收到多次请求（比如托盘菜单和设置页一起点），
  // 串起来跑，别让两次推理抢同一个 session
  let chain = Promise.resolve();
  api.onRequest((req) => { chain = chain.then(() => handle(req)); });
})();
