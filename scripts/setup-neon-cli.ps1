# Provisions a Neon Postgres project via CLI (bypasses broken console UI).
# Prerequisites: Node.js installed + neonctl auth completed.

$ErrorActionPreference = "Stop"

$orgId = "org-lively-king-39544455"
$projectName = "scalesystems-dev-eu"

Write-Host "ScaleSystems Neon CLI Provisioner" -ForegroundColor Cyan
Write-Host ""

$existingJson = npx neonctl@latest projects list --org-id $orgId --output json
$existing = $existingJson | ConvertFrom-Json
$project = $existing | Where-Object { $_.name -eq $projectName } | Select-Object -First 1

if (-not $project) {
  Write-Host "Creating project '$projectName'..." -ForegroundColor Yellow
  $createdJson = npx neonctl@latest projects create --name $projectName --org-id $orgId --region-id aws-eu-central-1 --output json
  $created = $createdJson | ConvertFrom-Json
  $projectId = $created.project.id
} else {
  $projectId = $project.id
  Write-Host "Using existing project '$projectName' ($projectId)" -ForegroundColor Green
}

Write-Host "Fetching pooled connection string..." -ForegroundColor Yellow
$connectionString = (npx neonctl@latest connection-string --project-id $projectId --pooled).Trim()

if ($connectionString -notmatch "sslmode=") {
  $connectionString = "$connectionString?sslmode=require"
}

$envPath = Join-Path (Split-Path $PSScriptRoot -Parent) ".env"
$content = Get-Content $envPath -Raw
$content = $content -replace 'DATABASE_URL="[^"]*"', "DATABASE_URL=`"$connectionString`""
Set-Content -Path $envPath -Value $content.TrimEnd() -NoNewline
Add-Content -Path $envPath -Value ""

Write-Host "Updated .env DATABASE_URL" -ForegroundColor Green

Push-Location (Split-Path $PSScriptRoot -Parent)
npx prisma db push
Pop-Location

Write-Host "Done! Start the app with: npm run dev" -ForegroundColor Green

