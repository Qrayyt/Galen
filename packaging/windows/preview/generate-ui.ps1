param([string]$Root = $PSScriptRoot)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$out = Join-Path $Root 'ui\generated'
New-Item -ItemType Directory -Force $out | Out-Null
Get-ChildItem $out -File -Filter '*.bmp' | Remove-Item -Force
$bg = [Drawing.Color]::FromArgb(41,41,41)
$white = [Drawing.Color]::FromArgb(244,244,244)
$ink = [Drawing.Color]::FromArgb(25,25,25)

function Save-Logo {
    $bmp = New-Object Drawing.Bitmap 324,348,([Drawing.Imaging.PixelFormat]::Format24bppRgb)
    $g = [Drawing.Graphics]::FromImage($bmp)
    $logo = [Drawing.Image]::FromFile((Resolve-Path (Join-Path $Root '..\..\..\assets\galen-brand\mark-dark.png')).Path)
    try {
        $g.Clear($bg)
        $g.InterpolationMode = [Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
        $g.SmoothingMode = [Drawing.Drawing2D.SmoothingMode]::AntiAlias
        $scale = [Math]::Min(324.0 / $logo.Width,348.0 / $logo.Height)
        $w = [int]($logo.Width * $scale)
        $h = [int]($logo.Height * $scale)
        $g.DrawImage($logo, [int]((324-$w)/2), [int]((348-$h)/2), $w, $h)
        $bmp.Save((Join-Path $out 'logo.bmp'), [Drawing.Imaging.ImageFormat]::Bmp)
    } finally { $logo.Dispose(); $g.Dispose(); $bmp.Dispose() }
}

function Save-Button([string]$Name,[string]$Caption) {
    $bmp = New-Object Drawing.Bitmap 402,102,([Drawing.Imaging.PixelFormat]::Format24bppRgb)
    $g = [Drawing.Graphics]::FromImage($bmp)
    $path = New-Object Drawing.Drawing2D.GraphicsPath
    $brush = New-Object Drawing.SolidBrush $white
    $text = New-Object Drawing.SolidBrush $ink
    $font = New-Object Drawing.Font 'Segoe UI', 40, ([Drawing.FontStyle]::Regular), ([Drawing.GraphicsUnit]::Pixel)
    $fmt = New-Object Drawing.StringFormat
    try {
        $g.Clear($bg)
        $g.SmoothingMode = [Drawing.Drawing2D.SmoothingMode]::AntiAlias
        $g.TextRenderingHint = [Drawing.Text.TextRenderingHint]::AntiAliasGridFit
        $d = 24
        $path.AddArc(0,0,$d,$d,180,90)
        $path.AddArc(401-$d,0,$d,$d,270,90)
        $path.AddArc(401-$d,101-$d,$d,$d,0,90)
        $path.AddArc(0,101-$d,$d,$d,90,90)
        $path.CloseFigure()
        $g.FillPath($brush,$path)
        $fmt.Alignment = [Drawing.StringAlignment]::Center
        $fmt.LineAlignment = [Drawing.StringAlignment]::Center
        $g.DrawString($Caption,$font,$text,[Drawing.RectangleF]::new(0,0,402,102),$fmt)
        $bmp.Save((Join-Path $out $Name),[Drawing.Imaging.ImageFormat]::Bmp)
    } finally {
        $fmt.Dispose(); $font.Dispose(); $text.Dispose(); $brush.Dispose(); $path.Dispose(); $g.Dispose(); $bmp.Dispose()
    }
}

function Save-Solid([string]$Name,[Drawing.Color]$Color) {
    $bmp = New-Object Drawing.Bitmap 8,8,([Drawing.Imaging.PixelFormat]::Format24bppRgb)
    $g = [Drawing.Graphics]::FromImage($bmp)
    try { $g.Clear($Color); $bmp.Save((Join-Path $out $Name),[Drawing.Imaging.ImageFormat]::Bmp) }
    finally { $g.Dispose(); $bmp.Dispose() }
}

Save-Logo
Save-Button 'install.bmp' 'Установить'
Save-Button 'finish.bmp' 'Готово'
Save-Solid 'track.bmp' ([Drawing.Color]::FromArgb(83,83,83))
Save-Solid 'fill.bmp' $white
