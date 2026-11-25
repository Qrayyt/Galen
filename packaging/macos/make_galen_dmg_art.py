"""Generate branded macOS installer assets from the repository's Galen artwork."""
import argparse
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[2]
BRAND = ROOT / "assets/galen-brand"

def font(size, bold=False):
    path = Path("/System/Library/Fonts/Supplemental") / ("Arial Bold.ttf" if bold else "Arial.ttf")
    return ImageFont.truetype(str(path), size) if path.is_file() else ImageFont.load_default(size=size)

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--icon-only", action="store_true")
    parser.add_argument("--stage", type=Path)
    args = parser.parse_args()
    if args.icon_only:
        Image.open(BRAND / "icon.png").convert("RGBA").save(BRAND / "icon.icns")
        return
    stage = args.stage.resolve()
    image = Image.new("RGB", (640, 400), "#f5f5f5")
    draw = ImageDraw.Draw(image)
    mark = Image.open(BRAND / "mark-light.png").convert("RGBA")
    mark.thumbnail((40, 40), Image.Resampling.LANCZOS)
    image.paste(mark, (28, 25), mark)
    draw.text((80, 29), "Galen", font=font(26, True), fill="#151515")
    draw.text((80, 61), "YOUR PERSONAL AI ASSISTANT", font=font(10), fill="#646464")
    draw.line((28, 93, 612, 93), fill="#d9d9d9", width=1)
    draw.line((278, 214, 362, 214), fill="#444444", width=2)
    draw.line((351, 204, 362, 214, 351, 224), fill="#444444", width=2)
    draw.text((320, 324), "Drag Galen into Applications", font=font(17, True), fill="#222222", anchor="mm")
    draw.text((320, 352), "Перетащите Galen в папку Программы", font=font(13), fill="#666666", anchor="mm")
    image.save(stage.parent / "galen-dmg-background.png")

if __name__ == "__main__":
    main()
