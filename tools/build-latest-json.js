// 按 GitHub Release 的 JSON 生成下载页清单 docs/latest.json
// 用法：
//   gh api repos/Zyh-Quotation/994-Desktop-Pet/releases/latest | node tools/build-latest-json.js
//   node tools/build-latest-json.js release.json
const fs = require('fs');
const path = require('path');

const arg = process.argv[2];
const raw = arg ? fs.readFileSync(arg, 'utf8') : fs.readFileSync(0, 'utf8');
const rel = JSON.parse(raw);

// 三个平台的包名规则，和 make-release.js / build-*.sh 保持一致
function slot(name) {
  if (/-win-x64\.zip$/i.test(name)) return 'win-x64';
  if (/-mac-x64\.zip$/i.test(name)) return 'mac-x64';
  if (/^pokepet-[\d.]+\.zip$/i.test(name)) return 'mac-arm64';
  return null;
}

const assets = {};
for (const a of rel.assets || []) {
  const key = slot(a.name || '');
  if (!key) continue;
  assets[key] = { file: a.name, size: a.size, url: a.browser_download_url };
}

if (!Object.keys(assets).length) {
  console.error('❌ 这个 Release 里没找到 zip（pokepet-*.zip / *-mac-x64.zip / *-win-x64.zip），不写清单');
  process.exit(1);
}

const out = {
  version: String(rel.tag_name || '').replace(/^v/, ''),
  tag: rel.tag_name,
  publishedAt: rel.published_at || new Date().toISOString(),
  assets
};

const dest = path.join(__dirname, '..', 'docs', 'latest.json');
fs.writeFileSync(dest, JSON.stringify(out, null, 2) + '\n');
console.log(`✅ ${path.relative(path.join(__dirname, '..'), dest)} ← ${out.tag}（${Object.keys(assets).join(' / ')}）`);
