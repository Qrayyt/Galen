"""Galen's native upgrade replaces program files, never the user profile."""

from __future__ import annotations

import re
from pathlib import Path


ROOT = Path(__file__).resolve().parents[3]


def test_windows_upgrade_keeps_the_user_profile_outside_the_install_tree() -> None:
    script = (ROOT / "packaging" / "windows" / "Dodaios.iss").read_text(encoding="utf-8")

    assert '#define UserDataDirDisplay "%LOCALAPPDATA%\\GalenData"' in script
    assert "DefaultDirName={localappdata}\\Programs\\{#AppName}" in script
    assert "Source: \"{#SourceDir}\\*\"; DestDir: \"{app}\"" in script
    assert "{#UserDataDirDisplay}" not in "\n".join(
        line for line in script.splitlines() if line.lstrip().startswith(("Type:", "Name:"))
    )
    assert "[UninstallDelete]" not in script


def test_update_contract_keeps_current_and_historical_config_files() -> None:
    contract = (ROOT / "install" / "update-contract.json").read_text(encoding="utf-8")
    assert re.search(r'"config_file"\s*:\s*"dodaios\.toml"', contract)
    assert (
        '"config_files": [\n'
        '    "dodaios.toml",\n'
        '    "jarvis.toml",\n'
        '    "galen.toml"\n'
        "  ]"
    ) in contract
