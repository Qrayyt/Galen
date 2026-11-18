param([string]$Binary = "")
if (-not $Binary) {
    $Binary = Join-Path $PSScriptRoot "bin\openrealtime.exe"
}
if (-not (Test-Path $Binary)) { throw "OpenRealtime binary not found. Build it first." }
& $Binary companion -client browser
