# 下载便携版 Hugo（extended）到 .tools/hugo/，不需要管理员权限，也不改动系统环境。
#
# 用法：
#   pwsh scripts/install-hugo.ps1                 # 安装最新版
#   pwsh scripts/install-hugo.ps1 -Version 0.166.0
#
# 如果想让 hugo 命令全局可用，推荐改用 winget：
#   winget install --id Hugo.Hugo.Extended -e

param(
  [string]$Version = "latest"
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$tools = Join-Path $root '.tools'
$target = Join-Path $tools 'hugo'
$zip = Join-Path $tools 'hugo.zip'

New-Item -ItemType Directory -Force -Path $tools | Out-Null

function Get-ReleaseTag {
  $api = if ($Version -eq 'latest') {
    'https://api.github.com/repos/gohugoio/hugo/releases/latest'
  } else {
    "https://api.github.com/repos/gohugoio/hugo/releases/tags/v$Version"
  }
  $json = Invoke-RestMethod -Uri $api -Headers @{ 'User-Agent' = 'map-site-setup' }
  return $json.tag_name
}

$tag = Get-ReleaseTag
$ver = $tag.TrimStart('v')
$url = "https://github.com/gohugoio/hugo/releases/download/$tag/hugo_extended_${ver}_windows-amd64.zip"

Write-Host "准备下载：$url" -ForegroundColor Cyan
Invoke-WebRequest -Uri $url -OutFile $zip -UseBasicParsing

if (Test-Path $target) { Remove-Item $target -Recurse -Force }
New-Item -ItemType Directory -Force -Path $target | Out-Null

# Windows 自带 tar（bsdtar）可以直接解压 zip
tar.exe -xf $zip -C $target
Remove-Item $zip -Force

& (Join-Path $target 'hugo.exe') version
Write-Host ""
Write-Host "完成。之后用 pwsh scripts/serve.ps1 预览。" -ForegroundColor Green
