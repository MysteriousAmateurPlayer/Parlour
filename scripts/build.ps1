# 生成静态站点到 public/，并自动做两项自检
#
# 用法：
#   .\build.bat                       （双击也行）
#   powershell -ExecutionPolicy Bypass -File scripts\build.ps1

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot

$local = Join-Path $root '.tools\hugo\hugo.exe'
if (Test-Path $local) {
  $hugo = $local
} else {
  $cmd = Get-Command hugo -ErrorAction SilentlyContinue
  if (-not $cmd) {
    Write-Host "找不到 Hugo，请先安装（见 README.md）。" -ForegroundColor Red
    exit 1
  }
  $hugo = $cmd.Source
}

Set-Location $root
& $hugo --source $root --minify --gc --cleanDestinationDir
if ($LASTEXITCODE -ne 0) {
  Write-Host ""
  Write-Host "构建失败，上面就是原因。把报错发我。" -ForegroundColor Red
  exit 1
}

# ---------- 自检 ----------
$node = Get-Command node -ErrorAction SilentlyContinue
if (-not $node) {
  Write-Host ""
  Write-Host "完成。静态文件在 public/ 目录。（没装 Node.js，跳过自检）" -ForegroundColor Cyan
  exit 0
}

Write-Host ""
Write-Host "--- 自检 1/2：站内链接 ----------" -ForegroundColor DarkGray
& node "scripts\check-links.cjs"
$linksOk = ($LASTEXITCODE -eq 0)

Write-Host ""
Write-Host "--- 自检 2/2：编辑器同步 ----------" -ForegroundColor DarkGray
& node "scripts\verify-editor-sync.cjs"
$syncOk = ($LASTEXITCODE -eq 0)

Write-Host ""
if ($linksOk -and $syncOk) {
  Write-Host "全部通过：构建成功，链接都能打开，编辑器字段与模板一致。" -ForegroundColor Green
  Write-Host "静态文件在 public/ 目录。" -ForegroundColor Cyan
} else {
  Write-Host "构建成功，但自检发现问题（见上）：" -ForegroundColor Yellow
  if (-not $linksOk) { Write-Host "  · 有链接点开会 404" -ForegroundColor Yellow }
  if (-not $syncOk) { Write-Host "  · 有字段模板要用、但写作台填不了" -ForegroundColor Yellow }
  Write-Host "  不影响本地预览；发布前最好修掉，或把上面的输出发我。" -ForegroundColor Yellow
}
