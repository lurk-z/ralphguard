param(
    [Parameter(Mandatory = $true)]
    [string]$FrontendUrl,

    [Parameter(Mandatory = $true)]
    [string]$BackendUrl,

    [Parameter(Mandatory = $true)]
    [string]$AuthSecret
)

$ErrorActionPreference = "Stop"
$FrontendUrl = $FrontendUrl.TrimEnd("/")
$BackendUrl = $BackendUrl.TrimEnd("/")
$script:Failed = $false

function ConvertTo-Base64Url {
    param([byte[]]$Bytes)
    return [Convert]::ToBase64String($Bytes).TrimEnd("=").Replace("+", "-").Replace("/", "_")
}

function New-SmokeTestToken {
    param([string]$Secret)

    $now = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
    $header = '{"alg":"HS256","typ":"JWT"}'
    $payload = @{
        sub = "deployment-smoke-test"
        email = "smoke-test@ralphguard.local"
        name = "Deployment Smoke Test"
        aud = "ralphguard-backend"
        iat = $now
        exp = $now + 300
    } | ConvertTo-Json -Compress

    $headerPart = ConvertTo-Base64Url ([Text.Encoding]::UTF8.GetBytes($header))
    $payloadPart = ConvertTo-Base64Url ([Text.Encoding]::UTF8.GetBytes($payload))
    $unsigned = "$headerPart.$payloadPart"
    $hmac = [Security.Cryptography.HMACSHA256]::new([Text.Encoding]::UTF8.GetBytes($Secret))
    try {
        $signature = ConvertTo-Base64Url ($hmac.ComputeHash([Text.Encoding]::UTF8.GetBytes($unsigned)))
    }
    finally {
        $hmac.Dispose()
    }
    return "$unsigned.$signature"
}

function Test-JsonEndpoint {
    param(
        [string]$Name,
        [string]$Url,
        [hashtable]$Headers = @{},
        [scriptblock]$Validate = { param($Body) $true }
    )
    try {
        $response = Invoke-WebRequest -Uri $Url -Headers $Headers -UseBasicParsing -TimeoutSec 90
        $body = $response.Content | ConvertFrom-Json
        if ($response.StatusCode -ne 200 -or -not (& $Validate $body)) {
            throw "unexpected response"
        }
        Write-Host "[PASS] $Name"
    }
    catch {
        $script:Failed = $true
        $detail = $_.ErrorDetails.Message
        if (-not $detail) { $detail = $_.Exception.Message }
        Write-Host "[FAIL] $Name - $detail"
    }
}

function Test-ModelAsset {
    param([string]$Path)
    try {
        $response = Invoke-WebRequest -Uri "$FrontendUrl$Path" -UseBasicParsing -TimeoutSec 90
        $contentType = [string]$response.Headers["Content-Type"]
        if ($response.StatusCode -ne 200 -or $contentType -notmatch "model/gltf-binary|application/octet-stream" -or $response.RawContentLength -lt 100000) {
            throw "invalid model asset response"
        }
        Write-Host "[PASS] 3D asset $Path"
    }
    catch {
        $script:Failed = $true
        Write-Host "[FAIL] 3D asset $Path - $($_.Exception.Message)"
    }
}

function Test-AiEndpoint {
    try {
        $payload = @{ question = "Reply only with OK." } | ConvertTo-Json -Compress
        $response = Invoke-WebRequest `
            -Uri "$BackendUrl/api/chat/" `
            -Method Post `
            -ContentType "application/json" `
            -Body $payload `
            -UseBasicParsing `
            -TimeoutSec 90
        $body = $response.Content | ConvertFrom-Json
        if ($response.StatusCode -ne 200 -or [string]::IsNullOrWhiteSpace([string]$body.answer)) {
            throw "AI returned an empty or invalid response"
        }
        Write-Host "[PASS] AI assistant"
    }
    catch {
        $script:Failed = $true
        $detail = $_.ErrorDetails.Message
        if (-not $detail) { $detail = $_.Exception.Message }
        Write-Host "[FAIL] AI assistant - $detail"
    }
}

function Test-CorsPolicy {
    try {
        $headers = @{
            Origin = $FrontendUrl
            "Access-Control-Request-Method" = "GET"
            "Access-Control-Request-Headers" = "authorization"
        }
        $response = Invoke-WebRequest `
            -Uri "$BackendUrl/api/projects/" `
            -Method Options `
            -Headers $headers `
            -UseBasicParsing `
            -TimeoutSec 90
        $allowedOrigin = [string]$response.Headers["Access-Control-Allow-Origin"]
        if ($response.StatusCode -ne 200 -or $allowedOrigin -ne $FrontendUrl) {
            throw "frontend origin is not allowed by the backend"
        }
        Write-Host "[PASS] CORS policy"
    }
    catch {
        $script:Failed = $true
        Write-Host "[FAIL] CORS policy - $($_.Exception.Message)"
    }
}

Write-Host "RalphGuard deployment verification"
Test-JsonEndpoint "Backend health" "$BackendUrl/health" @{} { param($body) $body.status -eq "ok" }
Test-JsonEndpoint "Backend readiness (DB/Auth/AI/schema)" "$BackendUrl/health/ready" @{} { param($body) $body.status -eq "ready" }
Test-JsonEndpoint "Google authentication provider" "$FrontendUrl/api/auth/providers" @{} { param($body) $null -ne $body.google }
Test-CorsPolicy
Test-ModelAsset "/models/Lab_room.glb"
Test-ModelAsset "/models/head.glb"
Test-JsonEndpoint "QSAR model metrics" "$BackendUrl/api/models/metrics" @{} { param($body) $body.available -eq $true }
Test-JsonEndpoint "Ingredient registry" "$BackendUrl/api/substances/registry/ready-count" @{} { param($body) [int]$body.count -gt 0 }
Test-JsonEndpoint "Thai herbal registry" "$BackendUrl/api/herbs?limit=1" @{} { param($body) $body.Count -gt 0 }
Test-AiEndpoint

$token = New-SmokeTestToken $AuthSecret
$authHeaders = @{ Authorization = "Bearer $token" }
Test-JsonEndpoint "Authenticated projects API" "$BackendUrl/api/projects/" $authHeaders { param($body) $body -is [array] }

if ($script:Failed) {
    Write-Host "Deployment verification FAILED"
    exit 1
}

Write-Host "Deployment verification PASSED"
