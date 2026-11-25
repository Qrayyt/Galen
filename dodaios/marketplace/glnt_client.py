"""GLNT catalog client. Verified archives are staged locally, never executed."""
from __future__ import annotations

import hashlib
import json
import re
import sqlite3
from contextlib import contextmanager
from pathlib import Path
from urllib.parse import urlsplit

import httpx
from packaging.version import Version

from dodaios import __version__
from dodaios.marketplace.glnt_manifest import (
    DIGEST, MAX_ARCHIVE, PERMISSIONS, SHA, SLUG, VERSION, github_archive_url,
    github_repo, read_package, safe_path,
)

ENTRY_ID = re.compile(r"[0-9a-f]{32}")
MAX_JSON = 2 * 1024 * 1024


def catalog_base(url: str) -> str:
    u = urlsplit(url)
    if (u.scheme != "https" or not u.hostname or u.netloc != u.hostname
            or not (u.hostname == "galenite.org" or u.hostname.endswith(".galenite.org"))
            or u.query or u.fragment or not re.fullmatch(r"(?:/[a-zA-Z0-9_-]+)*/?", u.path)):
        raise ValueError("GLNT catalog must use a trusted Galenite HTTPS endpoint")
    return url.rstrip("/")


def validate_entry(item: dict) -> dict:
    if not isinstance(item, dict):
        raise ValueError("Invalid catalog entry")
    keys = ("id", "name", "title", "description", "type", "version", "min_galen",
            "category", "permissions", "author", "repository_url", "commit",
            "manifest_sha256", "status")
    v = {k: item[k] for k in keys}
    if (v["status"] != "approved" or v["type"] not in ("plugin", "skill")
            or not ENTRY_ID.fullmatch(v["id"]) or not SLUG.fullmatch(v["name"])
            or not SHA.fullmatch(v["commit"]) or not DIGEST.fullmatch(v["manifest_sha256"])
            or not VERSION.fullmatch(v["version"]) or not VERSION.fullmatch(v["min_galen"])):
        raise ValueError("Invalid approved catalog entry")
    for k, limit in (("title",100),("description",500),("category",60),("author",100)):
        if not isinstance(v[k], str) or not v[k] or len(v[k]) > limit:
            raise ValueError("Invalid catalog metadata")
    p = v["permissions"]
    if not isinstance(p, list) or any(x not in PERMISSIONS for x in p) or len(set(p)) != len(p):
        raise ValueError("Invalid package permissions")
    v["repository_url"] = "https://github.com/" + github_repo(v["repository_url"])
    icon = item.get("icon_url")
    if icon is not None:
        prefix = f"https://raw.githubusercontent.com/{github_repo(v['repository_url'])}/{v['commit']}/"
        if not isinstance(icon, str) or not icon.startswith(prefix):
            raise ValueError("Icon source must match the reviewed commit")
        path = safe_path(icon[len(prefix):])
        if Path(path).suffix.lower() not in {".png", ".jpg", ".jpeg", ".webp"}:
            raise ValueError("Invalid icon format")
    v["icon_url"] = icon
    return v


async def download_icon(item: dict) -> bytes:
    """Fetch only a reviewed, commit-pinned raster and normalize it to PNG."""
    import io
    from PIL import Image
    item = validate_entry(item)
    url = item["icon_url"]
    if not url:
        raise ValueError("No icon")
    raw = bytearray()
    async with httpx.AsyncClient(timeout=10, follow_redirects=False, trust_env=False) as client:
        async with client.stream("GET", url) as response:
            response.raise_for_status()
            async for chunk in response.aiter_bytes():
                raw.extend(chunk)
                if len(raw) > 512 * 1024:
                    raise ValueError("Icon too large")
    with Image.open(io.BytesIO(raw)) as image:
        if image.format not in {"PNG", "JPEG", "WEBP"} or max(image.size) > 1024:
            raise ValueError("Unsupported icon dimensions or format")
        image.thumbnail((128, 128))
        output = io.BytesIO()
        image.convert("RGBA").save(output, format="PNG")
    return output.getvalue()


@contextmanager
def database(path: Path):
    path.parent.mkdir(parents=True, exist_ok=True)
    con = sqlite3.connect(path, timeout=10)
    try:
        con.execute("CREATE TABLE IF NOT EXISTS staged (name TEXT, kind TEXT, metadata TEXT NOT NULL, archive BLOB NOT NULL, PRIMARY KEY(name,kind))")
        con.execute("CREATE TABLE IF NOT EXISTS cache (key TEXT PRIMARY KEY, payload TEXT NOT NULL)")
        yield con
        con.commit()
    except BaseException:
        con.rollback()
        raise
    finally:
        con.close()


async def request_json(base: str, path: str, *, params=None, body=None, token=None):
    headers = {"Accept": "application/json"}
    if token:
        headers["Authorization"] = "Bearer " + token
    async with httpx.AsyncClient(timeout=15, follow_redirects=False, trust_env=False) as client:
        async with client.stream("POST" if body is not None else "GET", catalog_base(base) + path,
                                 params=params, json=body, headers=headers) as response:
            response.raise_for_status()
            if "json" not in response.headers.get("content-type", "").lower():
                raise ValueError("Invalid catalog response")
            data = bytearray()
            async for chunk in response.aiter_bytes():
                data.extend(chunk)
                if len(data) > MAX_JSON:
                    raise ValueError("Catalog response too large")
    result = json.loads(data)
    if not isinstance(result, dict) or result.get("api_version") != 1:
        raise ValueError("Unsupported GLNT API version")
    return result


async def browse(base: str, db: Path, q: str, kind: str, offset: int):
    params = {"q": q, "offset": offset, "limit": 30}
    if kind:
        params["kind"] = kind
    key = json.dumps([base, params], sort_keys=True)
    try:
        page = await request_json(base, "/v1/catalog", params=params)
        items = [validate_entry(i) for i in page["items"]]
        next_offset = page.get("next_offset")
        if len(items) > 30 or (next_offset is not None and (type(next_offset) is not int or next_offset <= offset)):
            raise ValueError("Invalid catalog pagination")
        page = {"items": items, "next_offset": next_offset, "stale": False}
    except (httpx.HTTPError, ValueError, KeyError, TypeError):
        with database(db) as con:
            row = con.execute("SELECT payload FROM cache WHERE key=?", (key,)).fetchone()
        if row is None:
            raise ValueError("GLNT catalog unavailable")
        return {**json.loads(row[0]), "stale": True}
    with database(db) as con:
        con.execute("INSERT OR REPLACE INTO cache VALUES (?,?)", (key, json.dumps(page)))
        con.execute("DELETE FROM cache WHERE rowid NOT IN (SELECT rowid FROM cache ORDER BY rowid DESC LIMIT 30)")
    return page


async def download_archive(item: dict) -> bytes:
    url = github_archive_url(github_repo(item["repository_url"]), item["commit"])
    async with httpx.AsyncClient(timeout=30, follow_redirects=False, trust_env=False) as client:
        async with client.stream("GET", url) as response:
            response.raise_for_status()
            if response.headers.get("content-type", "").split(";")[0].lower() not in (
                "application/zip", "application/octet-stream", "application/x-zip-compressed"
            ):
                raise ValueError("Unexpected GitHub archive content type")
            raw = bytearray()
            async for chunk in response.aiter_bytes():
                raw.extend(chunk)
                if len(raw) > MAX_ARCHIVE:
                    raise ValueError("Archive too large")
    return bytes(raw)


def stage_verified(db: Path, item: dict, raw: bytes, *, app_version: str = __version__) -> dict:
    item = validate_entry(item)
    manifest, _ = read_package(raw, item["manifest_sha256"])
    if (manifest.name, manifest.kind, manifest.version, manifest.min_galen, set(manifest.permissions)) != (
        item["name"], item["type"], item["version"], item["min_galen"], set(item["permissions"])
    ):
        raise ValueError("Catalog and package metadata disagree")
    if Version(app_version) < Version(manifest.min_galen):
        raise ValueError("Package requires a newer Galen version")
    receipt = {**item, "archive_sha256": hashlib.sha256(raw).hexdigest(), "local_status": "staged"}
    with database(db) as con:
        con.execute("BEGIN IMMEDIATE")
        old = con.execute("SELECT metadata FROM staged WHERE name=? AND kind=?", (manifest.name, manifest.kind)).fetchone()
        if old:
            previous = json.loads(old[0])
            if previous["repository_url"].lower() != item["repository_url"].lower():
                raise ValueError("Local package belongs to another repository")
            if Version(previous["version"]) > Version(item["version"]):
                raise ValueError("Downgrade refused")
        con.execute("INSERT OR REPLACE INTO staged VALUES (?,?,?,?)",
                    (manifest.name, manifest.kind, json.dumps(receipt), raw))
    return receipt


def staged(db: Path):
    with database(db) as con:
        return [json.loads(r[0]) for r in con.execute("SELECT metadata FROM staged ORDER BY name")]


def remove(db: Path, name: str, kind: str):
    if not SLUG.fullmatch(name) or kind not in ("plugin", "skill"):
        raise ValueError("Invalid package identity")
    with database(db) as con:
        return bool(con.execute("DELETE FROM staged WHERE name=? AND kind=?", (name, kind)).rowcount)


def read_staged(db: Path, name: str, kind: str, commit: str):
    if not SLUG.fullmatch(name) or kind not in ("plugin", "skill") or not SHA.fullmatch(commit):
        raise ValueError("Invalid package identity")
    with database(db) as con:
        row = con.execute("SELECT metadata,archive FROM staged WHERE name=? AND kind=?", (name, kind)).fetchone()
    if row is None:
        raise ValueError("Download the package first")
    item, raw = json.loads(row[0]), row[1]
    if item["commit"] != commit or hashlib.sha256(raw).hexdigest() != item["archive_sha256"]:
        raise ValueError("Local package changed; review and download again")
    manifest, files = read_package(raw, item["manifest_sha256"])
    if (manifest.name, manifest.kind, manifest.version, manifest.min_galen, set(manifest.permissions)) != (
        name, kind, item["version"], item["min_galen"], set(item["permissions"])
    ) or Version(__version__) < Version(manifest.min_galen):
        raise ValueError("Incompatible or mismatched package")
    return validate_entry(item), manifest, files
