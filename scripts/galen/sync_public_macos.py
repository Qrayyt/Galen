#!/usr/bin/env python3
"""Mirror verified macOS releases independently of the existing Windows feed."""
import json
import pathlib
import re
import runpy
import shutil
import tempfile

installed = pathlib.Path("/usr/local/sbin/galen-release-mirror")
base = runpy.run_path(str(installed if installed.is_file() else pathlib.Path(__file__).with_name("sync_public_release.py")))
ROOT, DEST = base["ROOT"], base["DEST"]
API, request, version = base["API"], base["request"], base["version"]
fetch_asset, DIGEST, LIMIT = base["fetch_asset"], base["DIGEST"], base["LIMIT"]

def valid(asset, limit):
    return (asset and asset.get("state") == "uploaded"
            and DIGEST.fullmatch(asset.get("digest") or "")
            and isinstance(asset.get("id"), int)
            and isinstance(asset.get("size"), int)
            and 0 < asset["size"] <= limit)

def mirror(rows, arch):
    name = f"Galen-macOS-{arch}.dmg"
    checksum_name = name + ".sha256"
    eligible = []
    for row in rows:
        key = version(row.get("tag_name", ""))
        if row.get("draft") or not key:
            continue
        assets = {a["name"]: a for a in row.get("assets", [])}
        installer, checksum = assets.get(name), assets.get(checksum_name)
        if valid(installer, LIMIT) and valid(checksum, 65536):
            eligible.append((key, row, installer, checksum))
    if not eligible:
        print("No published macOS image:", arch)
        return
    key, row, installer, checksum = max(eligible, key=lambda x: x[0])
    tag = row["tag_name"]
    folder = tag + "-" + installer["digest"][7:23]
    root = DEST / "macos"
    root.mkdir(mode=0o755, parents=True, exist_ok=True)
    final = root / folder
    pointer = DEST / f"latest-macos-{arch}.json"
    canonical = "installers-SHA256SUMS.txt"
    old = json.loads(pointer.read_text()) if pointer.is_file() else None
    if old and version(old.get("tag_name", "")) > key:
        raise RuntimeError("Refusing macOS rollback")
    if (old and old.get("tag_name") == tag
        and [(a["name"], a["digest"]) for a in old.get("assets", [])] == [(name, installer["digest"]), (canonical, checksum["digest"])]
        and all((final / n).is_file() for n in (name, canonical))):
        print("Already published:", tag, arch)
        return
    if not final.is_dir():
        if shutil.disk_usage(ROOT).free < installer["size"] + 128 * 1024**2:
            raise RuntimeError("Insufficient disk space for macOS " + arch)
        stage = pathlib.Path(tempfile.mkdtemp(prefix=".macos-stage-", dir=ROOT))
        try:
            fetch_asset(installer, stage / name)
            fetch_asset(checksum, stage / canonical)
            if (stage / canonical).read_text().split() != [installer["digest"][7:], name]:
                raise ValueError("macOS checksum disagrees with installer")
            stage.chmod(0o755)
            for file in stage.iterdir():
                file.chmod(0o644)
            stage.rename(final)
        finally:
            if stage.exists():
                shutil.rmtree(stage)
    else:
        import hashlib
        for file, expected in ((final / name, installer), (final / canonical, checksum)):
            with file.open("rb") as stream:
                actual = hashlib.file_digest(stream, "sha256").hexdigest()
            if file.stat().st_size != expected["size"] or "sha256:" + actual != expected["digest"]:
                raise ValueError("Existing macOS mirror digest mismatch")
    origin = f"https://galen.galenite.org/downloads/macos/{folder}/"
    result = {
        "tag_name": tag, "draft": False, "prerelease": bool(row.get("prerelease")),
        "published_at": row.get("published_at"), "body": row.get("body") or "",
        "html_url": "https://galen.galenite.org/install",
        "assets": [
            {"name": n, "size": a["size"], "digest": a["digest"], "state": "uploaded", "browser_download_url": origin + n}
            for n, a in ((name, installer), (canonical, checksum))
        ],
    }
    with tempfile.NamedTemporaryFile(mode="w", encoding="utf-8", dir=ROOT, delete=False) as out:
        json.dump(result, out, ensure_ascii=False)
        tmp = pathlib.Path(out.name)
    tmp.chmod(0o644)
    tmp.replace(pointer)
    # Only remove older images for this architecture, never Windows or the other Mac.
    older = sorted((p for p in root.iterdir() if p.is_dir() and p != final
                   and re.fullmatch(r"v\d+\.\d+\.\d+(?:-preview\.\d+)?-[a-f0-9]{16}", p.name)
                   and (p / name).is_file()), key=lambda p: p.stat().st_mtime, reverse=True)
    for obsolete in older[1:]:
        shutil.rmtree(obsolete)
    print("Published verified macOS installer:", tag, arch, installer["size"])

def sync():
    DEST.mkdir(mode=0o755, parents=True, exist_ok=True)
    with request(API + "/releases?per_page=100", "application/vnd.github+json") as response:
        rows = json.load(response)
    errors = []
    for arch in ("arm64", "x64"):
        try:
            mirror(rows, arch)
        except Exception as exc:
            errors.append(f"{arch}: {exc}")
    if errors:
        raise RuntimeError("; ".join(errors))

if __name__ == "__main__":
    sync()
