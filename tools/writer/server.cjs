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
  date: { key: 'date', label: '日期', type: 'date', required: true },
  description: { key: 'description', label: '摘要', type: 'textarea', rows: 2, placeholder: '一两句话，会显示在卡片和搜索结果里' },
  tags: { key: 'tags', label: '标签', type: 'tags', placeholder: '用逗号隔开，例如：短篇, 治愈' },
  draft: { key: 'draft', label: '草稿（勾着就不对外显示）', type: 'bool', default: true },
  filename: { key: '__filename', label: '文件名（决定网址）', type: 'text', hint: '建议用英文短名，例如 rain-stops。中文也能用，只是网址会变成一串 %E9 编码' }
};

const SECTIONS = [
  {
    key: 'fanworks',
    label: '二次同人创作',
    note: '同人小说、插画、长评',
    fields: [
      COMMON.title, COMMON.date, COMMON.description,
      { key: 'source', label: '原作', type: 'text', placeholder: '例如：《某部作品》' },
      COMMON.tags,
      { key: 'series', label: '系列', type: 'tags', placeholder: '同一系列的文章填同一个名字，会生成系列页' },
      { key: 'cover', label: '封面图', type: 'image', hint: '可留空，留空会自动用带编号的色块' },
      COMMON.draft, COMMON.filename
    ]
  },
  {
    key: 'math',
    label: '数学分享',
    note: '解题笔记、定理整理',
    fields: [
      COMMON.title, COMMON.date, COMMON.description, COMMON.tags,
      { key: 'math', label: '渲染数学公式（写 $公式$ 时必须勾）', type: 'bool', default: true },
      { key: 'toc', label: '显示右侧目录', type: 'bool', default: true },
      COMMON.draft, COMMON.filename
    ]
  },
  {
    key: 'garden',
    label: '园艺记录',
    note: '按年排成花木年表',
    fields: [
      COMMON.title, COMMON.date, COMMON.description,
      { key: 'weather', label: '天气', type: 'text', placeholder: '例如：晴，22℃（会显示在年表里）' },
      COMMON.tags, COMMON.draft, COMMON.filename
    ]
  },
  {
    key: 'kitchen',
    label: '烹饪食谱',
    note: '食材、步骤会排成漂亮的卡片',
    fields: [
      COMMON.title, COMMON.date, COMMON.description,
      { key: 'servings', label: '份量（人份）', type: 'number' },
      { key: 'prep_time', label: '准备时间（分钟）', type: 'number' },
      { key: 'cook_time', label: '烹饪时间（分钟）', type: 'number' },
      { key: 'difficulty', label: '难度', type: 'select', options: ['简单', '中等', '麻烦'] },
      COMMON.tags,
      {
        key: 'ingredients', label: '食材', type: 'ingredients', rows: 8,
        hint: '一组用一对方括号起头，下面每行写一样食材。例如：\n[主料]\n牛腩 700g\n番茄 3 个'
      },
      {
        key: 'steps', label: '步骤', type: 'steps', rows: 7,
        hint: '一行一步，会自动编号成卡片'
      },
      COMMON.draft, COMMON.filename
    ]
  },
  {
    key: 'vault',
    label: '里版（解谜后才能看）',
    note: '注意：里版内容会随网站公开，只是加了门禁',
    fields: [
      COMMON.title, COMMON.date, COMMON.description, COMMON.tags,
      { key: 'toc', label: '显示右侧目录', type: 'bool', default: false },
      { key: 'private', label: '不被搜索引擎收录（请保持勾选）', type: 'bool', default: true },
      COMMON.filename
    ]
  }
];

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
  // 判断是列表还是映射
  const first = lines[start];
  const isList = /^\s*-\s/.test(first) || first.trim() === '-';

  if (isList) {
    const arr = [];
    let i = start;
    while (i < lines.length && indentOf(lines[i]) === indent && /^\s*-\s?/.test(lines[i])) {
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
  while (i < lines.length && lines[i].trim() !== '' && indentOf(lines[i]) === indent) {
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

function quoteIfNeeded(v) {
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  const s = String(v);
  if (s === '') return '""';
  // 纯日期、纯数字以外一律加引号，最稳
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
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
function sectionByKey(key) { return SECTIONS.find((s) => s.key === key); }

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

  for (const f of section.fields) {
    if (f.key === '__filename' || f.key === 'body') continue;
    const raw = payload[f.key];

    if (f.type === 'bool') {
      const v = raw === true || raw === 'true' || raw === 'on';
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
        sections: SECTIONS.map((s) => ({ key: s.key, label: s.label, note: s.note, fields: s.fields.map((f) => ({ ...f, default: undefined })) })),
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
      const status = await runGit(['status', '--porcelain']);
      if (status.out.trim()) {
        await runGit(['add', '-A']);
        const msg = `更新内容 ${new Date().toLocaleString('zh-CN', { hour12: false })}`;
        const c = await runGit(['commit', '-m', msg]);
        log.push(`提交：${msg}`, c.out.trim());
      } else {
        log.push('没有需要提交的改动。');
      }
      let last = null;
      for (let i = 1; i <= 5; i++) {
        last = await runGit(['push', 'origin', 'HEAD']);
        log.push(`第 ${i} 次推送：${last.ok ? '成功' : '失败'}`);
        if (last.ok) break;
        log.push(last.out.trim().split('\n').slice(-3).join('\n'));
        await new Promise((r) => setTimeout(r, 5000));
      }
      return json(res, 200, {
        ok: !!(last && last.ok),
        log: log.join('\n'),
        hint: last && last.ok
          ? '已推送。1~2 分钟后刷新 https://mysteriousamateurplayer.github.io/Parlour/ 就能看到。'
          : '推送失败。检查网络，或双击 push.bat 再试。'
      });
    }

    if (req.method === 'GET' && u.pathname === '/api/preview-status') {
      return new Promise((resolve) => {
        const r = http.get({ host: '127.0.0.1', port: 1313, path: '/', timeout: 1500 }, (resp) => {
          resp.resume();
          json(res, 200, { running: true });
          resolve();
        });
        r.on('timeout', () => { r.destroy(); json(res, 200, { running: false }); resolve(); });
        r.on('error', () => { json(res, 200, { running: false }); resolve(); });
      });
    }

    if (req.method === 'POST' && u.pathname === '/api/preview-start') {
      const localHugo = path.join(ROOT, '.tools', 'hugo', 'hugo.exe');
      const exe = fs.existsSync(localHugo) ? localHugo : 'hugo';
      const { spawn } = require('child_process');
      const child = spawn(exe, ['server', '--source', ROOT, '--port', '1313', '--buildDrafts', '--buildFuture', '--navigateToChanged'], {
        detached: true, stdio: 'ignore', windowsHide: true
      });
      child.unref();
      return json(res, 200, { ok: true, url: 'http://localhost:1313/' });
    }

    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('404');
  } catch (e) {
    json(res, 500, { error: e.message });
  }
});

if (require.main === module) {
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

module.exports = { parseFrontMatter, dumpFrontMatter, buildPost, SECTIONS, listPosts, CONTENT, ROOT };
