from unittest.mock import Mock

import pytest

from dodaios.core.protocols import BrainMessage
from dodaios.speech.classic_context import ClassicCallContext


@pytest.mark.asyncio
async def test_classic_call_owns_history_and_project():
    brain = Mock()
    brain.take_voice_context_seed.return_value = ((BrainMessage(role="user", content="original"),), "private project")
    first = await ClassicCallContext.capture(brain, "call-a")
    assert first.kwargs()["use_history"] is False
    assert first.kwargs()["voice_project_context"] == "private project"
    first.remember("question", "answer")
    brain.take_voice_context_seed.return_value = ((), "")
    second = await ClassicCallContext.capture(brain, "call-b")
    assert [m.content for m in first.kwargs()["history_override"]] == ["original", "question", "answer"]
    assert second.kwargs()["history_override"] == ()
    assert second.kwargs()["voice_project_context"] == ""


@pytest.mark.asyncio
async def test_classic_call_fails_closed():
    brain = Mock()
    brain.take_voice_context_seed.side_effect = RuntimeError("offline")
    scope = await ClassicCallContext.capture(brain, "call")
    assert scope.kwargs()["history_override"] == ()
    assert scope.kwargs()["use_history"] is False
    assert await ClassicCallContext.capture(object(), "legacy") is None
