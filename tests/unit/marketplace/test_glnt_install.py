import hashlib
import json

import pytest

from dodaios.marketplace.glnt_install import RECEIPT, _public_https, quarantine_skill, skill_receipt


def test_quarantine_preserves_local_edits_and_is_outside_scanner(tmp_path):
    root = tmp_path / "skills"
    target = root / "my-skill"
    target.mkdir(parents=True)
    item = {"name": "my-skill", "repository_url": "https://github.com/owner/repo", "version": "1.0.0"}
    original = b"original"
    (target / "SKILL.md").write_bytes(original)
    (target / RECEIPT).write_text(json.dumps({**item, "files": {"SKILL.md": hashlib.sha256(original).hexdigest()}}))
    assert skill_receipt(target)["version"] == "1.0.0"
    (target / "SKILL.md").write_text("user edit")
    with pytest.raises(ValueError):
        skill_receipt(target)
    from pathlib import Path
    backup = Path(quarantine_skill(item, root))
    assert not target.exists()
    assert not backup.is_relative_to(root)
    assert (backup / "SKILL.md").read_text() == "user edit"


def test_quarantine_rejects_unmanaged_skill(tmp_path):
    root = tmp_path / "skills"
    target = root / "my-skill"
    target.mkdir(parents=True)
    (target / "SKILL.md").write_text("local")
    with pytest.raises(ValueError):
        quarantine_skill({"name": "my-skill", "repository_url": "https://github.com/owner/repo"}, root)
    assert target.is_dir()


@pytest.mark.parametrize("url", [None, [], "http://example.com", "https://127.0.0.1", "https://host.local", "https://user@example.com", "https://example.com:444"])
def test_reject_invalid_plugin_endpoints(url):
    assert not _public_https(url)
