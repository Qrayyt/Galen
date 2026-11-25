# Runs only on an ephemeral GitHub-hosted Windows runner.
param([Parameter(Mandatory=$true)][string] $Installer)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
if ($env:GITHUB_ACTIONS -ne 'true' -or $env:RUNNER_ENVIRONMENT -ne 'github-hosted') {
    throw 'Refusing installation smoke outside an ephemeral hosted runner'
}
$installerPath = (Resolve-Path -LiteralPath $Installer).Path
$root = Join-Path $env:RUNNER_TEMP ('galen-smoke-' + [guid]::NewGuid().ToString('N'))
$installDir = Join-Path $root 'app'
$evidence = Join-Path $env:RUNNER_TEMP 'galen-install-smoke'
New-Item -ItemType Directory -Path $root,$evidence -Force | Out-Null
$profile = Join-Path $env:LOCALAPPDATA 'GalenData'
if (Test-Path $profile) { throw 'Unexpected existing Galen profile; refusing to alter it' }
New-Item -ItemType Directory -Path $profile | Out-Null
$sentinel = Join-Path $profile 'ci-preserve.txt'
$nonce = [guid]::NewGuid().ToString()
Set-Content -LiteralPath $sentinel -Value $nonce
function Invoke-Wait([string] $File, [string[]] $Arguments, [int] $TimeoutSeconds) {
    $p = Start-Process -FilePath $File -ArgumentList $Arguments -PassThru
    if (-not $p.WaitForExit($TimeoutSeconds * 1000)) {
        Stop-Process -Id $p.Id -Force -ErrorAction SilentlyContinue
        throw "Timed out: $File"
    }
    $p.Refresh()
    if ($p.ExitCode -ne 0) { throw "Nonzero exit ($($p.ExitCode)): $File" }
}
function Assert-Profile {
    if (-not (Test-Path -LiteralPath $sentinel) -or
        (Get-Content -LiteralPath $sentinel -Raw).Trim() -ne $nonce) {
        throw 'Installer changed or deleted profile data'
    }
}
function Assert-Installed {
    foreach ($name in @('GalenApp.exe','GalenRealtime.exe','galen.exe')) {
        if (-not (Test-Path -LiteralPath (Join-Path $installDir $name) -PathType Leaf)) {
            throw "Missing installed file: $name"
        }
    }
    $cli = Join-Path $installDir 'galen.exe'
    $output = Join-Path $evidence 'cli-version.txt'
    $p = Start-Process -FilePath $cli -ArgumentList '--version' -RedirectStandardOutput $output -RedirectStandardError (Join-Path $evidence 'cli-stderr.txt') -PassThru
    if (-not $p.WaitForExit(60000)) {
        Stop-Process -Id $p.Id -Force -ErrorAction SilentlyContinue
        throw 'Installed CLI version check timed out'
    }
    $p.Refresh()
    if ($p.ExitCode -ne 0 -or (Get-Content -LiteralPath $output -Raw) -notmatch '\d+\.\d+\.\d+') {
        throw 'Installed CLI version check failed'
    }
    Assert-Profile
}
try {
    foreach ($phase in @('install','reinstall')) {
        $log = Join-Path $evidence "$phase.log"
        Invoke-Wait $installerPath @('/VERYSILENT','/SUPPRESSMSGBOXES','/NORESTART','/CURRENTUSER','/TASKS=""',"/DIR=""$installDir""","/LOG=""$log""") 900
        Assert-Installed
    }
    $uninstall = Join-Path $installDir 'unins000.exe'
    if (-not (Test-Path -LiteralPath $uninstall)) { throw 'Missing uninstaller' }
    $log = Join-Path $evidence 'uninstall.log'
    Invoke-Wait $uninstall @('/VERYSILENT','/SUPPRESSMSGBOXES','/NORESTART',"/LOG=""$log""") 300
    if (Test-Path -LiteralPath (Join-Path $installDir 'GalenApp.exe')) { throw 'Application survived uninstall' }
    Assert-Profile
    Set-Content -LiteralPath (Join-Path $evidence 'result.txt') -Value 'Fresh installation, installed CLI, same-version reinstall, uninstall and sentinel preservation passed. Interactive UI and prior-version data migration are not covered.'
} finally {
    # This folder was created by this script and contains only synthetic data.
    if (Test-Path -LiteralPath $profile) { Remove-Item -LiteralPath $profile -Recurse -Force }
}
