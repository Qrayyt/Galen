#Requires -Version 5.1
param(
    [Parameter(Mandatory=$true)][string]$Shell,
    [Parameter(Mandatory=$true)][string]$Engine,
    [Parameter(Mandatory=$true)][string]$Output
)
$ErrorActionPreference = 'Stop'
$magic = [Text.Encoding]::ASCII.GetBytes('GLNTIS01')
$engineFile = Get-Item -LiteralPath $Engine
$sha = [Security.Cryptography.SHA256]::Create()
$source = [IO.File]::OpenRead($engineFile.FullName)
try { $digest = $sha.ComputeHash($source) } finally { $source.Dispose(); $sha.Dispose() }
$stage = "$Output.$([Guid]::NewGuid().ToString('N')).tmp"
try {
    $dest = [IO.File]::Open($stage, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write)
    try {
        foreach ($path in @($Shell,$Engine)) {
            $source = [IO.File]::OpenRead($path)
            try { $source.CopyTo($dest, 1048576) } finally { $source.Dispose() }
        }
        $dest.Write($magic,0,$magic.Length)
        $length = [BitConverter]::GetBytes([long]$engineFile.Length)
        $dest.Write($length,0,$length.Length)
        $dest.Write($digest,0,$digest.Length)
    } finally { $dest.Dispose() }
    Move-Item -LiteralPath $stage -Destination $Output -Force
} finally {
    if (Test-Path -LiteralPath $stage) { Remove-Item -LiteralPath $stage -Force }
}
