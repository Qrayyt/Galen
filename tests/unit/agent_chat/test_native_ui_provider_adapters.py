"""Native UI survives real provider adapters, with fake transport events only.

The fixtures intentionally never use a network, user account or API key.
A single-chunk completion and arbitrary streaming boundaries share the same
provider-neutral BrainDelta contract; rendering/validation is covered in TS.
"""
from __future__ import annotations

import json
from types import SimpleNamespace as NS

import pytest

from dodaios.core.protocols import BrainMessage, BrainRequest
from dodaios.core.response_style import NATIVE_UI_GUIDANCE
from dodaios.plugins.brain import _anthropic_base, _openai_base, gemini


PAYLOAD = {"version": 1, "fallback": "Review then publish.", "blocks": [
    {"type": "checklist", "title": "Release", "items": ["Review", "Publish"]},
]}
ANSWER = "The next steps:\n\n```galen-ui\n" + json.dumps(PAYLOAD) + "\n```"


async def events(items):
    for item in items:
        yield item


class AnthropicStream:
    def __init__(self, items):
        self.items = items

    async def __aenter__(self):
        return events(self.items)

    async def __aexit__(self, *_):
        return None


async def openai_stream(req, fragments, captured):
    async def create(**kwargs):
        captured.append(kwargs)
        return events([
            NS(choices=[NS(delta=NS(content=chunk, reasoning_content="private thought", tool_calls=[]),
                           finish_reason=None)], usage=None)
            for chunk in fragments
        ] + [NS(choices=[NS(delta=NS(content=None, tool_calls=[]), finish_reason="stop")], usage=None)])
    client = NS(base_url="https://native-ui-fixture.invalid", chat=NS(completions=NS(create=create)))
    return [delta async for delta in _openai_base.stream_complete(client, "native-ui-fixture", req)]


async def anthropic_stream(req, fragments, captured):
    def stream(**kwargs):
        captured.append(kwargs)
        return AnthropicStream([
            NS(type="content_block_start", content_block=NS(type="thinking", thinking="", signature="")),
            NS(type="content_block_delta", delta=NS(type="thinking_delta", thinking="private thought")),
            NS(type="content_block_stop"),
            NS(type="content_block_start", content_block=NS(type="text", text="")),
            *[NS(type="content_block_delta", delta=NS(type="text_delta", text=chunk)) for chunk in fragments],
            NS(type="content_block_stop"),
            NS(type="message_delta", delta=NS(stop_reason="end_turn"), usage=None),
        ])
    return [delta async for delta in _anthropic_base.stream_complete(NS(messages=NS(stream=stream)), "native-ui-fixture", req)]


async def gemini_stream(req, fragments, captured):
    async def generate_content_stream(**kwargs):
        captured.append(kwargs)
        return events([
            NS(text=chunk, candidates=[], usage_metadata=None) for chunk in fragments
        ] + [NS(text=None, candidates=[NS(content=NS(parts=[]), finish_reason="STOP")], usage_metadata=None)])
    brain = gemini.GeminiBrain(model="gemini-3-flash")
    brain._client = NS(aio=NS(models=NS(generate_content_stream=generate_content_stream)))
    return [delta async for delta in brain.complete(req)]


@pytest.mark.parametrize("adapter", [openai_stream, anthropic_stream, gemini_stream], ids=["openai", "anthropic", "gemini"])
@pytest.mark.parametrize("chunk_size", [1, 17, 4096], ids=["single-character", "mixed-boundaries", "complete-text"])
@pytest.mark.parametrize("truncated", [False, True])
async def test_native_ui_text_is_not_mistaken_for_tool_calls(adapter, chunk_size, truncated, monkeypatch):
    monkeypatch.delenv("DODAIOS_GEMINI_CONTEXT_CACHE", raising=False)
    monkeypatch.delenv("DODAIOS_ANTHROPIC_PROMPT_CACHE", raising=False)
    # Disable the optional Gemini cache without depending on the environment-variable spelling.
    monkeypatch.delenv(gemini._ENV_CONTEXT_CACHE, raising=False)
    monkeypatch.delenv(_anthropic_base._ENV_PROMPT_CACHE, raising=False)
    req = BrainRequest(messages=(BrainMessage(role="user", content="Show release steps."),),
                       system=NATIVE_UI_GUIDANCE)
    source = ANSWER[:-5] if truncated else ANSWER
    fragments = [source[i:i + chunk_size] for i in range(0, len(source), chunk_size)]
    captured = []
    deltas = await adapter(req, fragments, captured)
    assembled = "".join(delta.content for delta in deltas if delta.content)
    assert assembled == source
    assert not any(delta.tool_call for delta in deltas)
    assert "private thought" not in assembled
    assert len(captured) == 1
    assert NATIVE_UI_GUIDANCE in str(captured[0])
    if not truncated:
        assert json.loads(assembled.split("\n```galen-ui\n", 1)[1].rsplit("\n```", 1)[0]) == PAYLOAD


async def responses_stream(req, fragments, captured):
    # Responses API has a distinct event protocol from Chat Completions.
    async def create(**kwargs):
        captured.append(kwargs)
        return events([
            NS(type="response.output_text.delta", delta=chunk) for chunk in fragments
        ] + [
            NS(type="response.output_item.done", item=NS(type="message")),
            NS(type="response.completed", response=NS(usage=None)),
        ])
    client = NS(responses=NS(create=create))
    kwargs = {"model": "native-ui-fixture", "messages": [
        {"role": "system", "content": req.system},
        {"role": "user", "content": "Show release steps."},
    ], "stream": True}
    return [delta async for delta in _openai_base._stream_via_responses(client, kwargs, {})]


@pytest.mark.parametrize("chunk_size", [1, 17, 4096])
@pytest.mark.parametrize("truncated", [False, True])
async def test_native_ui_responses_api_event_parity(chunk_size, truncated):
    req = BrainRequest(messages=(BrainMessage(role="user", content="Show release steps."),),
                       system=NATIVE_UI_GUIDANCE)
    source = ANSWER[:-5] if truncated else ANSWER
    captured = []
    deltas = await responses_stream(req, [source[i:i + chunk_size]
                                          for i in range(0, len(source), chunk_size)], captured)
    assert "".join(delta.content for delta in deltas if delta.content) == source
    assert not any(delta.tool_call for delta in deltas)
    assert len(captured) == 1
    assert NATIVE_UI_GUIDANCE in str(captured[0])
