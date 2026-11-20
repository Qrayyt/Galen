#!/usr/bin/env python3
"""Validate the Galen release identity without importing application dependencies."""

from __future__ import annotations

import ast
import hashlib
import json
import re
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]


def read(relative: str) -> str:
    return (ROOT / relative).read_text(encoding="utf-8-sig")


def literal_assignments(relative: str) -> dict[str, object]:
    result: dict[str, object] = {}
    for node in ast.parse(read(relative)).body:
        if not isinstance(node, (ast.Assign, ast.AnnAssign)):
            continue
        targets = node.targets if isinstance(node, ast.Assign) else [node.target]
        value = node.value
        if value is None:
            continue
        for target in targets:
            if not isinstance(target, ast.Name):
                continue
            try:
                result[target.id] = ast.literal_eval(value)
            except (ValueError, TypeError):
                pass
    return result


def expect(actual: object, wanted: object, label: str) -> None:
    if actual != wanted:
        raise SystemExit(f"{label}: expected {wanted!r}, got {actual!r}")


def expect_text(relative: str, needle: str) -> None:
    if needle not in read(relative):
        raise SystemExit(f"{relative}: missing {needle!r}")


def digest(relative: str) -> str:
    return hashlib.sha256((ROOT / relative).read_bytes()).hexdigest()


def main() -> None:
    branding = literal_assignments("dodaios/core/branding.py")
    expect(branding.get("PRODUCT_NAME"), "Galen", "product name")
    expect(branding.get("WINDOWS_USER_DATA_DIR_NAME"), "GalenData", "Windows profile")
    expect(
        branding.get("LEGACY_WINDOWS_USER_DATA_DIR_NAMES"),
        ("Dodaios", "Jarvis"),
        "profile compatibility",
    )
    expect(branding.get("CONFIG_FILE_NAME"), "galen.toml", "configuration file")
    expect(branding.get("MACOS_BUNDLE_ID"), "com.galen.desktop", "macOS managed bundle id")
    expect(branding.get("WINDOWS_MUTEX_NAME"), r"Global\Galen_v1", "Windows mutex")
    expect(branding.get("DEFAULT_OFFICIAL_REPO_SLUG"), "Qrayyt/Galen", "repository")

    for plugin in ("dodaios/plugins/stt/deepgram_api.py", "dodaios/plugins/stt/groq_api.py"):
        constants = literal_assignments(plugin)
        expect(constants.get("_KEYRING_SERVICE"), "galen", f"{plugin} keyring")
        expect(
            constants.get("_LEGACY_KEYRING_SERVICES"),
            ("dodaios", "personal-jarvis"),
            f"{plugin} legacy keyrings",
        )
    for plugin in (
        "dodaios/plugins/brain/openrouter.py",
        "dodaios/plugins/stt/openrouter_stt.py",
        "dodaios/plugins/tts/openrouter_tts.py",
    ):
        expect_text(plugin, '"HTTP-Referer": "https://github.com/Qrayyt/Galen"')

    spec = literal_assignments("dodaios.spec")
    expect(spec.get("GUI_EXE_NAME"), "GalenApp", "GUI executable")
    expect(spec.get("CLI_EXE_NAME"), "galen", "CLI executable")
    expect(spec.get("MACOS_APP_NAME"), "Galen.app", "macOS bundle")
    expect_text("dodaios.spec", 'StringStruct("ProductName", "Galen")')
    expect_text("dodaios.spec", '"CFBundleDisplayName": "Galen"')

    hook = literal_assignments("packaging/pyinstaller_rthook_frozen.py")
    expect(hook.get("_WINDOWS_USER_DATA_DIR_NAME"), "GalenData", "frozen Windows profile")
    expect(
        hook.get("_LEGACY_WINDOWS_USER_DATA_DIR_NAMES"),
        ("Dodaios", "Jarvis"),
        "frozen profile compatibility",
    )
    expect(hook.get("_CONFIG_FILE_NAME"), "galen.toml", "frozen configuration")
    expect(
        hook.get("_GUI_EXE_NAMES"),
        ("GalenApp", "DodaiosApp", "PersonalJarvis"),
        "frozen GUI names",
    )
    expect(
        hook.get("_MUTEX_NAMES"),
        (
            r"Global\Galen_v1",
            r"Global\Galen_v1_dev",
            r"Global\Dodaios_v1",
            r"Global\Dodaios_v1_dev",
            r"Global\PersonalJarvis_v1",
            r"Global\PersonalJarvis_v1_dev",
        ),
        "frozen mutexes",
    )

    build = read("packaging/windows/build.ps1")
    required = '@("GalenApp.exe", "DodaiosApp.exe", "PersonalJarvis.exe", "galen.exe", "dodaios.exe", "jarvis.exe")'
    if required not in build:
        raise SystemExit("packaging/windows/build.ps1: frozen executable checks drifted")
    if build.count('$RealtimeBin = Join-Path $RepoRoot "integrations\\openrealtime\\bin\\openrealtime.exe"') != 1:
        raise SystemExit("packaging/windows/build.ps1: OpenRealtime copy block must appear once")

    expect_text("packaging/windows/Dodaios.iss", '#define AppName "Galen"')
    expect_text("packaging/windows/Dodaios.iss", '#define GuiExeName "GalenApp.exe"')
    expect_text("packaging/windows/Dodaios.iss", '#define SignedSetupBaseName "Galen-Setup-x64"')
    expect_text("packaging/windows/Dodaios.iss", '#define LegacyCliExeName "dodaios.exe"')
    expect_text("packaging/windows/Dodaios.iss", 'Add the ""galen"" command to PATH')
    expect_text("packaging/windows/Dodaios.iss", '#define UserDataDirDisplay "%LOCALAPPDATA%\\GalenData"')
    expect_text("dodaios.toml.example", "admin_api_port = 47921")

    contract = json.loads(read("install/update-contract.json"))
    expect(contract.get("config_file"), "dodaios.toml", "update contract config")
    expect(
        contract.get("config_files"),
        ["dodaios.toml", "jarvis.toml", "galen.toml"],
        "update contract configs",
    )
    expect(contract.get("macos_app_dir_name"), "Galen.app", "update contract macOS app")
    expect(contract.get("macos_bundle_id"), "com.galen.desktop", "update contract bundle id")
    expect_text(
        "dodaios/core/update_contract.py",
        "LEGACY_CONFIG_FILE_NAMES[0] if LEGACY_CONFIG_FILE_NAMES else CONFIG_FILE_NAME",
    )
    expect(hook.get("_LEGACY_ADMIN_PORT"), 47821, "legacy admin port")
    expect(hook.get("_DEFAULT_ADMIN_PORT"), 47921, "Galen admin port")
    expect_text("packaging/pyinstaller_rthook_frozen.py", "_migrate_default_admin_port(config_path, home)")

    icon_png = digest("assets/galen-brand/icon.png")
    for target in (
        "dodaios/ui/web/frontend/public/dodaios-logo.png",
        "dodaios/ui/web/frontend/public/dodaios-gigi-256.png",
        "dodaios/ui/web/frontend/src/assets/dodaios-mark.png",
        "dodaios/assets/icons/dodaios.png",
        "assets/icons/dodaios-1024.png",
        "assets/icons/dodaios-gigi-256.png",
    ):
        expect(digest(target), icon_png, target)
    expect(
        digest("dodaios/ui/web/frontend/public/dodaios-mark-256.png"),
        digest("assets/galen-brand/mark-dark.png"),
        "transparent dark-surface mark",
    )
    icon_ico = digest("assets/galen-brand/icon.ico")
    for target in (
        "assets/icons/dodaios.ico",
        "dodaios/ui/web/frontend/public/dodaios.ico",
        "dodaios/ui/web/frontend/public/dodaios-gigi.ico",
        "dodaios/assets/icons/dodaios.ico",
    ):
        expect(digest(target), icon_ico, target)

    expect(
        digest("assets/galen-brand/galen.svg"),
        digest("dodaios/assets/icons/galen.svg"),
        "canonical Galen SVG",
    )
    source = read("assets/galen-brand/galen-icon.svg")
    if not re.search(r"<svg\b", source) or "<path" not in source:
        raise SystemExit("assets/galen-brand/galen-icon.svg: invalid SVG logo")
    if 'viewBox="-119 -88 1100 1100"' not in source:
        raise SystemExit("assets/galen-brand/galen-icon.svg: square padding drifted")
    expect_text("assets/galen-brand/galen-icon-dark.svg", 'fill="#FFFFFF"')
    for target in (
        "dodaios/ui/web/frontend/public/m/icon-192.png",
        "dodaios/ui/web/frontend/public/m/icon-512.png",
        "dodaios/ui/web/frontend/public/m/icon-maskable-512.png",
    ):
        if not (ROOT / target).is_file() or (ROOT / target).stat().st_size < 1_000:
            raise SystemExit(f"{target}: missing generated PWA icon")
    print("Galen release identity is consistent")


if __name__ == "__main__":
    main()
