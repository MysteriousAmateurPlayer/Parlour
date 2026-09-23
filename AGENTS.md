# 协作约定（给 AI 助手 / 未来会话）

本文件不在 Hugo 的发布范围内（Hugo 只处理 `content/`、`layouts/`、`static/`、`assets/` 等），
因此可以安全地在这里记录操作规范。

## ⛔ 绝对禁止：按"进程名"批量结束进程

**事故记录（2026-09-23）**：为了清理截图用的无头浏览器，助手多次执行了

```powershell
Get-Process msedge -ErrorAction SilentlyContinue | Stop-Process -Force
Get-Process hugo,msedge -ErrorAction SilentlyContinue | Stop-Process -Force
```

`msedge.exe` 这个进程名**同时**包含"助手启动的无头测试实例"和"用户正在使用的浏览器窗口"，
因此上述命令会**把用户正在浏览的 Edge 窗口一起关掉** —— 表现为"浏览器莫名关闭"。
同理，`Get-Process node | Stop-Process` 会误杀工具链自身（已发生过一次）。

### 正确做法

1. **只按 PID 关闭自己启动的进程**：启动时记下 PID，用完精确结束：

   ```powershell
   $p = Start-Process -FilePath $edge -ArgumentList @('--headless=new', ...) -PassThru
   # 用完后：
   Stop-Process -Id $p.Id -Force -ErrorAction SilentlyContinue
   ```

2. **无头截图/抓取一律使用 `--headless=new` + 独立的 `--user-data-dir`**，
   并且不要在其它地方按名字清理它们（无头实例通常自行退出）。
3. **确实需要兜底清理时，必须先按命令行过滤**，只结束带 `--headless`
   或本项目临时配置目录的进程：

   ```powershell
   Get-CimInstance Win32_Process -Filter "Name='msedge.exe'" |
     Where-Object { $_.CommandLine -match '--headless' -or $_.CommandLine -match 'edge-shot-' } |
     ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
   ```

4. **结束进程时不要连带杀掉 `node` / `pwsh` / `powershell` / DSH 自身的进程**。
5. 临时浏览器配置目录用完即删：项目内 `.tools/edge-shot-*`。

## 本地服务端口约定

- **1313**：本地预览（`scripts/serve.ps1`，用 `hugo server`，会写入 `public/`）。
  助手做静态构建前应**先停掉它**，否则删 `public/` 会让预览服务器的资源 404。
- **8899**：助手临时用的轻量静态服务器（`.tools/mini-server.cjs`），
  用完必须按端口精确关闭：
  `Get-NetTCPConnection -LocalPort 8899 -State Listen` → `Stop-Process -Id <PID>`。

## 发布流程（不要跳步）

1. 先停 `hugo server`（避免资源 404）→ 删 `public/`、`resources/` → `hugo --source . --minify --gc`
2. 跑自检：`scripts/check-links.cjs`、`verify.cjs`、`verify-editor-sync.cjs`、
   `verify-writer.cjs`、`verify-site-settings.cjs`
3. 提交后用 `push.bat` 推送（它自带 SSH 443 通道设置；**不要**直接 `git push`）
4. 用 `.tools/gh-status.cjs` 看 Actions，`scripts/check-live.cjs` 体检线上
5. 最后恢复 `localhost:1313` 预览

## ⛔ 禁止用"全局通配 + 显隐切换"做兜底（事故记录 2026-09-23）

为了让"样式表尚未就绪"这个极小概率的瞬间不出现满屏巨大 SVG，助手在 `<head>` 里加过一段兜底：

```css
:where(html:not(.css-ready)) svg { display: none; }
```

后果极其严重：**顶栏的徽标与导航图标本身就是 SVG**，于是样式表就绪前整条顶栏消失/闪烁；
再叠加"用 setInterval 轮询探测样式是否就绪"，造成整页反复重算样式，滚动时元素若隐若现。
最后只能整段删除。

### 由此确立的规则

1. **不要用通配选择器（`svg`、`*`、`img` …）配合显隐切换做兜底** —— 它必然误伤全局元素
   （顶栏徽标、导航图标、页脚印章……）。
2. **不要为了"极小概率的观感问题"引入全局状态开关**（如 `html.css-ready`）。
   宁可接受那一下朴素渲染，也不要为了它换来持续性的渲染 bug。
3. **不要用 `setInterval` 轮询页面状态**；需要等待就用事件（`load` / `DOMContentLoaded` /
   `link.sheet`），且只做一次性判断。
4. **不要随意给大范围元素加合成层/裁剪**（`translateZ(0)`、`will-change`、`contain: paint`），
   它们在滚动时容易造成重绘不同步、元素若隐若现；确需使用必须实测滚动。
5. 凡改动 `<head>`、全局 CSS、或涉及 `position: fixed/sticky` 的元素，
   **必须同时验证顶栏与页脚在所有页面上的表现**（至少首页 + 一个子页 + 关于页）。
6. 改动后**要从构建产物反查规则确实生效**（源文件改了不代表产物里有；
   历史上已多次出现"替换静默失败但以为成功了"）。
