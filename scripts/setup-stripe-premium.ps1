# Creates ScaleSystems Starter ($49) and Premium ($149) Stripe prices.
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

function Set-EnvValue {
  param([string]$Content, [string]$Key, [string]$Value)
  if ($Content -match "$Key=`"[^`"]*`"") {
    return $Content -replace "$Key=`"[^`"]*`"", "$Key=`"$Value`""
  }
  return $Content + "`n$Key=`"$Value`""
}

Write-Host "Creating ScaleSystems Starter product..." -ForegroundColor Cyan
$starterProductRaw = stripe products create `
  --name "ScaleSystems Starter" `
  --description "Starter agent tier - 5 active agents"

$starterProductId = Get-StripeId -Json $starterProductRaw -Field "id"
if (-not $starterProductId) {
  Write-Error "Failed to create Starter product. Raw output:`n$starterProductRaw"
}

Write-Host "Creating Starter monthly price ($49.00 USD)..." -ForegroundColor Cyan
$starterPriceRaw = stripe prices create `
  --currency usd `
  --unit-amount 4900 `
  -d "recurring[interval]=month" `
  -d "product=$starterProductId"

$starterPriceId = Get-StripeId -Json $starterPriceRaw -Field "id"
if (-not $starterPriceId) {
  Write-Error "Failed to create Starter price. Raw output:`n$starterPriceRaw"
}

Write-Host "Creating ScaleSystems Premium product..." -ForegroundColor Cyan
$premiumProductRaw = stripe products create `
  --name "ScaleSystems Premium" `
  --description "Premium agent tier - unlimited agents and compute"

$premiumProductId = Get-StripeId -Json $premiumProductRaw -Field "id"
if (-not $premiumProductId) {
  Write-Error "Failed to create Premium product. Raw output:`n$premiumProductRaw"
}

Write-Host "Creating Premium monthly price ($149.00 USD)..." -ForegroundColor Cyan
$premiumPriceRaw = stripe prices create `
  --currency usd `
  --unit-amount 14900 `
  -d "recurring[interval]=month" `
  -d "product=$premiumProductId"

$premiumPriceId = Get-StripeId -Json $premiumPriceRaw -Field "id"
if (-not $premiumPriceId) {
  Write-Error "Failed to create Premium price. Raw output:`n$premiumPriceRaw"
}

$envPath = Join-Path (Split-Path $PSScriptRoot -Parent) ".env"
if (-not (Test-Path $envPath)) {
  Write-Error ".env file not found at $envPath"
}

$content = Get-Content $envPath -Raw
$content = Set-EnvValue -Content $content -Key "STRIPE_STARTER_PRICE_ID" -Value $starterPriceId
$content = Set-EnvValue -Content $content -Key "NEXT_PUBLIC_STRIPE_STARTER_PRICE_ID" -Value $starterPriceId
$content = Set-EnvValue -Content $content -Key "STRIPE_PREMIUM_PRICE_ID" -Value $premiumPriceId
$content = Set-EnvValue -Content $content -Key "NEXT_PUBLIC_STRIPE_PREMIUM_PRICE_ID" -Value $premiumPriceId
Set-Content -Path $envPath -Value $content.TrimEnd()
Add-Content -Path $envPath -Value ""

Write-Host ""
Write-Host "Success! Updated .env with:" -ForegroundColor Green
Write-Host "STRIPE_STARTER_PRICE_ID=`"$starterPriceId`" ($49/mo)"
Write-Host "STRIPE_PREMIUM_PRICE_ID=`"$premiumPriceId`" ($149/mo)"
