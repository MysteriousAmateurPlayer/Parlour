# 新建一篇文章
#
# 用法：
#   pwsh scripts/new.ps1 math "费马小定理的三种证明"
#   pwsh scripts/new.ps1 kitchen "葱油拌面"
#   pwsh scripts/new.ps1 fanworks "新短篇"
#   pwsh scripts/new.ps1 garden "九月：换盆记录"
#   pwsh scripts/new.ps1 vault "新的废案"
#
# 文件名会自动用「-」连接；板块对应 archetypes/ 下的同名模板。

param(
  [Parameter(Mandatory = $true, Position = 0)]
  [ValidateSet('fanworks', 'math', 'garden', 'kitchen', 'vault')]
  [string]$Section,

  [Parameter(Mandatory = $true, Position = 1)]
  [string]$Title
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot

$local = Join-Path $root '.tools\hugo\hugo.exe'
if (Test-Path $local) { $hugo = $local } else { $hugo = (Get-Command hugo).Source }

$slug = ($Title -replace '\s+', '-') -replace '[\\/:*?"<>|]', ''
& $hugo new content "$Section/$slug.md" --source $root --kind page
