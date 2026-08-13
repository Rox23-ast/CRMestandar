# Global Git Hook: Commit Verification Script
# This script enforces build correctness, linting, and test completeness before commits are allowed.
# Customize the commands below to fit your specific project tech stack.

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host " Quality Gate: Pre-Commit Verify" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan

# ---------------------------------------------------------
# STEP 1: COMPILATION / BUILD CHECK
# ---------------------------------------------------------
Write-Host "Step 1: Building project..." -ForegroundColor Yellow

# --- FOR NODE / REACT PROJECTS ---
npm run build

if ($LASTEXITCODE -ne 0) {
    Write-Host "CRITICAL: Project compilation failed or warnings were detected. Commit aborted." -ForegroundColor Red
    exit 1
}
Write-Host "✓ Build compiled successfully with 0 warnings/errors." -ForegroundColor Green


# ---------------------------------------------------------
# STEP 2: RUN UNIT TESTS
# ---------------------------------------------------------
Write-Host "Step 2: Executing Unit Tests..." -ForegroundColor Yellow

# --- FOR NODE / REACT PROJECTS ---
npm run test

if ($LASTEXITCODE -ne 0) {
    Write-Host "CRITICAL: One or more unit tests failed. Commit aborted." -ForegroundColor Red
    exit 1
}
Write-Host "✓ All unit tests passed successfully." -ForegroundColor Green

Write-Host "==========================================" -ForegroundColor Green
Write-Host " SUCCESS: Quality gates passed. Commit allowed." -ForegroundColor Green
Write-Host "==========================================" -ForegroundColor Green
exit 0
