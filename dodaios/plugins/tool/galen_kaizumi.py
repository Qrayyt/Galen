"""Ask-tier wrapper over real Kaizumi desktop input routines."""
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
