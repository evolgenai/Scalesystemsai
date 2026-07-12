# Local PostgreSQL fallback when Neon console is unavailable.
# Default credentials: postgres / scalesystems

$ErrorActionPreference = "Stop"

$dbName = "scalesystems"
$dbUser = "postgres"
$dbPassword = "scalesystems"
$dbPort = "5432"
$connectionString = "postgresql://${dbUser}:${dbPassword}@localhost:${dbPort}/${dbName}"

Write-Host "ScaleSystems Local PostgreSQL Setup" -ForegroundColor Cyan
Write-Host ""

$psql = Get-Command psql -ErrorAction SilentlyContinue
if (-not $psql) {
  Write-Host "PostgreSQL not found in PATH." -ForegroundColor Yellow
  Write-Host "Install with: winget install -e --id PostgreSQL.PostgreSQL.17" -ForegroundColor Yellow
  Write-Host "Then re-run this script." -ForegroundColor Yellow
  exit 1
}

$env:PGPASSWORD = $dbPassword
& createdb -U $dbUser -h localhost -p $dbPort $dbName 2>$null
if ($LASTEXITCODE -ne 0) {
  Write-Host "Database '$dbName' may already exist — continuing." -ForegroundColor DarkGray
}

$envPath = Join-Path (Split-Path $PSScriptRoot -Parent) ".env"
$content = Get-Content $envPath -Raw
$content = $content -replace 'DATABASE_URL="[^"]*"', "DATABASE_URL=`"$connectionString`""
Set-Content -Path $envPath -Value $content.TrimEnd() -NoNewline
Add-Content -Path $envPath -Value ""

Write-Host "Updated .env DATABASE_URL for local PostgreSQL." -ForegroundColor Green

Push-Location (Split-Path $PSScriptRoot -Parent)
npx prisma db push
Pop-Location

Write-Host ""
Write-Host "Local database ready. Start with: npm run dev" -ForegroundColor Green
