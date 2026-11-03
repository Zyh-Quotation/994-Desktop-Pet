// 生成应用图标 png（1024×1024，带圆角与透明）
const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');

app.disableHardwareAcceleration();

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 1024, height: 1024, show: false, frame: false,
    transparent: true, backgroundColor: '#00000000',
    webPreferences: { offscreen: true, backgroundThrottling: false }
  });
  await win.loadFile(path.join(__dirname, 'icon.html'));
  await new Promise(r => setTimeout(r, 1200));
  const img = await win.webContents.capturePage();
  const out = path.join(__dirname, '..', '..', 'assets', 'app-icon.png');
  fs.writeFileSync(out, img.toPNG());
  console.log('[icon] 已生成', out, img.getSize());
  app.quit();
});
