from dodaios.ui.web.update_routes import _public_release_from_payload


def test_public_release_requires_pinned_download_origin_and_digests():
    digest = "a" * 64
    tag = "v1.0.0-preview.4"
    base = f"https://galen.galenite.org/downloads/{tag}-{digest[:16]}/"
    assets = [dict(name=name, size=100, digest="sha256:" + digest, browser_download_url=base+name) for name in ("Galen-Setup-x64.exe", "installers-SHA256SUMS.txt")]
    payload = dict(tag_name=tag, draft=False, prerelease=True, assets=assets)
    assert _public_release_from_payload(payload)["version"] == "1.0.0-preview.4"
    assets[0]["browser_download_url"] = "https://example.com/installer.exe"
    assert _public_release_from_payload(payload) is None
    assets[0]["browser_download_url"] = base+assets[0]["name"]
    assets[1]["digest"] = None
    assert _public_release_from_payload(payload) is None
