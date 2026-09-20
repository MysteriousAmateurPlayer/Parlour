// 站内链接体检：抓出每个页面里的链接，逐个验证能不能真的打开。
//
// 用法：
//   node scripts/check-links.cjs                     # 检查刚构建出来的 public/（离线，快）
//   node scripts/check-links.cjs https://你的域名/    # 检查线上（逐个发请求）
//
// 为什么需要它：GitHub Pages 的项目页挂在 /仓库名/ 子路径下，
// 一旦某个链接漏了这段前缀（例如 relURL 对以 / 开头的路径不补子路径），
// 点下去就会跳到根域名 → GitHub 的 404 页面。这个脚本专门抓这种情况。

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const PUB = path.join(ROOT, 'public');
const target = process.argv[2];

// 从 hugo.toml 里读 baseURL，得出「子路径」前缀（例如 /Parlour/）
function readBaseUrl() {
  const toml = fs.readFileSync(path.join(ROOT, 'hugo.toml'), 'utf8');
  const m = toml.match(/^\s*baseURL\s*=\s*"([^"]+)"/m);
  return m ? m[1] : '/';
}
const baseUrl = readBaseUrl();
const basePath = new URL(baseUrl, 'https://x.invalid').pathname;   // 例如 /Parlour/
const baseOrigin = new URL(baseUrl, 'https://x.invalid').origin;

const norm = (h) => h.replace(/(\s[a-zA-Z_:][-a-zA-Z0-9_:.]*)=([^\s"'>`]+)/g, '$1="$2"');

function extractLinks(html) {
  const out = new Set();
  for (const m of norm(html).matchAll(/(?:href|src)="([^"]+)"/g)) {
    const raw = m[1];
    if (/^(mailto:|tel:|javascript:|data:|#)/.test(raw)) continue;
    if (raw.includes('livereload.js')) continue;   // 开发服务器注入的脚本，不是站内链接
    out.add(raw);
  }
  return [...out];
}

function walkHtml(dir, acc = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walkHtml(p, acc);
    else if (e.name.endsWith('.html')) acc.push(p);
  }
  return acc;
}

/* ---------------- 离线模式：按 public/ 里的实际文件判断 ---------------- */
function checkOffline() {
  const files = walkHtml(PUB);
  if (!files.length) {
    console.error('public/ 里没有任何 HTML —— 构建大概失败了。请先跑 build.bat 并确认没有报错。');
    process.exitCode = 2;
    return;
  }
  const cache = new Map();
  const broken = [];
  let checked = 0;

  function resolveInternal(raw, fromFile) {
    // 统一成「站点内路径」，例如 /Parlour/about/ 或 about/
    if (/^https?:\/\//i.test(raw)) {
      if (!raw.startsWith(baseOrigin)) return { external: true };
      raw = raw.slice(baseOrigin.length) || '/';
    } else if (raw.startsWith('//')) {
      return { external: true };
    }
    if (!raw.startsWith('/')) {
      // 相对路径：相对当前页面目录
      const rel = path.posix.join(path.posix.dirname('/' + path.relative(PUB, fromFile).replace(/\\/g, '/')), raw);
      raw = rel;
    }
    if (!raw.startsWith(basePath)) {
      return { wrongPrefix: raw };   // 漏了子路径 → 线上必然 404
    }
    return { sitePath: raw.slice(basePath.length) };
  }

  function existsInPublic(sitePath) {
    if (cache.has(sitePath)) return cache.get(sitePath);
    const clean = decodeURIComponent(sitePath.split('#')[0].split('?')[0]);
    const candidates = [
      path.join(PUB, clean),
      path.join(PUB, clean, 'index.html'),
      path.join(PUB, clean.replace(/\/$/, '') + '.html')
    ];
    const ok = candidates.some((c) => {
      try { return fs.existsSync(c) && fs.statSync(c).isFile(); } catch (e) { return false; }
    });
    cache.set(sitePath, ok);
    return ok;
  }

  for (const file of files) {
    const html = fs.readFileSync(file, 'utf8');
    const rel = path.relative(PUB, file).replace(/\\/g, '/');
    for (const raw of extractLinks(html)) {
      const r = resolveInternal(raw, file);
      if (r.external) continue;
      checked++;
      if (r.wrongPrefix !== undefined) {
        broken.push({ page: rel, href: raw, why: `少了子路径 ${basePath}（会跳到根域名 → 404）` });
      } else if (!existsInPublic(r.sitePath)) {
        broken.push({ page: rel, href: raw, why: 'public/ 里没有对应的文件' });
      }
    }
  }

  console.log(`离线检查：${files.length} 个页面，${checked} 个站内链接（子路径前缀 ${basePath}）\n`);
  report(broken);
}

/* ---------------- 在线模式：真的发请求 ---------------- */
async function checkOnline(base) {
  const root = base.endsWith('/') ? base : base + '/';
  const pages = ['', 'about/', 'fanworks/', 'math/', 'garden/', 'kitchen/', 'tags/', 'vault/'];
  const seen = new Map();
  const broken = [];
  let checked = 0;

  for (const p of pages) {
    let html;
    try {
      const r = await fetch(root + p);
      if (!r.ok) { console.log(`!! 打不开 ${root + p} → HTTP ${r.status}`); continue; }
      html = await r.text();
    } catch (e) { console.log(`!! 打不开 ${root + p} → ${e.message}`); continue; }

    for (const raw of extractLinks(html)) {
      let abs;
      try { abs = new URL(raw, root + p).href; } catch (e) { continue; }
      if (!abs.startsWith(new URL(root).origin)) continue;
      if (seen.has(abs)) continue;
      checked++;
      try {
        const r = await fetch(abs, { redirect: 'follow' });
        seen.set(abs, r.status);
        if (!r.ok) broken.push({ page: p || '/', href: abs.replace(root, '/'), why: `HTTP ${r.status}` });
      } catch (e) {
        seen.set(abs, 0);
        broken.push({ page: p || '/', href: abs.replace(root, '/'), why: e.message });
      }
    }
  }

  console.log(`在线检查：${pages.length} 个入口页，${checked} 个站内链接\n`);
  report(broken);
}

function report(broken) {
  if (!broken.length) {
    console.log('全部通过 ✓ 没有打不开的站内链接');
    process.exitCode = 0;
    return;
  }
  const byWhy = {};
  for (const b of broken) (byWhy[b.why] = byWhy[b.why] || []).push(b);
  for (const [why, list] of Object.entries(byWhy)) {
    console.log(`✗ ${why}（${list.length} 处）`);
    const seen = new Set();
    for (const b of list) {
      const sig = b.href;
      if (seen.has(sig)) continue;
      seen.add(sig);
      console.log(`   ${b.href}   出现于 ${b.page}`);
      if (seen.size >= 12) { console.log(`   … 其余 ${list.length - seen.size} 处省略`); break; }
    }
  }
  console.log(`\n合计 ${broken.length} 处打不开的链接`);
  process.exitCode = 1;
}

if (target) checkOnline(target);
else checkOffline();
