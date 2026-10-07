// 站点设置安全回归：确认写作台改「首页文案 / 板块介绍页 / 联系方式」时
// 不会弄丢其他字段、不会破坏注释、不会覆盖里版的解谜配置。
//
// 用法：node scripts/verify-site-settings.cjs
// 它会真的改文件、测完再逐字节还原（中途不写坏任何东西；万一中途崩溃，
// 还原逻辑也写在 finally 里）。

const fs = require('fs');
const path = require('path');
const W = require('../tools/writer/server.cjs');

const ROOT = W.ROOT;
const HOME = path.join(ROOT, 'data', 'home.yaml');
const SOCIALS = path.join(ROOT, 'data', 'socials.yaml');
const files = {
  home: HOME,
  socials: SOCIALS,
  about: path.join(ROOT, 'content', 'about', '_index.md'),
  secrets: path.join(ROOT, 'content', 'secrets', '_index.md')
};
const backup = {};
for (const [k, f] of Object.entries(files)) backup[k] = fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : null;

let fails = 0;
const ok = (label, cond, extra = '') => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}${extra ? '  ' + extra : ''}`); if (!cond) fails++; };

try {
  console.log('检查站点设置的读写安全性\n');

  // ---------- 首页文案 ----------
  const values = W.homeToFormValues(W.readHome());
  ok('首页文案能解析成表单值', !!values['hero.name'], `名字=${values['hero.name']}`);
  ok('段落是多行文本', values['about.paragraphs'].includes('\n'), `${values['about.paragraphs'].split('\n').length} 段`);
  ok('速览是「名目 | 内容」', values['about.facts'].includes('|'), JSON.stringify(values['about.facts'].split('\n')[0]));
  const needFields = ['hero.kicker', 'hero.name', 'about.paragraphs', 'about.facts', 'latest.count',
    'explore.kicker', 'explore.title', 'explore.lede',
    'globe.title', 'globe.lede', 'globe.hint'];
  const missing = needFields.filter((k) => !W.SITE_HOME_FIELDS.some((f) => f.key === k));
  ok('字段表覆盖了首页全部可编辑文案', W.SITE_HOME_FIELDS.length >= 18 && missing.length === 0,
    '共 ' + W.SITE_HOME_FIELDS.length + ' 项' + (missing.length ? '，缺 ' + missing.join('/') : ''));

  const probe = { ...values };
  probe['hero.tabTitle'] = '__测试标签页标题__';
  probe['about.paragraphs'] = '第一段。\n第二段。';
  probe['about.facts'] = '名目甲 | 内容甲\n名目乙 | 内容乙';
  probe['latest.count'] = '4';
  W.saveHome(probe);

  const saved = W.readHome();
  ok('标签页标题写入正确', saved.hero.tabTitle === '__测试标签页标题__');
  ok('太阳上的前缀与站名都在', !!saved.hero.kicker && !!saved.hero.name, `${saved.hero.kicker} / ${saved.hero.name}`);
  ok('段落数量正确', Array.isArray(saved.about.paragraphs) && saved.about.paragraphs.length === 2);
  ok('速览结构正确', saved.about.facts.length === 2 && saved.about.facts[0].label === '名目甲' && saved.about.facts[1].value === '内容乙');
  ok('显示条数是数字', saved.latest.count === 4 && typeof saved.latest.count === 'number');
  ok('主按钮链接没丢', saved.hero.primary && saved.hero.primary.url === W.readHome().hero.primary.url,
    saved.hero.primary && saved.hero.primary.url);
  ok('注释头被保留', fs.readFileSync(HOME, 'utf8').trimStart().startsWith('#'));

  // ---------- 板块介绍页 ----------
  const before = W.readIntro('about');
  W.saveIntro('about', { title: '__测试标题__', description: '__测试副标题__', body: '## 小节\n\n正文测试。' });
  const after = W.readIntro('about');
  ok('介绍页标题已改', after.title === '__测试标题__');
  ok('介绍页正文已改', after.body.includes('正文测试。'));
  const aboutRaw = fs.readFileSync(files.about, 'utf8');
  ok('layout: profile 被保留', /layout:\s*"?profile/.test(aboutRaw));
  ok('原有其他字段仍在', (after.extraKeys || []).length >= 1, (after.extraKeys || []).join(','));

  // ---------- 另一个维度：门禁开关与 private 必须原样保留 ----------
  // （题目与答案已统一放在 hugo.toml 的 [params.secrets]，_index.md 里不再写 gate 段）
  const vIntro = W.readIntro('secrets');
  W.saveIntro('secrets', { title: vIntro.title, description: vIntro.description, body: vIntro.body });
  const secretsAfter = fs.readFileSync(files.secrets, 'utf8');
  ok('另一个维度 secretsGate 仍在', /secretsGate:\s*true/.test(secretsAfter));
  ok('另一个维度 private: true 仍在', /private:\s*true/.test(secretsAfter));

  // ---------- 联系方式 ----------
  const before2 = W.readSocials();
  ok('联系方式能读出来', Array.isArray(before2) && before2.length > 0, `${before2.length} 条`);
  W.saveSocials([
    { name: '邮件', icon: 'mail', url: 'mailto:a@b.c', text: 'a@b.c' },
    { name: '', url: '' },
    { name: 'GitHub', icon: 'github', url: 'https://github.com/x', text: '@x' }
  ]);
  const after2 = W.readSocials();
  ok('空行被过滤（保存 2 条）', after2.length === 2, `${after2.length} 条`);
  ok('图标与链接正确', after2[1].icon === 'github' && after2[1].url === 'https://github.com/x');
  ok('联系方式注释头保留', fs.readFileSync(SOCIALS, 'utf8').trimStart().startsWith('#'));

  /* ---------- 友情链接 ---------- */
  const FRIENDS = path.join(ROOT, 'data', 'friends.yaml');
  const fOriginal = fs.existsSync(FRIENDS) ? fs.readFileSync(FRIENDS, 'utf8') : '';
  try {
    const before = W.readFriends();
    ok('友情链接能读出来', Array.isArray(before), before.length + ' 条');
    const savedF = W.saveFriends([
      { name: '__测试友链__', url: 'https://example.com', banner: '/images/x.jpg', note: '一句话' },
      { name: '', url: '', banner: '', note: '' }
    ]);
    ok('空行被过滤（保存 1 条）', savedF.length === 1, savedF.length + ' 条');
    ok('banner 与说明都写进去了', savedF[0].banner === '/images/x.jpg' && savedF[0].note === '一句话');
    const back = W.readFriends();
    ok('重新读回来一致', back.length === 1 && back[0].name === '__测试友链__');
    ok('友情链接注释头保留', fs.readFileSync(FRIENDS, 'utf8').includes('#  页脚 · 友情链接'));
  } finally {
    fs.writeFileSync(FRIENDS, fOriginal, 'utf8');
  }

} finally {
  let restored = 0;
  for (const [k, f] of Object.entries(files)) {
    if (backup[k] != null) { fs.writeFileSync(f, backup[k], 'utf8'); restored++; }
  }
  const same = Object.entries(files).every(([k, f]) => backup[k] == null || fs.readFileSync(f, 'utf8') === backup[k]);
  console.log(`\n已还原 ${restored} 个文件${same ? '（逐字节一致 ✓）' : '（⚠ 还原后内容不一致，请检查）'}`);
  if (!same) fails++;
}

console.log(fails ? `\n${fails} 项失败 —— 站点设置的读写有风险，需要修` : '\n全部通过 ✓ 站点设置读写安全（其他字段、注释、解谜配置都不会被破坏）');
process.exitCode = fails ? 1 : 0;
