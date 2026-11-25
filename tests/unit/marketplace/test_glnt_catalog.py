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
