"""Register verified declarative GLNT packages, without enabling them."""
from __future__ import annotations

import hashlib
import json
import os
import shutil
import tempfile
import threading
from pathlib import Path
from urllib.parse import urlsplit

from packaging.version import Version

from dodaios.marketplace.glnt_manifest import safe_path

RECEIPT = ".glnt-receipt.json"
_SKILL_LOCK = threading.RLock()


def _digest(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def _public_https(value: str) -> bool:
    from ipaddress import ip_address
    if not isinstance(value, str):
        return False
    try:
        u = urlsplit(value)
        host = u.hostname or ""
        if u.scheme != "https" or not host or "." not in host or u.username or u.password or u.port not in (None, 443):
            return False
        if host.endswith((".local", ".localhost", ".internal", ".test")):
            return False
        try:
            return ip_address(host).is_global
        except ValueError:
            return True
    except ValueError:
        return False


def plugin_spec(item, manifest, files):
    from dodaios.marketplace.agent_plugins_loader import convert_manifest
    plugin = json.loads(files["plugin.json"])
    mcp = json.loads(files["mcp.json"]) if "mcp.json" in files else None
    if not isinstance(mcp, dict) or not isinstance(mcp.get("mcpServers"), dict) or len(mcp["mcpServers"]) != 1:
        raise ValueError("GLNT v1 requires one remote MCP endpoint")
    server = next(iter(mcp["mcpServers"].values()))
    if not isinstance(server, dict) or server.get("command") or not _public_https(server.get("url", "")):
        raise ValueError("GLNT v1 accepts HTTPS MCP, not local commands")
    spec = convert_manifest(plugin, mcp, publisher=item["author"], version=manifest.version,
                            source_url=item["repository_url"])
    if spec.id != manifest.name or not {"network", "tools"}.issubset(manifest.permissions):
        raise ValueError("Plugin identity or declared permissions mismatch")
    # No app-supplied credentials or OAuth registrations for unknown services.
    # This first release accepts remote MCP open or user-entered token modes.
    if spec.auth.mode not in {"hosted_mcp_open", "pat_paste"}:
        raise ValueError("Unsupported GLNT plugin authentication mode")
    if spec.auth.mode == "pat_paste" and "credentials" not in manifest.permissions:
        raise ValueError("Plugin must declare credentials permission")
    if spec.oauth_client_family or spec.fallback_auth:
        raise ValueError("Shared credentials or fallback auth are not supported")
    auth = spec.auth.model_dump()
    for key, value in auth.items():
        if key.endswith(("_url", "_endpoint")) and isinstance(value, str) and value and not _public_https(value):
            raise ValueError("Unsafe authentication endpoint")
    return spec.model_copy(update={"source": "glnt", "logo_url": None})


def register_plugin(item, manifest, files):
    from dodaios.marketplace.catalog_data import load_catalog
    from dodaios.marketplace.community_install import install_plugin_spec, seed_plugin_ids
    from dodaios.marketplace.token_store import TokenStore
    spec = plugin_spec(item, manifest, files)
    existing = load_catalog().by_id(spec.id)
    if spec.id in seed_plugin_ids():
        raise ValueError("Built-in plugin name is reserved")
    if existing:
        if existing.source != "glnt" or existing.source_url != item["repository_url"]:
            raise ValueError("Plugin belongs to another source")
        if existing.version and Version(existing.version) > Version(manifest.version):
            raise ValueError("Downgrade refused")
        if TokenStore().load(spec.id) is not None:
            raise ValueError("Disconnect the plugin before updating it")
    install_plugin_spec(spec)
    return {"name": spec.id, "version": manifest.version, "status": "installed", "enabled": False}


def skill_receipt(root: Path):
    marker = root / RECEIPT
    if root.is_symlink() or marker.is_symlink() or not marker.is_file():
        raise ValueError("Skill belongs to another source")
    receipt = json.loads(marker.read_text(encoding="utf-8"))
    expected = receipt["files"]
    found = set()
    for p in root.rglob("*"):
        if p.is_symlink():
            raise ValueError("Skill contains local changes")
        if p.is_file() and p != marker:
            rel = p.relative_to(root).as_posix()
            found.add(rel)
            if rel not in expected or _digest(p.read_bytes()) != expected[rel]:
                raise ValueError("Skill contains local changes; preserve it before updating")
    if found != set(expected):
        raise ValueError("Skill contains local changes")
    return receipt


def register_skill(item, manifest, files, root: Path):
    with _SKILL_LOCK:
        return _register_skill(item, manifest, files, root)


def _register_skill(item, manifest, files, root: Path):
    from dodaios.skills.loader import parse_skill
    from dodaios.skills.registry import _rewrite_state_in_frontmatter
    from dodaios.skills.schema import SkillLifecycleState
    from dodaios.skills.builtin import BUILTIN_SKILL_NAMES
    if any(Path(name).name.casefold() == 'skill.md' and name != 'SKILL.md' for name in files):
        raise ValueError('Nested skill entry points are not supported')
    if manifest.name in BUILTIN_SKILL_NAMES:
        raise ValueError("Built-in skill name is reserved")
    root.mkdir(parents=True, exist_ok=True)
    target = root / manifest.name
    if target.is_symlink():
        raise ValueError("Unsafe local skill directory")
    if target.exists():
        previous = skill_receipt(target)
        if previous["repository_url"] != item["repository_url"] or Version(previous["version"]) > Version(manifest.version):
            raise ValueError("Source collision or downgrade")
    # Stage on the same volume. The skill loader must see a valid draft BEFORE
    # publishing the directory. No hooks, commands or auto-activation.
    # Never stage within the recursively scanned skill root.
    recovery = root.parent / ".glnt-recovery"
    recovery.mkdir(parents=True, exist_ok=True)
    tmp = Path(tempfile.mkdtemp(prefix="install-", dir=recovery))
    backup = tmp / "previous"
    try:
        incoming = tmp / "incoming"
        incoming.mkdir()
        for relative, data in files.items():
            safe_path(relative)
            path = incoming / relative
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(data)
        skill_path = incoming / "SKILL.md"
        parsed = parse_skill(skill_path)
        if parsed.frontmatter is None or parsed.name != manifest.name:
            raise ValueError("Invalid SKILL.md identity")
        body = _rewrite_state_in_frontmatter(skill_path.read_text(encoding="utf-8-sig"), SkillLifecycleState.DRAFT.value)
        skill_path.write_text(body, encoding="utf-8")
        parsed = parse_skill(skill_path)
        if parsed.frontmatter is None or parsed.error or parsed.state != SkillLifecycleState.DRAFT:
            raise ValueError("Skill cannot be safely registered as a draft")
        receipt = {**item, "files": {name: _digest((incoming / name).read_bytes()) for name in files}}
        (incoming / RECEIPT).write_text(json.dumps(receipt), encoding="utf-8")
        if target.exists():
            # Recheck ownership and local edits immediately before the swap.
            previous = skill_receipt(target)
            if previous["repository_url"] != item["repository_url"] or Version(previous["version"]) > Version(manifest.version):
                raise ValueError("Source collision or downgrade")
            os.replace(target, backup)
        try:
            os.replace(incoming, target)
        except OSError:
            if backup.exists():
                os.replace(backup, target)
            raise
        # Keep the previous installed version outside the scanner for recovery.
    finally:
        if not backup.exists():
            shutil.rmtree(tmp, ignore_errors=True)
    return {"name": manifest.name, "version": manifest.version, "status": "installed", "enabled": False}


def quarantine_skill(item, root: Path) -> str:
    """Uninstall a GLNT skill without deleting user edits or unrelated data."""
    from dodaios.marketplace.glnt_manifest import SLUG
    if not SLUG.fullmatch(item["name"]):
        raise ValueError("Invalid skill identity")
    with _SKILL_LOCK:
        target = root / item["name"]
        marker = target / RECEIPT
        if target.is_symlink() or marker.is_symlink() or not marker.is_file():
            raise ValueError("Skill is not a managed GLNT installation")
        receipt = json.loads(marker.read_text(encoding="utf-8"))
        if receipt.get("name") != item["name"] or receipt.get("repository_url") != item["repository_url"]:
            raise ValueError("Skill belongs to another source")
        recovery = root.parent / ".glnt-recovery"
        recovery.mkdir(parents=True, exist_ok=True)
        backup = Path(tempfile.mkdtemp(prefix="removed-", dir=recovery)) / item["name"]
        os.replace(target, backup)
        return str(backup)


def installed_status(item, skill_root: Path):
    if item["type"] == "plugin":
        from dodaios.marketplace.catalog_data import load_catalog
        spec = load_catalog().by_id(item["name"])
        return spec.version if spec and spec.source == "glnt" and spec.source_url == item["repository_url"] else None
    marker = skill_root / item["name"] / RECEIPT
    try:
        if marker.is_symlink() or marker.parent.is_symlink():
            return None
        value = json.loads(marker.read_text(encoding="utf-8"))
        return value["version"] if value["repository_url"] == item["repository_url"] else None
    except (OSError, ValueError, KeyError):
        return None
