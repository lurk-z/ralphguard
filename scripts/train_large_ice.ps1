[CmdletBinding()]
param(
    [ValidateRange(1000, 1000000)]
    [int]$MinTotal = 10000,

    [ValidateRange(0, 1000000)]
    [int]$MinPerEndpoint = 0,

    [ValidateRange(0, 1000000)]
    [int]$MinClassRows = 0,

    [ValidateRange(0, 1000000)]
    [int]$RecommendedMinClassRows = 100,

    [ValidateRange(0, 1000000)]
    [int]$MaxTrainingRowsPerEndpoint = 0,

    [ValidateSet("auto", "full", "large", "quick")]
    [string]$ValidationProfile = "auto",

    [ValidateRange(100, 100000)]
    [int]$PubChemTarget = 1000,

    [ValidateRange(0, 100000)]
    [int]$PubChemTargetPerEndpoint = 0,

    [ValidateRange(1, 10000)]
    [int]$PubChemStartPage = 1,

    [ValidateRange(1, 500)]
    [int]$PubChemMaxPages = 20,

    [switch]$ProcessAllPubChemPages,

    [switch]$AllowUnderPubChemTarget
)

$ErrorActionPreference = "Stop"
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
Set-Location $repoRoot

function Invoke-DockerStep {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Name,

        [Parameter(Mandatory = $true)]
        [string[]]$Arguments
    )

    Write-Host "`n=== $Name ===" -ForegroundColor Cyan
    & docker @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw "$Name failed with exit code $LASTEXITCODE"
    }
}

& docker info *> $null
if ($LASTEXITCODE -ne 0) {
    throw "Docker Engine is not running. Open Docker Desktop and run this command again."
}

Invoke-DockerStep -Name "Prepare official ICE experimental endpoint rows" -Arguments @(
    "compose", "--profile", "training", "run", "--rm", "ice-data-prep",
    "python", "scripts/prepare_ice_bulk_training.py",
    "--download", "--min-total", $MinTotal.ToString(), "--allow-under-minimum"
)

Invoke-DockerStep -Name "Start PubChem evidence services" -Arguments @(
    "compose", "up", "-d", "postgres", "redis", "backend"
)

Write-Host "`n=== Wait for backend readiness ===" -ForegroundColor Cyan
$backendReady = $false
for ($attempt = 1; $attempt -le 60; $attempt++) {
    try {
        $readiness = Invoke-RestMethod -Uri "http://localhost:8000/health/ready" -TimeoutSec 3
        if ($readiness.status -eq "ready") {
            $backendReady = $true
            break
        }
    }
    catch {
        # The container can exist before migrations/Uvicorn finish. A refused
        # connection is expected during this window and must not terminate the
        # retry loop when ErrorActionPreference is Stop.
    }
    Start-Sleep -Seconds 2
}
if (-not $backendReady) {
    throw "Backend did not become ready within 120 seconds. Run 'docker compose logs backend' for details."
}

Invoke-DockerStep -Name "Run NICE/ICE label-mapping regression tests" -Arguments @(
    "compose", "exec", "-T", "backend",
    "pytest", "-q", "tests/test_ingredient_registry.py", "tests/test_nice_evidence.py", "tests/test_pubchem_evidence.py"
)

$pubChemArguments = @(
    "compose", "exec", "-T", "backend",
    "python", "scripts/import_global_pubchem_ghs.py",
    "--target", $PubChemTarget.ToString(), "--start-page", $PubChemStartPage.ToString(),
    "--max-pages", $PubChemMaxPages.ToString(),
    "--report", "/data/curated/pubchem_global_import_report.json",
    "--include-single-regulatory"
)
if ($PubChemTargetPerEndpoint -gt 0) {
    $pubChemArguments += @("--target-per-endpoint", $PubChemTargetPerEndpoint.ToString())
}
if ($AllowUnderPubChemTarget) {
    $pubChemArguments += "--allow-under-target"
}
if ($ProcessAllPubChemPages) {
    $pubChemArguments += "--process-all-pages"
}
Invoke-DockerStep -Name "Import attributed PubChem regulatory weak-label candidates" -Arguments $pubChemArguments

Invoke-DockerStep -Name "Export eligible PubChem supplemental training rows" -Arguments @(
    "compose", "--profile", "training", "run", "--rm", "trainer",
    "python", "scripts/export_verified_pubchem_training.py", "--api", "http://backend:8000"
)

Invoke-DockerStep -Name "Run external-holdout quarantine regression tests" -Arguments @(
    "compose", "--profile", "training", "run", "--rm", "trainer",
    "pytest", "-q", "scientific/tests/test_training_holdout.py", "scientific/tests/test_ice_bulk_preparation.py", "scientific/tests/test_training_weights.py"
)

$auditArguments = @(
    "compose", "--profile", "training", "run", "--rm", "trainer",
    "python", "scripts/check_training_integrity.py", "--require-all", "--require-manifest",
    "--min-total-training-rows", $MinTotal.ToString(),
    "--recommended-min-class-training-rows", $RecommendedMinClassRows.ToString()
)
if ($MinPerEndpoint -gt 0) {
    $auditArguments += @("--min-per-endpoint-training-rows", $MinPerEndpoint.ToString())
}
if ($MinClassRows -gt 0) {
    $auditArguments += @("--min-class-training-rows", $MinClassRows.ToString())
}
Invoke-DockerStep -Name "Audit identities, conflicts, scaffolds, leakage, and final row count" -Arguments $auditArguments

$trainArguments = @(
    "compose", "--profile", "training", "run", "--rm", "trainer",
    "python", "scripts/train_candidate_v2.py", "--validation-profile", $ValidationProfile
)
if ($MaxTrainingRowsPerEndpoint -gt 0) {
    $trainArguments += @("--max-training-rows-per-endpoint", $MaxTrainingRowsPerEndpoint.ToString())
}
Invoke-DockerStep -Name "Train candidate-v2 and generate validation plots" -Arguments $trainArguments

Write-Host "`nTraining complete." -ForegroundColor Green
Write-Host "Report: scientific/models/candidate_v2/TRAINING_REPORT.md"
Write-Host "Metrics: scientific/models/candidate_v2/validation_report.json"
Write-Host "Plots: scientific/models/candidate_v2/plots/"
