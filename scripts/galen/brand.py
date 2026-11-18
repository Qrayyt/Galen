#!/usr/bin/env python3
"""Galen identity overlay on the exact Dodaios source tree.

Display names and persistent IDs become GALEN so the app can live next to the
original Dodaios. The Python package, entry point groups, import paths and
third-party notices deliberately retain their original values.
Run once on the imported upstream checkout. This file is also a reproducible
manifest of the downstream changes.
"""
from __future__ import annotations

import json
import re
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def path(name: str) -> Path:
    result = ROOT / name
    if not result.exists():
        raise FileNotFoundError(name)
    return result


def edit(name: str, modify) -> None:
    target = path(name)
    original = target.read_text(encoding="utf-8-sig")
    edited = modify(original)
    if original != edited:
        target.write_text(edited, encoding="utf-8", newline="\n")
        print("Updated", name)


def assignments(updates: dict[str, str]):
    def run(text: str) -> str:
        for key, rhs in updates.items():
            regex = re.compile(r"^(" + re.escape(key) + r"\s*=\s*).*$", re.M)
            if len(regex.findall(text)) != 1:
                raise RuntimeError(f"{key}: expected one assignment")
            text = regex.sub(lambda m: m.group(1) + rhs, text)
        return text
    return run


def replace(needle: str, value: str):
    def run(text: str) -> str:
        if text.count(needle) != 1:
            if text.count(value) == 1 and needle not in text:
                return text
            raise RuntimeError(f"expected exactly one original occurrence: {needle[:70]!r}")
        return text.replace(needle, value)
    return run


def chain(*funcs):
    def run(s):
        for fn in funcs:
            s = fn(s)
        return s
    return run


brand = {
    "PRODUCT_NAME": '"Galen"',
    "PERSISTENT_PRODUCT_NAME": '"Galen"',
    "PERSISTENT_COMPACT_NAME": '"Galen"',
    "PERSISTENT_SLUG": '"galen"',
    "LAUNCHER_ENTRY_NAME": '"Galen"',
    "LEGACY_LAUNCHER_ENTRY_NAMES": '("Personal Jarvis",)',
    "CONFIG_FILE_NAME": '"galen.toml"',
    "LEGACY_CONFIG_FILE_NAMES": "()",
    "KEYRING_SERVICE_NAME": '"galen"',
    "LEGACY_KEYRING_SERVICE_NAMES": "()",
    "SESSION_COOKIE_NAME": '"galen_session"',
    "MANAGED_INSTALL_MARKER": '".galen-managed-install"',
    "LEGACY_MANAGED_INSTALL_MARKERS": "()",
    "DEFAULT_INSTALL_DIR_NAME": '".galen"',
    "LEGACY_DEFAULT_INSTALL_DIR_NAMES": "()",
    # Python imports keep their upstream name, while the user-facing commands
    # use Galen. The old commands remain aliases so upstream automation works.
    "LEGACY_DISTRIBUTION_NAMES": '("personal-jarvis",)',
    "CLI_COMMAND_NAME": '"galen"',
    "CONTROL_CLI_COMMAND_NAME": '"galenctl"',
    "LEGACY_CLI_COMMAND_NAMES": '("dodaios", "jarvis")',
    "LEGACY_CONTROL_CLI_COMMAND_NAMES": '("dodaiosctl", "jarvisctl")',
    # Keep the install separate from an existing original Dodaios installation.
    "WINDOWS_USER_DATA_DIR_NAME": '"Galen"',
    "LEGACY_WINDOWS_USER_DATA_DIR_NAMES": "()",
    "FALLBACK_USER_DATA_DIR_NAME": '".galen-data"',
    "LEGACY_FALLBACK_USER_DATA_DIR_NAMES": "()",
    "DESKTOP_OUTPUT_MIRROR_DIR_NAME": '"Galen-Output"',
    "LEGACY_DESKTOP_OUTPUT_MIRROR_DIR_NAMES": "()",
    "DELIVERABLES_DIR_NAME": '"Galen-Outputs"',
    "LEGACY_DELIVERABLES_DIR_NAMES": "()",
    "OBSIDIAN_VAULT_FOLDER_NAME": '"Galen"',
    "LEGACY_OBSIDIAN_VAULT_FOLDER_NAMES": "()",
    "WINDOWS_MUTEX_NAME": r'r"Global\Galen_v1"',
    "LEGACY_WINDOWS_MUTEX_NAMES": "()",
    "WINDOWS_AUTOSTART_TASK_NAME": '"Galen Autostart"',
    "LEGACY_WINDOWS_AUTOSTART_TASK_NAMES": "()",
    "WINDOWS_AUTOSTART_DESCRIPTION": '"Galen (Autostart)"',
    "LEGACY_WINDOWS_AUTOSTART_DESCRIPTIONS": "()",
    "WINDOWS_SHORTCUT_FILE_NAME": '"Galen.lnk"',
    "LEGACY_WINDOWS_SHORTCUT_FILE_NAMES": "()",
    "WINDOWS_BRANDED_LAUNCHER_FILE_NAME": '"GalenApp.exe"',
    "LEGACY_WINDOWS_BRANDED_LAUNCHER_FILE_NAMES": '("PersonalJarvis.exe",)',
    "WINDOWS_BRANDED_LAUNCHER_DIR_NAME": '"GalenApp"',
    "LEGACY_WINDOWS_BRANDED_LAUNCHER_DIR_NAMES": "()",
    "MACOS_APP_NAME": '"Galen"',
    "LEGACY_MACOS_APP_NAMES": "()",
    "MACOS_EXECUTABLE_NAME": '"GalenApp"',
    "LEGACY_MACOS_EXECUTABLE_NAMES": '("PersonalJarvis",)',
    "LINUX_APP_NAME": '"Galen"',
    "LEGACY_LINUX_APP_NAMES": "()",
    "LINUX_DESKTOP_ENTRY_FILE_NAME": '"galen.desktop"',
    "LINUX_WM_CLASS": '"galen"',
    "LEGACY_LINUX_DESKTOP_ENTRY_FILE_NAMES": "()",
    "LEGACY_LINUX_WM_CLASSES": "()",
    "DEFAULT_OFFICIAL_REPO_SLUG": '"Qrayyt/Galen"',
    "LEGACY_OFFICIAL_REPO_SLUGS": "()",
    "UPDATER_USER_AGENT": '"Galen-Updater"',
    "HTTP_USER_AGENT": '"Galen/1.0"',
    # Keep the published plugin entry-point namespace 'dodaios' unchanged.
    "MCP_TOOLS_SERVER_NAME": '"galen"',
    "MCP_AGENTS_SERVER_NAME": '"galen-agents"',
}

def main() -> None:
    edit("dodaios/core/branding.py", assignments(brand))
    edit("dodaios/ui/web/frontend/src/lib/branding.ts", chain(
        replace('PRODUCT_NAME = "Dodaios";', 'PRODUCT_NAME = "Galen";'),
        replace('OFFICIAL_REPO_SLUG = "Dodaios/Dodaios";', 'OFFICIAL_REPO_SLUG = "Qrayyt/Galen";'),
        replace('MCP_TOOLS_SERVER_NAMES: readonly string[] = ["dodaios", "jarvis"]',
                'MCP_TOOLS_SERVER_NAMES: readonly string[] = ["galen", "dodaios", "jarvis"]'),
    ))
    def russian_default_ui(s: str) -> str:
        pattern = re.compile(r"(function readUi\(\): UiLanguage \{.*?\n  return )\"(?:en|ru)\";", re.S)
        if len(pattern.findall(s)) != 1:
            raise RuntimeError("readUi: expected one default language")
        return pattern.sub(r'\1"ru";', s)
    edit("dodaios/ui/web/frontend/src/i18n/index.ts", russian_default_ui)
    for plugin in ("dodaios/plugins/stt/deepgram_api.py", "dodaios/plugins/stt/groq_api.py"):
        edit(plugin, chain(
            assignments({
                "_KEYRING_SERVICE": '"galen"',
                "_LEGACY_KEYRING_SERVICES": "()",
            }),
        ))
    for plugin in (
        "dodaios/plugins/brain/openrouter.py",
        "dodaios/plugins/stt/openrouter_stt.py",
        "dodaios/plugins/tts/openrouter_tts.py",
    ):
        edit(plugin, replace(
            '"HTTP-Referer": "https://github.com/Dodaios/Dodaios"',
            '"HTTP-Referer": "https://github.com/Qrayyt/Galen"',
        ))
    edit("dodaios.spec", chain(
        assignments({
            "GUI_EXE_NAME": '"GalenApp"',
            "CLI_EXE_NAME": '"galen"',
            "LEGACY_CLI_EXE_NAMES": '("dodaios", "jarvis")',
            "MACOS_APP_NAME": '"Galen.app"',
            "MACOS_BUNDLE_IDENTIFIER": '"ai.galen.desktop"',
            "ICON_DIR": 'PROJECT_ROOT / "assets" / "galen-brand"',
        }),
        replace('StringStruct("CompanyName", "Dodaios")',
                'StringStruct("CompanyName", "Galenite")'),
        replace('StringStruct("FileDescription", "Dodaios")',
                'StringStruct("FileDescription", "Galen")'),
        replace('"Dodaios contributors. Apache 2.0 licensed."',
                '"Galen contributors; based on Dodaios. Apache 2.0 licensed."'),
        replace('StringStruct("ProductName", "Dodaios")',
                'StringStruct("ProductName", "Galen")'),
        replace('"CFBundleName": "Dodaios"', '"CFBundleName": "Galen"'),
        replace('"CFBundleDisplayName": "Dodaios"',
                '"CFBundleDisplayName": "Galen"'),
    ))
    edit("packaging/pyinstaller_rthook_frozen.py", chain(
        assignments({
            "_WINDOWS_USER_DATA_DIR_NAME": '"Galen"',
            "_LEGACY_WINDOWS_USER_DATA_DIR_NAMES": "()",
            "_FALLBACK_USER_DATA_DIR_NAME": '".galen-data"',
            "_LEGACY_FALLBACK_USER_DATA_DIR_NAMES": "()",
            "_CONFIG_FILE_NAME": '"galen.toml"',
            "_LEGACY_CONFIG_FILE_NAMES": "()",
            "_GUI_EXE_NAMES": '("GalenApp", "PersonalJarvis")',
        }),
        replace(
            '_MUTEX_NAMES = (\n    "Global\\\\Dodaios_v1",\n'
            '    "Global\\\\Dodaios_v1_dev",\n'
            '    "Global\\\\PersonalJarvis_v1",\n'
            '    "Global\\\\PersonalJarvis_v1_dev",\n)',
            '_MUTEX_NAMES = (\n    "Global\\\\Galen_v1",\n'
            '    "Global\\\\Galen_v1_dev",\n)',
        ),
        replace('``%LOCALAPPDATA%\\\\Dodaios`` on Windows, ``~/.dodaios-data``',
                '``%LOCALAPPDATA%\\\\Galen`` on Windows, ``~/.galen-data``'),
        replace('stream.write(f"[jarvis] {message}\\n")',
                'stream.write(f"[galen] {message}\\n")'),
    ))
    edit("packaging/windows/build.ps1", chain(
        replace(r'$IconFile = Join-Path $RepoRoot "assets\icons\dodaios.ico"',
                r'$IconFile = Join-Path $RepoRoot "assets\galen-brand\icon.ico"'),
        replace(r'$Artifact = Join-Path $InstallerDir "Dodaios-Setup-x64.exe"',
                r'$Artifact = Join-Path $InstallerDir "Galen-Setup-x64.exe"'),
        replace('@("DodaiosApp.exe", "PersonalJarvis.exe", "dodaios.exe", "jarvis.exe")',
                '@("GalenApp.exe", "PersonalJarvis.exe", "galen.exe", "dodaios.exe", "jarvis.exe")'),
    ))

    def setup_script(s):
        repl = {
            "AppName": '"Galen"',
            "AppPublisher": '"Galenite"',
            "AppUrl": '"https://github.com/Qrayyt/Galen"',
            "GuiExeName": '"GalenApp.exe"',
            "SignedProductName": '"Galen"',
            "SignedSetupBaseName": '"Galen-Setup-x64"',
            "CliExeName": '"galen.exe"',
            "LegacyCliExeName": '"dodaios.exe"',
            "UserDataDirDisplay": r'"%LOCALAPPDATA%\Galen"',
            "AppGuid": '"6F548C6A-7FA9-4A2B-A1C3-1780B6D14E97"',
        }
        for key, value in repl.items():
            rx = re.compile(r"^(\s*#define\s+" + key + r"\s+).*$", re.M)
            if len(rx.findall(s)) != 1:
                raise RuntimeError("Inno definition not found: " + key)
            s = rx.sub(lambda m: m.group(1) + value, s)
        eng = 'Name: "english"; MessagesFile: "compiler:Default.isl"'
        rus = 'Name: "russian"; MessagesFile: "compiler:Languages\\Russian.isl"'
        if rus not in s:
            s = replace(eng, eng + "\n" + rus)(s)
        s = s.replace(
            'Add the ""dodaios"" command to PATH (lets you run ""dodaios serve"" in any terminal)',
            'Add the ""galen"" command to PATH (lets you run ""galen serve"" in any terminal)',
        )
        return s
    edit("packaging/windows/Dodaios.iss", setup_script)

    edit("dodaios/__init__.py", replace('__version__ = "5.6.0"', '__version__ = "1.0.0"'))
    def project_metadata(s: str) -> str:
        s = s.replace('version = "5.6.0"', 'version = "1.0.0"')
        galen = 'galen = "dodaios.__main__:main"'
        galenctl = 'galenctl = "dodaios.cli_ctl.__main__:main"'
        if galen not in s or galenctl not in s:
            needle = 'dodaios = "dodaios.__main__:main"'
            if s.count(needle) != 1:
                raise RuntimeError("expected one Dodaios console entry point")
            s = s.replace(needle, f"{galen}\n{galenctl}\n{needle}")
        return s

    edit("pyproject.toml", project_metadata)

    for language in ("en", "de", "es", "pt", "zh"):
        name = f"dodaios/ui/web/frontend/src/i18n/locales/{language}.json"
        def localize(s: str) -> str:
            data = json.loads(s)
            # Text-only replacements preserve all i18n keys and placeholders.
            text = json.dumps(data, ensure_ascii=False, indent=2)
            return text.replace("Dodaios", "Galen") + "\n"
        edit(name, localize)

    # The branded test contract follows the downstream identity. The shared
    # test setup pins English per test even though a first Galen launch is
    # Russian, preventing one locale test from leaking into another.
    test_replacements = {
        "dodaios/ui/web/frontend/src/lib/branding.test.ts": {
            'toBe("Dodaios")': 'toBe("Galen")',
            'toBe("Dodaios/Dodaios")': 'toBe("Qrayyt/Galen")',
            'toBe("https://github.com/Dodaios/Dodaios")': 'toBe("https://github.com/Qrayyt/Galen")',
            'toBe("github.com/Dodaios/Dodaios")': 'toBe("github.com/Qrayyt/Galen")',
            'toEqual(["dodaios", "jarvis"])': 'toEqual(["galen", "dodaios", "jarvis"])',
        },
        "dodaios/ui/web/frontend/src/components/AuthGate.test.tsx": {
            "this Dodaios install": "this Galen install",
        },
        "dodaios/ui/web/frontend/src/hooks/useWebSocket.permissions.test.tsx": {
            "Dodaios needs microphone access": "Galen needs microphone access",
        },
        "dodaios/ui/web/frontend/src/lib/permissionToast.test.ts": {
            "Dodaios needs microphone access": "Galen needs microphone access",
            "after Dodaios restarts": "after Galen restarts",
        },
        "dodaios/ui/web/frontend/src/components/home/AssistantPanel.test.tsx": {
            'toContain("Dodaios")': 'toContain("Galen")',
        },
        "dodaios/ui/web/frontend/src/components/layout/AppSurfaceSwitch.test.tsx": {
            "names both places, Dodaios first": "names both places, Galen first",
            'toContain("Dodaios")': 'toContain("Galen")',
        },
        "dodaios/ui/web/frontend/src/components/agentic/threads/StartedByBadge.test.tsx": {
            "names Dodaios by": "names Galen by",
            "another Dodaios agent": "another Galen agent",
            "Started by a Dodaios agent": "Started by a Galen agent",
        },
        "dodaios/ui/web/frontend/src/components/society/chat/MentionPicker.test.tsx": {
            'getByText("Dodaios tools")': 'getByText("Galen tools")',
        },
    }
    for name, replacements in test_replacements.items():
        edit(name, lambda s, replacements=replacements: chain(
            *(lambda text, old=old, new=new: text.replace(old, new)
              for old, new in replacements.items())
        )(s))

    # Public branding assets, not original upstream logo or third-party brand marks.
    icon_png = path("assets/galen-brand/icon.png")
    icon_ico = path("assets/galen-brand/icon.ico")
    for target in (
        "dodaios/ui/web/frontend/public/dodaios-logo.png",
        "dodaios/ui/web/frontend/public/dodaios-mark-256.png",
        "dodaios/ui/web/frontend/public/dodaios-gigi-256.png",
        "dodaios/assets/icons/dodaios.png",
    ):
        shutil.copyfile(icon_png, path(target))
    for target in (
        "assets/icons/dodaios.ico",
        "dodaios/ui/web/frontend/public/dodaios.ico",
        "dodaios/ui/web/frontend/public/dodaios-gigi.ico",
        "dodaios/assets/icons/dodaios.ico",
    ):
        shutil.copyfile(icon_ico, path(target))
    print("Galen identity completed; imported library names and OSS notices preserved.")


if __name__ == "__main__":
    main()
