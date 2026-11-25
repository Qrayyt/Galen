"""GLNT v1: strict declarative package, pinned GitHub source, safe ZIP reader.

Only data files are supported in v1. Nothing here imports or executes a package.
"""
from __future__ import annotations

import hashlib
import io
import json
import re
import stat
import zipfile
from dataclasses import dataclass
from pathlib import PurePosixPath
from typing import Any
from urllib.parse import urlsplit

MANIFEST = "galen-extension.json"
MAX_ARCHIVE = 8 * 1024 * 1024
MAX_EXPANDED = 16 * 1024 * 1024
MAX_FILE = 512 * 1024
MAX_FILES = 128
SLUG = re.compile(r"[a-z0-9][a-z0-9-]{1,62}[a-z0-9]\Z")
VERSION = re.compile(r"(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)\Z")
SHA = re.compile(r"[0-9a-f]{40}\Z")
DIGEST = re.compile(r"[0-9a-f]{64}\Z")
REPO = re.compile(r"[A-Za-z0-9-]{1,39}/[A-Za-z0-9_.-]{1,100}\Z")
SEGMENT = re.compile(r"[A-Za-z0-9_.-]{1,128}\Z")
RESERVED = {"CON", "PRN", "AUX", "NUL", *(f"COM{i}" for i in range(1, 10)), *(f"LPT{i}" for i in range(1, 10))}
PERMISSIONS = {"network", "credentials", "read-files", "write-files", "tools"}
SUFFIXES = {".md", ".txt", ".json", ".png", ".jpg", ".jpeg", ".webp"}


def github_repo(url: str) -> str:
    u = urlsplit(url)
    path = u.path.strip("/")
    if u.scheme != "https" or u.netloc.lower() != "github.com" or u.query or u.fragment or not REPO.fullmatch(path):
        raise ValueError("Use an HTTPS GitHub repository URL (owner/repo)")
    if any(part in {".", ".."} for part in path.split("/")):
        raise ValueError("Invalid repository")
    return path


def safe_path(path: str) -> str:
    if not isinstance(path, str) or not path or len(path) > 240 or "\\" in path:
        raise ValueError("unsafe path")
    parts = path.split("/")
    if any(not SEGMENT.fullmatch(p) or p in {".", ".."} or p.startswith(".") or p.endswith(".") or p.split(".")[0].upper() in RESERVED for p in parts):
        raise ValueError("unsafe path")
    return path


def data_path(path: str) -> str:
    safe_path(path)
    if PurePosixPath(path).suffix.lower() not in SUFFIXES:
        raise ValueError("unsupported or executable package file")
    return path


def _text(value: Any, limit: int) -> str:
    if not isinstance(value, str) or not value.strip() or len(value) > limit or any(ord(ch) < 32 for ch in value):
        raise ValueError("invalid manifest text")
    return value.strip()


@dataclass(frozen=True)
class Manifest:
    name: str
    title: str
    description: str
    kind: str
    version: str
    min_galen: str
    category: str
    permissions: tuple[str, ...]
    entry: str
    files: dict[str, str]
    icon: str | None


def parse_manifest(raw: bytes) -> Manifest:
    if len(raw) > MAX_FILE:
        raise ValueError("manifest too large")
    def unique(pairs):
        out = {}
        for key, value in pairs:
            if key in out:
                raise ValueError("duplicate JSON key")
            out[key] = value
        return out
    try:
        v = json.loads(raw.decode("utf-8"), object_pairs_hook=unique)
    except (UnicodeError, ValueError, RecursionError) as exc:
        raise ValueError("invalid manifest JSON") from exc
    allowed = {"schema", "name", "title", "description", "type", "version", "min_galen", "category", "permissions", "entry", "files", "icon"}
    if not isinstance(v, dict) or set(v) - allowed or type(v.get("schema")) is not int or v["schema"] != 1:
        raise ValueError("unsupported manifest schema")
    name = _text(v.get("name"), 64)
    version = _text(v.get("version"), 40)
    minimum = _text(v.get("min_galen"), 40)
    kind = v.get("type")
    if not SLUG.fullmatch(name) or not VERSION.fullmatch(version) or not VERSION.fullmatch(minimum) or kind not in ("plugin", "skill"):
        raise ValueError("invalid identity, version or type")
    permissions = v.get("permissions")
    if not isinstance(permissions, list) or len(permissions) > len(PERMISSIONS) or any(not isinstance(x, str) or x not in PERMISSIONS for x in permissions) or len(set(permissions)) != len(permissions):
        raise ValueError("invalid permissions")
    files = v.get("files")
    if not isinstance(files, dict) or not 1 <= len(files) <= MAX_FILES:
        raise ValueError("invalid file manifest")
    folded = set()
    for path, digest in files.items():
        data_path(path)
        if kind == "skill" and path != "SKILL.md" and PurePosixPath(path).name.casefold() == "skill.md":
            raise ValueError("nested skill entry point")
        if path == MANIFEST or path.casefold() in folded or not isinstance(digest, str) or not DIGEST.fullmatch(digest):
            raise ValueError("invalid file integrity declaration")
        folded.add(path.casefold())
    entry = v.get("entry")
    if entry != ("plugin.json" if kind == "plugin" else "SKILL.md") or entry not in files:
        raise ValueError("invalid extension entry point")
    icon = v.get("icon")
    if icon is not None and (not isinstance(icon, str) or icon not in files or PurePosixPath(icon).suffix.lower() not in {".png", ".jpg", ".jpeg", ".webp"}):
        raise ValueError("invalid icon")
    return Manifest(name, _text(v.get("title"), 100), _text(v.get("description"), 500), kind, version, minimum, _text(v.get("category"), 60), tuple(permissions), entry, files, icon)


def github_archive_url(repository: str, commit: str) -> str:
    if not REPO.fullmatch(repository) or not SHA.fullmatch(commit):
        raise ValueError("invalid pinned GitHub source")
    return f"https://codeload.github.com/{repository}/zip/{commit}"


def read_package(raw: bytes, manifest_sha256: str) -> tuple[Manifest, dict[str, bytes]]:
    """Read bounded bytes in memory. No extraction path is ever constructed."""
    if len(raw) > MAX_ARCHIVE or not DIGEST.fullmatch(manifest_sha256):
        raise ValueError("archive limit or integrity")
    files = {}
    folded = set()
    root = None
    total = 0
    try:
        with zipfile.ZipFile(io.BytesIO(raw)) as z:
            entries = z.infolist()
            if len(entries) > MAX_FILES * 3:
                raise ValueError("too many archive entries")
            for item in entries:
                original = item.filename.rstrip("/")
                safe_path(original)
                parts = original.split("/")
                if root is None:
                    root = parts[0]
                if parts[0] != root:
                    raise ValueError("multiple archive roots")
                mode = item.external_attr >> 16
                if stat.S_IFMT(mode) not in (0, stat.S_IFREG, stat.S_IFDIR):
                    raise ValueError("links or special files are prohibited")
                if item.flag_bits & 1:
                    raise ValueError("encrypted archive")
                if item.is_dir():
                    if stat.S_IFMT(mode) == stat.S_IFREG:
                        raise ValueError("invalid directory")
                    continue
                if len(parts) < 2 or stat.S_IFMT(mode) == stat.S_IFDIR or mode & 0o111:
                    raise ValueError("unsafe executable archive entry")
                path = data_path("/".join(parts[1:]))
                if path.casefold() in folded:
                    raise ValueError("duplicate path")
                folded.add(path.casefold())
                total += item.file_size
                if item.file_size > MAX_FILE or total > MAX_EXPANDED or item.file_size > max(1024, item.compress_size * 150) or len(files) >= MAX_FILES + 1:
                    raise ValueError("archive expansion limit")
                with z.open(item) as stream:
                    body = stream.read(MAX_FILE + 1)
                if len(body) != item.file_size or len(body) > MAX_FILE:
                    raise ValueError("archive length mismatch")
                files[path] = body
    except (zipfile.BadZipFile, RuntimeError, NotImplementedError, OSError) as exc:
        raise ValueError("invalid archive") from exc
    manifest = files.pop(MANIFEST, None)
    if manifest is None or hashlib.sha256(manifest).hexdigest() != manifest_sha256:
        raise ValueError("manifest integrity mismatch")
    parsed = parse_manifest(manifest)
    if set(files) != set(parsed.files):
        raise ValueError("undeclared or missing package file")
    for path, digest in parsed.files.items():
        if hashlib.sha256(files[path]).hexdigest() != digest:
            raise ValueError("file integrity mismatch")
    return parsed, files
