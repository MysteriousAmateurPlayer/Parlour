# 推送代码到 GitHub —— 走 ssh.github.com:443，专治 github.com 被干扰
#
# 用法：
#   powershell -ExecutionPolicy Bypass -File scripts\push.ps1
#   或直接双击 push.bat
#
# 它会：① 检查 SSH 通道 ② 自动提交未提交的改动 ③ 推送（失败自动重试）

param(
  [int]$Retries = 5,
  [int]$DelaySeconds = 6
)

$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

function Say($msg, $color = 'Gray') { Write-Host $msg -ForegroundColor $color }

Write-Host ""
Write-Host "============================================================" -ForegroundColor DarkGray
Write-Host "  推送到 GitHub" -ForegroundColor White
Write-Host "============================================================" -ForegroundColor DarkGray

if (-not (Test-Path (Join-Path $root '.git'))) {
  Say "这里不是 git 仓库，请确认脚本在 D:\个人网站 里。" Red
  exit 1
}

$remote = (git remote get-url origin 2>$null)
if (-not $remote) {
  Say "还没配置远程仓库。先执行：" Red
  Say '  git remote add origin git@github.com:MysteriousAmateurPlayer/Parlour.git' Yellow
  exit 1
}
Say "远程仓库：$remote" Cyan

# ---------- 1. SSH 通道 ----------
Say "`n[1/3] 检查 SSH 通道（github.com → ssh.github.com:443）..." White
$test = (ssh -T -o BatchMode=yes -o ConnectTimeout=15 git@github.com 2>&1 | Out-String)

if ($test -match 'successfully authenticated') {
  Say "  通道正常，密钥已注册 ✓" Green
}
elseif ($test -match 'Permission denied') {
  Say "  通道是通的，但这台电脑的 SSH 公钥还没加到你的 GitHub 账号。" Yellow
  Say "`n  请把下面这串公钥贴到 https://github.com/settings/keys" Yellow
  Say "  （New SSH key → Title 随便写 → Key 里粘贴 → Add SSH key）`n" Yellow
  Get-Content (Join-Path $env:USERPROFILE '.ssh\id_ed25519.pub') | ForEach-Object { Write-Host "  $_" -ForegroundColor White }
  Say "`n  如果 github.com 打不开：多刷新几次、换手机热点、或用手机浏览器登录后操作。" Yellow
  Say "  加好密钥后，重新运行本脚本即可。" Yellow
  exit 2
}
else {
  Say "  SSH 通道也不通，输出如下：" Red
  Write-Host $test
  Say "  可改用保底方案：见 上线指南.md 的「网络受限」一节。" Yellow
  exit 3
}

# ---------- 2. 提交本地改动 ----------
$dirty = git status --porcelain
if ($dirty) {
  Say "`n[2/3] 发现未提交的改动，先自动提交..." White
  git add -A
  $msg = "更新内容 " + (Get-Date -Format 'yyyy-MM-dd HH:mm')
  git commit -q -m $msg
  Say "  已提交：$msg" Green
} else {
  Say "`n[2/3] 没有未提交的改动，直接推送。" White
}

# ---------- 3. 推送（带重试） ----------
Say "`n[3/3] 推送到 GitHub（最多 $Retries 次，每次间隔 $DelaySeconds 秒）..." White
for ($i = 1; $i -le $Retries; $i++) {
  Say "  第 $i 次..." DarkGray
  $out = (git push -u origin HEAD 2>&1 | Out-String)
  if ($LASTEXITCODE -eq 0) {
    Say "`n推送成功 ✓" Green
    Say "去这里看自动部署进度（绿色勾 = 网站已更新）：" Cyan
    Say "  https://github.com/MysteriousAmateurPlayer/Parlour/actions" Cyan
    Say "`n网站地址：https://mysteriousamateurplayer.github.io/Parlour/" Cyan
    exit 0
  }
  if ($out -match 'Repository not found|repository not found') {
    Say "  仓库还不存在。请先在 GitHub 上新建名为 Parlour 的公开仓库。" Red
    exit 4
  }
  $tail = ($out.Trim() -split "`n")[-1]
  Say "  失败：$tail" Yellow
  if ($i -lt $Retries) { Start-Sleep -Seconds $DelaySeconds }
}

Say "`n多次重试仍然失败。把上面的输出整段发我。" Red
exit 1
