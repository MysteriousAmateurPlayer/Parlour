// 上线后体检：对着真实网址跑一遍，确认部署真的成功。
//
// 用法：
//   node scripts/check-live.cjs https://你的用户名.github.io/仓库名/
//
// 它会检查：首页能否打开、CSS/JS 资源是否 404（新手最常见的坑）、
// 五个版块与文章页是否可达、站点地图是否排除了里版、
// 页面里的 canonical 是否和你给的网址一致（baseURL 是否配错）、404 是否正常。

const base = (process.argv[2] || '').trim();

if (!base) {
  console.error('用法：node scripts/check-live.cjs https://你的用户名.github.io/仓库名/');
  process.exit(2);
}

const root = base.endsWith('/') ? base : base + '/';
const url = (p) => new URL(p.replace(/^\//, ''), root).href;

// Hugo 前端的 HTML 会省略可选引号（href=/x.css），先把属性值补回引号，
// 这样压缩前后两种输出都能正确解析。
const norm = (html) => html.replace(/(\s[a-zA-Z_:][-a-zA-Z0-9_:.]*)=([^\s"'>`]+)/g, '$1="$2"');

let fails = 0;
let warns = 0;

function line(status, label, extra) {
  const tag = status === 'PASS' ? 'PASS' : status === 'WARN' ? 'WARN' : 'FAIL';
  if (status === 'FAIL') fails++;
  if (status === 'WARN') warns++;
  console.log(`${tag}  ${label}${extra ? '  ' + extra : ''}`);
}

async function get(path, { timeout = 25000 } = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeout);
  try {
    const res = await fetch(url(path), { signal: ctrl.signal, redirect: 'follow', headers: { 'user-agent': 'map-site-check' } });
    const text = await res.text();
    return { ok: true, status: res.status, type: res.headers.get('content-type') || '', text, finalUrl: res.url };
  } catch (e) {
    return { ok: false, error: e.name === 'AbortError' ? '请求超时' : e.message };
  } finally {
    clearTimeout(timer);
  }
}

(async () => {
  console.log(`\n正在体检：${root}\n${'─'.repeat(60)}`);

  // ---------- 1. 首页 ----------
  const home = await get('/');
  if (!home.ok) {
    line('FAIL', '首页可访问', home.error);
    console.log('\n连首页都打不开，先确认：仓库 Settings → Pages → Source 是否选了 GitHub Actions，以及网址拼写。');
    process.exit(1);
  }
  line(home.status === 200 ? 'PASS' : 'FAIL', '首页可访问', `HTTP ${home.status}`);
  if (home.status !== 200) process.exit(1);

  line(home.text.includes('hero__name') ? 'PASS' : 'FAIL', '首页有主视觉（内容没丢）');
  // 卡片标题是数据驱动的（板块数量可能被改过），所以只验证卡片区与卡片本身存在
  line(home.text.includes('band--sections') && home.text.includes('card__title') ? 'PASS' : 'FAIL', '首页有版块卡片区');
  // 首页结构：简介在太阳上，下拉是地球仪，星野里有一颗特殊的星星（里版入口）
  line(home.text.includes('hero__sun-layer') && home.text.includes('sun-disc') ? 'PASS' : 'FAIL', '首页简介放在太阳上（含古典光芒）');
  line(home.text.includes('globe-band') && home.text.includes('globe-stars') ? 'PASS' : 'FAIL', '首页第一屏露出地球（星图质感）');
  line(home.text.includes('globe-stage') && home.text.includes('globe-data') ? 'PASS' : 'FAIL', '首页有可旋转的地球仪');
  line(home.text.includes('vault-star') && home.text.includes('data-vault-open') ? 'PASS' : 'WARN', '首页有里版入口（特殊星星 + 弹窗）');

  const H = norm(home.text);

  // ---------- 2. 静态资源（最常见的 404 来源）----------
  const css = [...H.matchAll(/href="([^"]*\/css\/site\.min\.[^"]+\.css)"/g)].map((m) => m[1]);
  const js = [...H.matchAll(/src="([^"]*\/js\/site\.min\.[^"]+\.js)"/g)].map((m) => m[1]);

  if (!css.length) {
    line('FAIL', '首页引用了 CSS 打包文件', '没找到 link 标签，模板可能有问题');
  }
  for (const href of css.slice(0, 1)) {
    const r = await get(new URL(href, root).href.replace(root, '/'));
    const okCss = r.ok && r.status === 200 && r.text.includes('#faf7f2');
    line(okCss ? 'PASS' : 'FAIL', 'CSS 能加载且内容正确', `HTTP ${r.status} ${Math.round((r.text || '').length / 1024)} KB`);
  }
  if (!js.length) {
    line('FAIL', '首页引用了 JS 打包文件');
  }
  for (const src of js.slice(0, 1)) {
    const r = await get(new URL(src, root).href.replace(root, '/'));
    line(r.ok && r.status === 200 ? 'PASS' : 'FAIL', 'JS 能加载', `HTTP ${r.status}`);
  }

  // ---------- 3. canonical（baseURL 是否配错）----------
  const canonical = (H.match(/<link rel="canonical" href="([^"]+)"/) || [])[1];
  let siteOrigin = '';
  if (!canonical) {
    line('WARN', '页面里有 canonical 链接', '没找到');
  } else {
    try { siteOrigin = new URL(canonical).origin; } catch (e) {}
    const same = canonical.replace(/\/$/, '') === root.replace(/\/$/, '');
    line(same ? 'PASS' : 'WARN', 'canonical 与实际网址一致', same ? canonical : `页面里写的是 ${canonical}，你访问的是 ${root}`);
    if (!same) console.log('       → 只要页面样式正常，这一条通常可以忽略（例如用 127.0.0.1 测试、或平台做了域名跳转）。');
  }

  // ---------- 4. 各页面可达性 ----------
  const pages = [
    ['自我介绍', '/about/'],
    ['同人创作列表', '/fanworks/'],
    ['数学列表', '/math/'],
    ['一篇数学文章（含公式）', '/math/golden-ratio-continued-fraction/'],
    ['园艺年表', '/garden/'],
    ['食谱列表', '/kitchen/'],
    ['一份食谱（含结构化数据）', '/kitchen/tomato-beef-brisket/'],
    ['标签总览', '/tags/'],
    ['里版入口', '/vault/'],
    ['RSS 订阅', '/index.xml'],
    ['robots.txt', '/robots.txt'],
    ['sitemap.xml', '/sitemap.xml']
  ];
  for (const [label, p] of pages) {
    const r = await get(p);
    line(r.ok && r.status === 200 ? 'PASS' : 'FAIL', `${label}`, r.ok ? `HTTP ${r.status}` : r.error);
  }

  // ---------- 5. 里版是否被排除在站点地图外 ----------
  const sm = await get('/sitemap.xml');
  if (sm.ok && sm.status === 200) {
    line(!sm.text.includes('/vault/') ? 'PASS' : 'WARN', 'sitemap 里没有里版', sm.text.includes('/vault/') ? '建议检查 content/vault 的 private 设置' : '');
    const firstLoc = (sm.text.match(/<loc>([^<]+)<\/loc>/) || [])[1] || '';
    let smOrigin = '';
    try { smOrigin = new URL(firstLoc).origin; } catch (e) {}
    // 只比对自己站点内部是否一致（sitemap 与页面 canonical 应同源）
    const consistent = smOrigin && siteOrigin ? smOrigin === siteOrigin : true;
    line(consistent ? 'PASS' : 'FAIL', 'sitemap 与页面同源', smOrigin && siteOrigin ? `${smOrigin} vs ${siteOrigin}` : '（有一侧没取到，跳过）');
  }

  // ---------- 6. 404 是否正常 ----------
  const notFound = await get('/this-page-should-not-exist-9f3a/');
  if (notFound.ok) {
    line(notFound.status === 404 ? 'PASS' : 'WARN', '不存在的网址返回 404', `HTTP ${notFound.status}`);
  } else {
    line('WARN', '404 检查', notFound.error);
  }

  // ---------- 7. 公式资源（只在数学页加载）----------
  const math = await get('/math/golden-ratio-continued-fraction/');
  if (math.ok && math.status === 200) {
    line(math.text.includes('vendor/katex/katex.min.css') ? 'PASS' : 'FAIL', '数学页加载了 KaTeX');
    const katex = await get('/vendor/katex/katex.min.css');
    line(katex.ok && katex.status === 200 ? 'PASS' : 'FAIL', 'KaTeX 样式文件可达', `HTTP ${katex.status}`);
    const font = await get('/vendor/katex/fonts/KaTeX_Main-Regular.woff2');
    line(font.ok && font.status === 200 ? 'PASS' : 'FAIL', 'KaTeX 字体可达（公式才好看）', `HTTP ${font.status}`);
  }

  console.log('─'.repeat(60));
  if (fails === 0) {
    console.log(`全部通过 ✓  ${warns ? `（有 ${warns} 条提醒，见上面 WARN）` : ''}`);
    console.log('网站已经正常上线，可以发给朋友了。');
  } else {
    console.log(`${fails} 项失败${warns ? `，${warns} 条提醒` : ''}。把上面的输出整段发我，我来定位。`);
  }
  process.exitCode = fails === 0 ? 0 : 1;
})();
