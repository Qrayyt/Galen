import hashlib
import io
import json
import stat
import zipfile

import pytest

from dodaios.marketplace.glnt_manifest import MANIFEST, github_repo, parse_manifest, read_package


def sample():
    body = b"# Example skill"
    raw = json.dumps({
        "schema": 1, "name": "test-skill", "title": "Test", "description": "Test skill",
        "type": "skill", "version": "1.0.0", "min_galen": "1.0.0", "category": "general",
        "permissions": ["tools"], "entry": "SKILL.md",
        "files": {"SKILL.md": hashlib.sha256(body).hexdigest()},
    }).encode()
    return raw, body


def archive(extra=None):
    manifest, body = sample()
    output = io.BytesIO()
    with zipfile.ZipFile(output, "w") as z:
        z.writestr("repo-commit/" + MANIFEST, manifest)
        z.writestr("repo-commit/SKILL.md", body)
        if extra:
            z.writestr(*extra)
    return output.getvalue(), hashlib.sha256(manifest).hexdigest()


def test_valid_declarative_package():
    raw, digest = archive()
    manifest, files = read_package(raw, digest)
    assert manifest.name == "test-skill"
    assert files == {"SKILL.md": b"# Example skill"}


@pytest.mark.parametrize("path", ["repo-commit/../evil.txt", "repo-commit/payload.exe", "repo-commit/skill.md", "repo-commit/CON.txt", "repo-commit/.env"])
def test_unsafe_archive(path):
    raw, digest = archive((path, b"x"))
    with pytest.raises(ValueError):
        read_package(raw, digest)


def test_symlink_and_integrity():
    item = zipfile.ZipInfo("repo-commit/link.txt")
    item.create_system = 3
    item.external_attr = (stat.S_IFLNK | 0o777) << 16
    raw, digest = archive((item, b"../../secret"))
    with pytest.raises(ValueError):
        read_package(raw, digest)
    raw, _ = archive()
    with pytest.raises(ValueError):
        read_package(raw, "0" * 64)


@pytest.mark.parametrize("url", ["https://github.com.evil/a/b", "http://github.com/a/b", "https://github.com/a/b?token=x", "https://github.com/a/b/tree/main"])
def test_repository_boundary(url):
    with pytest.raises(ValueError):
        github_repo(url)


def test_version_and_schema_rejected():
    raw, _ = sample()
    data = json.loads(raw)
    data["schema"] = 2
    with pytest.raises(ValueError):
        parse_manifest(json.dumps(data).encode())
