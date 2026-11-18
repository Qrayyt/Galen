"""Ask-tier audio focus using Elissa's real Mixer. Never auto-reduces system volume."""
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
