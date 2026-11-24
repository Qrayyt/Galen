#!/usr/bin/env python3
"""Mirror only verified, published Galen Windows releases. Server-side GitHub credential."""
import hashlib
import json
import os
import pathlib
import re
import shutil
import tempfile
import urllib.request
import urllib.parse

REPO = "Qrayyt/Galen"
API = "https://api.github.com/repos/" + REPO
ORIGIN = "https://galen.galenite.org/downloads/"
ROOT = pathlib.Path("/var/www/galen")
DEST = ROOT / "downloads"
NAMES = ("Galen-Setup-x64.exe", "installers-SHA256SUMS.txt", "Galen-Setup-x64.exe.sha256")
TAG = re.compile(r"v(\d+)\.(\d+)\.(\d+)(?:-preview\.(\d+))?")
DIGEST = re.compile(r"sha256:[a-f0-9]{64}")
LIMIT = 2 * 1024**3


class SafeRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        if urllib.parse.urlsplit(newurl).scheme != "https":
            raise ValueError("Non-HTTPS GitHub redirect")
        result = super().redirect_request(req, fp, code, msg, headers, newurl)
        if result:
            result.remove_header("Authorization")
        return result


OPENER = urllib.request.build_opener(SafeRedirect())


def request(url, accept):
    if urllib.parse.urlsplit(url).hostname != "api.github.com":
        raise ValueError("Unexpected GitHub API host")
    req = urllib.request.Request(url, headers={
        "Accept": accept, "User-Agent": "Galen-release-mirror",
        "Authorization": "Bearer " + os.environ["GITHUB_TOKEN"],
        "X-GitHub-Api-Version": "2022-11-28",
    })
    return OPENER.open(req, timeout=90)


def version(tag):
    m = TAG.fullmatch(tag)
    if not m:
        return None
    a, b, c, pre = m.groups()
    return int(a), int(b), int(c), pre is None, int(pre or 0)


def choose(rows):
    eligible = []
    for row in rows:
        tag = row.get("tag_name", "")
        key = version(tag)
        if row.get("draft") or not key:
            continue
        assets = {a["name"]: a for a in row.get("assets", []) if a.get("state") == "uploaded"}
        if not all(n in assets and DIGEST.fullmatch(assets[n].get("digest") or "")
                   and 0 < assets[n].get("size", 0) <= (LIMIT if n.endswith(".exe") else 65536)
                   and isinstance(assets[n].get("id"), int) for n in NAMES):
            continue
        eligible.append((key, row, assets))
    return max(eligible, key=lambda x: x[0]) if eligible else None


def fetch_asset(asset, path):
    digest = hashlib.sha256()
    count = 0
    with request(API + "/releases/assets/" + str(asset["id"]), "application/octet-stream") as response, path.open("wb") as out:
        while chunk := response.read(1024 * 1024):
            count += len(chunk)
            if count > asset["size"]:
                raise ValueError("Asset exceeds published size")
            digest.update(chunk)
            out.write(chunk)
    if count != asset["size"] or "sha256:" + digest.hexdigest() != asset["digest"]:
        raise ValueError("Asset SHA256 or size mismatch: " + asset["name"])


def sync():
    DEST.mkdir(mode=0o755, parents=True, exist_ok=True)
    with request(API + "/releases?per_page=100", "application/vnd.github+json") as response:
        selected = choose(json.load(response))
    if not selected:
        raise RuntimeError("No complete published installer")
    key, row, assets = selected
    tag = row["tag_name"]
    installer = assets[NAMES[0]]
    folder = tag + "-" + installer["digest"][7:23]
    final = DEST / folder
    pointer = DEST / "latest.json"
    if pointer.is_file():
        old = json.loads(pointer.read_text())
        if version(old.get("tag_name", "")) > key:
            raise RuntimeError("Refusing to roll back public release")
        if old.get("tag_name") == tag and old.get("assets", [{}])[0].get("digest") == installer["digest"] and all((final / n).is_file() for n in NAMES):
            print("Already published:", tag)
            return
    if shutil.disk_usage(ROOT).free < installer["size"] + 128 * 1024**2:
        raise RuntimeError("Insufficient disk space for atomic mirror")
    if not final.is_dir():
        stage = pathlib.Path(tempfile.mkdtemp(prefix=".release-stage-", dir=ROOT))
        try:
            for name in NAMES:
                fetch_asset(assets[name], stage / name)
            expected = installer["digest"][7:]
            for name in NAMES[1:]:
                if (stage / name).read_text().split() != [expected, NAMES[0]]:
                    raise ValueError("Checksum manifest disagrees with installer")
            stage.chmod(0o755)
            for file in stage.iterdir():
                file.chmod(0o644)
            stage.rename(final)
        finally:
            if stage.exists():
                shutil.rmtree(stage)
    result = {
        "tag_name": tag, "draft": False, "prerelease": bool(row.get("prerelease")),
        "published_at": row.get("published_at"), "body": row.get("body") or "",
        "html_url": "https://galen.galenite.org/install.html",
        "assets": [{"name": n, "size": assets[n]["size"], "digest": assets[n]["digest"],
                    "state": "uploaded", "browser_download_url": ORIGIN + folder + "/" + n} for n in NAMES],
    }
    with tempfile.NamedTemporaryFile(mode="w", encoding="utf-8", dir=ROOT, delete=False) as out:
        json.dump(result, out, ensure_ascii=False)
        tmp = pathlib.Path(out.name)
    tmp.chmod(0o644)
    tmp.replace(pointer)
    # Keep the previous verified release as a fallback; never remove other files.
    others = sorted((p for p in DEST.iterdir() if p.is_dir() and p != final
                     and re.fullmatch(r"v\d+\.\d+\.\d+(?:-preview\.\d+)?-[a-f0-9]{16}", p.name)),
                    key=lambda p: p.stat().st_mtime, reverse=True)
    for old in others[1:]:
        shutil.rmtree(old)
    print("Published verified installer:", tag, installer["size"])


if __name__ == "__main__":
    sync()
