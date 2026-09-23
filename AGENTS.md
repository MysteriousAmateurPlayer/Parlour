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
