# .HMAN — bridge + tunnel launcher for Windows
#
# Usage:
#   pwsh -File ops/start-bridge.ps1                    # local only (127.0.0.1:8765)
#   pwsh -File ops/start-bridge.ps1 -Tunnel quick      # public quick tunnel (trycloudflare.com)
#   pwsh -File ops/start-bridge.ps1 -Tunnel named      # named tunnel (requires cloudflared login + config)
#
# The first run generates HMAN_AUTH_TOKEN and persists it to ~/.hman/bridge.env.
# The token is printed so you can paste it into the web dashboard the first time.

[CmdletBinding()]
param(
    [ValidateSet('none', 'quick', 'named')]
    [string]$Tunnel = 'none',
    [string]$TunnelName = 'hman-bridge',   # used when -Tunnel named
    [int]$Port = 8765
)

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
$bridgeDir = Join-Path $repoRoot 'packages/python-bridge'
$dataDir = Join-Path $env:USERPROFILE '.hman'
$envFile = Join-Path $dataDir 'bridge.env'

if (-not (Test-Path $dataDir)) { New-Item -ItemType Directory -Path $dataDir | Out-Null }

# 1. Generate / load auth token
if (Test-Path $envFile) {
    Get-Content $envFile | ForEach-Object {
        if ($_ -match '^([^=]+)=(.*)$') { Set-Item -Path ("env:" + $Matches[1]) -Value $Matches[2] }
    }
    Write-Host "Loaded env from $envFile" -ForegroundColor DarkGray
}

if (-not $env:HMAN_AUTH_TOKEN) {
    $token = -join ((1..48) | ForEach-Object { '{0:x}' -f (Get-Random -Maximum 16) })
    $env:HMAN_AUTH_TOKEN = $token
    "HMAN_AUTH_TOKEN=$token" | Out-File -FilePath $envFile -Encoding utf8 -Append
    Write-Host ""
    Write-Host "  Generated new bridge auth token:" -ForegroundColor Cyan
    Write-Host "  $token" -ForegroundColor Yellow
    Write-Host "  (saved to $envFile)" -ForegroundColor DarkGray
    Write-Host ""
    Write-Host "  Paste this into the web dashboard when it prompts." -ForegroundColor DarkGray
    Write-Host ""
}

# 2. Tunnel origin → CORS allow
switch ($Tunnel) {
    'quick' {
        Write-Host "Starting a Cloudflare Quick Tunnel (trycloudflare.com)..." -ForegroundColor Cyan
        # Not ideal — we can't know the generated URL in advance, so we allow
        # any trycloudflare origin. Users should switch to 'named' for real use.
        $env:HMAN_ALLOWED_ORIGINS = 'https://*.trycloudflare.com'
    }
    'named' {
        # Assume the caller already set HMAN_PUBLIC_ORIGIN=https://hman.tailor.au or similar
        if (-not $env:HMAN_PUBLIC_ORIGIN) {
            Write-Warning "HMAN_PUBLIC_ORIGIN is not set. Set it to the frontend URL that calls this bridge, e.g. https://hman.tailor.au"
        } else {
            $env:HMAN_ALLOWED_ORIGINS = $env:HMAN_PUBLIC_ORIGIN
        }
    }
}

# 3. Launch the bridge
Push-Location $bridgeDir
try {
    if (-not (Test-Path '.venv')) {
        Write-Host "Creating venv..." -ForegroundColor DarkGray
        python -m venv .venv
        & .venv\Scripts\pip install -r requirements.txt | Out-Null
    }
    $bridgeProc = Start-Process -FilePath '.venv\Scripts\python.exe' -ArgumentList 'api/server.py' -PassThru -WindowStyle Minimized
    Write-Host "Bridge PID $($bridgeProc.Id) listening on 127.0.0.1:$Port" -ForegroundColor Green
} finally {
    Pop-Location
}

# 4. Launch the tunnel if requested
if ($Tunnel -eq 'quick') {
    Start-Process -FilePath 'cloudflared' -ArgumentList "tunnel --url http://127.0.0.1:$Port" -WindowStyle Normal
    Write-Host "Cloudflare Quick Tunnel starting — the URL will appear in the cloudflared window." -ForegroundColor Green
    Write-Host "Copy it to VITE_HMAN_BRIDGE in your frontend .env.production" -ForegroundColor DarkGray
} elseif ($Tunnel -eq 'named') {
    Start-Process -FilePath 'cloudflared' -ArgumentList "tunnel run $TunnelName" -WindowStyle Minimized
    Write-Host "Cloudflare named tunnel '$TunnelName' started." -ForegroundColor Green
}

Write-Host ""
Write-Host "To stop: kill the bridge process (PID $($bridgeProc.Id)) and the cloudflared window." -ForegroundColor DarkGray
