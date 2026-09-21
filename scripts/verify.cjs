// 站点冒烟测试：构建之后运行，检查关键页面是否真的生成了预期内容。
//
// 用法：
//   node scripts/verify.cjs
//
// 特点：板块名、板块数量、文章是否还在，都是「照着 data/sections.yaml 和实际文件」来判断的，
//       所以你在写作台里改板块名 / 加板块 / 删文章之后，这个脚本不会误报。

const fs = require('fs');
const path = require('path');
const W = require('../tools/writer/server.cjs');   // 复用同一套 YAML 解析，避免两套逻辑

const ROOT = path.join(__dirname, '..');
const PUB = path.join(ROOT, 'public');

// Hugo 的 HTML 压缩器会省略可选引号（href=/x.css），补回引号后断言才能通用
const norm = (html) => html.replace(/(\s[a-zA-Z_:][-a-zA-Z0-9_:.]*)=([^\s"'>`]+)/g, '$1="$2"');
const read = (p) => norm(fs.readFileSync(path.join(PUB, p), 'utf8'));
const exists = (p) => fs.existsSync(path.join(PUB, p));
const srcExists = (p) => fs.existsSync(path.join(ROOT, p));

let fails = 0, skips = 0;
function check(label, cond, extra) {
  console.log(`${cond ? 'PASS' : (cond === null ? 'SKIP' : 'FAIL')}  ${label}${extra ? '  ' + extra : ''}`);
  if (cond === null) skips++;
  else if (!cond) fails++;
}

if (!exists('index.html')) {
  console.error('找不到 public/index.html —— 请先运行 build.bat（或 scripts/build.ps1）');
  process.exit(1);
}

// ---------- 读取板块配置 ----------
const sections = W.parseYaml(fs.readFileSync(path.join(ROOT, 'data', 'sections.yaml'), 'utf8'));
const byWeight = (a, b) => (a.weight || 100) - (b.weight || 100);
const list = Object.entries(sections).map(([key, m]) => ({ key, ...m }));
const navSections = list.filter((s) => s.nav).sort(byWeight);
const homeSections = list.filter((s) => s.home).sort(byWeight);

console.log(`板块配置：共 ${list.length} 个（导航 ${navSections.length} 个，首页卡片 ${homeSections.length} 个）\n`);

// ---------- 首页 ----------
const home = read('index.html');
// 压缩后的 HTML 会把单词属性写成无引号（class=nav__link），先规范化再做正则提取
const homeNorm = home.replace(/(\s[a-zA-Z_:][-a-zA-Z0-9_:.]*)=([^\s"'>]+)/g, '$1="$2"');
check('首页有主视觉', home.includes('hero__name'));
check('首页有五个房间区块', home.includes('band--sections'));
check('首页有最新记录', home.includes('post-row__title'));
check('首页有明暗切换按钮', home.includes('id="theme-toggle"'));
check('首页未加 noindex', !home.includes('name="robots"'));

const cardTitles = [...homeNorm.matchAll(/card__title">([^<]+)</g)].map((m) => m[1]);
check(`首页卡片数 = ${homeSections.length}`, cardTitles.length === homeSections.length, cardTitles.join(' / '));
check('首页卡片标题与配置一致', cardTitles.join('|') === homeSections.map((s) => s.title).join('|'),
  homeSections.map((s) => s.title).join(' / '));

// 导航项现在带板块图标，标题包在 <span> 里；首页那一项是纯文字。
// 注意：必须先把每个 <a> 块切出来再取文字，否则正则会跨到下一条导航里去。
const navTitles = [...homeNorm.matchAll(/<a class="nav__link[^"]*"[^>]*>([\s\S]*?)<\/a>/g)]
  .map((m) => {
    const sp = m[1].match(/<span>([^<]+)<\/span>/);
    return (sp ? sp[1] : m[1].replace(/<[^>]*>/g, '')).trim();
  });
check('顶部导航第一项是首页', navTitles[0] === '首页', navTitles.join(' / '));
check('导航项与配置一致', navTitles.slice(1).join('|') === navSections.map((s) => s.title).join('|'),
  navSections.map((s) => s.title).join(' / '));

// ---------- 首页结构：太阳上的简介 + 可旋转的地球仪 ----------
check('首页简介放在太阳上', home.includes('hero__sun-layer') && home.includes('sun-disc'));
check('首页有地球仪舞台', home.includes('globe-stage') && home.includes('globe-clip'));
const globeJson = (home.match(/id="?globe-data"?[^>]*>([\s\S]*?)<\/script>/) || [])[1] || '';
let globeSections = -1, globeCapacity = 0;
try {
  const gj = JSON.parse(globeJson);
  globeSections = (gj.sections || []).length;
  globeCapacity = gj.capacity || 0;
} catch (e) { globeSections = -1; }
check('地球仪数据可解析', globeSections >= 0, globeSections < 0 ? 'JSON 解析失败' : `${globeSections} 个板块`);
// 板块可以用 globe: false 明确排除在地球拼图之外（例如"关于本站"在首页另有区块）
const globeEligible = list.filter((s) => s.home && String(s.globe) !== 'false').length;
check('地球仪覆盖全部该上拼图的板块', globeSections === globeEligible, `${globeSections} / ${globeEligible}`);
check('地球仪留了空位给以后的板块', globeCapacity > homeSections.length, `capacity=${globeCapacity}`);
check('星野里有里版入口那颗特殊的星星', home.includes('vault-star'));

// ---------- 样式 ----------
const cssFiles = fs.readdirSync(path.join(PUB, 'css'));
const cssBody = fs.readFileSync(path.join(PUB, 'css', cssFiles[0]), 'utf8');
check('CSS 打包存在且含主题变量', cssFiles.length >= 1 && cssBody.includes('#faf7f2'), cssFiles.length + ' 个文件');
check('CSS 含暗色主题与响应式',
  (cssBody.includes('[data-theme=dark]') || cssBody.includes('[data-theme="dark"]')) && cssBody.includes('@media'));

// ---------- 每个板块的列表页 ----------
for (const s of list) {
  check(`板块页 /${s.key}/ 已生成`, exists(path.join(s.key, 'index.html')));
}

// ---------- 关于我（如果还在） ----------
if (srcExists('content/about/_index.md')) {
  const about = read('about/index.html');
  check('自我介绍页用 profile 版面', about.includes('profile__aside') || about.includes('contact-list'));
} else {
  check('自我介绍页', null, '（已删除该板块，跳过）');
}

// ---------- 数学公式（示例文章还在才检查） ----------
const mathSample = 'content/math/golden-ratio-continued-fraction.md';
if (srcExists(mathSample)) {
  const math = read('math/golden-ratio-continued-fraction/index.html');
  check('数学页加载 KaTeX', math.includes('vendor/katex/katex.min.css') && math.includes('auto-render.min.js'));
  check('数学页公式原样保留', math.includes('$$') && math.includes('\\varphi'));
  check('KaTeX 样式文件存在', exists('vendor/katex/katex.min.css'));
  check('KaTeX 字体存在', exists('vendor/katex/fonts/KaTeX_Main-Regular.woff2'));
  const fan = fs.existsSync(path.join(ROOT, 'content/fanworks')) ? [...fs.readdirSync(path.join(ROOT, 'content/fanworks'))].find((f) => f.endsWith('.md') && f !== '_index.md') : null;
  if (fan) check('非数学页不加载 KaTeX', !read(`fanworks/${fan.replace(/\.md$/, '')}/index.html`).includes('katex.min.js'));
  else check('非数学页不加载 KaTeX', null, '（同人板块没有文章，跳过）');
} else {
  check('数学公式相关', null, '（示例数学文章已删除，跳过）');
}

// ---------- 食谱结构化数据 ----------
const recipeSample = 'content/kitchen/tomato-beef-brisket.md';
if (srcExists(recipeSample)) {
  const recipe = read('kitchen/tomato-beef-brisket/index.html');
  check('食谱页有规格条/食材/步骤',
    recipe.includes('recipe-specs') && recipe.includes('ingredients__group-title') && recipe.includes('steps__item'));
  const lds = [...recipe.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  const parsed = lds.map((s) => { try { return JSON.parse(s); } catch (e) { return { __err: e.message }; } });
  const bad = parsed.find((o) => o.__err);
  check('食谱 JSON-LD 可解析', !bad, bad ? bad.__err : `${lds.length} 块`);
  const rl = parsed.find((o) => o['@type'] === 'Recipe');
  check('Recipe 结构化数据完整', !!rl && Array.isArray(rl.recipeIngredient) && rl.recipeInstructions.length > 0);
} else {
  check('食谱结构化数据', null, '（示例食谱已删除，跳过）');
}

// ---------- 列表页形态（按板块类型） ----------
if (srcExists('content/garden')) check('园艺年表结构', read('garden/index.html').includes('timeline__item'));
if (srcExists('content/fanworks')) check('同人标签筛选', fs.existsSync(path.join(ROOT, 'content/fanworks')) &&
  (fs.readdirSync(path.join(ROOT, 'content/fanworks')).filter((f) => f.endsWith('.md') && f !== '_index.md').length < 2
    ? true : (read('fanworks/index.html').match(/filter-bar__btn/g) || []).length >= 2));

// ---------- 标签 / 系列 ----------
check('标签总览页', read('tags/index.html').includes('term-chip'));

// ---------- 里版（如果还在） ----------
const vaultCfg = sections.vault;
if (vaultCfg && srcExists('content/vault/_index.md')) {
  const vault = read('vault/index.html');
  check('里版有门禁与答案哈希', vault.includes('data-vault-gate') && /data-hash="[0-9a-f]{64}"/.test(vault));
  check('里版内容默认隐藏', vault.includes('data-vault-content hidden'));
  check('里版 noindex', vault.includes('content="noindex, nofollow, noarchive"'));
  check('sitemap 排除里版', !read('sitemap.xml').includes('/vault/'));
  check('robots 屏蔽里版', read('robots.txt').includes('Disallow: /vault/'));
} else {
  check('里版相关', null, '（未启用里版，跳过）');
}

// ---------- 杂项 ----------
check('404 页面', read('404.html').includes('这一页不在架上'));
check('sitemap 可访问', read('sitemap.xml').includes('<urlset'));
check('robots.txt 存在', read('robots.txt').includes('User-agent'));

console.log(`\n${fails === 0 ? `全部通过 ✓${skips ? `（${skips} 项因内容不存在而跳过）` : ''}` : fails + ' 项失败'}`);
process.exitCode = fails === 0 ? 0 : 1;
