"""Caller-owned history for classic voice; never seed the shared text brain."""
from __future__ import annotations

import asyncio
import logging
from dataclasses import dataclass, field
from typing import Any

from dodaios.core.protocols import BrainMessage

log = logging.getLogger(__name__)


@dataclass
class ClassicCallContext:
    call_id: str
    history: list[BrainMessage] = field(default_factory=list)
    project_context: str = ""

    @classmethod
    async def capture(cls, brain: Any, call_id: str | None) -> ClassicCallContext | None:
        take = getattr(brain, "take_voice_context_seed", None)
        if not call_id or not callable(take):
            # Legacy adapters do not implement caller-owned context.
            return None
        try:
            messages, project = await asyncio.to_thread(take, call_id)
            return cls(call_id, [m for m in messages if isinstance(m, BrainMessage)][-400:], project if isinstance(project, str) else "")
        except Exception:
            # On a supported brain, fail closed rather than exposing shared
            # history from a different chat after a failed seed.
            log.warning("Classic call context unavailable; using empty scope")
            return cls(call_id)

    def kwargs(self) -> dict[str, Any]:
        return {
            "use_history": False,
            "history_override": tuple(self.history),
            "voice_project_context": self.project_context,
            "conversation_id": "voice:" + self.call_id,
        }

    def remember(self, user: str, answer: str) -> None:
        if user.strip() and answer and answer.strip():
            self.history.extend((BrainMessage(role="user", content=user), BrainMessage(role="assistant", content=answer)))
            self.history[:] = self.history[-400:]
