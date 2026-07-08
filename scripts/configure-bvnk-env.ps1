# Writes BVNK sandbox credentials from portal into .env (interactive).

$ErrorActionPreference = "Stop"

$envPath = Join-Path (Split-Path $PSScriptRoot -Parent) ".env"
if (-not (Test-Path $envPath)) {
  Write-Error ".env not found at $envPath"
}

function Read-Secret([string]$label) {
  $value = Read-Host $label
  return $value.Trim()
}

Write-Host "BVNK Sandbox -> ScaleSystems .env linker" -ForegroundColor Cyan
Write-Host "Paste values from BVNK Portal (Integrations -> API Keys / Webhooks / Wallets)." -ForegroundColor DarkGray
Write-Host ""

$hawkId = Read-Secret "Hawk Auth ID"
$hawkKey = Read-Secret "Hawk Auth Key (secret)"
$walletId = Read-Secret "Wallet ID (walletId for pay/summary)"
$merchantId = Read-Secret "Merchant ID (optional, press Enter to skip)"
$webhookSecret = Read-Secret "Webhook signing secret"

if ([string]::IsNullOrWhiteSpace($hawkId) -or [string]::IsNullOrWhiteSpace($hawkKey) -or [string]::IsNullOrWhiteSpace($walletId) -or [string]::IsNullOrWhiteSpace($webhookSecret)) {
  Write-Error "Hawk Auth ID, Hawk Auth Key, Wallet ID, and Webhook secret are required."
}

$content = Get-Content $envPath -Raw

function Set-EnvLine([string]$key, [string]$value) {
  $script:content = $script:content -replace "(?m)^$key=.*$", "$key=`"$value`""
}

Set-EnvLine "BVNK_HAWK_AUTH_ID" $hawkId
Set-EnvLine "BVNK_HAWK_AUTH_KEY" $hawkKey
Set-EnvLine "BVNK_API_KEY" $hawkId
Set-EnvLine "BVNK_API_SECRET" $hawkKey
Set-EnvLine "BVNK_WALLET_ID" $walletId
Set-EnvLine "BVNK_WEBHOOK_SECRET" $webhookSecret
Set-EnvLine "BVNK_API_BASE_URL" "https://api.sandbox.bvnk.com"

if (-not [string]::IsNullOrWhiteSpace($merchantId)) {
  Set-EnvLine "BVNK_MERCHANT_ID" $merchantId
}

Set-Content -Path $envPath -Value $content.TrimEnd() -NoNewline
Add-Content -Path $envPath -Value ""

Write-Host ""
Write-Host "BVNK credentials saved to .env" -ForegroundColor Green
Write-Host "Next: npm run bvnk:verify" -ForegroundColor Yellow
