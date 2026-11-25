#!/usr/bin/env python3
"""Publish small verified release manifests, never mirror installer binaries."""
import hashlib
import json
import pathlib
import re
import tempfile
import urllib.request

REPO = "Qrayyt/Galen"
API = "https://api.github.com/repos/" + REPO
ORIGIN = "https://galen.galenite.org/downloads/"
ROOT = pathlib.Path("/var/www/galen")
DEST = ROOT / "downloads"
TAG = re.compile(r"v(\d+)\.(\d+)\.(\d+)(?:-preview\.(\d+))?")
DIGEST = re.compile(r"sha256:[a-f0-9]{64}")
PLATFORMS = (
    ("Galen-Setup-x64.exe", "latest.json", ""),
    ("Galen-macOS-arm64.dmg", "latest-macos-arm64.json", "macos/"),
    ("Galen-macOS-x64.dmg", "latest-macos-x64.json", "macos/"),
)

def version(tag):
    m = TAG.fullmatch(tag)
    if not m:
        return None
    a, b, c, pre = m.groups()
    return int(a), int(b), int(c), pre is None, int(pre or 0)

def download(url, limit):
    req = urllib.request.Request(url, headers={"User-Agent": "Galen-release-metadata"})
    with urllib.request.urlopen(req, timeout=30) as response:
        if not response.geturl().startswith("https://"):
            raise ValueError("Non-HTTPS response")
        data = response.read(limit + 1)
    if len(data) > limit:
        raise ValueError("Response too large")
    return data

def valid(asset, tag, name, limit):
    return (asset and asset.get("state") == "uploaded"
            and DIGEST.fullmatch(asset.get("digest") or "")
            and 0 < asset.get("size", 0) <= limit
            and asset.get("browser_download_url") ==
            f"https://github.com/{REPO}/releases/download/{tag}/{name}")

def atomic(path, data):
    path.parent.mkdir(parents=True, exist_ok=True, mode=0o755)
    with tempfile.NamedTemporaryFile(dir=path.parent, delete=False) as out:
        out.write(data)
        tmp = pathlib.Path(out.name)
    try:
        tmp.chmod(0o644)
        tmp.replace(path)
    finally:
        tmp.unlink(missing_ok=True)

def sync():
    rows = json.loads(download(API + "/releases?per_page=100", 8 * 1024**2))
    DEST.mkdir(parents=True, exist_ok=True)
    for name, feed, prefix in PLATFORMS:
        checksum = name + ".sha256"
        choices = []
        for row in rows:
            tag = row.get("tag_name", "")
            key = version(tag)
            if row.get("draft") or not key:
                continue
            assets = {a["name"]: a for a in row.get("assets", [])}
            if valid(assets.get(name), tag, name, 2 * 1024**3) and valid(assets.get(checksum), tag, checksum, 65536):
                choices.append((key, row, assets))
        if not choices:
            print("No published asset:", name)
            continue
        key, row, assets = max(choices, key=lambda x: x[0])
        tag = row["tag_name"]
        installer, proof = assets[name], assets[checksum]
        pointer = DEST / feed
        if pointer.is_file():
            previous = version(json.loads(pointer.read_text()).get("tag_name", ""))
            if previous and previous > key:
                raise ValueError("Refusing rollback: " + feed)
        folder = prefix + tag + "-" + installer["digest"][7:23]
        payload = download(proof["browser_download_url"], 65536)
        if len(payload) != proof["size"] or "sha256:" + hashlib.sha256(payload).hexdigest() != proof["digest"]:
            raise ValueError("Checksum asset mismatch")
        if payload.decode().split() != [installer["digest"][7:], name]:
            raise ValueError("Checksum disagrees with installer digest")
        local = DEST / folder
        atomic(local / "installers-SHA256SUMS.txt", payload)
        atomic(local / checksum, payload)
        def entry(n, size, digest):
            return {"name": n, "size": size, "digest": digest, "state": "uploaded",
                    "browser_download_url": ORIGIN + folder + "/" + n}
        result = {"tag_name": tag, "draft": False, "prerelease": bool(row.get("prerelease")),
                  "published_at": row.get("published_at"), "body": row.get("body") or "",
                  "html_url": "https://galen.galenite.org/install.html",
                  "assets": [entry(name, installer["size"], installer["digest"]),
                             entry("installers-SHA256SUMS.txt", len(payload), proof["digest"]),
                             entry(checksum, len(payload), proof["digest"])]}
        atomic(pointer, json.dumps(result, ensure_ascii=False).encode())
        print("Published metadata:", tag, name)

if __name__ == "__main__":
    sync()
