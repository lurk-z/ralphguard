[CmdletBinding()]
param(
    [switch]$SkipDocker,
    [switch]$SkipDefaultBranchCheck
)

$ErrorActionPreference = "Stop"
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
Set-Location $repoRoot

$errors = [System.Collections.Generic.List[string]]::new()
$warnings = [System.Collections.Generic.List[string]]::new()

function Add-CheckError([string]$Message) {
    $errors.Add($Message)
    Write-Host "[FAIL] $Message" -ForegroundColor Red
}

function Add-CheckOk([string]$Message) {
    Write-Host "[ OK ] $Message" -ForegroundColor Green
}

$requiredFiles = @(
    ".env.example",
    "docker-compose.yml",
    "backend/Dockerfile",
    "backend/alembic.ini",
    "backend/alembic/versions/20260616_0001_initial_schema.py",
    "frontend/Dockerfile",
    "frontend/package.json",
    "frontend/package-lock.json",
    "frontend/public/models/Lab_room.glb",
    "frontend/public/models/head.glb",
    "frontend/public/models/human.glb",
    "frontend/public/textures/blister_height.png",
    "frontend/public/textures/blister_normal.png",
    "frontend/public/landing/grid-scan-angle.png",
    "frontend/public/landing/grid-scan-front.png",
    "frontend/public/landing/label-ocr-source.png",
    "frontend/public/landing/node-workspace.png",
    "scientific/Dockerfile",
    "scientific/models/skin_model.pkl",
    "scientific/models/eye_model.pkl",
    "scientific/models/sens_model.pkl",
    "scientific/models/acute_model.pkl",
    "scientific/models/validation_report.json"
)

foreach ($path in $requiredFiles) {
    if (-not (Test-Path -LiteralPath $path -PathType Leaf)) {
        Add-CheckError "missing runtime file: $path"
        continue
    }

    git ls-files --error-unmatch -- $path *> $null
    if ($LASTEXITCODE -ne 0) {
        Add-CheckError "runtime file is not tracked by Git: $path"
        continue
    }

    Add-CheckOk $path
}

$modelFiles = Get-ChildItem -LiteralPath "scientific/models" -Filter "*_model.pkl" -File
if ($modelFiles.Count -ne 4) {
    Add-CheckError "expected 4 QSAR model bundles, found $($modelFiles.Count)"
} elseif ($modelFiles.Where({ $_.Length -lt 1MB }).Count -gt 0) {
    Add-CheckError "one or more QSAR model bundles are unexpectedly smaller than 1 MB"
} else {
    Add-CheckOk "all 4 QSAR model bundles are present and non-empty"
}

if (-not $SkipDefaultBranchCheck) {
    $currentBranch = (git branch --show-current).Trim()
    $defaultRef = (git symbolic-ref --quiet --short refs/remotes/origin/HEAD 2>$null)
    if ($LASTEXITCODE -eq 0 -and $defaultRef) {
        $defaultBranch = $defaultRef.Trim().Replace("origin/", "")
        if ($currentBranch -ne $defaultBranch) {
            Add-CheckError "current branch '$currentBranch' is not GitHub's clone-default branch '$defaultBranch'"
        } else {
            Add-CheckOk "current branch matches clone-default branch '$defaultBranch'"
        }
    } else {
        $warnings.Add("could not determine origin/HEAD; skipped default-branch comparison")
    }
}

$envTemplate = Get-Content -LiteralPath ".env.example" -Raw
if ($envTemplate -match "(?i)(AQ\.[A-Za-z0-9_-]{20,}|AIza[A-Za-z0-9_-]{20,}|gsk_[A-Za-z0-9]{20,}|sk-[A-Za-z0-9_-]{20,})") {
    Add-CheckError ".env.example appears to contain a real API key"
} else {
    Add-CheckOk ".env.example contains no recognized API-key pattern"
}

if (-not $SkipDocker) {
    if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
        Add-CheckError "Docker is not installed or not available in PATH"
    } else {
        docker compose config --quiet
        if ($LASTEXITCODE -ne 0) {
            Add-CheckError "docker-compose.yml is invalid"
        } else {
            Add-CheckOk "docker-compose.yml parses successfully"
        }
    }
}

foreach ($warning in $warnings) {
    Write-Host "[WARN] $warning" -ForegroundColor Yellow
}

if ($errors.Count -gt 0) {
    Write-Host "`nClone-readiness failed with $($errors.Count) issue(s)." -ForegroundColor Red
    exit 1
}

Write-Host "`nClone-readiness passed. This branch contains all required runtime assets." -ForegroundColor Green
