# Creates ScaleSystems Premium product + $49/mo price in your Stripe sandbox.
# Run after: npm run stripe:login

$ErrorActionPreference = "Stop"

$env:Path = [System.Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path", "User")

function Get-StripeId {
  param([string]$Json, [string]$Field)
  if ($Json -match "`"$Field`"\s*:\s*`"([^`"]+)`"") {
    return $Matches[1]
  }
  return $null
}

Write-Host "Creating ScaleSystems Premium product..." -ForegroundColor Cyan
$productRaw = stripe products create `
  --name "ScaleSystems Premium" `
  --description "Premium agent tier - unlimited agents and compute"

$productId = Get-StripeId -Json $productRaw -Field "id"
if (-not $productId) {
  Write-Error "Failed to create Stripe product. Raw output:`n$productRaw"
}

Write-Host "Creating monthly price ($49.00 USD)..." -ForegroundColor Cyan
$priceRaw = stripe prices create `
  --currency usd `
  --unit-amount 4900 `
  -d "recurring[interval]=month" `
  -d "product=$productId"

$priceId = Get-StripeId -Json $priceRaw -Field "id"
if (-not $priceId) {
  Write-Error "Failed to create Stripe price. Raw output:`n$priceRaw"
}

$envPath = Join-Path (Split-Path $PSScriptRoot -Parent) ".env"
if (-not (Test-Path $envPath)) {
  Write-Error ".env file not found at $envPath"
}

$content = Get-Content $envPath -Raw
$content = $content -replace 'STRIPE_PREMIUM_PRICE_ID="[^"]*"', "STRIPE_PREMIUM_PRICE_ID=`"$priceId`""
$content = $content -replace 'NEXT_PUBLIC_STRIPE_PREMIUM_PRICE_ID="[^"]*"', "NEXT_PUBLIC_STRIPE_PREMIUM_PRICE_ID=`"$priceId`""
Set-Content -Path $envPath -Value $content.TrimEnd() -NoNewline
Add-Content -Path $envPath -Value ""

Write-Host ""
Write-Host "Success! Updated .env with:" -ForegroundColor Green
Write-Host "STRIPE_PREMIUM_PRICE_ID=`"$priceId`""
Write-Host "NEXT_PUBLIC_STRIPE_PREMIUM_PRICE_ID=`"$priceId`""
Write-Host ""
Write-Host "Product ID: $productId"
Write-Host "Price ID:   $priceId"
