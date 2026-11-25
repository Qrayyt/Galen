param(
    [string]$Root = ""
)

$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Drawing

if (-not $Root) { $Root = $PSScriptRoot }

$config = & (Join-Path $Root "config.ps1")
$outDir = Join-Path $Root "ui\generated"
$fontDir = Join-Path $Root "ui\fonts"
New-Item -ItemType Directory -Path $outDir -Force | Out-Null
Get-ChildItem $outDir -File -ErrorAction SilentlyContinue | Remove-Item -Force
New-Item -ItemType Directory -Path $fontDir -Force | Out-Null

$bg        = [Drawing.Color]::FromArgb(0x10, 0x10, 0x10)
$accent    = [Drawing.Color]::FromArgb([int]$config.AccentR, [int]$config.AccentG, [int]$config.AccentB)
$accentHov = [Drawing.Color]::FromArgb(
    [Math]::Min(255, [int]$config.AccentR + 24),
    [Math]::Min(255, [int]$config.AccentG + 24),
    [Math]::Min(255, [int]$config.AccentB + 24)
)
$cream     = [Drawing.Color]::FromArgb(0xF2, 0xF2, 0xF2)
$muted     = [Drawing.Color]::FromArgb(0xA0, 0xA0, 0xA0)
$stepDone  = [Drawing.Color]::FromArgb(0x2A, 0x2A, 0x2A)

# Local Windows fonts: no font downloads.
$barlow = New-Object Drawing.FontFamily "Segoe UI"
$sourceSans = New-Object Drawing.FontFamily "Segoe UI"

function New-PxFont([Drawing.FontFamily]$Family, [int]$SizePx, [Drawing.FontStyle]$Style = [Drawing.FontStyle]::Regular) {
    return New-Object Drawing.Font $Family, $SizePx, $Style, ([Drawing.GraphicsUnit]::Pixel)
}

function Save-Bmp24 {
    param([Drawing.Bitmap]$Source, [string]$Path)

    $width  = $Source.Width
    $height = $Source.Height
    $bmp    = New-Object Drawing.Bitmap $width, $height, ([Drawing.Imaging.PixelFormat]::Format24bppRgb)
    $g      = [Drawing.Graphics]::FromImage($bmp)
    $g.CompositingQuality = [Drawing.Drawing2D.CompositingQuality]::HighQuality
    $g.InterpolationMode  = [Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.SmoothingMode      = [Drawing.Drawing2D.SmoothingMode]::HighQuality
    $g.Clear($bg)
    $g.DrawImage($Source, 0, 0, $width, $height)
    $g.Dispose()

    $rect       = New-Object Drawing.Rectangle 0, 0, $width, $height
    $bits       = $bmp.LockBits($rect, [Drawing.Imaging.ImageLockMode]::ReadOnly, [Drawing.Imaging.PixelFormat]::Format24bppRgb)
    $stride     = [Math]::Abs($bits.Stride)
    $pixelBytes = New-Object byte[] ($stride * $height)
    [Runtime.InteropServices.Marshal]::Copy($bits.Scan0, $pixelBytes, 0, $pixelBytes.Length)
    $bmp.UnlockBits($bits)
    $bmp.Dispose()

    $rowSize   = [Math]::Ceiling($width * 3 / 4.0) * 4
    $pixelSize = $rowSize * $height
    $fileSize  = 54 + $pixelSize
    $header    = New-Object byte[] 54
    $header[0] = 0x42; $header[1] = 0x4D
    [BitConverter]::GetBytes([int]$fileSize).CopyTo($header, 2)
    [BitConverter]::GetBytes([int]54).CopyTo($header, 10)
    [BitConverter]::GetBytes([int]40).CopyTo($header, 14)
    [BitConverter]::GetBytes([int]$width).CopyTo($header, 18)
    [BitConverter]::GetBytes([int]$height).CopyTo($header, 22)
    [BitConverter]::GetBytes([int16]1).CopyTo($header, 26)
    [BitConverter]::GetBytes([int16]24).CopyTo($header, 28)

    $pixels = New-Object byte[] $pixelSize
    for ($y = 0; $y -lt $height; $y++) {
        $srcRow = ($height - 1 - $y) * $stride
        $dstRow = $y * $rowSize
        [Buffer]::BlockCopy($pixelBytes, $srcRow, $pixels, $dstRow, $width * 3)
    }

    $stream = [IO.File]::Open($Path, [IO.FileMode]::Create, [IO.FileAccess]::Write)
    try {
        $stream.Write($header, 0, $header.Length)
        $stream.Write($pixels, 0, $pixels.Length)
    }
    finally { $stream.Dispose() }
}

$typo = [Drawing.StringFormat]::GenericTypographic
$typo.FormatFlags = $typo.FormatFlags -bor [Drawing.StringFormatFlags]::MeasureTrailingSpaces

function Measure-Glyph([Drawing.Graphics]$G, [string]$Ch, [Drawing.Font]$Font) {
    return $G.MeasureString($Ch, $Font, ([Drawing.PointF]::new(0, 0)), $typo)
}

function Draw-TrackedLine {
    param(
        [Drawing.Graphics]$G,
        [string]$Text,
        [Drawing.Font]$Font,
        [Drawing.Brush]$Brush,
        [float]$X, [float]$Y,
        [float]$Tracking = 0.14,
        [ValidateSet("Left","Center")][string]$Align = "Left",
        [float]$BoxWidth = 0
    )
    $extra = $Font.Size * $Tracking
    $total = 0.0
    $chars = $Text.ToCharArray()
    for ($i = 0; $i -lt $chars.Length; $i++) {
        $total += (Measure-Glyph $G ([string]$chars[$i]) $Font).Width
        if ($i -lt $chars.Length - 1) { $total += $extra }
    }
    $cursor = $X
    if ($Align -eq "Center" -and $BoxWidth -gt 0) {
        $cursor = $X + (($BoxWidth - $total) / 2)
    }
    foreach ($ch in $chars) {
        $G.DrawString([string]$ch, $Font, $Brush, $cursor, $Y, $typo)
        $cursor += (Measure-Glyph $G ([string]$ch) $Font).Width + $extra
    }
}

# Neutral abstract backdrop — no logos, no product photography.
function New-NeutralBackdrop([int]$Width, [int]$Height) {
    $bmp = New-Object Drawing.Bitmap $Width, $Height, ([Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $g = [Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = [Drawing.Drawing2D.SmoothingMode]::AntiAlias

    $base = New-Object Drawing.Drawing2D.LinearGradientBrush(
        (New-Object Drawing.Rectangle 0, 0, $Width, $Height),
        [Drawing.Color]::FromArgb(0x12, 0x12, 0x12),
        [Drawing.Color]::FromArgb(0x24, 0x24, 0x24),
        55.0
    )
    $g.FillRectangle($base, 0, 0, $Width, $Height)
    $base.Dispose()

    $glowH = [int]($Height * 0.55)
    $glowRect = New-Object Drawing.Rectangle(0, 0, $Width, $glowH)
    $glow = New-Object Drawing.Drawing2D.LinearGradientBrush(
        $glowRect,
        [Drawing.Color]::FromArgb(55, $accent.R, $accent.G, $accent.B),
        [Drawing.Color]::FromArgb(0, $accent.R, $accent.G, $accent.B),
        [Drawing.Drawing2D.LinearGradientMode]::Vertical
    )
    $g.FillRectangle($glow, $glowRect)
    $glow.Dispose()

    $gridPen = New-Object Drawing.Pen ([Drawing.Color]::FromArgb(28, 255, 255, 255), 1)
    for ($x = 40; $x -lt $Width; $x += 64) { $g.DrawLine($gridPen, $x, 0, $x, $Height) }
    for ($y = 40; $y -lt $Height; $y += 64) { $g.DrawLine($gridPen, 0, $y, $Width, $y) }
    $gridPen.Dispose()

    $g.Dispose()
    return $bmp
}

function Draw-Wordmark([Drawing.Graphics]$G, [string]$SubText) {
    $titleFont = New-PxFont $barlow 36 ([Drawing.FontStyle]::Bold)
    $subFont   = New-PxFont $sourceSans 28
    $creamBr   = New-Object Drawing.SolidBrush $cream
    $mutedBr   = New-Object Drawing.SolidBrush $muted

    $topRect = New-Object Drawing.Rectangle 0, 0, 520, 110
    $topGrad = New-Object Drawing.Drawing2D.LinearGradientBrush(
        $topRect,
        [Drawing.Color]::FromArgb(190, 0x10, 0x10, 0x10),
        [Drawing.Color]::FromArgb(0, 0x10, 0x10, 0x10),
        [Drawing.Drawing2D.LinearGradientMode]::Horizontal
    )
    $G.FillRectangle($topGrad, $topRect)
    $topGrad.Dispose()

    # Neutral label — not a brand logo mark.
    Draw-TrackedLine $G "GALEN" $titleFont $creamBr 48 44 0.10 "Left"
    $G.DrawLine((New-Object Drawing.Pen($mutedBr, 2)), 220, 48, 220, 82)
    $G.DrawString($SubText, $subFont, $mutedBr, 236, 54, $typo)

    $titleFont.Dispose(); $subFont.Dispose()
    $creamBr.Dispose(); $mutedBr.Dispose()
}

function Draw-StepIndicator {
    param(
        [Drawing.Graphics]$G,
        [int]$ActiveStep,
        [string[]]$Labels
    )

    $stepFont = New-PxFont $sourceSans 24
    $numFont  = New-PxFont $barlow 32 ([Drawing.FontStyle]::Bold)
    $creamBr  = New-Object Drawing.SolidBrush $cream
    $mutedBr  = New-Object Drawing.SolidBrush $muted
    $accentBr = New-Object Drawing.SolidBrush $accent
    $doneBr   = New-Object Drawing.SolidBrush $stepDone

    $scrimRect = New-Object Drawing.Rectangle 0, 980, 800, 300
    $scrimGrad = New-Object Drawing.Drawing2D.LinearGradientBrush(
        $scrimRect,
        [Drawing.Color]::FromArgb(0, 0x10, 0x10, 0x10),
        [Drawing.Color]::FromArgb(210, 0x10, 0x10, 0x10),
        [Drawing.Drawing2D.LinearGradientMode]::Vertical
    )
    $G.FillRectangle($scrimGrad, $scrimRect)
    $scrimGrad.Dispose()

    $cx = @(128, 400, 672)
    $cy = 1080
    $r  = 28

    for ($i = 0; $i -lt 3; $i++) {
        $step = $i + 1
        $isActive = ($step -eq $ActiveStep)
        $isDone   = ($step -lt $ActiveStep)

        if ($i -lt 2) {
            $linePen = if ($isDone) { New-Object Drawing.Pen $accent, 2 } else { New-Object Drawing.Pen $stepDone, 2 }
            $G.DrawLine($linePen, $cx[$i] + $r + 8, $cy, $cx[$i + 1] - $r - 8, $cy)
            $linePen.Dispose()
        }

        $circleRect = New-Object Drawing.Rectangle ($cx[$i] - $r), ($cy - $r), ($r * 2), ($r * 2)
        if ($isActive) {
            $G.FillEllipse($doneBr, $circleRect)
            $pen = New-Object Drawing.Pen $accent, 4
            $G.DrawEllipse($pen, $circleRect)
            $pen.Dispose()
        } elseif ($isDone) {
            $G.FillEllipse($accentBr, $circleRect)
        } else {
            $G.FillEllipse($doneBr, $circleRect)
            $pen = New-Object Drawing.Pen ([Drawing.Color]::FromArgb(0x44, 0x44, 0x48), 2)
            $G.DrawEllipse($pen, $circleRect)
            $pen.Dispose()
        }

        $numStr = "$step"
        $numSize = $G.MeasureString($numStr, $numFont)
        $nx = $cx[$i] - ($numSize.Width / 2)
        $ny = $cy - ($numSize.Height / 2) + 2
        $numBrush = if ($isDone) { [Drawing.Brushes]::Black } elseif ($isActive) { $creamBr } else { $mutedBr }
        $G.DrawString($numStr, $numFont, $numBrush, $nx, $ny, $typo)

        $lbl = $Labels[$i]
        $lblSize = $G.MeasureString($lbl, $stepFont)
        $lblBrush = if ($isActive) { $creamBr } else { $mutedBr }
        $G.DrawString($lbl, $stepFont, $lblBrush, ($cx[$i] - $lblSize.Width / 2), ($cy + $r + 16), $typo)
    }

    $stepFont.Dispose(); $numFont.Dispose()
    $creamBr.Dispose(); $mutedBr.Dispose(); $accentBr.Dispose(); $doneBr.Dispose()
}

function Save-HeroFrame {
    param(
        [string]$Path,
        [string]$LogoSub,
        [int]$ActiveStep,
        [string[]]$StepLabels,
        [string]$HeadLine,
        [string]$BodyLine
    )

    $frame = New-NeutralBackdrop 800 1280
    $g = [Drawing.Graphics]::FromImage($frame)
    $g.SmoothingMode = [Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.TextRenderingHint = [Drawing.Text.TextRenderingHint]::AntiAliasGridFit

    Draw-Wordmark $g $LogoSub
    $logoPath = Join-Path $Root "..\..\..\assets\galen-brand\mark-dark.png"
    $logo = [Drawing.Image]::FromFile((Resolve-Path $logoPath).Path)
    try {
        $lw = 300; $lh = [int]($lw * $logo.Height / $logo.Width)
        $g.DrawImage($logo, [int]((800-$lw)/2), [int](320-$lh/2), $lw, $lh)
    } finally { $logo.Dispose() }

    $midRect = New-Object Drawing.Rectangle 0, 500, 800, 600
    $midGrad = New-Object Drawing.Drawing2D.LinearGradientBrush(
        $midRect,
        [Drawing.Color]::FromArgb(0, 0x10, 0x10, 0x10),
        [Drawing.Color]::FromArgb(180, 0x10, 0x10, 0x10),
        [Drawing.Drawing2D.LinearGradientMode]::Vertical
    )
    $g.FillRectangle($midGrad, $midRect)
    $midGrad.Dispose()

    if ($HeadLine) {
        $headFont = New-PxFont $barlow 72 ([Drawing.FontStyle]::Bold)
        $bodyFont = New-PxFont $sourceSans 28
        $creamBr  = New-Object Drawing.SolidBrush $cream
        $mutedBr  = New-Object Drawing.SolidBrush $muted
        $g.DrawString($HeadLine, $headFont, $creamBr, 48, 620, $typo)
        if ($BodyLine) { $g.DrawString($BodyLine, $bodyFont, $mutedBr, 48, 710, $typo) }
        $metaFont = New-PxFont $sourceSans 22
        $g.DrawString(("v{0}  ·  Windows" -f $config.Version), $metaFont, $mutedBr, 48, 760, $typo)
        $headFont.Dispose(); $bodyFont.Dispose(); $metaFont.Dispose()
        $creamBr.Dispose(); $mutedBr.Dispose()
    }

    Draw-StepIndicator $g $ActiveStep $StepLabels
    $g.Dispose()
    Save-Bmp24 $frame $Path
    $frame.Dispose()
    Write-Host ("  {0}" -f [IO.Path]::GetFileName($Path))
}

$short = [string]$config.AppShortName
$stepsRu = @("Параметры", "Установка", "Завершение")
$stepsEn = @("Parameters", "Installing", "Finished")

Write-Host "Generating hero frames..."
Save-HeroFrame (Join-Path $outDir "hero-welcome-ru.bmp") "Установщик" 1 $stepsRu $short "Готовы к установке."
Save-HeroFrame (Join-Path $outDir "hero-welcome-en.bmp") "Installer"  1 $stepsEn $short "Ready when you are."
Save-HeroFrame (Join-Path $outDir "hero-installing-ru.bmp") "Установщик" 2 $stepsRu $short "Копирование файлов..."
Save-HeroFrame (Join-Path $outDir "hero-installing-en.bmp") "Installer"  2 $stepsEn $short "Copying files..."
Save-HeroFrame (Join-Path $outDir "hero-finished-ru.bmp") "Установщик" 3 $stepsRu $short "Готово!"
Save-HeroFrame (Join-Path $outDir "hero-finished-en.bmp") "Installer"  3 $stepsEn $short "Done!"

function New-NextBtn([string]$Text, [Drawing.Color]$Fill, [string]$OutFile) {
    $w = 412; $h = 96
    $bmp = New-Object Drawing.Bitmap $w, $h, ([Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $g = [Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = [Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.TextRenderingHint = [Drawing.Text.TextRenderingHint]::AntiAliasGridFit
    $g.Clear($bg)

    $radius = 12
    $rect = New-Object Drawing.Rectangle 0, 0, $w, $h
    $gp = New-Object Drawing.Drawing2D.GraphicsPath
    $gp.AddArc($rect.X, $rect.Y, $radius * 2, $radius * 2, 180, 90)
    $gp.AddArc($rect.Right - $radius * 2, $rect.Y, $radius * 2, $radius * 2, 270, 90)
    $gp.AddArc($rect.Right - $radius * 2, $rect.Bottom - $radius * 2, $radius * 2, $radius * 2, 0, 90)
    $gp.AddArc($rect.X, $rect.Bottom - $radius * 2, $radius * 2, $radius * 2, 90, 90)
    $gp.CloseFigure()

    $fillBr = New-Object Drawing.SolidBrush $Fill
    $g.FillPath($fillBr, $gp)

    $font = New-PxFont $barlow 40 ([Drawing.FontStyle]::Bold)
    $textBr = New-Object Drawing.SolidBrush ([Drawing.Color]::FromArgb(0x10,0x10,0x10))
    $lineH = $font.GetHeight($g)
    Draw-TrackedLine $g ($Text.ToUpper() + "  >") $font $textBr 0 (($h - $lineH) / 2) 0.03 "Center" $w

    $font.Dispose(); $textBr.Dispose(); $fillBr.Dispose(); $gp.Dispose(); $g.Dispose()
    Save-Bmp24 $bmp $OutFile
    $bmp.Dispose()
    Write-Host ("  {0}" -f [IO.Path]::GetFileName($OutFile))
}

Write-Host "Generating button BMPs..."
New-NextBtn "Установить" $accent    (Join-Path $outDir "btn-install-ru.bmp")
New-NextBtn "Install"    $accent    (Join-Path $outDir "btn-install-en.bmp")
New-NextBtn "Далее"      $accent    (Join-Path $outDir "btn-next-ru.bmp")
New-NextBtn "Next"       $accent    (Join-Path $outDir "btn-next-en.bmp")
New-NextBtn "Готово"  $accent    (Join-Path $outDir "btn-launch-ru.bmp")
New-NextBtn "Done"     $accent    (Join-Path $outDir "btn-launch-en.bmp")

Write-Host "Generating progress BMPs..."
$track = [Drawing.Color]::FromArgb(0x3A, 0x3A, 0x3A)
$solid = New-Object Drawing.Bitmap 8, 8, ([Drawing.Imaging.PixelFormat]::Format32bppArgb)
$sg = [Drawing.Graphics]::FromImage($solid)
$sg.Clear($track); $sg.Dispose()
Save-Bmp24 $solid (Join-Path $outDir "progress-track.bmp")
$sg = [Drawing.Graphics]::FromImage($solid)
$sg.Clear($accent); $sg.Dispose()
Save-Bmp24 $solid (Join-Path $outDir "progress-fill.bmp")
$solid.Dispose()

Write-Host ""
Write-Host "Installer UI ready in $outDir"
