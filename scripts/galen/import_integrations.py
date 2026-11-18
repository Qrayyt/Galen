#!/usr/bin/env python3
"""Pinned, reproducible source-level integrations for Galen.

Input checkouts are downloaded by GitHub Actions at exact upstream commits.
The import copies LICENSE files and real implementation modules, not screenshots,
pseudo-code or examples presented as integrations.

Each integration is isolated behind an opt-in entry point:
- OpenDex: actual React HUD components in an authenticated optional Galen view.
- Kaizumi: actual Windows computer_control() available as an ask-tier tool.
- Elissa: actual audio mixer available as an ask-tier tool.
- OpenRealtime: actual Go realtime runtime, built as an optional companion.
"""
from __future__ import annotations

import json
import re
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SOURCES = ROOT / ".galen-upstream-checkouts"

PINS = {
    "opendex": "3e898343d1127c8d5075b459acdd55da83b83f04",
    "kaizumi": "8085f243dd0d0a44603bd8e74d8f822ed8a88836",
    "elissa": "283c59e4061f954d8f7025105973d9953f2fa407",
    "openrealtime": "d474a3469117f56ded45d79b431b9956d7acec97",
}


def put(path: str, content: str) -> None:
    p = ROOT / path
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(content, encoding="utf-8", newline="\n")
    print("Added", path)


def transplant(name: str, source: str, target: str) -> str:
    src = SOURCES / name / source
    if not src.is_file():
        raise FileNotFoundError(src)
    content = src.read_text(encoding="utf-8")
    put(target, content)
    return content


def main() -> None:
    for name, sha in PINS.items():
        src = SOURCES / name
        if not src.is_dir():
            raise FileNotFoundError(src)
        assert (src / "LICENSE").is_file(), "missing license: " + name
        # Repo SHA is checked by the cloning workflow before this script runs.
        target = ROOT / "third_party" / f"galen-{name}"
        target.mkdir(parents=True, exist_ok=True)
        shutil.copy2(src / "LICENSE", target / "LICENSE")
        put(str(target.relative_to(ROOT) / "UPSTREAM.md"),
            f"Source: https://github.com/{'wassgha/opendex' if name=='opendex' else 'MusayevDoniyor/kaizumi' if name=='kaizumi' else 'inginddie/elissa' if name=='elissa' else 'bojieli/OpenRealtime'}\n"
            f"Commit: {sha}\nLicense: see LICENSE\n")

    # OPENDEx: keep genuine source components, adapt only their import paths.
    hud = "dodaios/ui/web/frontend/src/components/galen/hud"
    transplant("opendex", "src/renderer/src/components/themes/shared/use-amplitude.ts",
               f"{hud}/use-amplitude.ts")
    transplant("opendex", "src/renderer/src/lib/dex/state.ts", f"{hud}/state.ts")
    for component in ("jarvis-reactor", "hud-widgets"):
        body = (SOURCES/"opendex"/f"src/renderer/src/components/themes/jarvis/{component}.tsx").read_text("utf-8")
        body = body.replace('"../shared/use-amplitude"', '"./use-amplitude"')
        body = body.replace('"@/lib/dex/state"', '"./state"')
        # Galenite monochrome identity. Original JSX and logic are retained.
        body = body.replace("text-cyan-300", "text-gray-200")
        body = body.replace("text-cyan-200", "text-gray-100")
        body = body.replace("bg-cyan-500", "bg-gray-300")
        put(f"{hud}/{component}.tsx", body)

    put(f"{hud}/GalenHud.tsx", r'''/** Authenticated optional HUD using real Dodaios voice state and OpenDex components. */
import { useCallback } from "react";
import { useEventStore } from "@/store/events";
import { JarvisReactor } from "./jarvis-reactor";
import { HudRing } from "./hud-widgets";
import type { DexStatus } from "./state";
import "./hud.css";

export function GalenHud() {
  const state = useEventStore((s) => s.voiceState);
  const assistantName = useEventStore((s) => s.assistantName);
  const status: DexStatus =
    state === "listening" ? "active_listening" :
    state === "thinking" ? "thinking" :
    state === "speaking" ? "speaking" :
    state === "error" ? "error" :
    state === "paused" ? "muted" : "idle";
  // No synthetic microphone amplitudes: real state drives the mode.
  const getAmplitude = useCallback(() => 0, []);
  const labels: Record<DexStatus, string> = {
    idle: "Готов", listening_wake: "Ожидание", active_listening: "Слушаю",
    follow_up_listening: "Слушаю", thinking: "Думаю", speaking: "Говорю",
    muted: "Пауза", error: "Ошибка", unsupported: "Недоступно",
  };
  return (
    <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-[#090b0d] text-white" data-testid="galen-hud">
      <div className="absolute inset-0 opacity-10 pointer-events-none" style={{backgroundImage:"linear-gradient(#ddd 1px, transparent 1px),linear-gradient(90deg,#ddd 1px, transparent 1px)",backgroundSize:"44px 44px"}}/>
      <header className="absolute top-6 left-8 right-8 flex items-center justify-between text-sm tracking-widest">
        <div><span className="font-bold">GALEN</span><span className="ml-3 text-white/40">by GALENITE</span></div>
        <button onClick={()=>window.location.assign("/")} className="rounded-md border border-white/25 px-4 py-2 hover:bg-white/10">Вернуться в Galen</button>
      </header>
      <div className="relative">
        <HudRing size={140} className="absolute -left-16 top-5 opacity-30"/>
        <HudRing size={100} className="absolute -right-10 bottom-12 opacity-25"/>
        <JarvisReactor status={status} getAmplitude={getAmplitude}/>
      </div>
      <h1 className="text-2xl font-semibold tracking-[.25em] uppercase">{assistantName || "Galen"}</h1>
      <p className="mt-3 text-white/60">{labels[status]}</p>
      <p className="absolute bottom-7 text-xs text-white/40">Реальный статус голосового контура. Альтернативный HUD — OpenDex / Galenite.</p>
    </div>
  );
}
''')
    put(f"{hud}/hud.css", """
@keyframes galen-dex-spin {to {transform:rotate(360deg)}}
@keyframes galen-dex-spin-rev {to {transform:rotate(-360deg)}}
@keyframes galen-dex-bar {0%,100%{transform:scaleY(.4)}50%{transform:scaleY(1)}}
.animate-dex-spin {animation:galen-dex-spin 12s linear infinite}
.animate-dex-spin-slow {animation:galen-dex-spin 22s linear infinite}
.animate-dex-spin-slower {animation:galen-dex-spin 42s linear infinite}
.animate-dex-spin-rev {animation:galen-dex-spin-rev 18s linear infinite}
.animate-dex-bar {animation:galen-dex-bar 1.2s ease-in-out infinite}
""")
    main_tsx = ROOT/"dodaios/ui/web/frontend/src/main.tsx"
    text = main_tsx.read_text("utf-8")
    marker = 'const isEditorWindow = new URLSearchParams(window.location.search).get("view") === "appshot-editor";'
    if text.count(marker)!=1:
        raise RuntimeError("main.tsx editor gate drift")
    text=text.replace(marker,
      'const GalenHudWindow = React.lazy(() => import("./components/galen/hud/GalenHud").then((m)=>({default:m.GalenHud})));\n'
      +marker+'\nconst isGalenHudWindow = new URLSearchParams(window.location.search).get("view") === "galen-hud";')
    old='                  <App />\n                  <DesignLayer />'
    if text.count(old)!=1:
        raise RuntimeError("main.tsx app gate drift")
    text=text.replace(old,
      old+'\n                  {isGalenHudWindow && <React.Suspense fallback={null}><GalenHudWindow /></React.Suspense>}')
    main_tsx.write_text(text,"utf-8")

    # KAIZUMI: native controls, but never bypass Dodaios' manual approvals.
    base="dodaios/galen_sources/kaizumi"
    put("dodaios/galen_sources/__init__.py", '"""Approved upstream integrations for Galen."""\n')
    put(f"{base}/__init__.py", '"""Kaizumi computer control integration (MIT)."""\n')
    transplant("kaizumi", "actions/computer_control.py", f"{base}/computer_control.py")
    put("dodaios/plugins/tool/galen_kaizumi.py", r'''"""Ask-tier wrapper over real Kaizumi desktop input routines."""
from __future__ import annotations
import asyncio
import sys
from typing import Any
from dodaios.core.protocols import ExecutionContext, ToolResult

# No screenshots of other users, arbitrary shell or credential extraction.
ALLOWED = {"smart_type", "hotkey", "press", "scroll", "focus_window"}

class GalenKaizumiTool:
    name = "galen_windows_action"
    description = "Optional Windows keyboard and window control via Kaizumi. Confirmation required before every action."
    risk_tier = "ask"
    is_action_tool = True
    schema: dict[str, Any] = {
      "type":"object",
      "properties":{
        "action":{"type":"string","enum":sorted(ALLOWED)},
        "text":{"type":"string"},
        "keys":{"type":"string"},
        "key":{"type":"string"},
        "title":{"type":"string"},
        "amount":{"type":"integer","minimum":1,"maximum":20},
        "direction":{"type":"string","enum":["up","down","left","right"]}
      },"required":["action"]}

    async def execute(self, args: dict[str, Any], ctx: ExecutionContext) -> ToolResult:
        if sys.platform != "win32":
            return ToolResult(False, None, "This integration requires Windows.")
        if not isinstance(args, dict) or args.get("action") not in ALLOWED:
            return ToolResult(False, None, "Action not on Galen's Kaizumi allowlist.")
        if len(str(args.get("text",""))) > 4000:
            return ToolResult(False, None, "Too much text for a single approved action.")
        from dodaios.galen_sources.kaizumi.computer_control import computer_control
        result = await asyncio.to_thread(computer_control, dict(args))
        return ToolResult(True, {"result": str(result)})
''')

    # ELISSA: vendor the existing safe audio focus/ducking code and its system facade.
    el="dodaios/galen_sources/elissa"
    put(f"{el}/__init__.py", '"""Elissa audio focus integration (MIT)."""\n')
    transplant("elissa", "elissa/audio_mixer.py", f"{el}/audio_mixer.py")
    for name in ("__init__.py", "windows.py", "macos.py", "linux.py"):
        transplant("elissa", "elissa/system/"+name, f"{el}/system/"+name)
    put("dodaios/plugins/tool/galen_audio_focus.py", r'''"""Ask-tier audio focus using Elissa's real Mixer. Never auto-reduces system volume."""
from __future__ import annotations
import asyncio
from typing import Any
from dodaios.core.protocols import ExecutionContext, ToolResult

_mixer = None
_watchdog = None

class GalenAudioFocusTool:
    name = "galen_audio_focus"
    description = "Lower other app audio during conversation and restore on request (Elissa Mixer). Requires permission."
    risk_tier = "ask"
    is_action_tool = True
    schema: dict[str, Any] = {
        "type":"object",
        "properties":{"action":{"type":"string","enum":["duck","restore"]},
                      "level":{"type":"number","minimum":0.1,"maximum":0.8}},
        "required":["action"]}

    async def execute(self, args: dict[str, Any], ctx: ExecutionContext) -> ToolResult:
        global _mixer, _watchdog
        action = str(args.get("action",""))
        if action not in {"duck","restore"}:
            return ToolResult(False,None,"Choose duck or restore.")
        from dodaios.galen_sources.elissa.audio_mixer import Mixer
        if _mixer is None:
            _mixer = Mixer()
            _watchdog = asyncio.create_task(_mixer.watchdog())
        if action == "duck":
            level = float(args.get("level",0.25))
            if level < 0.1 or level > 0.8:
                return ToolResult(False,None,"Invalid level.")
            await _mixer.duck(level)
        else:
            await _mixer.restore()
        return ToolResult(True, {"status":action})
''')

    # Both tools enter the SAME Dodaios/Mission permission system.
    config=ROOT/"pyproject.toml"
    body=config.read_text("utf-8")
    marker='[project.entry-points."jarvis.tool"]'
    if body.count(marker)!=1:
        raise RuntimeError("Missing existing Dodaios tool entry point group")
    lines='\ngalen_kaizumi = "dodaios.plugins.tool.galen_kaizumi:GalenKaizumiTool"\ngalen_audio_focus = "dodaios.plugins.tool.galen_audio_focus:GalenAudioFocusTool"'
    body=body.replace(marker,marker+lines)
    config.write_text(body,"utf-8")

    # OPENREALTIME: executable implementation, isolated from Dodaios core runtime.
    src=SOURCES/"openrealtime"
    dst=ROOT/"integrations/openrealtime/source"
    shutil.copytree(src,dst,ignore=shutil.ignore_patterns(".git",".github","*.mp4","*.webm","*.gif"),dirs_exist_ok=True)
    put("integrations/openrealtime/README.md",
        "# OpenRealtime companion (experimental)\n\n"
        "This directory contains the pinned upstream Go runtime and is compiled "
        "as a separately launched companion. It is NOT the default Galen voice engine.\n"
        "The native Dodaios Realtime/Pipeline engines remain the supported default.\n"
        "Run `go build -o ../bin/openrealtime.exe ./cmd/openrealtime` in source/ on Windows.\n"
        "Configuration and API credentials follow upstream OpenRealtime documentation.\n")
    put("integrations/openrealtime/run-windows.ps1", r'''param([string]$Binary = "")
if (-not $Binary) {
    $Binary = Join-Path $PSScriptRoot "bin\openrealtime.exe"
}
if (-not (Test-Path $Binary)) { throw "OpenRealtime binary not found. Build it first." }
& $Binary companion -client browser
''')
    # Include the companion binary in the Windows package if Windows CI built it.
    builder=ROOT/"packaging/windows/build.ps1"
    build=builder.read_text("utf-8")
    mark="# --- 3. Inno Setup"
    extra=r'''# Optional full-duplex voice companion, compiled from pinned OpenRealtime.
$RealtimeBin = Join-Path $RepoRoot "integrations\openrealtime\bin\openrealtime.exe"
if (Test-Path $RealtimeBin) {
    Copy-Item $RealtimeBin (Join-Path $BundleDir "GalenRealtime.exe") -Force
    Write-Step "OpenRealtime companion included"
}

'''
    if build.count(mark)!=1:
        raise RuntimeError("Windows packaging marker drift")
    build=build.replace(mark,extra+mark)
    builder.write_text(build,"utf-8")
    print("Real source integrations added; main Galen UI and default voice runtime preserved.")


if __name__ == "__main__":
    main()
