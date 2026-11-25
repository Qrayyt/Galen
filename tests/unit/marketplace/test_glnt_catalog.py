import pytest
from fastapi.testclient import TestClient

from services.glnt_catalog import app as module


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setenv("GLNT_CATALOG_DB", str(tmp_path / "catalog.sqlite"))
    monkeypatch.setenv("GLNT_ADMIN_TOKEN", "a" * 40)
    async def inspect(url, token):
        assert token == "github-token"
        return ({
            "name": "sample-skill", "title": "Sample", "description": "Example", "type": "skill",
            "version": "1.0.0", "min_galen": "1.0.0", "category": "general", "permissions": [],
            "author": "owner", "repository_url": url, "commit": "a" * 40,
            "manifest_sha256": "b" * 64, "icon_url": None,
        }, 1, 2, 3)
    monkeypatch.setattr(module, "inspect_repository", inspect)
    return TestClient(module.app)


def test_pending_is_hidden_until_moderation(client):
    submission = client.post("/v1/submissions", json={"repository_url": "https://github.com/owner/repo"}, headers={"Authorization": "Bearer github-token"})
    assert submission.status_code == 202
    entry = submission.json()["item"]
    assert entry["status"] == "pending"
    assert client.get("/v1/catalog").json()["total"] == 0
    assert client.get("/v1/catalog/" + entry["id"]).status_code == 404
    assert client.post("/v1/moderation/" + entry["id"], json={"status": "approved", "note": "Reviewed"}).status_code == 401
    result = client.post("/v1/moderation/" + entry["id"], json={"status": "approved", "note": "Reviewed"}, headers={"Authorization": "Bearer " + "a" * 40})
    assert result.status_code == 200
    listing = client.get("/v1/catalog?q=sample&kind=skill").json()
    assert listing["api_version"] == 1
    assert listing["total"] == 1
    assert listing["items"][0]["status"] == "approved"
    assert "files" not in listing["items"][0]
    assert client.get("/v1/catalog?kind=plugin").json()["total"] == 0


@pytest.mark.asyncio
@pytest.mark.parametrize("valid", [True, False])
async def test_submission_checks_pinned_blob_integrity(monkeypatch, valid):
    import base64
    import hashlib
    import json
    from fastapi import HTTPException

    body = b"# Sample skill"
    manifest = json.dumps({
        "schema": 1, "name": "sample-skill", "title": "Sample",
        "description": "Example", "type": "skill", "version": "1.0.0",
        "min_galen": "1.0.0", "category": "general", "permissions": [],
        "entry": "SKILL.md", "files": {"SKILL.md": hashlib.sha256(body if valid else b"wrong").hexdigest()},
    }).encode()
    commit, tree, blob = "a" * 40, "b" * 40, "c" * 40
    responses = {
        "/user": {"id": 2},
        "/repos/owner/repo": {"id": 1, "owner": {"id": 2, "login": "owner"}, "full_name": "owner/repo", "default_branch": "main"},
        "/repos/owner/repo/commits/main": {"sha": commit, "commit": {"tree": {"sha": tree}}},
        f"/repos/owner/repo/contents/galen-extension.json?ref={commit}": {
            "encoding": "base64", "size": len(manifest), "content": base64.b64encode(manifest).decode()},
        f"/repos/owner/repo/git/trees/{tree}?recursive=1": {"tree": [
            {"type": "blob", "mode": "100644", "path": "galen-extension.json", "sha": "d" * 40, "size": len(manifest)},
            {"type": "blob", "mode": "100644", "path": "SKILL.md", "sha": blob, "size": len(body)},
        ]},
        f"/repos/owner/repo/git/blobs/{blob}": {"encoding": "base64", "size": len(body), "content": base64.b64encode(body).decode()},
    }

    async def request(client, path, max_bytes=2 * 1024 * 1024):
        return responses[path]

    monkeypatch.setattr(module, "github_json", request)
    if valid:
        metadata, *_ = await module.inspect_repository("https://github.com/owner/repo", "github-token")
        assert metadata["commit"] == commit
        assert metadata["manifest_sha256"] == hashlib.sha256(manifest).hexdigest()
        assert "files" not in metadata
    else:
        with pytest.raises(HTTPException, match="integrity mismatch"):
            await module.inspect_repository("https://github.com/owner/repo", "github-token")
