"""GLNT metadata-only catalog. Run behind HTTPS; no archive proxy or package store."""
from __future__ import annotations

import base64
import hashlib
import hmac
import json
import os
import sqlite3
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Literal
from urllib.parse import quote

import httpx
from fastapi import FastAPI, Header, HTTPException, Query
from pydantic import BaseModel, ConfigDict, Field

from dodaios.marketplace.glnt_manifest import (
    MANIFEST, MAX_FILE, MAX_FILES, SHA, data_path, github_repo, parse_manifest,
)

app = FastAPI(title="GLNT Marketplace", version="1.0.0")
API = "https://api.github.com"


def now() -> str:
    return datetime.now(timezone.utc).isoformat()


@contextmanager
def database():
    path = Path(os.environ.get("GLNT_CATALOG_DB", "./data/glnt-catalog.sqlite3"))
    path.parent.mkdir(parents=True, exist_ok=True)
    con = sqlite3.connect(path, timeout=10)
    con.row_factory = sqlite3.Row
    try:
        con.execute("""CREATE TABLE IF NOT EXISTS entries (
            id TEXT PRIMARY KEY, repo_id INTEGER NOT NULL, owner_id INTEGER NOT NULL,
            submitter_id INTEGER NOT NULL, name TEXT NOT NULL, kind TEXT NOT NULL,
            version TEXT NOT NULL, commit_sha TEXT NOT NULL,
            metadata TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN ('pending','approved','rejected')),
            submitted_at TEXT NOT NULL, moderated_at TEXT, moderation_note TEXT,
            UNIQUE(repo_id, version)
        )""")
        con.execute("""CREATE TABLE IF NOT EXISTS moderation_audit (
            id INTEGER PRIMARY KEY, entry_id TEXT NOT NULL, from_status TEXT NOT NULL,
            to_status TEXT NOT NULL, note TEXT NOT NULL, created_at TEXT NOT NULL
        )""")
        yield con
        con.commit()
    except BaseException:
        con.rollback()
        raise
    finally:
        con.close()


def public_row(row: sqlite3.Row) -> dict[str, Any]:
    return {**json.loads(row["metadata"]), "id": row["id"], "status": row["status"],
            "submitted_at": row["submitted_at"], "moderated_at": row["moderated_at"]}


async def github_json(client: httpx.AsyncClient, path: str, max_bytes: int = 2 * 1024 * 1024) -> Any:
    # Every caller supplies a fixed API path or a canonical validated repo path.
    async with client.stream("GET", API + path) as res:
        if res.status_code != 200:
            raise HTTPException(429 if res.status_code in (403, 429) and res.headers.get("x-ratelimit-remaining") == "0" else 400,
                                "GitHub request failed or was rate limited")
        if "json" not in res.headers.get("content-type", "").lower():
            raise HTTPException(502, "Unexpected GitHub content type")
        raw = bytearray()
        async for chunk in res.aiter_bytes():
            raw.extend(chunk)
            if len(raw) > max_bytes:
                raise HTTPException(413, "GitHub response too large")
    try:
        return json.loads(raw)
    except ValueError as exc:
        raise HTTPException(502, "Invalid GitHub response") from exc


async def inspect_repository(repository_url: str, token: str) -> tuple[dict[str, Any], int, int, int]:
    repository = github_repo(repository_url)
    async with httpx.AsyncClient(timeout=15, follow_redirects=False, trust_env=False,
                                 headers={"Authorization": f"Bearer {token}", "Accept": "application/vnd.github+json",
                                          "X-GitHub-Api-Version": "2022-11-28", "User-Agent": "GLNT-Catalog/1"}) as client:
        identity = await github_json(client, "/user")
        repo = await github_json(client, f"/repos/{repository}")
        if repo.get("private") or repo.get("archived") or repo.get("disabled"):
            raise HTTPException(400, "Only active public repositories can be submitted")
        if repo["owner"]["id"] != identity["id"] and not repo.get("permissions", {}).get("push"):
            raise HTTPException(403, "Repository write permission is required")
        canonical = github_repo("https://github.com/" + repo["full_name"])
        commit = await github_json(client, f"/repos/{canonical}/commits/{quote(repo['default_branch'], safe='')}")
        sha = commit["sha"]
        tree_sha = commit["commit"]["tree"]["sha"]
        if not SHA.fullmatch(sha) or not SHA.fullmatch(tree_sha):
            raise HTTPException(502, "Invalid GitHub commit")
        manifest_obj = await github_json(client, f"/repos/{canonical}/contents/{MANIFEST}?ref={sha}", 1024 * 1024)
        if manifest_obj.get("encoding") != "base64" or manifest_obj.get("size", MAX_FILE + 1) > MAX_FILE:
            raise HTTPException(400, "Invalid or oversized manifest")
        raw = base64.b64decode(manifest_obj["content"].replace("\n", ""), validate=True)
        manifest = parse_manifest(raw)
        tree = await github_json(client, f"/repos/{canonical}/git/trees/{tree_sha}?recursive=1")
        if tree.get("truncated") or len(tree.get("tree", [])) > MAX_FILES * 3:
            raise HTTPException(400, "Repository too large to validate")
        found = set()
        for node in tree["tree"]:
            if node["type"] == "tree":
                continue
            if node["type"] != "blob" or node.get("mode") != "100644" or node.get("size", MAX_FILE + 1) > MAX_FILE:
                raise HTTPException(400, "Executable, link or oversized repository file")
            found.add(data_path(node["path"]))
        if found != set(manifest.files) | {MANIFEST}:
            raise HTTPException(400, "Undeclared or missing repository files")
        metadata = {
            "name": manifest.name, "title": manifest.title, "description": manifest.description,
            "type": manifest.kind, "version": manifest.version, "min_galen": manifest.min_galen,
            "category": manifest.category, "permissions": list(manifest.permissions),
            "author": repo["owner"]["login"], "repository_url": "https://github.com/" + canonical,
            "commit": sha, "manifest_sha256": hashlib.sha256(raw).hexdigest(),
            "icon_url": f"https://raw.githubusercontent.com/{canonical}/{sha}/{manifest.icon}" if manifest.icon else None,
        }
        return metadata, int(repo["id"]), int(repo["owner"]["id"]), int(identity["id"])


class Submission(BaseModel):
    model_config = ConfigDict(extra="forbid")
    repository_url: str = Field(min_length=10, max_length=250)


class Moderation(BaseModel):
    model_config = ConfigDict(extra="forbid")
    status: Literal["approved", "rejected"]
    note: str = Field(min_length=1, max_length=500)


def bearer(auth: str | None) -> str:
    if not auth or not auth.startswith("Bearer ") or not 10 <= len(auth[7:]) <= 512:
        raise HTTPException(401, "Authorization required")
    return auth[7:]


def require_moderator(auth: str | None) -> None:
    expected = os.environ.get("GLNT_ADMIN_TOKEN", "")
    if len(expected) < 32 or not hmac.compare_digest(bearer(auth), expected):
        raise HTTPException(403, "Moderator authorization required")


@app.get("/v1/catalog")
def catalog(q: str = Query("", max_length=100), kind: Literal["plugin", "skill"] | None = None,
            category: str = Query("", max_length=60), offset: int = Query(0, ge=0, le=100000),
            limit: int = Query(30, ge=1, le=100)):
    with database() as con:
        rows = con.execute("SELECT * FROM entries WHERE status='approved' ORDER BY submitted_at DESC, id").fetchall()
    # Latest approved version per repository, by numeric SemVer.
    latest = {}
    for row in rows:
        current = latest.get(row["repo_id"])
        if current is None or tuple(map(int, row["version"].split("."))) > tuple(map(int, current["version"].split("."))):
            latest[row["repo_id"]] = row
    items = [public_row(row) for row in latest.values()]
    folded = q.casefold()
    filtered = [item for item in items if (not kind or item["type"] == kind)
                and (not category or item["category"].casefold() == category.casefold())
                and (not folded or folded in " ".join(str(item[key]) for key in ("name", "title", "description", "author")).casefold())]
    return {"api_version": 1, "items": filtered[offset:offset + limit], "total": len(filtered),
            "next_offset": offset + limit if offset + limit < len(filtered) else None}


@app.get("/v1/catalog/{entry_id}")
def detail(entry_id: str):
    with database() as con:
        row = con.execute("SELECT * FROM entries WHERE id=? AND status='approved'", (entry_id,)).fetchone()
    if row is None:
        raise HTTPException(404, "Extension not found")
    return {"api_version": 1, "item": public_row(row)}


@app.post("/v1/submissions", status_code=202)
async def submit(body: Submission, authorization: str | None = Header(None)):
    token = bearer(authorization)
    try:
        metadata, repo_id, owner_id, submitter = await inspect_repository(body.repository_url, token)
    except (ValueError, KeyError, TypeError, httpx.HTTPError) as exc:
        raise HTTPException(400, "Repository or manifest validation failed") from exc
    entry_id = hashlib.sha256(f"{repo_id}:{metadata['version']}".encode()).hexdigest()[:32]
    with database() as con:
        con.execute("BEGIN IMMEDIATE")
        old = con.execute("SELECT * FROM entries WHERE id=?", (entry_id,)).fetchone()
        if old is not None:
            if old["commit_sha"] != metadata["commit"]:
                raise HTTPException(409, "This version is immutable; submit a new version")
            return {"api_version": 1, "item": public_row(old)}
        con.execute("INSERT INTO entries VALUES (?,?,?,?,?,?,?,?,?,'pending',?,NULL,NULL)",
                    (entry_id, repo_id, owner_id, submitter, metadata["name"], metadata["type"], metadata["version"],
                     metadata["commit"], json.dumps(metadata, ensure_ascii=False), now()))
        row = con.execute("SELECT * FROM entries WHERE id=?", (entry_id,)).fetchone()
    return {"api_version": 1, "item": public_row(row)}


@app.get("/v1/moderation")
def pending(authorization: str | None = Header(None), limit: int = Query(50, ge=1, le=100), offset: int = Query(0, ge=0)):
    require_moderator(authorization)
    with database() as con:
        rows = con.execute("SELECT * FROM entries WHERE status='pending' ORDER BY submitted_at LIMIT ? OFFSET ?", (limit, offset)).fetchall()
    return {"api_version": 1, "items": [public_row(row) for row in rows]}


@app.post("/v1/moderation/{entry_id}")
def moderate(entry_id: str, body: Moderation, authorization: str | None = Header(None)):
    require_moderator(authorization)
    with database() as con:
        con.execute("BEGIN IMMEDIATE")
        row = con.execute("SELECT * FROM entries WHERE id=?", (entry_id,)).fetchone()
        if row is None:
            raise HTTPException(404, "Submission not found")
        if body.status == "approved":
            collision = con.execute("SELECT id FROM entries WHERE name=? AND kind=? AND repo_id<>? AND status='approved'",
                                    (row["name"], row["kind"], row["repo_id"])).fetchone()
            if collision:
                raise HTTPException(409, "Extension name is already assigned")
        stamp = now()
        con.execute("UPDATE entries SET status=?, moderated_at=?, moderation_note=? WHERE id=?",
                    (body.status, stamp, body.note, entry_id))
        con.execute("INSERT INTO moderation_audit(entry_id,from_status,to_status,note,created_at) VALUES (?,?,?,?,?)",
                    (entry_id, row["status"], body.status, body.note, stamp))
        return {"api_version": 1, "item": public_row(con.execute("SELECT * FROM entries WHERE id=?", (entry_id,)).fetchone())}
