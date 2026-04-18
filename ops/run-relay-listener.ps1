# Debug helper — load bridge.env, run the relay listener in foreground with
# visible output. Kill with Ctrl-C when done.
$envFile = Join-Path $env:USERPROFILE '.hman\bridge.env'
if (-not (Test-Path $envFile)) { throw "Missing $envFile. Run ops/azure-deploy.ps1 first." }

Write-Host "Loading $envFile..."
Get-Content $envFile | ForEach-Object {
    if ($_ -match '^([^=#]+)=(.*)$') {
        $k = $Matches[1].Trim()
        $v = $Matches[2].Trim()
        Set-Item -Path ("env:" + $k) -Value $v
        if ($k -in @('HMAN_AUTH_TOKEN', 'HMAN_RELAY_KEY')) {
            Write-Host "  $k = ***"
        } else {
            Write-Host "  $k = $v"
        }
    }
}

$repoRoot = Split-Path -Parent $PSScriptRoot
$exe = Join-Path $repoRoot 'packages/bridge-relay-listener/bin/Release/net9.0/hman-bridge-relay.exe'
if (-not (Test-Path $exe)) {
    Write-Host "Building listener..."
    Push-Location (Split-Path -Parent $exe | Split-Path -Parent | Split-Path -Parent | Split-Path -Parent)
    try { dotnet build -c Release | Out-Null } finally { Pop-Location }
}

Write-Host ""
Write-Host "Starting $exe (Ctrl-C to stop)..."
Write-Host ""
& $exe
