#!/usr/bin/env node
/**
 * MAP 写作台 —— 本地写作界面（不需要会写代码）
 *
 * 运行： node tools/writer/server.cjs   （或双击 写作台.bat）
 * 然后浏览器打开 http://127.0.0.1:4321/
 *
 * 它做的事：
 *   · 左边选板块、选已有文章；右边填表写字（正文支持简单的排版按钮）
 *   · 保存 → 写进 content/<板块>/<文件名>.md
 *   · 发布 → 自动提交并推送到 GitHub（走 ssh.github.com:443）
 *   · 传图 → 存进 static/images/ 并自动插入图片语法
 *
 * 只绑定 127.0.0.1，不对外网开放。
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');

const ROOT = path.resolve(__dirname, '..', '..');
const CONTENT = path.join(ROOT, 'content');
const IMAGES = path.join(ROOT, 'static', 'images');
const PORT = Number(process.argv[2] || 4321);

/* ============================================================
   板块与字段定义（决定表单长什么样）
   ============================================================ */
const COMMON = {
  title: { key: 'title', label: '标题', type: 'text', required: true, placeholder: '例如：雨停之后' },
  date: { key: 'date', label: '日期', type: 'date', hint: '留空就用今天' },
  description: { key: 'description', label: '摘要', type: 'textarea', rows: 2, placeholder: '一两句话，会显示在卡片和搜索结果里（可以不填）' },
  tags: { key: 'tags', label: '标签', type: 'tags', placeholder: '用逗号隔开，例如：短篇, 治愈（可以不填）' },
  cover: { key: 'cover', label: '封面图', type: 'image', hint: '可留空，留空会自动用带编号的色块' },
  series: { key: 'series', label: '系列', type: 'tags', placeholder: '同一系列的文章填同一个名字，会生成系列页（可不填）' },
  source: { key: 'source', label: '参考 / 来源', type: 'text', placeholder: '例如：原作名、菜谱出处、资料链接（可不填）' },
  toc: { key: 'toc', label: '显示右侧目录', type: 'bool', default: false },
  draft: { key: 'draft', label: '草稿（勾着就不对外显示）', type: 'bool', default: true },
  filename: { key: '__filename', label: '文件名（决定网址）', type: 'text', hint: '建议用英文短名，例如 rain-stops。中文也能用，只是网址会变成一串 %E9 编码' }
};

/* 各内置板块的专属字段（只有「标题」是必填，其余都可以空着） */
const SPECIAL_FIELDS = {
  fanworks: () => [
    COMMON.title, COMMON.date, COMMON.description,
    { key: 'source', label: '原作', type: 'text', placeholder: '例如：《某部作品》' },
    COMMON.tags, COMMON.series, COMMON.cover, COMMON.draft, COMMON.filename
  ],
  math: () => [
    COMMON.title, COMMON.date, COMMON.description, COMMON.tags, COMMON.series,
    { key: 'math', label: '渲染数学公式（写 $公式$ 时必须勾）', type: 'bool', default: true },
    { key: 'toc', label: '显示右侧目录', type: 'bool', default: true },
    COMMON.draft, COMMON.filename
  ],
  garden: () => [
    COMMON.title, COMMON.date, COMMON.description,
    { key: 'weather', label: '天气', type: 'text', placeholder: '例如：晴，22℃（会显示在年表里）' },
    COMMON.tags, COMMON.series, COMMON.draft, COMMON.filename
  ],
  kitchen: () => [
    COMMON.title, COMMON.date, COMMON.description,
    { key: 'servings', label: '份量（人份）', type: 'number' },
    { key: 'prep_time', label: '准备时间（分钟）', type: 'number' },
    { key: 'cook_time', label: '烹饪时间（分钟）', type: 'number' },
    { key: 'difficulty', label: '难度', type: 'select', options: ['简单', '中等', '麻烦'] },
    COMMON.tags, COMMON.series, COMMON.source,
    {
      key: 'ingredients', label: '食材', type: 'ingredients', rows: 8,
      hint: '一组用一对方括号起头，下面每行写一样食材。例如：\n[主料]\n牛腩 700g\n番茄 3 个'
    },
    { key: 'steps', label: '步骤', type: 'steps', rows: 7, hint: '一行一步，会自动编号成卡片' },
    { key: 'cover', label: '成品图（可留空）', type: 'image' },
    COMMON.draft, COMMON.filename
  ],
  vault: () => [
    COMMON.title, COMMON.date, COMMON.description, COMMON.tags, COMMON.series,
    COMMON.toc,
    { key: 'private', label: '不被搜索引擎收录（请保持勾选）', type: 'bool', default: true },
    COMMON.filename
  ]
};

/* 自定义板块的通用字段 */
function genericFields() {
  return [COMMON.title, COMMON.date, COMMON.description, COMMON.tags, COMMON.series,
    COMMON.cover, COMMON.draft, COMMON.filename];
}

function fieldsFor(key) {
  const f = SPECIAL_FIELDS[key];
  return f ? f() : genericFields();
}

/* ============================================================
   板块配置：读写 data/sections.yaml（所以板块名可以随时改）
   ============================================================ */
const SECTIONS_FILE = path.join(ROOT, 'data', 'sections.yaml');
const PAGES_FILE = path.join(ROOT, '.pages.yml');
const TRASH_DIR = path.join(ROOT, '.tools', 'trash');

const ICON_CHOICES = ['user', 'feather', 'sigma', 'leaf', 'pot', 'lock', 'key', 'tag', 'quote',
  'calendar', 'clock', 'servings', 'gauge', 'mail', 'github', 'bilibili', 'pixiv', 'rss', 'link',
  'check', 'sun', 'moon', 'arrow-right', 'arrow-down'];

function readSectionData() {
  if (!fs.existsSync(SECTIONS_FILE)) return {};
  return parseYaml(fs.readFileSync(SECTIONS_FILE, 'utf8')) || {};
}

/** 给前端用的板块列表：展示信息来自 YAML，字段来自上面的定义 */
function listSections() {
  const data = readSectionData();
  return Object.entries(data)
    .map(([key, meta]) => ({
      key,
      title: meta.title || key,
      en: meta.en || '',
      numeral: meta.numeral || '',
      accent: meta.accent || '#8a6f63',
      icon: meta.icon || 'link',
      blurb: meta.blurb || '',
      weight: Number(meta.weight) || 100,
      nav: meta.nav !== false,
      home: meta.home !== false,
      fields: fieldsFor(key)
    }))
    .sort((a, b) => a.weight - b.weight);
}

function writeSectionData(data) {
  fs.writeFileSync(SECTIONS_FILE, dumpFrontMatter(data, '').replace(/^---\n/, '').replace(/\n---\n?$/, '\n'), 'utf8');
}

function sectionByKey(key) {
  return listSections().find((s) => s.key === key);
}

/* ============================================================
   板块管理：改名 / 新增 / 删除，并同步网页后台的 .pages.yml
   ============================================================ */
const PAGES_SETTINGS_BLOCK = `  # ==========================================================
  #  站点设置（不是文章，改完直接生效）
  # ==========================================================
  - name: settings
    label: 站点设置
    type: group
    items:
      - name: home
        label: 首页文案
        type: file
        path: data/home.yaml
        format: yaml
        fields:
          - name: hero
            label: 主视觉（首屏）
            type: object
            fields:
              - { name: kicker, label: 名字上方的小字, type: string }
              - { name: name, label: 名字（超大字）, type: string }
              - { name: tagline, label: 一行定位语, type: string }
              - { name: intro, label: 自我介绍正文, type: text }
              - name: primary
                label: 主按钮（实心）
                type: object
                fields:
                  - { name: label, label: 按钮文字, type: string }
                  - { name: url, label: 链接, type: string }
              - name: secondary
                label: 次按钮（描边）
                type: object
                fields:
                  - { name: label, label: 按钮文字, type: string }
                  - { name: url, label: 链接, type: string }
          - name: about
            label: 首页「关于我」区块
            type: object
            fields:
              - { name: title, label: 标题, type: string }
              - { name: subtitle, label: 英文小标题, type: string }
              - { name: portrait, label: 竖版照片, type: image }
              - { name: portraitFallback, label: 没有照片时显示的字母, type: string }
              - { name: paragraphs, label: 段落（每行一段）, type: string, list: true }
              - name: facts
                label: 速览（常驻 / 在做 / 写给我 之类）
                type: object
                list:
                  collapsible:
                    collapsed: false
                    summary: "{label}"
                fields:
                  - { name: label, label: 名目, type: string }
                  - { name: value, label: 内容, type: string }
          - name: latest
            label: 首页「最近的记录」
            type: object
            fields:
              - { name: title, label: 标题, type: string }
              - { name: subtitle, label: 英文小标题, type: string }
              - { name: count, label: 显示几条, type: number }

      - name: socials
        label: 联系方式
        type: file
        path: data/socials.yaml
        format: yaml
        list: true
        fields:
          - { name: name, label: 名称, type: string }
          - name: icon
            label: 图标
            type: select
            options:
              values: [mail, github, twitter, bilibili, pixiv, rss, link]
          - { name: url, label: 链接, type: string }
          - { name: text, label: 显示的文字, type: string }
`;

function cmsFieldLines(f) {
  const out = [`      - name: ${f.key}`, `        label: ${quoteIfNeeded(f.label)}`];
  switch (f.type) {
    case 'textarea': out.push('        type: text'); break;
    case 'number': out.push('        type: number'); break;
    case 'date': out.push('        type: date'); break;
    case 'bool':
      out.push('        type: boolean');
      if (f.default === true) out.push('        default: true');
      break;
    case 'select':
      out.push('        type: select', '        options:', `          values: [${f.options.map(quoteIfNeeded).join(', ')}]`);
      break;
    case 'tags':
    case 'steps':
      out.push('        type: string', '        list: true');
      break;
    case 'image': out.push('        type: image'); break;
    case 'ingredients':
      out.push('        type: object', '        list:', '          collapsible:',
        '            collapsed: false', '            summary: "{group}"', '        fields:',
        '          - name: group', '            label: 分组名', '            type: string',
        '          - name: items', '            label: 这一组的食材（每行一条）', '            type: string',
        '            list: true');
      break;
    default: out.push('        type: string');
  }
  if (f.required) out.push('        required: true');
  return out;
}

/** 依据 data/sections.yaml 重新生成网页后台配置 .pages.yml */
function regeneratePagesYml() {
  const sections = listSections();
  const L = [];
  const put = (...s) => s.forEach((x) => L.push(x));

  put('# ============================================================',
    '#  Pages CMS 配置 · 网页版写作后台',
    '#  ------------------------------------------------------------',
    '#  怎么用：用 GitHub 账号登录 https://app.pagescms.org ，授权本仓库，',
    '#          浏览器里就会出现下面这些栏目，可以直接写文章、传图片。',
    '#          保存 = 自动提交到 GitHub = 网站自动重新发布（约 1~2 分钟）。',
    '#',
    '#  ⚠️ 这个文件由「写作台 → 板块管理」自动生成：改名/新增/删除板块时会重写。',
    '#     如果你想手改这里的字段标签，改完就别再用写作台动板块管理（会覆盖）。',
    '# ============================================================',
    '',
    '# 图片上传到仓库的 static/images/，网站上对应 /images/',
    'media:',
    '  input: static/images',
    '  output: /images',
    '  rename: safe',
    '  categories: [image]',
    '',
    'content:');

  for (const s of sections) {
    if (s.key === 'about') continue;   // about 是单页，下面单独处理
    put(`  # ---------------- ${s.title} ----------------`,
      `  - name: ${s.key}`,
      `    label: ${quoteIfNeeded(s.title)}`,
      '    type: collection',
      `    path: content/${s.key}`,
      '    exclude: [_index.md]',
      '    format: yaml-frontmatter',
      '    filename:',
      '      template: "{year}-{month}-{day}-{slug}.md"',
      '      field: create',
      '    view: { primary: title, sort: date, order: desc }',
      '    fields:');
    for (const f of s.fields) {
      if (f.key === '__filename') continue;
      cmsFieldLines(f).forEach((l) => L.push(l));
    }
  }

  if (sections.some((s) => s.key === 'about')) {
    put('  # ---------------- 自我介绍页（单页） ----------------',
      '  - name: about',
      '    label: 自我介绍页',
      '    type: file',
      '    path: content/about/_index.md',
      '    format: yaml-frontmatter',
      '    fields:',
      '      - { name: title, label: 标题, type: string }',
      '      - { name: description, label: 副标题 / 摘要, type: text }',
      '      - { name: layout, label: 版面模板（请勿修改）, type: string, readonly: true }',
      '      - { name: body, label: 正文（Markdown）, type: rich-text, options: { switcher: true } }');
  }

  put('', PAGES_SETTINGS_BLOCK.trimEnd());
  const text = L.join('\n') + '\n';
  fs.writeFileSync(PAGES_FILE, text, 'utf8');
  return { sections: sections.length, bytes: text.length };
}

function nextWeight(data) {
  const ws = Object.values(data).map((s) => Number(s.weight) || 100);
  return ws.length ? Math.max(...ws) + 5 : 10;
}

function nextNumeral(data) {
  const cn = ['壹', '贰', '叁', '肆', '伍', '陆', '柒', '捌', '玖', '拾', '拾壹', '拾贰'];
  const used = Object.values(data).map((s) => s.numeral);
  return cn.find((c) => !used.includes(c)) || '';
}

function saveSectionDisplay(key, patch) {
  const data = readSectionData();
  if (!data[key]) throw new Error('板块不存在：' + key);
  const s = data[key];
  for (const k of ['title', 'en', 'numeral', 'accent', 'icon', 'blurb']) {
    if (patch[k] !== undefined) s[k] = String(patch[k]);
  }
  if (patch.weight !== undefined) s.weight = Number(patch.weight) || 100;
  if (patch.nav !== undefined) s.nav = !!patch.nav;
  if (patch.home !== undefined) s.home = !!patch.home;
  writeSectionData(data);
  regeneratePagesYml();
  return s;
}

function createSection(patch) {
  const key = String(patch.key || '').trim().toLowerCase();
  if (!/^[a-z][a-z0-9-]{1,30}$/.test(key)) {
    throw new Error('板块代号只能用英文小写字母开头，可加数字和连字符，例如 notes、daily-life');
  }
  const data = readSectionData();
  if (data[key]) throw new Error('代号 ' + key + ' 已经被占用了');
  const dir = path.join(CONTENT, key);
  if (fs.existsSync(dir)) throw new Error('content/' + key + ' 目录已经存在');

  const title = String(patch.title || key).trim();
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, '_index.md'), dumpFrontMatter({ title, description: '' }, ''), 'utf8');

  data[key] = {
    title,
    en: String(patch.en || ''),
    numeral: String(patch.numeral || nextNumeral(data)),
    accent: String(patch.accent || '#6b7a8a'),
    icon: String(patch.icon || 'link'),
    blurb: String(patch.blurb || ''),
    weight: Number(patch.weight) || nextWeight(data),
    nav: patch.nav !== false,
    home: patch.home !== false
  };
  writeSectionData(data);
  regeneratePagesYml();
  return key;
}

function deleteSection(key) {
  const data = readSectionData();
  if (!data[key]) throw new Error('板块不存在：' + key);
  const dir = path.join(CONTENT, key);
  let moved = null;
  if (fs.existsSync(dir)) {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const dest = path.join(TRASH_DIR, `${stamp}-section-${key}`);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.renameSync(dir, dest);
    moved = path.relative(ROOT, dest).replace(/\\/g, '/');
  }
  delete data[key];
  writeSectionData(data);
  regeneratePagesYml();
  return { key, moved };
}

function trashPost(sectionKey, file) {
  const { full, name } = safePostPath(sectionKey, file);
  if (!fs.existsSync(full)) throw new Error('文件不存在：' + name);
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const dest = path.join(TRASH_DIR, `${stamp}-${sectionKey}-${name}`);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.renameSync(full, dest);
  return path.relative(ROOT, dest).replace(/\\/g, '/');
}


/* ============================================================
   站点设置：首页文案 / 板块介绍页 / 联系方式
   ============================================================ */
const HOME_FILE = path.join(ROOT, 'data', 'home.yaml');
const SOCIALS_FILE = path.join(ROOT, 'data', 'socials.yaml');

// 首页文案的字段表（dotted path → 类型），前端照着渲染表单
const SITE_HOME_FIELDS = [
  { group: '主视觉（首屏）', key: 'hero.kicker', label: '名字上方的小字', type: 'string' },
  { group: '主视觉（首屏）', key: 'hero.name', label: '名字（超大字）', type: 'string', hint: '就是页面正中那个大写名字' },
  { group: '主视觉（首屏）', key: 'hero.tagline', label: '一行定位语', type: 'string' },
  { group: '主视觉（首屏）', key: 'hero.intro', label: '自我介绍正文', type: 'text' },
  { group: '主视觉（首屏）', key: 'hero.primary.label', label: '主按钮文字（实心）', type: 'string' },
  { group: '主视觉（首屏）', key: 'hero.primary.url', label: '主按钮链接', type: 'string', hint: '站内写 /about/ 这样就行' },
  { group: '主视觉（首屏）', key: 'hero.secondary.label', label: '次按钮文字（描边）', type: 'string' },
  { group: '主视觉（首屏）', key: 'hero.secondary.url', label: '次按钮链接', type: 'string' },
  { group: '关于我（首页区块）', key: 'about.title', label: '标题', type: 'string' },
  { group: '关于我（首页区块）', key: 'about.subtitle', label: '英文小标题', type: 'string' },
  { group: '关于我（首页区块）', key: 'about.portrait', label: '竖版照片', type: 'image', hint: '上传后会同时用在首页和自我介绍页；留空则显示字母方框' },
  { group: '关于我（首页区块）', key: 'about.portraitFallback', label: '没有照片时显示的字母', type: 'string' },
  { group: '关于我（首页区块）', key: 'about.paragraphs', label: '段落', type: 'lines', hint: '一行一段' },
  { group: '关于我（首页区块）', key: 'about.facts', label: '速览', type: 'pairs', hint: '一行一条，写成「名目 | 内容」，例如：\n常驻 | 某座四季分明的城市' },
  { group: '最近的记录', key: 'latest.title', label: '标题', type: 'string' },
  { group: '最近的记录', key: 'latest.subtitle', label: '英文小标题', type: 'string' },
  { group: '最近的记录', key: 'latest.count', label: '显示几条', type: 'number' }
];

function getPath(obj, dotted) {
  return dotted.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
}

function setPath(obj, dotted, value) {
  const parts = dotted.split('.');
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    if (cur[parts[i]] == null || typeof cur[parts[i]] !== 'object') cur[parts[i]] = {};
    cur = cur[parts[i]];
  }
  cur[parts[parts.length - 1]] = value;
}

/** 保留文件开头的中文注释块（重新生成时不让注释消失） */
function leadingComments(text) {
  const lines = String(text).replace(/^\uFEFF/, '').split(/\r?\n/);
  const head = [];
  for (const line of lines) {
    if (line.trim() === '' || line.trim().startsWith('#')) head.push(line);
    else break;
  }
  return head.length ? head.join('\n').replace(/\s+$/, '') + '\n\n' : '';
}

function readHome() {
  if (!fs.existsSync(HOME_FILE)) return {};
  return parseYaml(fs.readFileSync(HOME_FILE, 'utf8')) || {};
}

function readSocials() {
  if (!fs.existsSync(SOCIALS_FILE)) return [];
  const v = parseYaml(fs.readFileSync(SOCIALS_FILE, 'utf8'));
  return Array.isArray(v) ? v : [];
}

/** 首页文案：转成「一行一个值」方便表单显示 */
function homeToFormValues(home) {
  const values = {};
  for (const f of SITE_HOME_FIELDS) {
    const v = getPath(home, f.key);
    if (f.type === 'lines') values[f.key] = Array.isArray(v) ? v.join('\n') : String(v || '');
    else if (f.type === 'pairs') {
      values[f.key] = Array.isArray(v)
        ? v.map((x) => (x && typeof x === 'object') ? `${x.label || ''} | ${x.value || ''}` : String(x)).join('\n')
        : '';
    } else values[f.key] = v == null ? '' : String(v);
  }
  return values;
}

/** 表单值写回首页文案（保留未知字段） */
function saveHome(values) {
  const original = fs.existsSync(HOME_FILE) ? fs.readFileSync(HOME_FILE, 'utf8') : '';
  const home = readHome();
  for (const f of SITE_HOME_FIELDS) {
    const raw = values[f.key];
    if (raw === undefined) continue;
    if (f.type === 'lines') {
      const list = String(raw).split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
      setPath(home, f.key, list);
    } else if (f.type === 'pairs') {
      const list = String(raw).split(/\r?\n/).map((s) => s.trim()).filter(Boolean)
        .map((line) => {
          const i = line.indexOf('|');
          return i === -1 ? { label: line.trim(), value: '' } : { label: line.slice(0, i).trim(), value: line.slice(i + 1).trim() };
        });
      setPath(home, f.key, list);
    } else if (f.type === 'number') {
      const n = Number(String(raw).trim());
      setPath(home, f.key, Number.isFinite(n) && String(raw).trim() !== '' ? n : 0);
    } else {
      setPath(home, f.key, String(raw).trim());
    }
  }
  fs.writeFileSync(HOME_FILE, leadingComments(original) + dumpFrontMatter(home, '').replace(/^---\n/, '').replace(/\n---\n?$/, '\n'), 'utf8');
  return home;
}

function saveSocials(items) {
  const original = fs.existsSync(SOCIALS_FILE) ? fs.readFileSync(SOCIALS_FILE, 'utf8') : '';
  const clean = (Array.isArray(items) ? items : [])
    .map((it) => ({ name: String(it.name || '').trim(), icon: String(it.icon || 'link').trim(), url: String(it.url || '').trim(), text: String(it.text || '').trim() }))
    .filter((it) => it.name || it.url);
  const body = clean.map((it) => [
    `- name: ${quoteIfNeeded(it.name)}`,
    `  icon: ${it.icon}`,
    `  url: ${quoteIfNeeded(it.url)}`,
    `  text: ${quoteIfNeeded(it.text)}`
  ].join('\n')).join('\n');
  fs.writeFileSync(SOCIALS_FILE, leadingComments(original) + body + '\n', 'utf8');
  return clean;
}

/** 板块介绍页（content/<板块>/_index.md）：只改 title / description / 正文，其它字段原样保留 */
function readIntro(key) {
  const file = path.join(CONTENT, key, '_index.md');
  if (!fs.existsSync(file)) return { title: '', description: '', body: '', exists: false };
  const { data, body } = parseFrontMatter(fs.readFileSync(file, 'utf8'));
  return { title: data.title || '', description: data.description || '', body, exists: true, extraKeys: Object.keys(data).filter((k) => !['title', 'description'].includes(k)) };
}

function saveIntro(key, patch) {
  if (!sectionByKey(key)) throw new Error('板块不存在：' + key);
  const file = path.join(CONTENT, key, '_index.md');
  const raw = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
  const parsed = raw ? parseFrontMatter(raw) : { data: {}, body: '' };
  const data = parsed.data || {};
  if (patch.title !== undefined) data.title = String(patch.title).trim();
  if (patch.description !== undefined) data.description = String(patch.description).trim();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, dumpFrontMatter(data, String(patch.body == null ? parsed.body : patch.body)), 'utf8');
  return readIntro(key);
}

/* ============================================================
   极简 YAML：解析 / 生成（只覆盖本站用到的写法，但保留未知字段）
   ============================================================ */
function scalarValue(raw) {
  let v = String(raw).trim();
  if (v === '' || v === '~' || v === 'null') return '';
  if (v === 'true') return true;
  if (v === 'false') return false;
  if (/^-?\d+$/.test(v)) return Number(v);
  if (/^-?\d+\.\d+$/.test(v)) return Number(v);
  if (v.startsWith('[') && v.endsWith(']')) {
    const inner = v.slice(1, -1).trim();
    if (!inner) return [];
    return splitFlow(inner).map((s) => unquote(s.trim()));
  }
  return unquote(v);
}

function unquote(s) {
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    const body = s.slice(1, -1);
    return s[0] === '"' ? body.replace(/\\"/g, '"').replace(/\\\\/g, '\\') : body.replace(/''/g, "'");
  }
  return s;
}

// 按逗号切分 flow 数组，忽略引号内的逗号
function splitFlow(s) {
  const out = [];
  let cur = '';
  let q = null;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) {
      cur += c;
      if (c === q && s[i - 1] !== '\\') q = null;
      continue;
    }
    if (c === '"' || c === "'") { q = c; cur += c; continue; }
    if (c === ',') { out.push(cur); cur = ''; continue; }
    cur += c;
  }
  if (cur.trim()) out.push(cur);
  return out;
}

function indentOf(line) { return line.match(/^ */)[0].length; }

function parseBlock(lines, start, indent) {
  // 先跳过开头的空行与注释，再判断这是列表还是映射
  let s = start;
  while (s < lines.length && (lines[s].trim() === '' || lines[s].trim().startsWith('#'))) s++;
  const first = lines[s] || '';
  const isList = /^\s*-\s/.test(first) || first.trim() === '-';

  if (isList) {
    const arr = [];
    let i = start;
    while (i < lines.length && indentOf(lines[i]) === indent && (/^\s*-\s?/.test(lines[i]) || lines[i].trim() === '' || lines[i].trim().startsWith('#'))) {
      if (lines[i].trim() === '' || lines[i].trim().startsWith('#')) { i++; continue; }   // 空行与注释只是分隔
      const rest = lines[i].replace(/^\s*-\s?/, '');
      if (rest.trim() === '') {
        // 嵌套结构
        const sub = parseBlock(lines, i + 1, indentOf(lines[i + 1] || ''));
        arr.push(sub.value);
        i = sub.next;
        continue;
      }
      if (/^[^:\s]+:\s/.test(rest) || /^[^:\s]+:$/.test(rest)) {
        // 列表项是映射：收集它与后续更深缩进的行
        const itemLines = [' '.repeat(indent + 2) + rest];
        let j = i + 1;
        while (j < lines.length && lines[j].trim() !== '' && indentOf(lines[j]) > indent) {
          itemLines.push(lines[j]);
          j++;
        }
        const sub = parseBlock(itemLines, 0, indentOf(itemLines[0]));
        arr.push(sub.value);
        i = j;
        continue;
      }
      arr.push(scalarValue(rest));
      i++;
    }
    return { value: arr, next: i };
  }

  const obj = {};
  let i = start;
  while (i < lines.length && indentOf(lines[i]) === indent) {
    if (lines[i].trim() === '' || lines[i].trim().startsWith('#')) { i++; continue; }   // 空行与注释只是分隔
    const m = lines[i].match(/^\s*([^:#]+):\s?(.*)$/);
    if (!m) { i++; continue; }
    const key = m[1].trim();
    const rest = m[2];
    if (rest.trim() === '') {
      // 可能是嵌套块，也可能是空值
      let j = i + 1;
      while (j < lines.length && lines[j].trim() === '') j++;
      if (j < lines.length && indentOf(lines[j]) > indent) {
        const sub = parseBlock(lines, j, indentOf(lines[j]));
        obj[key] = sub.value;
        i = sub.next;
        continue;
      }
      obj[key] = '';
      i++;
      continue;
    }
    obj[key] = scalarValue(rest);
    i++;
  }
  return { value: obj, next: i };
}

function parseFrontMatter(text) {
  const norm = text.replace(/^\uFEFF/, '');
  const m = norm.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!m) return { data: {}, body: norm.trim() };
  const lines = m[1].split(/\r?\n/);
  const parsed = parseBlock(lines, 0, 0);
  return { data: parsed.value || {}, body: norm.slice(m[0].length).replace(/^\s*\n/, '') };
}

/** 直接解析一段 YAML（例如 data/sections.yaml），给校验脚本复用 */
function parseYaml(text) {
  return parseBlock(String(text).replace(/^\uFEFF/, '').split(/\r?\n/), 0, 0).value || {};
}

function quoteIfNeeded(v) {
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  const s = String(v);
  if (s === '') return '""';
  // 纯日期，以及安全的普通标量（如 profile / leaf / About / /images/x.jpg）不加引号，读起来更清爽
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  if (/^[A-Za-z0-9_./@+-]+$/.test(s)) return s;
  return '"' + s.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\r?\n/g, '\\n') + '"';
}

function dumpValue(out, key, value, indent) {
  const pad = ' '.repeat(indent);
  const arr = Array.isArray(value);

  if (arr) {
    if (!value.length) { out.push(`${pad}${key}: []`); return; }
    if (value.every((v) => typeof v !== 'object' || v === null)) {
      out.push(`${pad}${key}: [${value.map((v) => quoteIfNeeded(v)).join(', ')}]`);
      return;
    }
    out.push(`${pad}${key}:`);
    for (const item of value) {
      if (item && typeof item === 'object') {
        const keys = Object.keys(item);
        keys.forEach((k, idx) => {
          const prefix = idx === 0 ? `${pad}  - ` : `${pad}    `;
          const v = item[k];
          if (Array.isArray(v)) {
            out.push(`${prefix}${k}:`);
            v.forEach((x) => out.push(`${pad}      - ${quoteIfNeeded(x)}`));
          } else {
            out.push(`${prefix}${k}: ${quoteIfNeeded(v)}`);
          }
        });
      } else {
        out.push(`${pad}  - ${quoteIfNeeded(item)}`);
      }
    }
    return;
  }

  if (value && typeof value === 'object') {
    const keys = Object.keys(value);
    if (!keys.length) { out.push(`${pad}${key}: {}`); return; }
    out.push(`${pad}${key}:`);
    for (const k of keys) dumpValue(out, k, value[k], indent + 2);
    return;
  }

  out.push(`${pad}${key}: ${quoteIfNeeded(value)}`);
}

function dumpFrontMatter(data, body) {
  const out = ['---'];
  for (const key of Object.keys(data)) {
    const v = data[key];
    if (v === undefined) continue;
    dumpValue(out, key, v, 0);
  }
  out.push('---', '');
  return out.join('\n') + '\n' + (body ? body.replace(/^\s*\n/, '').trimEnd() + '\n' : '');
}

/* ============================================================
   文件操作
   ============================================================ */
function listPosts(sectionKey) {
  const dir = path.join(CONTENT, sectionKey);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter((f) => f.endsWith('.md') && f !== '_index.md')
    .map((f) => {
      const full = path.join(dir, f);
      const raw = fs.readFileSync(full, 'utf8');
      const { data } = parseFrontMatter(raw);
      return { file: f, title: data.title || f.replace(/\.md$/, ''), date: String(data.date || ''), draft: data.draft === true };
    })
    .sort((a, b) => String(b.date).localeCompare(String(a.date)));
}

function safePostPath(sectionKey, file) {
  const clean = path.basename(String(file)).replace(/[\\/:*?"<>|]/g, '').trim();
  if (!clean) throw new Error('文件名不能为空');
  const name = clean.endsWith('.md') ? clean : clean + '.md';
  const full = path.join(CONTENT, sectionKey, name);
  if (!full.startsWith(path.join(CONTENT, sectionKey))) throw new Error('非法路径');
  return { full, name };
}

/* ---- 表单数据 → 文章（front matter + 正文） ---- */
function buildPost(sectionKey, payload) {
  const section = sectionByKey(sectionKey);
  if (!section) throw new Error('未知板块：' + sectionKey);

  const data = {};
  let body = String(payload.body || '');

  // 日期留空就默认今天（先补上，让它落在 front matter 里该在的位置）
  if (!payload.date) payload.date = new Date().toISOString().slice(0, 10);

  for (const f of section.fields) {
    if (f.key === '__filename' || f.key === 'body') continue;
    const raw = payload[f.key];

    if (f.type === 'bool') {
      // 没传（例如从接口直接保存）时按字段默认值处理：
      // 这样「草稿」「不被收录」这类默认勾选的项，忘了传也不会意外公开。
      const omitted = raw === undefined || raw === null || raw === '';
      const v = omitted ? f.default === true : (raw === true || raw === 'true' || raw === 'on');
      if (f.default === true || v) data[f.key] = v;
      continue;
    }
    if (f.type === 'number') {
      const v = String(raw == null ? '' : raw).trim();
      if (v !== '') data[f.key] = Number(v);
      continue;
    }
    if (f.type === 'tags') {
      const list = String(raw || '')
        .split(/[,，]/)
        .map((s) => s.trim())
        .filter(Boolean);
      if (list.length) data[f.key] = list;
      continue;
    }
    if (f.type === 'ingredients') {
      const groups = [];
      let cur = null;
      for (const line of String(raw || '').split(/\r?\n/)) {
        const t = line.trim();
        if (!t) continue;
        const g = t.match(/^[[【](.+?)[\]】]$/);
        if (g) { cur = { group: g[1].trim(), items: [] }; groups.push(cur); continue; }
        if (!cur) { cur = { group: '材料', items: [] }; groups.push(cur); }
        cur.items.push(t);
      }
      if (groups.length) data[f.key] = groups;
      continue;
    }
    if (f.type === 'steps') {
      const list = String(raw || '')
        .split(/\r?\n/)
        .map((s) => s.trim())
        .filter(Boolean);
      if (list.length) data[f.key] = list;
      continue;
    }

    const v = String(raw == null ? '' : raw).trim();
    if (v !== '') data[f.key] = v;
  }

  // 日期缺失时补今天
  if (!data.date) data.date = new Date().toISOString().slice(0, 10);
  return { data, body, section };
}

/* ============================================================
   HTTP
   ============================================================ */
function json(res, code, obj) {
  const s = JSON.stringify(obj);
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(s);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let b = '';
    req.on('data', (d) => { b += d; if (b.length > 30 * 1024 * 1024) reject(new Error('内容过大')); });
    req.on('end', () => resolve(b));
    req.on('error', reject);
  });
}

function runGit(args, timeout = 120000) {
  return new Promise((resolve) => {
    execFile('git', args, { cwd: ROOT, timeout, windowsHide: true, maxBuffer: 8 * 1024 * 1024 },
      (err, stdout, stderr) => resolve({ ok: !err, out: (stdout || '') + (stderr || ''), code: err ? (err.code || 1) : 0 }));
  });
}

/** 跑任意命令（不经过 shell），用于构建与自检脚本 */
function runCmd(exe, args, timeout = 120000) {
  return new Promise((resolve) => {
    execFile(exe, args, { cwd: ROOT, timeout, windowsHide: true, maxBuffer: 16 * 1024 * 1024 },
      (err, stdout, stderr) => resolve({ ok: !err, out: (stdout || '') + (stderr || ''), code: err ? (err.code || 1) : 0 }));
  });
}

/** 找 Hugo：优先用工作区里的便携版 */
function hugoExe() {
  const local = path.join(ROOT, '.tools', 'hugo', 'hugo.exe');
  return fs.existsSync(local) ? local : 'hugo';
}

/** 本地预览的地址：跟线上一致地带上 baseURL 里的子路径（例如 http://localhost:1313/Parlour/） */
function previewBase() {
  let basePath = '/';
  try {
    const toml = fs.readFileSync(path.join(ROOT, 'hugo.toml'), 'utf8');
    const m = toml.match(/^\s*baseURL\s*=\s*"([^"]+)"/m);
    if (m) {
      const u = new URL(m[1]);
      if (u.pathname) basePath = u.pathname;
    }
  } catch (e) {}
  if (!basePath.endsWith('/')) basePath += '/';
  return `http://localhost:1313${basePath}`;
}

const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, `http://127.0.0.1:${PORT}`);
  try {
    if (req.method === 'GET' && (u.pathname === '/' || u.pathname === '/index.html')) {
      const html = fs.readFileSync(path.join(__dirname, 'ui.html'), 'utf8');
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
      return res.end(html);
    }

    if (req.method === 'GET' && u.pathname === '/api/meta') {
      return json(res, 200, {
        sections: listSections().map((s) => ({
          key: s.key, label: s.title, note: s.blurb, weight: s.weight,
          nav: s.nav, home: s.home, accent: s.accent, icon: s.icon, numeral: s.numeral, en: s.en,
          fields: s.fields.map((f) => ({ ...f, default: undefined }))
        })),
        icons: ICON_CHOICES,
        previewBase: previewBase(),
        today: new Date().toISOString().slice(0, 10)
      });
    }

    if (req.method === 'GET' && u.pathname === '/api/posts') {
      const key = u.searchParams.get('section');
      if (!sectionByKey(key)) return json(res, 400, { error: '未知板块' });
      return json(res, 200, { posts: listPosts(key) });
    }

    if (req.method === 'GET' && u.pathname === '/api/post') {
      const key = u.searchParams.get('section');
      const file = u.searchParams.get('file');
      if (!sectionByKey(key)) return json(res, 400, { error: '未知板块' });
      const { full } = safePostPath(key, file);
      if (!fs.existsSync(full)) return json(res, 404, { error: '文件不存在' });
      const raw = fs.readFileSync(full, 'utf8');
      const { data, body } = parseFrontMatter(raw);
      return json(res, 200, { data, body, raw });
    }

    if (req.method === 'POST' && u.pathname === '/api/save') {
      const payload = JSON.parse(await readBody(req) || '{}');
      const key = payload.section;
      const { data, body } = buildPost(key, payload);
      const { full, name } = safePostPath(key, payload.__filename || payload.title || 'untitled');
      fs.mkdirSync(path.dirname(full), { recursive: true });
      fs.writeFileSync(full, dumpFrontMatter(data, body), 'utf8');   // 不带 BOM
      return json(res, 200, { ok: true, file: name, path: path.relative(ROOT, full) });
    }

    if (req.method === 'POST' && u.pathname === '/api/delete') {
      const payload = JSON.parse(await readBody(req) || '{}');
      const key = payload.section;
      if (!sectionByKey(key)) return json(res, 400, { error: '未知板块' });
      const moved = trashPost(key, payload.file);
      return json(res, 200, { ok: true, moved });
    }

    if (req.method === 'POST' && u.pathname === '/api/section/save') {
      const payload = JSON.parse(await readBody(req) || '{}');
      const s = saveSectionDisplay(payload.key, payload);
      return json(res, 200, { ok: true, section: payload.key, title: s.title });
    }

    if (req.method === 'POST' && u.pathname === '/api/section/create') {
      const payload = JSON.parse(await readBody(req) || '{}');
      const key = createSection(payload);
      return json(res, 200, { ok: true, key });
    }

    if (req.method === 'POST' && u.pathname === '/api/section/delete') {
      const payload = JSON.parse(await readBody(req) || '{}');
      const r = deleteSection(payload.key);
      return json(res, 200, { ok: true, moved: r.moved });
    }

    /* ---------------- 站点设置 ---------------- */
    if (req.method === 'GET' && u.pathname === '/api/site') {
      const home = readHome();
      return json(res, 200, {
        homeValues: homeToFormValues(home),
        fields: SITE_HOME_FIELDS,
        socials: readSocials(),
        icons: ICON_CHOICES,
        sections: listSections().map((s) => ({
          key: s.key, title: s.title, blurb: s.blurb, intro: readIntro(s.key)
        }))
      });
    }

    if (req.method === 'POST' && u.pathname === '/api/site/home') {
      const payload = JSON.parse(await readBody(req) || '{}');
      saveHome(payload.values || {});
      return json(res, 200, { ok: true });
    }

    if (req.method === 'POST' && u.pathname === '/api/site/socials') {
      const payload = JSON.parse(await readBody(req) || '{}');
      const saved = saveSocials(payload.items);
      return json(res, 200, { ok: true, count: saved.length });
    }

    if (req.method === 'POST' && u.pathname === '/api/site/intro') {
      const payload = JSON.parse(await readBody(req) || '{}');
      const saved = saveIntro(payload.key, payload);
      return json(res, 200, { ok: true, intro: saved });
    }

    if (req.method === 'POST' && u.pathname === '/api/upload') {
      const { name, dataUrl } = JSON.parse(await readBody(req) || '{}');
      const m = String(dataUrl || '').match(/^data:([^;]+);base64,(.*)$/);
      if (!m) return json(res, 400, { error: '图片数据无效' });
      const ext = (String(name).match(/\.([a-zA-Z0-9]+)$/) || [, 'jpg'])[1].toLowerCase();
      const base = path.basename(String(name).replace(/\.[^.]+$/, '')).replace(/[^\w\u4e00-\u9fa5-]/g, '-').slice(0, 60) || 'image';
      const file = `${base}-${Date.now().toString(36).slice(-4)}.${ext}`;
      fs.mkdirSync(IMAGES, { recursive: true });
      fs.writeFileSync(path.join(IMAGES, file), Buffer.from(m[2], 'base64'));
      return json(res, 200, { ok: true, url: '/images/' + file });
    }

    if (req.method === 'POST' && u.pathname === '/api/publish') {
      const log = [];

      // ① 先在本地构建一次：模板/内容有错就当场拦住，不把坏版本推上去
      //    --cleanDestinationDir：清掉上次的产物，避免开发服务器残留的 livereload.js 之类混进来
      const build = await runCmd(hugoExe(), ['--source', ROOT, '--minify', '--gc', '--cleanDestinationDir'], 240000);
      if (!build.ok) {
        return json(res, 200, {
          ok: false,
          log: '本地构建失败，已中止推送（线上还是上一个好版本，没被弄坏）：\n\n' + build.out.trim(),
          hint: '把上面的报错发我；也可以只点「保存」（不发布）先把内容留在本地。'
        });
      }
      log.push('① 本地构建通过 ✓');

      // ② 站内链接体检（漏了 /仓库名/ 前缀的链接会被抓出来）
      const links = await runCmd(process.execPath, [path.join(ROOT, 'scripts', 'check-links.cjs')], 180000);
      log.push('② 站内链接体检：' + (links.ok ? '全部通过 ✓' : '发现问题 ⚠'));
      if (!links.ok) log.push(links.out.trim().split('\n').slice(0, 12).join('\n'));

      // ③ 编辑器同步检查（模板要用的字段，写作台能不能填）
      const sync = await runCmd(process.execPath, [path.join(ROOT, 'scripts', 'verify-editor-sync.cjs')], 60000);
      log.push('③ 编辑器同步检查：' + (sync.ok ? '一致 ✓' : '有缺口 ⚠'));
      if (!sync.ok) log.push(sync.out.trim().split('\n').slice(-8).join('\n'));

      // ④ 提交并推送
      const status = await runGit(['status', '--porcelain']);
      if (status.out.trim()) {
        await runGit(['add', '-A']);
        const msg = `更新内容 ${new Date().toLocaleString('zh-CN', { hour12: false })}`;
        const c = await runGit(['commit', '-m', msg]);
        log.push(`④ 提交：${msg}`);
        if (!c.ok) log.push(c.out.trim().split('\n').slice(-3).join('\n'));
      } else {
        log.push('④ 没有需要提交的改动，直接推送。');
      }
      let last = null;
      for (let i = 1; i <= 5; i++) {
        last = await runGit(['push', 'origin', 'HEAD']);
        log.push(`④ 第 ${i} 次推送：${last.ok ? '成功' : '失败'}`);
        if (last.ok) break;
        log.push(last.out.trim().split('\n').slice(-3).join('\n'));
        await new Promise((r) => setTimeout(r, 5000));
      }
      const warn = (links.ok ? '' : '\n\n注意：站内链接体检发现有问题，虽然已经推送，但点那些链接会 404 —— 把日志发我。');
      return json(res, 200, {
        ok: !!(last && last.ok),
        log: log.join('\n'),
        hint: (last && last.ok)
          ? '已推送（本地构建与检查都跑过了）。1~2 分钟后刷新 https://mysteriousamateurplayer.github.io/Parlour/ 就能看到。' + warn
          : '推送失败。检查网络，或双击 push.bat 再试。'
      });
    }

    if (req.method === 'GET' && u.pathname === '/api/preview-status') {
      return new Promise((resolve) => {
        const r = http.get({ host: '127.0.0.1', port: 1313, path: new URL(previewBase()).pathname, timeout: 1500 }, (resp) => {
          resp.resume();
          json(res, 200, { running: resp.statusCode === 200, url: previewBase() });
          resolve();
        });
        r.on('timeout', () => { r.destroy(); json(res, 200, { running: false, url: previewBase() }); resolve(); });
        r.on('error', () => { json(res, 200, { running: false, url: previewBase() }); resolve(); });
      });
    }

    if (req.method === 'POST' && u.pathname === '/api/preview-start') {
      const localHugo = path.join(ROOT, '.tools', 'hugo', 'hugo.exe');
      const exe = fs.existsSync(localHugo) ? localHugo : 'hugo';
      const { spawn } = require('child_process');
      // 不加 --baseURL：让本地预览与线上一样挂在 baseURL 的子路径下，资源才不会 404
      const child = spawn(exe, ['server', '--source', ROOT, '--port', '1313',
        '--buildDrafts', '--buildFuture', '--navigateToChanged'], {
        detached: true, stdio: 'ignore', windowsHide: true
      });
      child.unref();
      return json(res, 200, { ok: true, url: previewBase() });
    }

    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('404');
  } catch (e) {
    json(res, 500, { error: e.message });
  }
});

if (require.main === module) {
  server.on('error', (e) => {
    if (e.code === 'EADDRINUSE') {
      const url = `http://127.0.0.1:${PORT}/`;
      console.log('');
      console.log('写作台已经在运行了（可能是你之前开的那个窗口还没关）。');
      console.log('现在帮你在浏览器里打开： ' + url);
      console.log('');
      const { spawn } = require('child_process');
      try { spawn('cmd', ['/c', 'start', '', url], { detached: true, stdio: 'ignore', windowsHide: true }).unref(); } catch (err) {}
      setTimeout(() => process.exit(0), 1200);
      return;
    }
    console.error('启动失败：' + e.message);
    process.exit(1);
  });

  server.listen(PORT, '127.0.0.1', () => {
    const url = `http://127.0.0.1:${PORT}/`;
    console.log('');
    console.log('============================================================');
    console.log('  MAP 写作台已启动');
    console.log('');
    console.log('  在浏览器打开： ' + url);
    console.log('');
    console.log('  （这个窗口不要关，关了写作台就停了）');
    console.log('============================================================');
    console.log('');
    const { spawn } = require('child_process');
    if (!process.env.MAP_WRITER_NO_OPEN) {
      try { spawn('cmd', ['/c', 'start', '', url], { detached: true, stdio: 'ignore', windowsHide: true }).unref(); } catch (e) {}
    }
  });
}

module.exports = {
  parseFrontMatter, dumpFrontMatter, parseYaml, buildPost, listPosts, CONTENT, ROOT,
  listSections, readSectionData, writeSectionData, saveSectionDisplay, createSection,
  deleteSection, trashPost, regeneratePagesYml,
  readHome, saveHome, homeToFormValues, readSocials, saveSocials, readIntro, saveIntro, SITE_HOME_FIELDS,
  previewBase, hugoExe
};
