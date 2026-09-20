// 写作台安全回归测试：确认「解析 → 重新生成 → 再解析」不会丢失或篡改任何一篇文章的字段。
//
// 用法：node scripts/verify-writer.cjs
// 只读不改：全部在内存里完成，不碰你的任何文件。
//
// 为什么需要它：写作台要把你填的表单写回 Markdown 文件。如果它的 YAML 处理有 bug，
// 保存就可能悄悄弄丢字段。这个脚本把 content/ 下每篇文章走一遍往返，逐个字段比对。

const fs = require('fs');
const path = require('path');
const W = require('../tools/writer/server.cjs');

const CONTENT = W.CONTENT;
const files = [];
for (const dir of fs.readdirSync(CONTENT)) {
  const full = path.join(CONTENT, dir);
  if (!fs.statSync(full).isDirectory()) continue;
  for (const f of fs.readdirSync(full)) if (f.endsWith('.md')) files.push(path.join(full, f));
}

function flatten(obj, prefix = '') {
  const out = {};
  for (const [k, v] of Object.entries(obj || {})) {
    const key = prefix ? prefix + '.' + k : k;
    if (Array.isArray(v)) {
      out[key + '[]'] = 'len=' + v.length;
      v.forEach((item, i) => {
        if (item && typeof item === 'object') Object.assign(out, flatten(item, `${key}[${i}]`));
        else out[`${key}[${i}]`] = String(item);
      });
    } else if (v && typeof v === 'object') {
      Object.assign(out, flatten(v, key));
    } else {
      out[key] = String(v);
    }
  }
  return out;
}

let fails = 0;
console.log(`检查 ${files.length} 个内容文件的往返一致性：\n`);

for (const file of files) {
  const rel = path.relative(W.ROOT, file).replace(/\\/g, '/');
  const raw = fs.readFileSync(file, 'utf8');
  const first = W.parseFrontMatter(raw);
  const rebuilt = W.dumpFrontMatter(first.data, first.body);
  const second = W.parseFrontMatter(rebuilt);

  const A = flatten(first.data);
  const B = flatten(second.data);
  const problems = [];

  for (const k of Object.keys(A)) if (!(k in B)) problems.push('丢失字段 ' + k);
  for (const k of Object.keys(B)) if (!(k in A)) problems.push('多出字段 ' + k);
  for (const k of Object.keys(A)) {
    if (k in B && String(A[k]) !== String(B[k])) problems.push(`${k}: "${A[k]}" → "${B[k]}"`);
  }
  if (first.body.trim() !== second.body.trim()) problems.push('正文发生变化');

  if (problems.length) {
    fails++;
    console.log(`FAIL  ${rel}`);
    problems.slice(0, 6).forEach((p) => console.log('        · ' + p));
  } else {
    console.log(`PASS  ${rel.padEnd(46)} 字段 ${String(Object.keys(A).length).padStart(2)} 个`);
  }
}

console.log('\n' + (fails
  ? `${fails} 个文件有问题 —— 写作台保存会破坏它们，需要修！`
  : '全部通过：写作台保存不会破坏任何现有文章 ✓'));
process.exitCode = fails ? 1 : 0;
