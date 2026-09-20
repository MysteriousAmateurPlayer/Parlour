// 站点冒烟测试：构建之后运行，检查关键页面是否真的生成了预期内容。
//
// 用法：
//   node scripts/verify.cjs
//
// 它只读 public/ 目录，不修改任何东西。加内容后如果改动过模板，
// 跑一遍能快速发现"构建成功但页面是空的"这类问题。

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const PUB = path.join(ROOT, 'public');

// Hugo 的 HTML 压缩器会省略可选引号（id=foo 而不是 id="foo"），
// 这里先把属性值统一补回引号，断言才能同时适配压缩前后两种输出。
const norm = (html) => html.replace(/(\s[a-zA-Z_:][-a-zA-Z0-9_:.]*)=([^\s"'>`]+)/g, '$1="$2"');
const read = (p) => norm(fs.readFileSync(path.join(PUB, p), 'utf8'));
const exists = (p) => fs.existsSync(path.join(PUB, p));
let fails = 0;

function check(label, cond, extra) {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}${extra ? '  ' + extra : ''}`);
  if (!cond) fails++;
}

if (!exists('index.html')) {
  console.error('找不到 public/index.html —— 请先运行 pwsh scripts/build.ps1');
  process.exit(1);
}

// ---------- 首页 ----------
const home = read('index.html');
check('首页 hero 名字', home.includes('hero__name') && home.includes('MAP'));
check('首页 版块卡片 ×5', (home.match(/class="card reveal"/g) || []).length === 5);
check('首页 最新记录行', (home.match(/post-row__title/g) || []).length >= 5);
check('首页 关于我预览', home.includes('about-preview'));
check('首页 里版入口条', home.includes('vault-teaser'));
check('首页 明暗切换按钮', home.includes('id="theme-toggle"'));
check('首页 无 noindex', !home.includes('name="robots"'));
const cardTitles = [...home.matchAll(/card__title">([^<]+)</g)].map((m) => m[1]);
check('五个版块名正确', cardTitles.join(',') === '自我介绍,二次同人创作,数学分享,园艺记录,烹饪食谱', cardTitles.join(','));

// ---------- CSS / JS 打包 ----------
const cssFiles = fs.readdirSync(path.join(PUB, 'css'));
check('CSS 打包存在', cssFiles.length >= 1, cssFiles.join(','));
const cssBody = fs.readFileSync(path.join(PUB, 'css', cssFiles[0]), 'utf8');
check('CSS 含宣纸底色', cssBody.includes('#faf7f2'));
check('CSS 含暗色主题', cssBody.includes('[data-theme=dark]') || cssBody.includes('[data-theme="dark"]'));
check('CSS 含响应式与降级', cssBody.includes('@media') && cssBody.includes('prefers-reduced-motion'));

// ---------- 关于我 ----------
const about = read('about/index.html');
check('关于我 两栏布局与联系方式', about.includes('profile__aside') && about.includes('contact-list'));

// ---------- 数学页 ----------
const math = read('math/golden-ratio-continued-fraction/index.html');
check('数学页 加载 KaTeX', math.includes('vendor/katex/katex.min.css') && math.includes('auto-render.min.js'));
check('数学页 目录 / 定理 / 证明', math.includes('article__toc') && math.includes('callout--theorem') && math.includes('callout--proof'));
check('数学页 公式原样保留', math.includes('$$') && math.includes('\\varphi'));
check('非数学页 不加载 KaTeX', !read('fanworks/after-the-rain/index.html').includes('katex.min.js'));

// ---------- 食谱页 ----------
const recipe = read('kitchen/tomato-beef-brisket/index.html');
check('食谱 规格条 / 食材 / 步骤', recipe.includes('recipe-specs') && recipe.includes('ingredients__group-title') && (recipe.match(/steps__item/g) || []).length === 7);
const lds = [...recipe.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => m[1]);
const parsed = lds.map((s) => { try { return JSON.parse(s); } catch (e) { return { __err: e.message }; } });
const bad = parsed.find((o) => o.__err);
check('JSON-LD 全部可解析', !bad, bad ? bad.__err : '');
const recipeLd = parsed.find((o) => o['@type'] === 'Recipe');
check('Recipe 结构化数据完整', !!recipeLd && Array.isArray(recipeLd.recipeIngredient) && recipeLd.recipeInstructions.length === 7);

// ---------- 列表页 ----------
check('园艺 年表结构', read('garden/index.html').includes('timeline__item'));
check('同人 标签筛选', (read('fanworks/index.html').match(/filter-bar__btn/g) || []).length >= 3);
check('标签总览页', read('tags/index.html').includes('term-chip'));
check('标签详情页', exists('tags/数论/index.html'));

// ---------- 里版 ----------
const vault = read('vault/index.html');
check('里版 有门禁与哈希', vault.includes('data-vault-gate') && /data-hash="[0-9a-f]{64}"/.test(vault));
check('里版 内容默认隐藏', vault.includes('data-vault-content hidden'));
check('里版 noindex', vault.includes('content="noindex, nofollow, noarchive"'));

// ---------- SEO ----------
check('sitemap 排除里版', !read('sitemap.xml').includes('vault'));
check('robots 屏蔽里版', read('robots.txt').includes('Disallow: /vault/'));
check('404 页面', read('404.html').includes('这一页不在架上'));

console.log(`\n${fails === 0 ? '全部通过 ✓' : fails + ' 项失败'}`);
process.exitCode = fails === 0 ? 0 : 1;
