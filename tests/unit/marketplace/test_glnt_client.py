import hashlib
import io
import json
import zipfile

import pytest

from dodaios.marketplace.glnt_client import catalog_base, stage_verified, staged, remove


def package(version="1.0.0", repo="https://github.com/owner/repo"):
    body = b"# Example skill"
    manifest = json.dumps({
        "schema": 1, "name": "test-skill", "title": "Test", "description": "Test",
        "type": "skill", "version": version, "min_galen": "1.0.0", "category": "general",
        "permissions": ["tools"], "entry": "SKILL.md",
        "files": {"SKILL.md": hashlib.sha256(body).hexdigest()},
    }).encode()
    out = io.BytesIO()
    with zipfile.ZipFile(out, "w") as z:
        z.writestr("repo-commit/galen-extension.json", manifest)
        z.writestr("repo-commit/SKILL.md", body)
    item = {"id": "a"*32, "name": "test-skill", "title": "Test", "description": "Test",
            "type": "skill", "version": version, "min_galen": "1.0.0", "category": "general",
            "permissions": ["tools"], "author": "owner", "repository_url": repo,
            "commit": "b"*40, "manifest_sha256": hashlib.sha256(manifest).hexdigest(),
            "status": "approved"}
    return item, out.getvalue()


def test_stage_update_and_rollback(tmp_path):
    db = tmp_path / "local.db"
    item, raw = package()
    receipt = stage_verified(db, item, raw, app_version="1.0.0")
    assert staged(db) == [receipt]
    update, updated_raw = package("1.1.0")
    with pytest.raises(ValueError):
        stage_verified(db, update, raw, app_version="1.0.0")
    assert staged(db) == [receipt]
    updated = stage_verified(db, update, updated_raw, app_version="1.0.0")
    assert staged(db) == [updated]
    with pytest.raises(ValueError):
        stage_verified(db, item, raw, app_version="1.0.0")
    assert staged(db) == [updated]
    assert remove(db, "test-skill", "skill")
    assert staged(db) == []


def test_incompatible_and_repository_collision(tmp_path):
    db = tmp_path / "local.db"
    item, raw = package()
    with pytest.raises(ValueError):
        stage_verified(db, item, raw, app_version="1.0.0-preview.5")
    assert staged(db) == []
    stage_verified(db, item, raw, app_version="1.0.0")
    other, raw = package("1.1.0", "https://github.com/other/repo")
    with pytest.raises(ValueError):
        stage_verified(db, other, raw, app_version="1.0.0")


@pytest.mark.parametrize("url", ["http://galenite.org", "https://galenite.org.evil.test", "https://galenite.org@evil.test", "https://galenite.org:444", "https://galenite.org/?x=1"])
def test_catalog_origin(url):
    with pytest.raises(ValueError):
        catalog_base(url)


@pytest.mark.parametrize("url", ["https://evil.test/icon.png", "https://raw.githubusercontent.com/owner/repo/main/icon.png", "https://raw.githubusercontent.com/owner/repo/" + "b"*40 + "/../icon.png", "https://raw.githubusercontent.com/owner/repo/" + "b"*40 + "/icon.svg"])
def test_icon_requires_pinned_safe_raster(url):
    from dodaios.marketplace.glnt_client import validate_entry
    item, _ = package()
    item["icon_url"] = url
    with pytest.raises(ValueError):
        validate_entry(item)


def test_pinned_icon_metadata():
    from dodaios.marketplace.glnt_client import validate_entry
    item, _ = package()
    item["icon_url"] = "https://raw.githubusercontent.com/owner/repo/" + "b"*40 + "/icon.png"
    assert validate_entry(item)["icon_url"] == item["icon_url"]
