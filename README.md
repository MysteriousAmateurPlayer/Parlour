# MAP · 个人网站

一个用 [Hugo](https://gohugo.io) 搭起来的个人网站模板：自我介绍、二次同人创作记录、数学分享、园艺记录、烹饪食谱，外加一个需要解谜才能进入的「里版」。

设计目标是**优雅端庄**：衬线排版、宣纸底色、一点朱砂色点缀，宽屏与手机上都不溢出、不喧哗。明暗两套配色，公式用 KaTeX 本地渲染（不依赖任何 CDN，国内访问也稳）。

---

## 网址在哪里

- **线上地址（已上线）**：<https://mysteriousamateurplayer.github.io/Parlour/>
  ⚠️ 路径**区分大小写**：`/Parlour/` 大写 P 才对，写成 `/parlour/` 会看到 GitHub 的
  「There isn't a GitHub Pages site here」。分享时从浏览器地址栏复制最稳妥。
- **本地预览**：`http://localhost:1313/`
  启动方式：双击 `D:\个人网站\start.bat`，或 `cd D:\个人网站` 后运行 `.\start.bat`。
  服务起来之前这个网址打不开——`localhost` 是"本机"的意思。
- **上线/排错**：见 **[上线指南.md](上线指南.md)**（含国内网络受限的处理办法）。

## 两件事，两个指南

| 你想做什么 | 看哪份 |
| --- | --- |
| **写文章 / 改文案 / 传照片（不会写代码也能用）** | 双击 **`写作台.bat`** —— 浏览器里填表写字，一键发布 |
| **改首页、板块介绍页、联系方式** | 写作台 → **🏠 站点设置** |
| **改板块名字/顺序、增删板块** | 写作台 → **🗂 板块管理** |
| 想了解每种写法 | **[写作指南.md](写作指南.md)**（写作台 / 网页后台 / VS Code） |
| 让网站有个真正的公网网址、给朋友看 | **[上线指南.md](上线指南.md)**（已上线：见下方「网址在哪里」） |
| 国内网络打不开 github.com / 推送失败 | **[上线指南.md](上线指南.md)** 里的「★ 国内网络受限怎么办」一节 |
| 只想在本地看看效果 | 双击 `start.bat` |
| 改完了推到线上 | 双击 `push.bat`（走 SSH 443，失败自动重试） |

> 写作有两条路，可以混着用：
> **① 网页后台**（[Pages CMS](https://app.pagescms.org)，用 GitHub 登录，手机上也能写，配置在 `.pages.yml`）；
> **② 本地 VS Code**（打开 `D:\个人网站`，按 `Ctrl+Shift+B` 就有本地预览，带写作片段和快捷键）。

---

## 现在有什么

| 板块 | 地址 | 内容形态 |
| --- | --- | --- |
| 自我介绍 | `/about/` | 左右两栏：照片 / 速览 / 联系方式 + 长文 |
| 二次同人创作 | `/fanworks/` | 卡片墙 + 标签筛选（小说、插画、长评……） |
| 数学分享 | `/math/` | 带目录的长文，KaTeX 公式、定理框、证明框 |
| 园艺记录 | `/garden/` | 按年份分组的年表 |
| 烹饪食谱 | `/kitchen/` | 食材分组 + 步骤卡片 + schema.org 结构化数据 |
| 里版 | `/vault/` | 解谜门禁，答对才显示里面内容 |

首页第一屏是**高悬的太阳**（姓名与简介就在太阳盘面上，古典的锥形 + 火焰光芒），太阳外围绕着一圈星星（星轨）；下缘露出**很大的地球的上沿**。往下拉，同一颗地球完整展开成**可旋转的地球仪**：球面有真实海岸线（七大洲轮廓）+ 柔和渐变的拼图式片区，片区里是各板块的图标，点击进入（空位留给以后新增的板块）。整体保持纸色 + 棕色线稿的星图质感；再往下是 关于我 → 板块卡片 → 最近的记录。里版入口是星野里那颗**只多一颗小卫星**的星星，点击弹出问答。

---

## 快速开始

> **先看这一条**：本仓库的视频/脚本命令有两种写法。
> Windows 自带的 PowerShell 叫 **`powershell`**（5.1 版）；`pwsh` 是另行安装的 PowerShell 7。
> 下面统一用 `powershell`，你的机器上一定能跑。已经装了 PowerShell 7 的话，把 `powershell -ExecutionPolicy Bypass -File X` 换成 `pwsh X` 即可。

### 0. 最快的方式：双击 `start.bat`

在资源管理器里打开 `D:\个人网站`，双击 **`start.bat`**，等它打印出

```
预览  : http://localhost:1313/
```

然后用浏览器打开 **http://localhost:1313/** 即可。
（那个黑色窗口不要关，关了网站就停了；要停止服务就按 `Ctrl+C` 或直接关窗口。）

命令行里等价于：

```powershell
cd D:\个人网站
.\start.bat
```

### 1. 安装 Hugo

```powershell
# 方式一：下载便携版到本仓库的 .tools/ 下（不需要管理员权限，不改系统环境）
powershell -ExecutionPolicy Bypass -File scripts\install-hugo.ps1

# 方式二：用 winget 装到系统里（需要管理员终端）
winget install --id Hugo.Hugo.Extended -e
```

> 本仓库当前已经在 `.tools/hugo/hugo.exe` 放了一份 Hugo extended v0.166.0（该目录已被 `.gitignore` 忽略）。
> 脚本会优先用它，没有才去找系统 PATH 里的 `hugo`。

### 2. 本地预览

```powershell
cd D:\个人网站

.\start.bat                                              # 最简单，等同于下一行
powershell -ExecutionPolicy Bypass -File scripts\serve.ps1            # 带草稿
powershell -ExecutionPolicy Bypass -File scripts\serve.ps1 -NoDrafts  # 不看草稿
```

看到 `Web Server is available at http://localhost:1313/` 就说明起来了，
在浏览器里打开 **http://localhost:1313/**。

预览时可以用 `?theme=dark` / `?theme=light` 临时切换配色，例如
`http://localhost:1313/?theme=dark`。

### 3. 构建静态文件

```powershell
cd D:\个人网站
.\build.bat                                                  # 等同于下一行
powershell -ExecutionPolicy Bypass -File scripts\build.ps1

node scripts\verify.cjs      # 可选：冒烟测试，检查关键页面是否正常生成
```

产物在 `public/`，整个目录丢到任何静态托管上都能跑。

### 报错怎么办

| 报错 | 原因 | 解决 |
| --- | --- | --- |
| `无法将“pwsh”项识别为 cmdlet` | 你没装 PowerShell 7 | 用 `powershell`，或者直接双击 `start.bat` |
| `无法将“.\start.bat”项识别为 cmdlet` | 当前目录不是站点目录 | 先 `cd D:\个人网站`，或用完整路径 `& "D:\个人网站\start.bat"` |
| `无法加载文件 … 因为在此系统上禁止运行脚本` | 执行策略限制 | 用 `powershell -ExecutionPolicy Bypass -File scripts\serve.ps1`，或双击 `start.bat` |
| 页面打开是空白 / 找不到页面 | 服务还没起来或已经关了 | 看那个黑窗口是否还在运行，是否有 `http://localhost:1313/` |
| 端口被占用 | 1313 已被别的程序用 | `powershell -ExecutionPolicy Bypass -File scripts\serve.ps1 -Port 8080` |

---

## 目录结构

```
上线指南.md                从注册 GitHub 到网站上线的逐步清单（新手先看这个）
写作指南.md                日常怎么改内容：写作台 / 网页后台 / VS Code + front matter 速查
版权与许可.md              字体、图标、第三方代码的授权情况（逐项已核，无版权风险）
写作台.bat                 双击 = 打开本地写作界面（填表写字、插图、板块管理、一键发布）
start.bat                  双击 = 本地预览
build.bat                  双击 = 生成 public/（部署用）
push.bat                   双击 = 把本地改动推到线上（SSH 443，自动重试）
tools/writer/              写作台的代码（只在本机运行，不会发布到网站）
.pages.yml                 网页版写作后台（Pages CMS）的配置
.vscode/                   VS Code 工作区：Ctrl+Shift+B 预览、推荐插件、写作片段
hugo.toml                  站点配置（导航、站点信息、里版答案哈希、渲染选项）
content/
  _index.md                首页（文案主要在 data/home.yaml）
  about/_index.md          自我介绍（layout: profile）
  fanworks/ math/ garden/ kitchen/
  vault/                   里版（private: true）
data/
  home.yaml                首页全部文案：主视觉、关于我、最近记录
  sections.yaml            五个版块的标题 / 编号 / 主色 / 图标 / 介绍
  socials.yaml             页脚与「关于我」里的联系方式
archetypes/                新建文章时的模板（每个板块一份）
themes/map/
  assets/css/main.css      主题样式（设计令牌在最上面，改配色先看这里）
  assets/js/site.js        明暗切换、移动端导航、滚动入场、标签筛选
  layouts/                 模板
  static/vendor/katex/     本地 KaTeX（CSS + JS + 字体）
static/
  favicon.svg              站点图标
  images/                  放照片、封面图
scripts/                   预览 / 构建 / 新建文章 / 生成答案哈希 / 冒烟测试 / 上线体检
```

---

## 日常使用

### 写一篇新文章

```powershell
cd D:\个人网站
powershell -ExecutionPolicy Bypass -File scripts\new.ps1 math    "费马小定理的三种证明"
powershell -ExecutionPolicy Bypass -File scripts\new.ps1 kitchen "葱油拌面"
powershell -ExecutionPolicy Bypass -File scripts\new.ps1 fanworks "新短篇：夏天的最后一天"
powershell -ExecutionPolicy Bypass -File scripts\new.ps1 garden  "九月：换盆记录"
powershell -ExecutionPolicy Bypass -File scripts\new.ps1 vault   "新的废案"
```

会用 `archetypes/` 里对应板块的模板生成文件，`draft: true`，写完把 `draft` 改成 `false` 就会正式出现。

### front matter 字段

所有文章通用：

| 字段 | 说明 |
| --- | --- |
| `title` | 标题 |
| `date` | 日期（列表排序用） |
| `description` | 摘要，显示在卡片和搜索结果里 |
| `tags` | 标签数组，会生成 `/tags/xxx/` 页面 |
| `draft` | `true` 时只在 `-D` 预览下出现 |
| `cover` | 封面图路径，例如 `/images/rose.jpg`；不填则自动用带编号的色块 |
| `toc` | `true` 时宽屏显示右侧目录 |
| `private` | `true` 时不进 sitemap、加 `noindex`（里版用） |

各板块额外字段：

| 板块 | 字段 |
| --- | --- |
| 数学 | `math: true` 才会加载 KaTeX |
| 园艺 | `weather`，会显示在年表标题旁，例如 `"晴，22℃"` |
| 同人 | `source`（原作）、`series`（系列名） |
| 食谱 | `servings` 份量、`prep_time` 准备分钟、`cook_time` 烹饪分钟、`difficulty` 难度、`ingredients` 分组食材、`steps` 步骤数组 |
| 里版 | 必须写 `private: true` |

食谱的 front matter 长这样（步骤写进 `steps`，心得写进正文）：

```yaml
servings: 3
prep_time: 20
cook_time: 110
difficulty: "中等"
ingredients:
  - group: 主料
    items: ["牛腩 700g", "番茄 3 个"]
  - group: 调味
    items: ["生抽 2 大勺"]
steps:
  - "牛腩冷水下锅焯水，撇净浮沫。"
  - "番茄炒出沙，下牛腩翻炒。"
```

### 改首页文案

首页一个字都不用碰模板，全部在 `data/home.yaml`：

```yaml
hero:
  kicker: "PERSONAL SITE · 个人网站"
  name: "MAP"
  tagline: "在算式、花木与灶火之间"
  intro: "你好，我是 MAP。……"
  primary:   { label: "从头认识我", url: "/about/" }
  secondary: { label: "最近的记录", url: "/fanworks/" }
```

版块卡片的标题、编号（壹贰叁肆伍）、主色、图标在 `data/sections.yaml`；
联系方式在 `data/socials.yaml`（`icon` 可选 `mail / github / twitter / bilibili / pixiv / rss / link`）。

想放自己的照片：把竖版照片存成 `static/images/portrait.jpg`，
然后在 `data/home.yaml` 里加一行 `portrait: "/images/portrait.jpg"`。

### 改导航、站点名、配色

- **导航**：不用改代码。顶部导航由 `data/sections.yaml` 里 `nav: true` 的板块自动生成，
  顺序按 `weight` 排。用写作台的 **⚙ 板块管理** 就能改名、调顺序、隐藏某一项，
  或者新增/删除整个板块（首页的卡片墙同理，用 `home: true` 控制）。
- 站点名 / 副标题 / 建站年份：`hugo.toml` 的 `title`、`params.tagline`、`params.since`
- 配色：`themes/map/assets/css/main.css` 顶部的 `:root` 与 `[data-theme="dark"]`
  —— `--bg` 纸色、`--ink` 墨色、`--accent` 朱砂色，改这三个就能换气质
- 版权与素材合规：见 **[版权与许可.md](版权与许可.md)**（字体、图标、第三方代码逐项已核）

---

## 数学公式

在 front matter 写 `math: true`，正文里直接写 LaTeX：

```markdown
行内公式 $e^{i\pi} + 1 = 0$

$$
\int_{-\infty}^{\infty} e^{-x^2}\,\mathrm{d}x = \sqrt{\pi}
$$
```

`$$...$$`、`\[...\]`、`$...$`、`\(...\)` 都会渲染（由 `hugo.toml` 的 passthrough 配置放行）。
KaTeX 已经放在 `themes/map/static/vendor/katex/`，**不需要联网**。

### 自定义短代码

```markdown
{{< note type="tip" title="小提示" >}}内容支持 Markdown{{< /note >}}
{{< note title="注意" >}}type 还可以是 idea / warn{{< /note >}}

{{< theorem title="勾股定理" number="1.2" >}}设直角三角形……{{< /theorem >}}

{{< proof >}}由连分数的基本恒等式……{{< /proof >}}
```

---

## 里版与解谜

### 它现在怎么工作

1. 访客打开 `/vault/`，看到的是一张门禁卡片：一道题 + 一个输入框。
2. 输入的答案在浏览器里做 SHA-256，与页面上的哈希比对。
3. 答对后，底下原本隐藏的内容（`data-vault-content`）显示出来，并在 `sessionStorage` 里记一个标记——同一个标签页内不再重复提问。
4. 答案本身**不会**出现在 HTML 里，只出现它的哈希。
5. `/vault/` 及其中所有文章都带 `noindex`，不进 sitemap，`robots.txt` 也屏蔽了它。

默认答案就是网站主人的名字（三个大写字母，页面上到处都是提示）。

### 换题目和答案

```powershell
powershell -ExecutionPolicy Bypass -File scripts\hash-answer.ps1 "你的新答案"
# 输出一行 64 位十六进制哈希
```

把这串哈希填到 `hugo.toml` 的 `params.vault.answerHash`（全局），
或 `content/vault/_index.md` 的 `gate.hash`（只覆盖里版首页）。
题目、提示、输入框占位符也都在同一个 `gate:` 段里改。

> 哈希的规范化方式与前端一致：去掉所有空白字符 → 转大写 → UTF-8 → SHA-256。
> 大小写和空格不影响判定，所以答案是"中文句子"也完全可以。

### ⚠️ 这是软门禁，不是保险柜

静态网站的 HTML 是公开的。门禁只能挡住"随手点进来的人"和搜索引擎，
**挡不住查看网页源码的人**——`/vault/xxx/` 这些地址只要被猜到或被抓取，内容就能直接读到。
所以里版适合放"还没准备好公开、但漏出去也不致命"的东西（废案、草稿、设定笔记）。

### 想要真正保密，三选一

1. **不发布**：里版内容只留在本地仓库，或放到另一个私有仓库/分支，构建时排除。
   （在 `hugo.toml` 里加 `ignoreFiles = ["content/vault/.*"]` 之类，配合删掉 vault 的导航入口。）
2. **构建时加密**：用 [staticrypt](https://github.com/robinmoisson/staticrypt) 之类的工具
   把 `public/vault/**` 用口令加密成一段 AES 密文，访问者必须输入口令才能解密。
   这一步可以放在 `scripts/build.ps1` 之后跑，口令不会进仓库：
   ```powershell
   npx staticrypt public/vault/index.html -p "你的口令" -d public/vault --recursive
   ```
3. **放到需要鉴权的托管上**：Cloudflare Access、Netlify Identity、Vercel 密码保护，
   或者干脆用一台能配 HTTP Basic Auth 的服务器托管 `/vault/`。

第三种最安全也最省事；第二种体验最接近"解谜"。

---

## 部署

> **新手请直接看 [上线指南.md](上线指南.md)**：那里是从注册 GitHub 账号、建仓库、推代码、
> 开启 Pages 到排错的逐步清单。下面只是各平台的参数速查。
>
> 关于 `baseURL`：`.github/workflows/hugo.yml` 里已经用 `actions/configure-pages`
> 自动把网址设成你的实际地址，所以**一般不需要手工改** `hugo.toml` 的 `baseURL`。
> 它只影响本机构建出来的绝对链接。

### GitHub Pages（仓库里已经准备好工作流）

1. 把仓库推到 GitHub。
2. 仓库 **Settings → Pages → Build and deployment → Source** 选 **GitHub Actions**。
3. 推送到 `main` 就会自动构建并发布（见 `.github/workflows/hugo.yml`）。

如果站点地址是 `https://<用户名>.github.io/<仓库名>/`，
`baseURL` 必须写成带子路径的形式（**结尾要带斜杠**）：

```toml
baseURL = "https://your-name.github.io/my-site/"
```

### Cloudflare Pages / Netlify / Vercel

- 构建命令：`hugo --minify --gc`
- 输出目录：`public`
- 环境变量：`HUGO_VERSION = 0.166.0`（必须是 extended 版，否则 `resources.Concat`/SCSS 之类会报错）

### 自定义域名

在域名服务商处把 CNAME 指到托管平台，再在平台里绑定域名，
最后把 `baseURL` 改成 `https://你的域名/`。因为主题里的链接全部走相对路径，换域名只需要改这一行。

### 上线之后：跑一次体检

拿到公网网址后，用这个脚本逐个检查首页、版块、文章、RSS、站点地图、KaTeX 字体，
以及新手最容易踩的「CSS/JS 404 导致页面没样式」：

```powershell
node scripts\check-live.cjs https://你的用户名.github.io/仓库名/
```

---

## 质量检查

```powershell
cd D:\个人网站
.\build.bat          # 构建 + 自动跑「链接体检」和「编辑器同步检查」
node scripts\verify.cjs
```

四个脚本各管一件事，改完东西跑一遍就够：

| 脚本 | 检查什么 | 什么时候跑 |
| --- | --- | --- |
| `check-links.cjs` | 每个页面里的站内链接能不能真的打开（专抓漏了 `/仓库名/` 前缀 → 点开 404） | 每次改模板/加链接后（`build.bat` 已自动包含） |
| `verify-editor-sync.cjs` | 模板要用的文章字段，写作台里能不能填（防止"网站改了、编辑器失效"） | 每次改模板或改写作台字段后（`build.bat` 已自动包含） |
| `verify.cjs` | 站点冒烟测试：首页、各板块列表、文章、KaTeX、食谱结构化数据、sitemap 等 | 改模板/内容后 |
| `verify-writer.cjs` | 写作台保存文章时会不会弄丢字段（拿 `content/` 里所有文章做往返比对） | 改写作台的 YAML 处理时 |

> 在线版本：`node scripts\check-links.cjs https://mysteriousamateurplayer.github.io/Parlour/`
> 会把线上页面的链接逐个请求一遍，确认部署后真的都能点开。

---

## 已验证的事情

本次搭建完成后逐项确认过：

- `hugo --gc` 构建 0 警告 0 错误，产出 81 个页面；
- 首页、五个版块列表页、文章页、标签页、系列页、404、RSS、sitemap、robots 全部正常生成；
- 明暗两套配色都渲染正常，首屏无闪白；
- KaTeX 公式、定理框、证明框、目录、表格渲染正常，且非数学页不加载 KaTeX；
- 食谱页的 schema.org Recipe 结构化数据可被 JSON 解析；
- 用无头浏览器实测 10 个页面 × 320px / 390px 两种窄屏，**没有横向溢出**；
- 开启了 `prefers-reduced-motion` 的用户不会看到入场动画，内容直接可见；
- `start.bat` / `build.bat` 在 cmd 下实测可用，`scripts\*.ps1` 在 **Windows PowerShell 5.1**
  与 PowerShell 7 下都实测可跑（脚本存为 UTF-8 with BOM，5.1 才能正确解析中文；
  `.bat` 则刻意只用 ASCII，因为 cmd 按字节偏移读批处理，中途切代码页会把后面的行读错位）。
- `.pages.yml`（网页后台配置）已用 Hugo 的 YAML 解析器验证：5 个内容集合 + 1 个设置分组，
  字段数与预期一致；`.vscode/` 下 4 个配置文件已校验为合法 JSONC，任务依赖关系与
  `Ctrl+Shift+B` 默认任务都已确认。
- **已实际部署到 GitHub Pages 并通过线上体检**（24 项全过）：首页、五个版块列表、
  一篇文章、一份食谱、标签页、里版入口、RSS、robots、sitemap 全部 200；
  CSS/JS/KaTeX 字体与公式均正常加载；canonical 与实际网址一致；sitemap 已排除里版；
  线上首页截图与本地渲染一致。

（本次验收过程的截图留在 `.tools/shots/`，该目录已被 git 忽略，可以随时删。）

## 下一步可以加

- **站内搜索**：Hugo 的 `outputs` 加一个 JSON 索引，再写十几行前端即可，不需要后端。
- **评论**：giscus / Waline（都支持 GitHub 登录，静态站点友好）。
- **里版真正加密**：现在是软门禁；要做成"输口令才能解密"的话，可以用 staticrypt 之类的
  构建后处理，口令不进仓库。
- **图片处理**：把原图放进 `assets/`，用 `{{ $img := resources.Get "x.jpg" }}` 自动生成多尺寸 WebP。
- **多语言**：`content/en/` + `i18n/`，主题里的界面文字目前是中文硬编码。
- **阅读时长 / 字数**：`.WordCount`、`.ReadingTime` 直接可用，加进 `partials/article-foot.html` 即可。

---

## 关于 `.tools/` 目录

这个目录放的是本地工具链和验收截图，**已被 `.gitignore` 忽略**，不会进版本库：

```
.tools/hugo/hugo.exe    便携版 Hugo extended（scripts/serve.ps1 会优先用它）
.tools/shots/           搭建时的验收截图
```

想彻底删掉它也没问题，只要系统里装了 Hugo，一切照常。
