# BVNK has no official CLI. This script validates sandbox env vars and prints portal setup steps.

$ErrorActionPreference = "Stop"

$envPath = Join-Path (Split-Path $PSScriptRoot -Parent) ".env"
if (-not (Test-Path $envPath)) {
  Write-Error ".env not found."
}

function Get-EnvValue([string]$key) {
  $line = Select-String -Path $envPath -Pattern "^$key=" | Select-Object -First 1
  if (-not $line) { return "" }
  return ($line.Line -replace "^$key=", "").Trim('"')
}

$hawkId = Get-EnvValue "BVNK_HAWK_AUTH_ID"
if ([string]::IsNullOrWhiteSpace($hawkId)) { $hawkId = Get-EnvValue "BVNK_API_KEY" }
$hawkKey = Get-EnvValue "BVNK_HAWK_AUTH_KEY"
if ([string]::IsNullOrWhiteSpace($hawkKey)) { $hawkKey = Get-EnvValue "BVNK_API_SECRET" }
$walletId = Get-EnvValue "BVNK_WALLET_ID"
$merchantId = Get-EnvValue "BVNK_MERCHANT_ID"
$webhookSecret = Get-EnvValue "BVNK_WEBHOOK_SECRET"
$baseUrl = Get-EnvValue "BVNK_API_BASE_URL"

Write-Host "BVNK Sandbox Setup Checklist" -ForegroundColor Cyan
Write-Host ""

$missing = @()
if ($hawkId -match "placeholder" -or [string]::IsNullOrWhiteSpace($hawkId)) { $missing += "BVNK_HAWK_AUTH_ID" }
if ($hawkKey -match "placeholder" -or [string]::IsNullOrWhiteSpace($hawkKey)) { $missing += "BVNK_HAWK_AUTH_KEY" }
if ($walletId -match "placeholder" -or [string]::IsNullOrWhiteSpace($walletId)) { $missing += "BVNK_WALLET_ID" }
if ($merchantId -match "placeholder" -or [string]::IsNullOrWhiteSpace($merchantId)) { $missing += "BVNK_MERCHANT_ID (optional)" }
if ($webhookSecret -match "placeholder" -or [string]::IsNullOrWhiteSpace($webhookSecret)) { $missing += "BVNK_WEBHOOK_SECRET" }

if ($missing.Count -gt 0) {
  Write-Host "Missing or placeholder values:" -ForegroundColor Yellow
  $missing | ForEach-Object { Write-Host "  - $_" }
  Write-Host ""
  Write-Host "1) Create sandbox account:" -ForegroundColor White
  Write-Host "   https://signup.sandbox.bvnk.com/create-dev-account"
  Write-Host "2) In BVNK Portal -> Integrations -> API Keys -> Hawk Auth ID + Key"
  Write-Host "3) Copy Wallet ID from Wallets section into BVNK_WALLET_ID"
  Write-Host "4) Run: npm run bvnk:configure"
  Write-Host "   URL: http://localhost:3000/api/webhooks/bvnk (use ngrok for external tests)"
  Write-Host "   Events: payment/checkout completion events"
  Write-Host "5) Copy webhook secret into BVNK_WEBHOOK_SECRET"
} else {
  Write-Host "BVNK env vars are populated." -ForegroundColor Green
}

Write-Host ""
Write-Host "API base URL: $baseUrl" -ForegroundColor DarkGray
Write-Host "Webhook route: /api/webhooks/bvnk" -ForegroundColor DarkGray
