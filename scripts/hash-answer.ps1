# 生成解谜答案的 SHA-256（与 themes/map/assets/js/vault-gate.js 的规范化方式一致：
#   去掉所有空白字符 → 转大写 → UTF-8 → SHA-256 → 小写十六进制）
#
# 用法：
#   pwsh scripts/hash-answer.ps1 "MAP"
#   然后把这串哈希填到 hugo.toml 的 params.vault.answerHash，
#   或 content/vault/_index.md 的 gate.hash

param(
  [Parameter(Mandatory = $true, Position = 0)]
  [string]$Answer
)

$normalized = ($Answer -replace '\s', '').ToUpperInvariant()
$bytes = [System.Text.Encoding]::UTF8.GetBytes($normalized)
$sha = [System.Security.Cryptography.SHA256]::Create()
$hash = ($sha.ComputeHash($bytes) | ForEach-Object { $_.ToString('x2') }) -join ''

Write-Host ""
Write-Host "输入答案      : $Answer"
Write-Host "规范化之后    : $normalized"
Write-Host "SHA-256       : $hash"
Write-Host ""
Write-Host "把上面这串哈希填到 hugo.toml 的 params.vault.answerHash 即可。" -ForegroundColor Cyan
