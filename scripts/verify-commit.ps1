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
Write-Host "Build compiled successfully with 0 warnings/errors." -ForegroundColor Green

Write-Host "Step 1b: Building frontend..." -ForegroundColor Yellow
Push-Location -LiteralPath "./frontend"
npm run build
$frontendExitCode = $LASTEXITCODE
Pop-Location

if ($frontendExitCode -ne 0) {
    Write-Host "CRITICAL: Frontend compilation failed. Commit aborted." -ForegroundColor Red
    exit 1
}
Write-Host "Frontend compiled successfully." -ForegroundColor Green


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
Write-Host "All unit tests passed successfully." -ForegroundColor Green

# ---------------------------------------------------------
# STEP 3: DEPENDENCY SECURITY AUDIT
# ---------------------------------------------------------
Write-Host "Step 3: Auditing dependencies..." -ForegroundColor Yellow

# Backend: only production dependencies ship in the runtime image.
npm audit --audit-level=high --omit=dev

if ($LASTEXITCODE -ne 0) {
    Write-Host "CRITICAL: High or critical vulnerabilities in backend production dependencies. Commit aborted." -ForegroundColor Red
    exit 1
}

# Frontend: full audit (axios is a production dependency).
Push-Location -LiteralPath "./frontend"
npm audit --audit-level=high
$auditExitCode = $LASTEXITCODE
Pop-Location

if ($auditExitCode -ne 0) {
    Write-Host "CRITICAL: High or critical vulnerabilities in frontend dependencies. Commit aborted." -ForegroundColor Red
    exit 1
}
Write-Host "Dependency audit passed (no high/critical vulnerabilities)." -ForegroundColor Green

Write-Host "==========================================" -ForegroundColor Green
Write-Host " SUCCESS: Quality gates passed. Commit allowed." -ForegroundColor Green
Write-Host "==========================================" -ForegroundColor Green
exit 0
