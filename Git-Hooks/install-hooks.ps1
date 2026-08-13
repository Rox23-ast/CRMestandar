# Installer script for Git pre-commit hooks.
# Copies or hooks standard verification files to .git/hooks/pre-commit which calls verify-commit.ps1.

$hookDir = Join-Path (Get-Location) ".git\hooks"
$hookFile = Join-Path $hookDir "pre-commit"

if (-not (Test-Path $hookDir)) {
    Write-Host "CRITICAL: .git/hooks directory not found. Ensure this is run from the root of a Git repository." -ForegroundColor Red
    exit 1
}

# Construct the hook content using standard newlines.
# Note: This shell script invokes PowerShell to execute the verification script.
$hookContent = "#!/bin/sh`n# Invoke the PowerShell verify-commit script to run quality checks.`npowershell.exe -NoProfile -ExecutionPolicy Bypass -File `"./scripts/verify-commit.ps1`""

Set-Content -Path $hookFile -Value $hookContent

Write-Host "==========================================" -ForegroundColor Green
Write-Host "Git pre-commit hook installed successfully!" -ForegroundColor Green
Write-Host "Make sure to place 'verify-commit.ps1' inside a folder named 'scripts/' at your project root." -ForegroundColor Yellow
Write-Host "==========================================" -ForegroundColor Green
