"""Exercise the actual candidate installer, frozen server and served UI on a disposable Windows runner.

No live model call, no developer config, no user data and no release publication.
This smoke does not claim native WebView or microphone acceptance.
"""
from __future__ import annotations

import argparse
import contextlib
import http.client
import json
import os
import secrets
import socket
import subprocess
import time
from pathlib import Path

import psutil
from playwright.sync_api import sync_playwright, expect


def stop_owned(process: subprocess.Popen) -> None:
    try:
        parent = psutil.Process(process.pid)
        owned = [*reversed(parent.children(recursive=True)), parent]
    except psutil.NoSuchProcess:
        return
    for child in owned:
        with contextlib.suppress(psutil.NoSuchProcess):
            child.terminate()
    _, alive = psutil.wait_procs(owned, timeout=8)
    for child in alive:
        with contextlib.suppress(psutil.NoSuchProcess):
            child.kill()
    _, alive = psutil.wait_procs(alive, timeout=5)
    if alive:
        raise RuntimeError("Installed app left owned child processes running")


def run_setup(installer: Path, install_dir: Path, output: Path) -> None:
    log = output / "setup.log"
    process = subprocess.Popen([
        str(installer), "/VERYSILENT", "/SUPPRESSMSGBOXES", "/NORESTART", "/SP-",
        "/TASKS=", f"/DIR={install_dir}", f"/LOG={log}",
    ], stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    try:
        code = process.wait(timeout=600)
    except subprocess.TimeoutExpired:
        stop_owned(process)
        raise RuntimeError("Candidate setup timed out") from None
    if code:
        raise RuntimeError(f"Candidate setup exited {code}; see setup.log")


def free_port() -> int:
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        return sock.getsockname()[1]


def api(port: int, path: str, method: str = "GET", body=None, expected=(200,)):
    # Local same-origin UI request, not a remote Control-API action.
    headers = {"Origin": f"http://127.0.0.1:{port}", "Sec-Fetch-Site": "same-origin"}
    if body is not None:
        headers["Content-Type"] = "application/json"
        body = json.dumps(body).encode()
    con = http.client.HTTPConnection("127.0.0.1", port, timeout=15)
    try:
        con.request(method, path, body=body, headers=headers)
        response = con.getresponse()
        raw = response.read()
        if response.status not in expected:
            raise RuntimeError(f"{method} {path} returned {response.status}: {raw[:500]!r}")
        return json.loads(raw) if raw else None
    finally:
        con.close()


def isolated_env(profile: Path, port: int, key: str) -> dict:
    keep = {"PATH", "PATHEXT", "SYSTEMROOT", "SYSTEMDRIVE", "WINDIR", "COMSPEC",
            "TEMP", "TMP", "PROGRAMFILES", "PROGRAMFILES(X86)", "PROGRAMW6432",
            "LANG", "LANGUAGE", "LC_ALL", "LC_CTYPE"}
    env = {k: v for k, v in os.environ.items() if k.upper() in keep}
    for name in ("HOME", "USERPROFILE", "LOCALAPPDATA", "APPDATA", "XDG_CONFIG_HOME", "XDG_DATA_HOME"):
        env[name] = str(profile)
    config = profile / "jarvis.toml"
    # The established isolated dev instance adds a 200-port offset.
    text = config.read_text(encoding="utf-8") if config.exists() else ""
    import re
    pattern = r"(?m)^admin_api_port\s*=.*$"
    line = f"admin_api_port = {port - 200}"
    text = re.sub(pattern, line, text, count=1) if re.search(pattern, text) else f"[ui]\n{line}\n" + text
    config.write_text(text, encoding="utf-8")
    env.update(JARVIS_INSTANCE="dev", JARVIS_CONFIG=str(config),
               JARVIS_DATA_DIR=str(profile / "data"), JARVIS_CONTROL_API_KEY=key,
               PYTHON_KEYRING_BACKEND="keyring.backends.null.Keyring",
               PYTHONIOENCODING="utf-8")
    return env


@contextlib.contextmanager
def boot(app: Path, profile: Path, output: Path, key: str, name: str):
    port = free_port()
    with (output / f"{name}.log").open("wb") as log:
        child = subprocess.Popen([str(app), "serve"], cwd=profile,
                                 env=isolated_env(profile, port, key),
                                 stdin=subprocess.DEVNULL, stdout=log, stderr=subprocess.STDOUT,
                                 creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
        try:
            deadline = time.monotonic() + 300
            while time.monotonic() < deadline:
                if child.poll() is not None:
                    raise RuntimeError(f"Frozen app exited during boot: {child.returncode}")
                try:
                    if api(port, "/api/health").get("ok"):
                        break
                except (OSError, http.client.HTTPException, RuntimeError, ValueError):
                    pass
                time.sleep(1)
            else:
                raise RuntimeError("Frozen app never reported healthy")
            yield port
        finally:
            stop_owned(child)


def check_ui(port: int, output: Path, *, collapse: bool):
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)
        try:
            page = browser.new_page(viewport={"width": 1440, "height": 960}, locale="en-US")
            page.goto(f"http://127.0.0.1:{port}/", wait_until="domcontentloaded", timeout=60000)
            sidebar = page.get_by_test_id("unified-chat-sidebar")
            expect(sidebar).to_be_visible(timeout=90000)
            group = sidebar.get_by_role("region", name="Candidate project")
            expect(group).to_be_visible(timeout=60000)
            toggle = group.locator("button[aria-expanded]")
            expect(toggle).to_have_attribute("aria-expanded", "true" if collapse else "false")
            if collapse:
                toggle.click()
                expect(toggle).to_have_attribute("aria-expanded", "false", timeout=15000)
            page.screenshot(path=str(output / ("project-collapse.png" if collapse else "project-restored.png")))
        finally:
            browser.close()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--installer", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    if os.name != "nt" or os.environ.get("GITHUB_ACTIONS") != "true":
        raise RuntimeError("This setup smoke is restricted to disposable GitHub Windows runners")
    out = args.output.resolve()
    out.mkdir(parents=True, exist_ok=False)
    profile = out / "scratch-profile"
    profile.mkdir()
    install = out / "installed"
    key = "jctl_" + secrets.token_urlsafe(32)
    report = {"passed": False, "phase": "install"}
    try:
        run_setup(args.installer.resolve(strict=True), install, out)
        app = install / "galen.exe"
        assert app.is_file() and (install / "GalenApp.exe").is_file()
        report["phase"] = "first boot"
        with boot(app, profile, out, key, "first-boot") as port:
            api(port, "/api/onboarding/complete", "POST")
            project = api(port, "/api/chats/projects", "POST", {
                "name": "Candidate project", "instructions": "Fixture only",
                "context_documents": {"note.txt": "Scoped fixture text"},
            })
            pid = project["id"]
            first = api(port, "/api/agent-chat/sessions", "POST", {
                "provider": "openai", "model": "gpt-4o-mini", "surface": "jarvis",
                "title": "Candidate Chat", "project_id": pid,
            }, expected=(201,))
            second = api(port, "/api/agent-chat/sessions", "POST", {
                "provider": "openai", "model": "gpt-4o-mini", "surface": "agent",
                "cwd": str(profile), "title": "Candidate Work", "project_id": pid,
            }, expected=(201,))
            first_id, second_id = first["session_id"], second["session_id"]
            assert first_id != second_id
            api(port, f"/api/agent-chat/sessions/{first_id}", "PATCH", {
                "draft": "Only first chat", "state": {"fixture": 1},
            })
            api(port, f"/api/agent-chat/sessions/{second_id}", "PATCH", {"draft": "Only Work chat"})
            report["phase"] = "served packaged UI"
            check_ui(port, out, collapse=True)
        report["phase"] = "restart and isolation"
        with boot(app, profile, out, key, "restart") as port:
            assert api(port, "/api/onboarding/state")["completed"]
            projects = api(port, "/api/chats/projects")
            row = next(p for p in projects if p["id"] == pid)
            assert row["collapsed"] and row["context_documents"] == {"note.txt": "Scoped fixture text"}
            a = api(port, f"/api/agent-chat/sessions/{first_id}")["session"]
            b = api(port, f"/api/agent-chat/sessions/{second_id}")["session"]
            assert a["surface"] == "jarvis" and b["surface"] == "agent"
            assert a["draft"] == "Only first chat" and b["draft"] == "Only Work chat"
            assert a["project_id"] == b["project_id"] == pid
            assert a["state"] == {"fixture": 1}
            check_ui(port, out, collapse=False)
            api(port, f"/api/chats/projects/{pid}", "DELETE")
            assert not api(port, f"/api/agent-chat/sessions/{first_id}")["session"]["project_id"]
            assert not api(port, f"/api/agent-chat/sessions/{second_id}")["session"]["project_id"]
        report.update(passed=True, phase="done")
        return 0
    except Exception as exc:
        report["failure"] = f"{type(exc).__name__}: {exc}"
        raise
    finally:
        (out / "report.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
        print(json.dumps(report), flush=True)


if __name__ == "__main__":
    raise SystemExit(main())
