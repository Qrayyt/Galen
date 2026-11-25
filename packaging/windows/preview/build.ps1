$ErrorActionPreference = 'Stop'
& "$PSScriptRoot\generate-ui.ps1" -Root $PSScriptRoot
$candidates = @()
$cmd = Get-Command ISCC.exe -ErrorAction SilentlyContinue
if ($cmd) { $candidates += $cmd.Source }
$candidates += "${env:ProgramFiles(x86)}\Inno Setup 6\ISCC.exe", "$env:ProgramFiles\Inno Setup 6\ISCC.exe", "${env:ProgramFiles(x86)}\Inno Setup 7\ISCC.exe", "$env:ProgramFiles\Inno Setup 7\ISCC.exe"
$iscc = $candidates | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $iscc) { throw "Inno Setup 6.6+ required" }
& $iscc "$PSScriptRoot\preview.iss"
if ($LASTEXITCODE -ne 0) { throw "ISCC failed: $LASTEXITCODE" }
$exe = Join-Path $PSScriptRoot 'out\Galen-Installer-Visual-Preview.exe'
if (-not (Test-Path $exe)) { throw "Preview EXE missing" }
Get-Item $exe
Get-FileHash $exe -Algorithm SHA256
