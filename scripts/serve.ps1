# 本地预览：优先使用工作区里的便携版 Hugo（.tools/hugo/hugo.exe），
# 没有就退回系统 PATH 里的 hugo。
#
# 用法：
#   pwsh scripts/serve.ps1              # 默认带草稿
#   pwsh scripts/serve.ps1 -NoDrafts    # 不看草稿
#   pwsh scripts/serve.ps1 -Port 8080

param(
  [switch]$NoDrafts,
  [int]$Port = 1313
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot

$local = Join-Path $root '.tools\hugo\hugo.exe'
if (Test-Path $local) {
  $hugo = $local
} else {
  $cmd = Get-Command hugo -ErrorAction SilentlyContinue
  if (-not $cmd) {
    Write-Host "找不到 Hugo。请先安装（见 README.md），或运行 scripts/install-hugo.ps1 下载便携版。" -ForegroundColor Red
    exit 1
  }
  $hugo = $cmd.Source
}

# 本地预览的地址要和线上保持一致：baseURL 里带 /仓库名/ 时，本地也挂在同一个子路径下，
# 否则页面里的资源（/仓库名/css/...）会 404。
$basePath = '/'
$cfg = Join-Path $root 'hugo.toml'
if (Test-Path $cfg) {
  $m = Select-String -Path $cfg -Pattern '^\s*baseURL\s*=\s*"([^"]+)"' | Select-Object -First 1
  if ($m) {
    try {
      $uri = [System.Uri]$m.Matches[0].Groups[1].Value
      if ($uri.AbsolutePath) { $basePath = $uri.AbsolutePath }
    } catch { }
  }
}
$previewUrl = "http://localhost:$Port$basePath"

$hugoArgs = @(
  'server',
  '--source', $root,
  '--port', $Port,
  '--navigateToChanged',
  '--disableFastRender'
)
if (-not $NoDrafts) { $hugoArgs += @('--buildDrafts', '--buildFuture') }

Write-Host "Hugo  : $hugo" -ForegroundColor Cyan
Write-Host "预览  : $previewUrl" -ForegroundColor Cyan
Write-Host ""

& $hugo @hugoArgs
