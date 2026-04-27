# .HMAN -- stop and remove the NSSM-wrapped HMAN-Bridge / HMAN-Relay
# services installed by ops/install-windows-service.ps1.
#
# Idempotent: missing services are silently skipped, so this is safe to
# run on a machine that's been only partially installed (or that has
# already been uninstalled).
#
# Requires: run as Administrator.
#
# Usage:
#   pwsh -File ops/uninstall-windows-service.ps1

[CmdletBinding()]
param(
    [string]$BridgeServiceName = 'HMAN-Bridge',
    [string]$RelayServiceName  = 'HMAN-Relay'
)

$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $PSScriptRoot
$nssmExe  = Join-Path $repoRoot 'ops/nssm/nssm.exe'

if (-not (Test-Path $nssmExe)) {
    throw "NSSM binary missing: $nssmExe. Cannot uninstall a service without the same NSSM that installed it."
}

# Are we elevated?
$identity  = [System.Security.Principal.WindowsIdentity]::GetCurrent()
$principal = New-Object System.Security.Principal.WindowsPrincipal($identity)
if (-not $principal.IsInRole([System.Security.Principal.WindowsBuiltInRole]::Administrator)) {
    throw "This script must run elevated. Right-click PowerShell -> Run as Administrator and re-run."
}

function Remove-NssmService {
    param([string]$Name)
    $svc = Get-Service -Name $Name -ErrorAction SilentlyContinue
    if (-not $svc) {
        Write-Host "[$Name] not installed -- skipping." -ForegroundColor DarkGray
        return
    }

    Write-Host "[$Name] stopping..." -ForegroundColor DarkGray
    # `nssm stop` waits for graceful shutdown then a hard kill if needed.
    # Ignore non-zero exit (e.g. service already stopped).
    & $nssmExe stop $Name | Out-Null

    Write-Host "[$Name] removing..." -ForegroundColor DarkGray
    & $nssmExe remove $Name confirm
    if ($LASTEXITCODE -ne 0) {
        throw "nssm remove $Name failed with exit code $LASTEXITCODE"
    }
}

Remove-NssmService -Name $BridgeServiceName
Remove-NssmService -Name $RelayServiceName

Write-Host ""
Write-Host "  Both services removed. Logs are preserved at ~/.hman/logs/." -ForegroundColor Green
