[CmdletBinding()]
param(
    [ValidateSet("auto", "full", "large", "quick")]
    [string]$ValidationProfile = "auto",

    [ValidateRange(1, 10000)]
    [int]$PubChemStartPage = 201,

    [ValidateRange(1, 500)]
    [int]$PubChemMaxPages = 100,

    [ValidateRange(5, 100000)]
    [int]$MinimumClassRows = 20,

    [ValidateRange(10000, 1000000)]
    [int]$MaxTrainingRowsPerEndpoint = 15000
)

$ErrorActionPreference = "Stop"
$pipeline = Join-Path $PSScriptRoot "train_large_ice.ps1"

# Screening more PubChem structures than the requested final training count is
# intentional: only attributed regulatory evidence is eligible, conflicts and
# exact duplicates are removed, and missing hazard statements never become
# negative labels. The final integrity gate, not this screened target, decides
# whether the requested dataset actually exists.
& $pipeline `
    -MinTotal 40000 `
    -MinPerEndpoint 10000 `
    -MinClassRows $MinimumClassRows `
    -RecommendedMinClassRows 100 `
    -MaxTrainingRowsPerEndpoint $MaxTrainingRowsPerEndpoint `
    -ValidationProfile $ValidationProfile `
    -PubChemTarget 10000 `
    -PubChemTargetPerEndpoint 20000 `
    -PubChemStartPage $PubChemStartPage `
    -PubChemMaxPages $PubChemMaxPages `
    -ProcessAllPubChemPages `
    -AllowUnderPubChemTarget

if ($LASTEXITCODE -ne 0) {
    exit $LASTEXITCODE
}
