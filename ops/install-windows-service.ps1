# .HMAN — register the Python bridge + .NET Azure Relay listener as
# real Windows services using NSSM (Non-Sucking Service Manager).
#
# Why NSSM (and not Task Scheduler):
#   Task Scheduler triggers run inside the interactive desktop and die when
#   the console window is closed. NSSM-wrapped services live in
#   `services.msc`, auto-start before login, restart on failure, and survive
#   accidental window closure / log-out / lock — which is the exact failure
#   mode this script exists to fix (see issue #19).
#
# What gets installed:
#   HMAN-Bridge   wraps `.venv\Scripts\python.exe api/server.py`
#                 (FastAPI on 127.0.0.1:8765)
#                 dependency: bthserv (Bluetooth Support) so the EEG
#                 streamer can pair on boot
#   HMAN-Relay    wraps `packages/bridge-relay-listener/bin/Release/
#                       net9.0/win-x64/publish/hman-bridge-relay.exe`
#                 (only installed when -Tunnel azure is active)
#
# Both services:
#   - run under the member's user account (NOT LocalSystem) so they can
#     access ~/.hman/, the microphone, and BLE devices
#   - start automatically at boot
#   - auto-restart on failure with a 10s throttle
#   - log stdout/stderr to ~/.hman/logs/<svc>.service.{log,err}
#   - rotate logs at 50 MB
#
# Idempotent: safe to re-run. Existing services are stopped + reconfigured
# in-place rather than recreated.
#
# Requires: run as Administrator (PowerShell -> Run as Admin).
#
# Usage:
#   pwsh -File ops/install-windows-service.ps1                 # azure tunnel, current user
#   pwsh -File ops/install-windows-service.ps1 -Tunnel none    # local-only, no relay
#   pwsh -File ops/install-windows-service.ps1 -User DOMAIN\me -Password (Read-Host -AsSecureString)
#
# To uninstall both services:
#   pwsh -File ops/uninstall-windows-service.ps1

[CmdletBinding()]
param(
    [ValidateSet('none', 'azure')]
    [string]$Tunnel = 'azure',

    # Defaults to the current interactive user. NSSM expects 'DOMAIN\user'
    # or '.\user' for a local account. Pass -Password as a SecureString to
    # supply credentials non-interactively (required for true headless
    # install — Windows refuses to register a service for a user account
    # without one).
    [string]$User = "$env:USERDOMAIN\$env:USERNAME",
    [System.Security.SecureString]$Password = $null,

    [string]$BridgeServiceName = 'HMAN-Bridge',
    [string]$RelayServiceName  = 'HMAN-Relay'
)

$ErrorActionPreference = 'Stop'

# -- Locate everything relative to the repo --------------------------------

$repoRoot         = Split-Path -Parent $PSScriptRoot
$nssmExe          = Join-Path $repoRoot 'ops/nssm/nssm.exe'
$bridgeDir        = Join-Path $repoRoot 'packages/python-bridge'
$bridgePython     = Join-Path $bridgeDir '.venv/Scripts/python.exe'
$bridgeEntrypoint = 'api/server.py'
$relayDir         = Join-Path $repoRoot 'packages/bridge-relay-listener'
$relayExe         = Join-Path $relayDir 'bin/Release/net9.0/win-x64/publish/hman-bridge-relay.exe'

$dataDir = Join-Path $env:USERPROFILE '.hman'
$logsDir = Join-Path $dataDir 'logs'
$envFile = Join-Path $dataDir 'bridge.env'

# -- Sanity checks --------------------------------------------------------

if (-not (Test-Path $nssmExe)) {
    throw "NSSM binary missing: $nssmExe. Restore it from https://nssm.cc/release/nssm-2.24.zip (win64/nssm.exe) -- see ops/nssm/LICENSE-NSSM.txt."
}

# Are we elevated? NSSM service install requires admin.
$identity  = [System.Security.Principal.WindowsIdentity]::GetCurrent()
$principal = New-Object System.Security.Principal.WindowsPrincipal($identity)
if (-not $principal.IsInRole([System.Security.Principal.WindowsBuiltInRole]::Administrator)) {
    throw "This script must run elevated. Right-click PowerShell -> Run as Administrator and re-run."
}

if (-not (Test-Path $bridgePython)) {
    throw "Python venv missing: $bridgePython. Bootstrap it with `cd $bridgeDir; python -m venv .venv; .venv\Scripts\pip install -r requirements.txt` first."
}

if ($Tunnel -eq 'azure' -and -not (Test-Path $relayExe)) {
    throw "Relay listener exe missing: $relayExe. Build it with `cd $relayDir; dotnet publish -c Release -r win-x64 --self-contained false` first."
}

if (-not (Test-Path $logsDir)) {
    New-Item -ItemType Directory -Path $logsDir -Force | Out-Null
}

# -- Helper: invoke nssm and surface non-zero exit codes ------------------

function Invoke-Nssm {
    param([Parameter(ValueFromRemainingArguments = $true)][string[]]$Args)
    & $nssmExe @Args
    if ($LASTEXITCODE -ne 0) {
        throw "nssm $($Args -join ' ') failed with exit code $LASTEXITCODE"
    }
}

# -- Helper: check whether a Windows service already exists ---------------

function Test-Service {
    param([string]$Name)
    return [bool](Get-Service -Name $Name -ErrorAction SilentlyContinue)
}

# -- Helper: install or reconfigure one NSSM-wrapped service --------------
#
# The "set" command-set is exhaustive; calling it on an existing service
# overwrites every parameter, so the script behaves identically whether
# the service is brand-new or being repaired in-place.

function Install-NssmService {
    param(
        [string]$Name,
        [string]$Executable,
        [string]$Arguments,
        [string]$WorkingDir,
        [string]$LogStem,
        [string[]]$Dependencies = @()
    )

    if (Test-Service $Name) {
        Write-Host "[$Name] already registered -- stopping and reconfiguring in place..." -ForegroundColor DarkGray
        # `nssm stop` waits for graceful shutdown; ignore failures (e.g. already stopped).
        & $nssmExe stop $Name | Out-Null
    } else {
        Write-Host "[$Name] installing fresh..." -ForegroundColor DarkGray
        Invoke-Nssm install $Name $Executable
    }

    # Core process configuration
    Invoke-Nssm set $Name Application       $Executable
    Invoke-Nssm set $Name AppParameters     $Arguments
    Invoke-Nssm set $Name AppDirectory      $WorkingDir
    Invoke-Nssm set $Name DisplayName       "HMAN $Name"
    Invoke-Nssm set $Name Description       "HMAN platform service ($Name) -- supervised by NSSM. See ops/install-windows-service.ps1."
    Invoke-Nssm set $Name Start             SERVICE_AUTO_START

    # Run as the member, not LocalSystem, so the service can read ~/.hman/,
    # the encrypted voice reference, and use BLE / microphone APIs.
    if ($Password) {
        $plain = [System.Runtime.InteropServices.Marshal]::PtrToStringAuto(
            [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($Password)
        )
        Invoke-Nssm set $Name ObjectName $User $plain
    } else {
        # Without -Password, NSSM stores the user but Windows will refuse
        # to start the service until a password is set out-of-band:
        #   sc.exe config $Name obj= "$User" password= "<pwd>"
        # This branch is the "headless install on a build agent" path —
        # the operator runs the password command separately.
        Write-Warning "[$Name] -Password not supplied. Service is registered for $User but will fail to start until you run: sc.exe config $Name obj= `"$User`" password= `"<pwd>`""
        Invoke-Nssm set $Name ObjectName $User
    }

    # Service dependencies (Bluetooth for the bridge, so EEG works post-reboot)
    if ($Dependencies.Count -gt 0) {
        Invoke-Nssm set $Name DependOnService @Dependencies
    } else {
        # Clear any stale dependency from a prior install
        Invoke-Nssm set $Name DependOnService ''
    }

    # Auto-restart on failure: 10s throttle, indefinite retries
    Invoke-Nssm set $Name AppExit Default Restart
    Invoke-Nssm set $Name AppRestartDelay 10000
    Invoke-Nssm set $Name AppThrottle 10000

    # stdout / stderr -> rotating log files
    $stdout = Join-Path $logsDir "$LogStem.service.log"
    $stderr = Join-Path $logsDir "$LogStem.service.err"
    Invoke-Nssm set $Name AppStdout       $stdout
    Invoke-Nssm set $Name AppStderr       $stderr
    Invoke-Nssm set $Name AppRotateFiles  1
    Invoke-Nssm set $Name AppRotateOnline 1
    Invoke-Nssm set $Name AppRotateBytes  52428800   # 50 MB
    Invoke-Nssm set $Name AppStdoutCreationDisposition 4   # OPEN_ALWAYS / append
    Invoke-Nssm set $Name AppStderrCreationDisposition 4
}

# -- Install HMAN-Bridge --------------------------------------------------

Install-NssmService `
    -Name         $BridgeServiceName `
    -Executable   $bridgePython `
    -Arguments    $bridgeEntrypoint `
    -WorkingDir   $bridgeDir `
    -LogStem      'bridge' `
    -Dependencies @('bthserv')

Write-Host "  [$BridgeServiceName] configured: $bridgePython $bridgeEntrypoint (cwd $bridgeDir)" -ForegroundColor Green

# -- Install HMAN-Relay (azure tunnel only) -------------------------------

if ($Tunnel -eq 'azure') {
    Install-NssmService `
        -Name       $RelayServiceName `
        -Executable $relayExe `
        -Arguments  '' `
        -WorkingDir $relayDir `
        -LogStem    'relay'
    Write-Host "  [$RelayServiceName]  configured: $relayExe" -ForegroundColor Green
} else {
    # If a previous install left a relay service hanging around, remove it
    # so `none` mode is actually local-only.
    if (Test-Service $RelayServiceName) {
        Write-Host "  [$RelayServiceName] removing stale service (Tunnel=$Tunnel)..." -ForegroundColor DarkGray
        & $nssmExe stop   $RelayServiceName | Out-Null
        Invoke-Nssm       remove $RelayServiceName confirm
    }
}

# -- Start ----------------------------------------------------------------
#
# `nssm start` is best-effort — if -Password wasn't supplied the service
# can't actually start until the operator sets the credential. Surface the
# error to the console but do not fail the whole install, so the script
# stays idempotent.

Write-Host ""
& $nssmExe start $BridgeServiceName 2>&1 | ForEach-Object { Write-Host "  $_" -ForegroundColor DarkGray }
if ($Tunnel -eq 'azure') {
    & $nssmExe start $RelayServiceName 2>&1 | ForEach-Object { Write-Host "  $_" -ForegroundColor DarkGray }
}

Write-Host ""
Write-Host "  Done." -ForegroundColor Green
Write-Host "  Manage with: services.msc  (or: Get-Service '$BridgeServiceName','$RelayServiceName')" -ForegroundColor DarkGray
Write-Host "  Logs:        $logsDir" -ForegroundColor DarkGray
Write-Host "  Uninstall:   pwsh -File ops/uninstall-windows-service.ps1" -ForegroundColor DarkGray
