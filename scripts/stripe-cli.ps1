# Resolves Stripe CLI from PATH or WinGet install location, then forwards args.
param(
  [Parameter(ValueFromRemainingArguments = $true)]
  [string[]]$StripeArgs
)

$machinePath = [System.Environment]::GetEnvironmentVariable("Path", "Machine")
$userPath = [System.Environment]::GetEnvironmentVariable("Path", "User")
$env:Path = "$machinePath;$userPath"

function Resolve-StripeExecutable {
  $fromPath = Get-Command stripe -ErrorAction SilentlyContinue
  if ($fromPath) {
    return $fromPath.Source
  }

  $wingetRoot = Join-Path $env:LOCALAPPDATA "Microsoft\WinGet\Packages"
  if (Test-Path $wingetRoot) {
    $candidate = Get-ChildItem -Path $wingetRoot -Recurse -Filter "stripe.exe" -ErrorAction SilentlyContinue |
      Select-Object -First 1 -ExpandProperty FullName

    if ($candidate) {
      return $candidate
    }
  }

  return $null
}

$stripeExe = Resolve-StripeExecutable

if (-not $stripeExe) {
  Write-Error @"
Stripe CLI was not found.

Install it with:
  winget install -e --id Stripe.StripeCli

Then close and reopen PowerShell, or run:
  npm run stripe:login
"@
  exit 1
}

& $stripeExe @StripeArgs
exit $LASTEXITCODE
