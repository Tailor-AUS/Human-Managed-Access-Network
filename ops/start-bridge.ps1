# .HMAN -- bridge + tunnel launcher for Windows.
#
# Three ingress modes:
#   -Tunnel none         local-only (127.0.0.1:8765)
#   -Tunnel azure        Azure Relay Hybrid Connection (recommended for prod)
#   -Tunnel cloudflare   Cloudflare Tunnel (community alternative)
#   -Tunnel cf-quick     Cloudflare Quick Tunnel (trycloudflare.com, zero-setup)
#
# On first run, generates HMAN_AUTH_TOKEN (48 hex chars) unless already
# present in ~/.hman/bridge.env. The Azure deploy script pre-populates
# this file with the tunnel config + token from your Bicep deployment.

[CmdletBinding()]
param(
    [ValidateSet('none', 'azure', 'cloudflare', 'cf-quick')]
    [string]$Tunnel = 'azure',
    [string]$CloudflareTunnelName = 'hman-bridge',
    [int]$Port = 8765
)

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
$bridgeDir = Join-Path $repoRoot 'packages/python-bridge'
$relayListenerDir = Join-Path $repoRoot 'packages/bridge-relay-listener'
$dataDir = Join-Path $env:USERPROFILE '.hman'
$envFile = Join-Path $dataDir 'bridge.env'

if (-not (Test-Path $dataDir)) { New-Item -ItemType Directory -Path $dataDir | Out-Null }

# -- Load env file if present --------------------------------------

if (Test-Path $envFile) {
    Get-Content $envFile | ForEach-Object {
        if ($_ -match '^([^=#]+)=(.*)$') { Set-Item -Path ("env:" + $Matches[1]) -Value $Matches[2] }
    }
    Write-Host "Loaded $envFile" -ForegroundColor DarkGray
}

# Generate a token if we don't have one (e.g. running without the azure deploy script)
if (-not $env:HMAN_AUTH_TOKEN) {
    $token = -join ((1..48) | ForEach-Object { '{0:x}' -f (Get-Random -Maximum 16) })
    $env:HMAN_AUTH_TOKEN = $token
    "HMAN_AUTH_TOKEN=$token" | Out-File -FilePath $envFile -Encoding utf8 -Append
    Write-Host ""
    Write-Host "  Generated new bridge auth token:" -ForegroundColor Cyan
    Write-Host "  $token" -ForegroundColor Yellow
    Write-Host "  (saved to $envFile)" -ForegroundColor DarkGray
    Write-Host ""
}

# -- Start the Python bridge ---------------------------------------

Push-Location $bridgeDir
try {
    if (-not (Test-Path '.venv')) {
        Write-Host "Creating venv + installing deps (one-time)..." -ForegroundColor DarkGray
        python -m venv .venv
        & .venv\Scripts\pip install -r requirements.txt | Out-Null
    }
    $bridgeProc = Start-Process -FilePath '.venv\Scripts\python.exe' `
        -ArgumentList 'api/server.py' `
        -PassThru -WindowStyle Minimized
    Write-Host "Bridge PID $($bridgeProc.Id) listening on 127.0.0.1:$Port" -ForegroundColor Green
} finally {
    Pop-Location
}

# -- Start the ingress ---------------------------------------------

switch ($Tunnel) {
    'azure' {
        foreach ($k in 'HMAN_RELAY_NAMESPACE', 'HMAN_RELAY_PATH', 'HMAN_RELAY_KEY') {
            if (-not (Get-Item "env:$k" -ErrorAction SilentlyContinue)) {
                Write-Error "Azure Relay mode needs $k in $envFile. Run ops/azure-deploy.ps1 first."
                return
            }
        }

        Push-Location $relayListenerDir
        try {
            $exe = 'bin/Release/net9.0/hman-bridge-relay.exe'
            if (-not (Test-Path $exe)) {
                Write-Host "Building relay listener (one-time)..." -ForegroundColor DarkGray
                dotnet build -c Release | Out-Null
            }
            $listenerProc = Start-Process -FilePath $exe -PassThru -WindowStyle Minimized
            Write-Host "Relay listener PID $($listenerProc.Id) connected to $env:HMAN_RELAY_NAMESPACE / $env:HMAN_RELAY_PATH" -ForegroundColor Green
        } finally {
            Pop-Location
        }
    }
    'cloudflare' {
        Start-Process -FilePath 'cloudflared' `
            -ArgumentList "tunnel run $CloudflareTunnelName" `
            -WindowStyle Minimized
        Write-Host "Cloudflare named tunnel '$CloudflareTunnelName' started." -ForegroundColor Green
    }
    'cf-quick' {
        Start-Process -FilePath 'cloudflared' `
            -ArgumentList "tunnel --url http://127.0.0.1:$Port" `
            -WindowStyle Normal
        Write-Host "Cloudflare Quick Tunnel starting -- URL appears in the cloudflared window." -ForegroundColor Green
        Write-Host "Copy it into apps/web-dashboard/.env.production as VITE_HMAN_BRIDGE" -ForegroundColor DarkGray
    }
    default { Write-Host "Local-only mode. Bridge is at http://127.0.0.1:$Port" -ForegroundColor DarkGray }
}

Write-Host ""
Write-Host "Stop the bridge by killing PID $($bridgeProc.Id) and the ingress window." -ForegroundColor DarkGray
