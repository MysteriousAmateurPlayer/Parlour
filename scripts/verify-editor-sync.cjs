// 编辑器同步检查：确认「网站模板要用的文章字段」都能在写作台里填。
//
// 用法：node scripts/verify-editor-sync.cjs
//
// 背景：模板（themes/map/layouts）决定网站读哪些字段，写作台（tools/writer/server.cjs）
// 决定你能填哪些字段。两边一旦脱节，就会出现「模板在等一个值，但编辑器里没有这一栏」，
// 于是你在网页上永远改不了它。这个脚本专门抓这种情况，几毫秒出结果，不构建。

const fs = require('fs');
const path = require('path');
const W = require('../tools/writer/server.cjs');

const ROOT = path.join(__dirname, '..');
const LAYOUTS = path.join(ROOT, 'themes', 'map', 'layouts');

// 通用文章字段：所有板块的文章都可能有（写作台里各板块都提供了）
const COMMON_POST_PARAMS = new Set([
  'title', 'date', 'description', 'tags', 'draft', 'cover', 'toc', 'math', 'private', 'author', 'weight', 'noindex'
]);
// 属于「板块首页 / 单页」而不是文章正文的字段 —— 写作台有意不覆盖（在 content/<板块>/_index.md 里）
const PAGE_LEVEL_ONLY = new Set(['gate', 'vaultGate', 'layout', 'subtitle', 'portrait', 'portraitFallback', 'paragraphs', 'facts', 'hero', 'latest', 'primary', 'secondary', 'blurb', 'accent', 'icon', 'numeral', 'en', 'nav', 'home', 'count', 'kicker', 'tagline', 'since', 'ogImage', 'appearance', 'vault']);

function walk(dir, acc = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, acc);
    else if (/\.(html|xml|txt)$/.test(e.name)) acc.push(p);
  }
  return acc;
}

// ---- 收集「文章页字段」：只认 .Params.X，且排除 site.Params.X ----
const pageParams = new Map();     // param -> Set(模板相对路径)
for (const file of walk(LAYOUTS)) {
  const rel = path.relative(LAYOUTS, file).replace(/\\/g, '/');
  const text = fs.readFileSync(file, 'utf8');
  for (const m of text.matchAll(/(?<!site)(?<!Site)\.Params\.([A-Za-z_][A-Za-z0-9_]*)/g)) {
    const k = m[1];
    if (!pageParams.has(k)) pageParams.set(k, new Set());
    pageParams.get(k).add(rel);
  }
}

// 板块专属模板目录：layouts/<板块>/...
const GENERIC_DIRS = new Set(['partials', '_default', 'shortcodes']);
function paramsOfSectionDir(key) {
  const out = new Set();
  for (const [param, files] of pageParams) {
    for (const f of files) {
      const dir = f.includes('/') ? f.split('/')[0] : '';
      if (dir === key) out.add(param);
    }
  }
  return out;
}

const sections = W.listSections();
let problems = 0;

console.log('检查「模板要用的文章字段」是否都能在写作台里填\n');
console.log('模板里出现的文章字段：' + [...pageParams.keys()].sort().join(', ') + '\n');

for (const s of sections) {
  const editable = new Set(s.fields.map((f) => f.key));
  const needed = [...paramsOfSectionDir(s.key)]
    .filter((p) => !COMMON_POST_PARAMS.has(p) && !PAGE_LEVEL_ONLY.has(p));
  const missing = needed.filter((p) => !editable.has(p));

  if (missing.length) {
    problems++;
    console.log(`✗ 板块「${s.title}」（${s.key}）模板要用、但写作台填不了：`);
    for (const p of missing) {
      const where = [...pageParams.get(p)].filter((f) => f.startsWith(s.key + '/')).join(', ');
      console.log(`     · ${p}   ← ${where}`);
    }
  } else {
    const extra = needed.length ? `（专属字段 ${needed.join(', ')} 都可填）` : '';
    console.log(`✓ 板块「${s.title}」（${s.key}）：可填 ${s.fields.length} 项 ${extra}`);
  }
}

// ---- 通用模板里、但不是所有板块都提供的字段：给个提醒 ----
const genericOnly = [];
for (const [param, files] of pageParams) {
  if (COMMON_POST_PARAMS.has(param) || PAGE_LEVEL_ONLY.has(param)) continue;
  const inSectionDir = [...files].some((f) => !GENERIC_DIRS.has(f.split('/')[0]));
  if (inSectionDir) continue;
  const providedBy = sections.filter((s) => s.fields.some((f) => f.key === param)).map((s) => s.key);
  if (providedBy.length && providedBy.length < sections.length) {
    genericOnly.push(`${param}（通用模板 ${[...files].join(', ')} 会读；写作台只在 ${providedBy.join(', ')} 提供）`);
  }
}
if (genericOnly.length) {
  console.log('\n提醒：这些字段是「通用模板」会读的，但写作台只在部分板块提供：');
  genericOnly.forEach((g) => console.log('   · ' + g));
}

// ---- 反向：写作台提供但没有任何模板读取（多为改名/设计遗留，不算错误） ----
const ACCESSOR = { title: '.Title', date: '.Date', draft: '.Draft', description: '.Description' };
const unused = [];
for (const s of sections) {
  for (const f of s.fields) {
    if (f.key === '__filename') continue;
    if (pageParams.has(f.key) || ACCESSOR[f.key]) continue;
    unused.push(`${s.key}.${f.key}`);
  }
}
if (unused.length) {
  console.log(`\n提醒：写作台里有 ${unused.length} 项目前没有任何模板读取（可能是改名后遗留，也可能留着备用）：`);
  console.log('   ' + unused.join(', '));
}

console.log(`\n${problems ? problems + ' 个板块存在缺口 —— 需要给写作台补字段（否则你在网页上改不了这些值）' : '全部一致 ✓ 模板要用的字段都能在写作台里填'}`);
process.exitCode = problems ? 1 : 0;
