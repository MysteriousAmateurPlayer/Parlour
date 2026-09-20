# 生成静态站点到 public/（用于部署）
#
# 用法：
#   pwsh scripts/build.ps1

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

& $hugo --source $root --minify --gc --cleanDestinationDir

Write-Host ""
Write-Host "完成。静态文件在 public/ 目录。" -ForegroundColor Cyan
