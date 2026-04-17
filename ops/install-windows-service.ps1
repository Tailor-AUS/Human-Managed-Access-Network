# .HMAN — register the bridge + tunnel as Windows auto-start services.
# Requires: run as Administrator (PowerShell → Run as Admin).
#
#   pwsh -File ops/install-windows-service.ps1
#
# Uses the Windows Task Scheduler (simpler than creating a true Windows
# service for a Python process). Runs at user logon, restarts on failure.

[CmdletBinding()]
param(
    [string]$TaskName = 'HMAN-Bridge',
    [string]$Tunnel = 'named'      # 'none' | 'quick' | 'named'
)

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
$script = Join-Path $repoRoot 'ops/start-bridge.ps1'

if (-not (Test-Path $script)) {
    throw "Launch script not found: $script"
}

# Remove existing task if it's there
if (Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue) {
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
    Write-Host "Removed existing task $TaskName" -ForegroundColor DarkGray
}

$action = New-ScheduledTaskAction `
    -Execute 'powershell.exe' `
    -Argument "-NoProfile -WindowStyle Hidden -File `"$script`" -Tunnel $Tunnel"

$trigger = New-ScheduledTaskTrigger -AtLogOn
$settings = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -StartWhenAvailable `
    -RestartInterval (New-TimeSpan -Minutes 1) `
    -RestartCount 5

Register-ScheduledTask `
    -TaskName $TaskName `
    -Action $action `
    -Trigger $trigger `
    -Settings $settings `
    -RunLevel Highest `
    -Description '.HMAN bridge + tunnel — runs at login, restarts on failure'

Write-Host ""
Write-Host "  Task registered: $TaskName" -ForegroundColor Green
Write-Host "  Runs at logon.  Manage with: Get-ScheduledTask -TaskName '$TaskName'" -ForegroundColor DarkGray
Write-Host "  Start now:      Start-ScheduledTask -TaskName '$TaskName'" -ForegroundColor DarkGray
Write-Host "  Stop:           Stop-ScheduledTask -TaskName '$TaskName'" -ForegroundColor DarkGray
Write-Host "  Remove:         Unregister-ScheduledTask -TaskName '$TaskName' -Confirm:\$false" -ForegroundColor DarkGray
