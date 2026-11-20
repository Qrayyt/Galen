#!/usr/bin/env python3
"""Generate every Galen app-logo surface from the user-supplied SVG.

The source of truth is ``dodaios/assets/icons/galen.svg``. The generator keeps
the four original vector paths unchanged, places them on a square canvas with
consistent optical padding, and renders the Windows and web assets at their
native sizes. It deliberately supports only the SVG commands used by the Galen
mark (M, L, H, V, C and Z), so an incompatible source edit fails instead of
producing
a subtly broken icon.
"""

from __future__ import annotations

import argparse
import re
import shutil
import xml.etree.ElementTree as ET
from dataclasses import dataclass
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / "dodaios" / "assets" / "icons" / "galen.svg"
BRAND_DIR = ROOT / "assets" / "galen-brand"
FRONTEND = ROOT / "dodaios" / "ui" / "web" / "frontend"

SOURCE_WIDTH = 862.0
SOURCE_HEIGHT = 924.0
PADDING = 0.10
SUPERSAMPLE = 4
CURVE_STEPS = 24
ICO_SIZES = (256, 128, 64, 48, 40, 32, 24, 20, 16)

Image = None
ImageChops = None
ImageDraw = None

TOKEN_RE = re.compile(r"[A-Za-z]|[-+]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][-+]?\d+)?")
PLACEHOLDER_COMMANDS = {"M", "L", "H", "V", "C", "Z"}


@dataclass(frozen=True)
class SvgPath:
    data: str
    evenodd: bool


def require_pillow() -> None:
    global Image, ImageChops, ImageDraw
    try:
        from PIL import Image as pillow_image
        from PIL import ImageChops as pillow_chops
        from PIL import ImageDraw as pillow_draw
    except ImportError as exc:  # pragma: no cover - developer dependency guard
        raise SystemExit("Pillow is required: python -m pip install Pillow") from exc
    Image = pillow_image
    ImageChops = pillow_chops
    ImageDraw = pillow_draw


def source_paths() -> list[SvgPath]:
    tree = ET.parse(SOURCE)
    root = tree.getroot()
    view_box = root.attrib.get("viewBox", "")
    if view_box != "0 0 862 924":
        raise SystemExit(f"Unexpected Galen SVG viewBox: {view_box!r}")
    paths: list[SvgPath] = []
    for node in root.iter():
        if node.tag.rsplit("}", 1)[-1] != "path":
            continue
        data = node.attrib.get("d")
        if not data:
            raise SystemExit("Galen SVG contains a path without d data")
        commands = set(re.findall(r"[A-Za-z]", data.upper()))
        if not commands <= PLACEHOLDER_COMMANDS:
            raise SystemExit(f"Unsupported SVG path commands: {sorted(commands)}")
        paths.append(SvgPath(data, node.attrib.get("fill-rule") == "evenodd"))
    if len(paths) != 4:
        raise SystemExit(f"Expected four Galen paths, found {len(paths)}")
    return paths


def _cubic(
    p0: tuple[float, float],
    p1: tuple[float, float],
    p2: tuple[float, float],
    p3: tuple[float, float],
    t: float,
) -> tuple[float, float]:
    u = 1.0 - t
    return (
        u**3 * p0[0] + 3 * u**2 * t * p1[0] + 3 * u * t**2 * p2[0] + t**3 * p3[0],
        u**3 * p0[1] + 3 * u**2 * t * p1[1] + 3 * u * t**2 * p2[1] + t**3 * p3[1],
    )


def polygons(data: str) -> list[list[tuple[float, float]]]:
    tokens = TOKEN_RE.findall(data)
    result: list[list[tuple[float, float]]] = []
    current: list[tuple[float, float]] = []
    point = (0.0, 0.0)
    command = ""
    i = 0

    def number() -> float:
        nonlocal i
        if i >= len(tokens) or tokens[i].isalpha():
            raise SystemExit("Malformed Galen SVG path")
        value = float(tokens[i])
        i += 1
        return value

    while i < len(tokens):
        token = tokens[i]
        if token.isalpha():
            command = token.upper()
            if token != command:
                raise SystemExit("Relative SVG commands are not supported in the Galen mark")
            i += 1
        if command == "M":
            if current:
                result.append(current)
            point = (number(), number())
            current = [point]
            command = "L"
        elif command == "L":
            point = (number(), number())
            current.append(point)
        elif command == "H":
            point = (number(), point[1])
            current.append(point)
        elif command == "V":
            point = (point[0], number())
            current.append(point)
        elif command == "C":
            p1 = (number(), number())
            p2 = (number(), number())
            p3 = (number(), number())
            current.extend(_cubic(point, p1, p2, p3, n / CURVE_STEPS) for n in range(1, CURVE_STEPS + 1))
            point = p3
        elif command == "Z":
            if current:
                result.append(current)
                current = []
            command = ""
        else:
            raise SystemExit(f"Unsupported or missing SVG command: {command!r}")
    if current:
        result.append(current)
    return result


def _transform(point: tuple[float, float], size: int, scale_factor: int) -> tuple[float, float]:
    canvas = size * scale_factor
    usable = canvas * (1.0 - 2.0 * PADDING)
    scale = min(usable / SOURCE_WIDTH, usable / SOURCE_HEIGHT)
    left = (canvas - SOURCE_WIDTH * scale) / 2.0
    top = (canvas - SOURCE_HEIGHT * scale) / 2.0
    return left + point[0] * scale, top + point[1] * scale


def mark_mask(size: int) -> Image.Image:
    big = size * SUPERSAMPLE
    combined = Image.new("1", (big, big), 0)
    for svg_path in source_paths():
        path_mask = Image.new("1", (big, big), 0)
        for polygon in polygons(svg_path.data):
            layer = Image.new("1", (big, big), 0)
            ImageDraw.Draw(layer).polygon(
                [_transform(p, size, SUPERSAMPLE) for p in polygon], fill=1
            )
            path_mask = (
                ImageChops.logical_xor(path_mask, layer)
                if svg_path.evenodd
                else ImageChops.logical_or(path_mask, layer)
            )
        combined = ImageChops.logical_or(combined, path_mask)
    return combined.convert("L").resize((size, size), Image.Resampling.LANCZOS)


def rounded_square_mask(size: int) -> Image.Image:
    big = size * SUPERSAMPLE
    mask = Image.new("L", (big, big), 0)
    inset = max(1, round(big * 0.018))
    radius = round(big * 0.22)
    ImageDraw.Draw(mask).rounded_rectangle(
        (inset, inset, big - inset - 1, big - inset - 1), radius=radius, fill=255
    )
    return mask.resize((size, size), Image.Resampling.LANCZOS)


def render_mark(size: int, *, dark_surface: bool = False) -> Image.Image:
    color = (255, 255, 255, 255) if dark_surface else (0, 0, 0, 255)
    image = Image.new("RGBA", (size, size), color)
    image.putalpha(mark_mask(size))
    return image


def render_icon(size: int, *, dark: bool = False) -> Image.Image:
    paper = (10, 10, 10, 255) if dark else (255, 255, 255, 255)
    ink = (255, 255, 255, 255) if dark else (0, 0, 0, 255)
    icon = Image.new("RGBA", (size, size), paper)
    icon.putalpha(rounded_square_mask(size))
    figure = Image.new("RGBA", (size, size), ink)
    figure.putalpha(mark_mask(size))
    icon.alpha_composite(figure)
    return icon


def write_svg(path: Path, paths: list[SvgPath], *, ink: str, tile: str | None = None) -> None:
    attrs = 'width="1024" height="1024" viewBox="-119 -88 1100 1100" fill="none"'
    lines = [f'<svg {attrs} xmlns="http://www.w3.org/2000/svg">']
    if tile is not None:
        lines.append(f'<rect x="-119" y="-88" width="1100" height="1100" rx="242" fill="{tile}"/>')
    for item in paths:
        rule = ' fill-rule="evenodd" clip-rule="evenodd"' if item.evenodd else ""
        lines.append(f'<path d="{item.data}"{rule} fill="{ink}"/>')
    lines.append("</svg>")
    path.write_text("\n".join(lines) + "\n", encoding="utf-8", newline="\n")


def write_ico(path: Path) -> None:
    members = [render_icon(size) for size in ICO_SIZES]
    members[0].save(path, format="ICO", sizes=[image.size for image in members], append_images=members[1:])


def copy_many(source: Path, targets: tuple[Path, ...]) -> None:
    for target in targets:
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(source, target)


def generate() -> None:
    require_pillow()
    paths = source_paths()
    BRAND_DIR.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(SOURCE, BRAND_DIR / "galen.svg")
    write_svg(BRAND_DIR / "galen-icon.svg", paths, ink="#000000")
    write_svg(BRAND_DIR / "galen-icon-dark.svg", paths, ink="#FFFFFF")
    write_svg(BRAND_DIR / "galen-app-icon.svg", paths, ink="#000000", tile="#FFFFFF")

    icon = BRAND_DIR / "icon.png"
    icon_light = BRAND_DIR / "icon-light.png"
    icon_dark = BRAND_DIR / "icon-dark.png"
    mark_light = BRAND_DIR / "mark-light.png"
    mark_dark = BRAND_DIR / "mark-dark.png"
    render_icon(1024).save(icon)
    render_icon(1024).save(icon_light)
    render_icon(1024, dark=True).save(icon_dark)
    render_mark(1024).save(mark_light)
    render_mark(1024, dark_surface=True).save(mark_dark)

    ico = BRAND_DIR / "icon.ico"
    write_ico(ico)

    copy_many(
        icon,
        (
            FRONTEND / "public" / "dodaios-logo.png",
            FRONTEND / "public" / "dodaios-gigi-256.png",
            FRONTEND / "src" / "assets" / "dodaios-mark.png",
            ROOT / "dodaios" / "assets" / "icons" / "dodaios.png",
            ROOT / "assets" / "icons" / "dodaios-1024.png",
            ROOT / "assets" / "icons" / "dodaios-gigi-256.png",
        ),
    )
    copy_many(
        mark_dark,
        (FRONTEND / "public" / "dodaios-mark-256.png",),
    )
    copy_many(
        ico,
        (
            ROOT / "assets" / "icons" / "dodaios.ico",
            ROOT / "dodaios" / "assets" / "icons" / "dodaios.ico",
            FRONTEND / "public" / "dodaios.ico",
            FRONTEND / "public" / "dodaios-gigi.ico",
        ),
    )
    render_icon(512).save(FRONTEND / "public" / "m" / "icon-512.png")
    render_icon(512).save(FRONTEND / "public" / "m" / "icon-maskable-512.png")
    render_icon(192).save(FRONTEND / "public" / "m" / "icon-192.png")
    print("Generated Galen SVG, light/dark PNG, PWA and multi-size Windows assets.")


def check() -> None:
    expected = (
        BRAND_DIR / "galen.svg",
        BRAND_DIR / "galen-icon.svg",
        BRAND_DIR / "galen-icon-dark.svg",
        BRAND_DIR / "galen-app-icon.svg",
        BRAND_DIR / "icon.png",
        BRAND_DIR / "icon-light.png",
        BRAND_DIR / "icon-dark.png",
        BRAND_DIR / "mark-light.png",
        BRAND_DIR / "mark-dark.png",
        BRAND_DIR / "icon.ico",
    )
    missing = [str(path.relative_to(ROOT)) for path in expected if not path.is_file()]
    if missing:
        raise SystemExit("Missing generated Galen assets: " + ", ".join(missing))
    if (BRAND_DIR / "galen.svg").read_bytes() != SOURCE.read_bytes():
        raise SystemExit("assets/galen-brand/galen.svg drifted from the user-supplied source")
    print("Galen brand assets are present and the canonical SVG is in sync.")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    check() if args.check else generate()


if __name__ == "__main__":
    main()
