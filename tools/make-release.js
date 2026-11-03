// 打包自包含 app 为 zip，并生成 update.json
// 前置：先跑 ./tools/build-app.sh 生成 release/神奇宝贝.app
// 用法：node tools/make-release.js
// 生成：release/pokepet-<version>.zip、release/update.json

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'release');
const APP = path.join(OUT_DIR, '神奇宝贝.app');
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
let changelog = {};
try { changelog = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'changelog.json'), 'utf8')); } catch (_) {}
const NAME = `pokepet-${pkg.version}.zip`;
const ZIP = path.join(OUT_DIR, NAME);

if (!fs.existsSync(APP)) {
  console.error('找不到 release/神奇宝贝.app，请先运行 ./tools/build-app.sh');
  process.exit(1);
}

// 解压后要能直接看到说明书，所以先摊到一个临时目录再压：
//   神奇宝贝.app
//   使用说明.txt
const DOC = path.join(ROOT, 'docs', '使用说明.txt');
const os = require('os');
const STAGE = fs.mkdtempSync(path.join(os.tmpdir(), 'pokezip-'));
execFileSync('ditto', [APP, path.join(STAGE, '神奇宝贝.app')]);
if (fs.existsSync(DOC)) fs.copyFileSync(DOC, path.join(STAGE, '使用说明.txt'));
fs.rmSync(ZIP, { force: true });
execFileSync('ditto', ['-c', '-k', '--norsrc', STAGE, ZIP]);
fs.rmSync(STAGE, { recursive: true, force: true });

const sha256 = crypto.createHash('sha256').update(fs.readFileSync(ZIP)).digest('hex');
const size = fs.statSync(ZIP).size;
if (!changelog[pkg.version]) {
  console.warn(`⚠️ data/changelog.json 里没有 v${pkg.version} 的说明，更新弹窗会缺内容`);
}
const manifest = {
  version: pkg.version,
  name: pkg.name,
  file: NAME,
  url: process.env.RELEASE_URL || `https://example.com/pokepet/${NAME}`,
  sha256,
  size,
  notes: changelog[pkg.version] || process.env.RELEASE_NOTES || '',
  publishedAt: new Date().toISOString()
};
// Intel 版如果已经打好（tools/build-app-intel.sh），一并写进清单，
// 让 update.sh 能按本机架构挑对包包
const INTEL = path.join(OUT_DIR, `pokepet-${pkg.version}-mac-x64.zip`);
if (fs.existsSync(INTEL)) {
  const ib = fs.readFileSync(INTEL);
  const iName = path.basename(INTEL);
  const iBase = manifest.url.replace(/[^/]+$/, '');
  manifest.builds = {
    arm64: { file: NAME, url: manifest.url, sha256, size },
    x64: {
      file: iName,
      url: iBase + iName,
      sha256: crypto.createHash('sha256').update(ib).digest('hex'),
      size: ib.length
    }
  };
}
// Windows 便携包（可选）：tools/build-win.sh 生成的 zip 一并写入清单
const WIN = path.join(OUT_DIR, `pokepet-${pkg.version}-win-x64.zip`);
if (fs.existsSync(WIN)) {
  const wb = fs.readFileSync(WIN);
  const wName = path.basename(WIN);
  const wBase = manifest.url.replace(/[^/]+$/, '');
  manifest.builds = manifest.builds || {
    arm64: { file: NAME, url: manifest.url, sha256, size }
  };
  manifest.builds.win = {
    file: wName,
    url: wBase + wName,
    sha256: crypto.createHash('sha256').update(wb).digest('hex'),
    size: wb.length
  };
}

fs.writeFileSync(path.join(OUT_DIR, 'update.json'), JSON.stringify(manifest, null, 2));

console.log(`✅ 打包完成：${ZIP}`);
console.log(`   体积 ${(size / 1024 / 1024).toFixed(1)} MB`);
console.log(`   sha256 ${sha256}`);
console.log('   记得把 update.json 里的 url 换成真实下载地址');
