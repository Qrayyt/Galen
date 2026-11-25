"""Voice turns appear in the Jarvis agent chat without being re-answered."""

from __future__ import annotations

import asyncio
from pathlib import Path
from typing import Any

from dodaios.agent_chat.service import AgentChatService
from dodaios.agent_chat.store import AgentChatStore
from dodaios.agent_chat.voice_mirror import VoiceChatMirror
from dodaios.core.bus import EventBus
from dodaios.core.events import VoiceTurnCompleted


def _service(cwd: Path) -> AgentChatService:
    store = AgentChatStore(":memory:")
    return AgentChatService(store, assistant_name=lambda: "Jarvis", default_cwd=lambda: str(cwd))


def _open_session(svc: AgentChatService):
    return svc.create_session(provider="openai", model="m", effort="low", surface="jarvis")


def test_import_voice_turn_writes_user_and_finished_turn(tmp_path: Path) -> None:
    async def scenario() -> None:
        svc = _service(tmp_path)
        session = _open_session(svc)
        q = svc.subscribe(session.session_id)
        turn_id = await svc.import_voice_turn(
            session.session_id,
            "What did I say out loud?",
            "You said this out loud.",
            voice_turn_id="v1",
        )
        assert turn_id
        kinds = []
        while True:
            ev = await asyncio.wait_for(q.get(), timeout=5.0)
            kinds.append(ev["kind"])
            if ev["kind"] == "turn_finished":
                break
        assert kinds[0] == "user_message"
        assert "turn_started" in kinds
        assert "assistant_text" in kinds
        stored = svc.store.list_events(session.session_id)
        by_kind = [e["kind"] for e in stored]
        assert by_kind == ["user_message", "turn_started", "assistant_text", "turn_finished"]
        assert stored[0]["payload"]["text"] == "What did I say out loud?"
        assert stored[2]["payload"]["text"] == "You said this out loud."
        assert stored[1]["payload"]["runner"] == "voice"
        assert stored[-1]["payload"]["status"] == "done"

    asyncio.run(scenario())


def test_import_voice_turn_dedupes_and_skips_empties(tmp_path: Path) -> None:
    async def scenario() -> None:
        svc = _service(tmp_path)
        session = _open_session(svc)
        first = await svc.import_voice_turn(session.session_id, "hi", "hello", voice_turn_id="dup")
        second = await svc.import_voice_turn(session.session_id, "hi", "hello", voice_turn_id="dup")
        assert first
        assert second is None
        assert await svc.import_voice_turn(session.session_id, "", "  ") is None
        assert len(svc.store.list_events(session.session_id)) == 4

    asyncio.run(scenario())


def test_import_voice_turn_keeps_user_line_without_reply(tmp_path: Path) -> None:
    async def scenario() -> None:
        svc = _service(tmp_path)
        session = _open_session(svc)
        assert await svc.import_voice_turn(session.session_id, "only heard", "") is None
        stored = svc.store.list_events(session.session_id)
        assert [e["kind"] for e in stored] == ["user_message"]

    asyncio.run(scenario())


def test_mirror_files_completed_turn_into_newest_jarvis_session(tmp_path: Path) -> None:
    async def scenario() -> None:
        svc = _service(tmp_path)
        session = _open_session(svc)
        bus = EventBus()
        VoiceChatMirror(lambda: svc).attach(bus)
        await bus.publish(
            VoiceTurnCompleted(
                session_id="voice-1",
                turn_id="vt-1",
                user_text="spoken question",
                jarvis_text="spoken answer",
                provider="openai",
                model="m",
            )
        )
        stored = svc.store.list_events(session.session_id)
        assert [e["kind"] for e in stored] == [
            "user_message",
            "turn_started",
            "assistant_text",
            "turn_finished",
        ]
        # A redelivery of the same voice turn must not duplicate the chat.
        await bus.publish(
            VoiceTurnCompleted(
                session_id="voice-1",
                turn_id="vt-1",
                user_text="spoken question",
                jarvis_text="spoken answer",
            )
        )
        assert len(svc.store.list_events(session.session_id)) == 4

    asyncio.run(scenario())


def test_mirror_creates_the_lead_conversation_when_none_exists(tmp_path: Path) -> None:
    async def scenario() -> None:
        svc = _service(tmp_path)
        bus = EventBus()
        VoiceChatMirror(lambda: svc).attach(bus)
        await bus.publish(
            VoiceTurnCompleted(
                session_id="voice-1",
                turn_id="vt-9",
                user_text="first words ever",
                jarvis_text="first answer ever",
                provider="openai",
            )
        )
        sessions: list[Any] = svc.store.list_sessions(limit=10, surface="jarvis")
        assert len(sessions) == 1
        stored = svc.store.list_events(sessions[0].session_id)
        assert stored[0]["payload"]["text"] == "first words ever"

    asyncio.run(scenario())


def _turn(call: str, turn: str, user: str, reply: str) -> VoiceTurnCompleted:
    return VoiceTurnCompleted(
        session_id=call, turn_id=turn, user_text=user, jarvis_text=reply, provider="openai"
    )


def test_mirror_files_into_the_bound_chat_not_the_newest(tmp_path: Path) -> None:
    async def scenario() -> None:
        svc = _service(tmp_path)
        a = _open_session(svc)
        b = _open_session(svc)
        newest = svc.store.list_sessions(limit=1, surface="jarvis")[0]
        older = a if newest.session_id == b.session_id else b
        svc.bind_voice_chat(older.session_id)
        bus = EventBus()
        VoiceChatMirror(lambda: svc).attach(bus)
        await bus.publish(_turn("call-1", "t1", "continue here", "continuing"))
        assert len(svc.store.list_events(older.session_id)) == 4
        assert svc.store.list_events(newest.session_id) == []

    asyncio.run(scenario())


def test_one_call_stays_in_one_chat_when_another_is_opened(tmp_path: Path) -> None:
    async def scenario() -> None:
        svc = _service(tmp_path)
        first = _open_session(svc)
        second = _open_session(svc)
        svc.bind_voice_chat(first.session_id)
        bus = EventBus()
        VoiceChatMirror(lambda: svc).attach(bus)
        await bus.publish(_turn("call-1", "t1", "one", "uno"))
        svc.bind_voice_chat(second.session_id)
        await bus.publish(_turn("call-1", "t2", "two", "dos"))
        assert len(svc.store.list_events(first.session_id)) == 8
        assert svc.store.list_events(second.session_id) == []
        # The NEXT call follows the new binding.
        await bus.publish(_turn("call-2", "t3", "three", "tres"))
        assert len(svc.store.list_events(second.session_id)) == 4

    asyncio.run(scenario())


def test_a_call_on_a_blank_page_starts_one_new_conversation(tmp_path: Path) -> None:
    async def scenario() -> None:
        svc = _service(tmp_path)
        old = _open_session(svc)
        svc.bind_voice_chat(None)
        assert svc.voice_chat_id is None
        assert svc.voice_chat_fresh
        bus = EventBus()
        VoiceChatMirror(lambda: svc).attach(bus)
        await bus.publish(_turn("call-1", "t1", "first call", "first answer"))
        created_id = svc.voice_chat_id
        assert created_id and created_id != old.session_id
        assert not svc.voice_chat_fresh
        await bus.publish(_turn("call-2", "t2", "second call", "second answer"))
        assert svc.store.list_events(old.session_id) == []
        assert len(svc.store.list_events(created_id)) == 8
        assert len(svc.store.list_sessions(limit=10, surface="jarvis")) == 2
        assert svc.store.lead_session_id() == created_id

    asyncio.run(scenario())


def test_voice_chat_history_is_the_bound_chats_prose(tmp_path: Path) -> None:
    async def scenario() -> None:
        svc = _service(tmp_path)
        session = _open_session(svc)
        assert svc.voice_chat_history() == []
        await svc.import_voice_turn(session.session_id, "my question", "my answer")
        svc.bind_voice_chat(session.session_id)
        history = svc.voice_chat_history()
        assert [(m.role, m.content) for m in history] == [
            ("user", "my question"),
            ("assistant", "my answer"),
        ]

    asyncio.run(scenario())


def test_binding_rejects_unknown_and_foreign_surface_chats(tmp_path: Path) -> None:
    import pytest

    from dodaios.agent_chat.service import NoSuchSession

    svc = _service(tmp_path)
    coding = svc.create_session(provider="openai", model="m", effort="low", surface="agent")
    with pytest.raises(NoSuchSession):
        svc.bind_voice_chat("missing")
    with pytest.raises(NoSuchSession):
        svc.bind_voice_chat(coding.session_id)


def test_a_conversation_opened_by_a_call_keeps_the_persons_chat_model(tmp_path: Path) -> None:
    from dodaios.agent_chat.store import ChatSelection

    async def scenario() -> None:
        svc = _service(tmp_path)
        svc.store.save_chat_selection(ChatSelection("openai", "m", "low"))
        bus = EventBus()
        VoiceChatMirror(lambda: svc).attach(bus)
        await bus.publish(
            VoiceTurnCompleted(
                session_id="call-1",
                turn_id="t1",
                user_text="hello",
                jarvis_text="hi",
                provider="openai",
                model="gpt-realtime",
            )
        )
        created = svc.lead_session()
        assert created is not None
        assert len(svc.store.list_events(created.session_id)) == 4
        # Back on the keyboard, the chat runs on the seat picked for typing,
        # never on the realtime voice model.
        assert (created.provider, created.model) == ("openai", "m")

    asyncio.run(scenario())


def test_a_continued_voice_chat_is_not_copied_into_a_typed_chat(tmp_path: Path) -> None:
    from dodaios.sessions.continuation import continue_voice_session, continued_voice_session

    async def scenario() -> None:
        svc = _service(tmp_path)
        typed = _open_session(svc)
        svc.bind_voice_chat(
            None, voice_session="archived", voice_history=lambda: [("user", "old words")]
        )
        assert continued_voice_session() == "archived"
        assert svc.voice_chat_history() == [("user", "old words")]
        bus = EventBus()
        VoiceChatMirror(lambda: svc).attach(bus)
        await bus.publish(_turn("call-1", "t1", "go on", "going on"))
        assert svc.store.list_events(typed.session_id) == []
        assert len(svc.store.list_sessions(limit=10, surface="jarvis")) == 1
        # Putting a typed chat on stage ends the continuation.
        svc.bind_voice_chat(typed.session_id)
        assert continued_voice_session() is None

    try:
        asyncio.run(scenario())
    finally:
        continue_voice_session(None)


def test_voice_turn_files_its_tool_record_before_the_reply(tmp_path: Path) -> None:
    async def scenario() -> None:
        svc = _service(tmp_path)
        session = _open_session(svc)
        await svc.import_voice_turn(
            session.session_id,
            "Send the mail to Max",
            "Done, the mail is on its way.",
            tool_calls=["send_mail", {"name": "calendar_add", "output": "Event created"}],
        )
        events = svc.store.list_events(session.session_id)
        kinds = [e["kind"] for e in events]
        assert kinds == [
            "user_message",
            "turn_started",
            "tool_call",
            "tool_result",
            "tool_call",
            "tool_result",
            "assistant_text",
            "turn_finished",
        ]
        calls = [e["payload"] for e in events if e["kind"] == "tool_call"]
        results = [e["payload"] for e in events if e["kind"] == "tool_result"]
        assert [c["name"] for c in calls] == ["send_mail", "calendar_add"]
        assert [r["call_id"] for r in results] == [c["call_id"] for c in calls]
        assert results[1]["output"] == "Event created"
        # Honest about what is unknown: no invented result for the first tool.
        assert "not recorded" in results[0]["output"]

    asyncio.run(scenario())


def test_voice_turn_feeds_the_proactive_cues(tmp_path: Path, monkeypatch) -> None:
    seen: list[tuple[str, str, tuple[str, ...]]] = []

    async def fake_cues(session_id: str, text: str, tool_names: tuple[str, ...] = ()) -> None:
        seen.append((session_id, text, tool_names))

    monkeypatch.setattr("dodaios.agent_chat.surface_kits.read_proactive_cues", fake_cues)

    async def scenario() -> None:
        svc = _service(tmp_path)
        session = _open_session(svc)
        await svc.import_voice_turn(
            session.session_id,
            "I'll call Max tomorrow",
            "Good plan.",
            tool_calls=["schedule_routine"],
        )
        await svc.import_voice_turn(session.session_id, "hello", "", voice_turn_id="u-only")
        # An agent chat is not the lead's conversation: its words are no promise.
        other = svc.create_session(provider="openai", model="m", effort="low", surface="agent")
        await svc.import_voice_turn(other.session_id, "I'll call Anna tomorrow", "ok")
        assert seen[0] == (session.session_id, "I'll call Max tomorrow", ("schedule_routine",))
        assert [s[1] for s in seen] == ["I'll call Max tomorrow", "hello"]

    asyncio.run(scenario())


def test_the_mirror_passes_the_calls_tools_on(tmp_path: Path) -> None:
    async def scenario() -> None:
        svc = _service(tmp_path)
        _open_session(svc)
        bus = EventBus()
        VoiceChatMirror(lambda: svc).attach(bus)
        await bus.publish(
            VoiceTurnCompleted(
                session_id="call-1",
                turn_id="v-tools",
                user_text="open the mail",
                jarvis_text="Opened.",
                tool_calls=("open_app",),
            )
        )
        await asyncio.sleep(0.1)
        sid = svc.lead_session().session_id
        names = [
            e["payload"]["name"] for e in svc.store.list_events(sid) if e["kind"] == "tool_call"
        ]
        assert names == ["open_app"]

    asyncio.run(scenario())


def test_voice_project_seed_and_first_turn_remain_in_original_project(tmp_path: Path) -> None:
    async def scenario() -> None:
        svc = _service(tmp_path)
        projects = {
            "a": {"id": "a", "instructions": "private-a", "context_documents": {}},
            "b": {"id": "b", "instructions": "private-b", "context_documents": {}},
        }
        svc.project_lookup = projects.get
        a = svc.create_session(provider="openai", surface="jarvis", project_id="a")
        b = svc.create_session(provider="openai", surface="jarvis", project_id="b")
        await svc.import_voice_turn(a.session_id, "a history", "a reply")
        svc.bind_voice_chat(a.session_id)
        history, brief = svc.voice_context_seed("call-a")
        assert "private-a" in brief and "private-b" not in brief
        assert any("a history" in str(m.content) for m in history)
        svc.bind_voice_chat(b.session_id)
        mirror = VoiceChatMirror(lambda: svc)
        await mirror._on_turn(_turn("call-a", "t-a", "voice from a", "answer from a"))
        assert len(svc.store.list_events(a.session_id)) == 8
        assert svc.store.list_events(b.session_id) == []
        svc.bind_voice_chat(None, project_id="b")
        history, brief = svc.voice_context_seed("call-b")
        assert history == []
        assert "private-b" in brief and "private-a" not in brief
        svc.bind_voice_chat(a.session_id)
        await mirror._on_turn(_turn("call-b", "t-b", "fresh voice", "fresh reply"))
        assert svc.voice_chat_id == a.session_id
        created = [s for s in svc.store.list_sessions(limit=10, surface="jarvis") if s.session_id not in {a.session_id, b.session_id}]
        assert len(created) == 1 and created[0].project_id == "b"
        assert len(svc.store.list_events(created[0].session_id)) == 4

    asyncio.run(scenario())


def test_archived_voice_context_uses_current_project_link(tmp_path: Path) -> None:
    async def scenario() -> None:
        svc = _service(tmp_path)
        projects = {"a": {"id": "a", "instructions": "private-a"}, "b": {"id": "b", "instructions": "private-b"}}
        links = {"archive": "a"}
        svc.project_lookup = projects.get
        svc.voice_archive_project_lookup = links.get
        svc.bind_voice_chat(None, voice_session="archive", voice_history=lambda: [("user", "archived history")])
        try:
            history, brief = svc.voice_context_seed("archive-call-a")
            assert history == [("user", "archived history")]
            assert "private-a" in brief and "private-b" not in brief
            links["archive"] = "b"
            _, brief = svc.voice_context_seed("archive-call-b")
            assert "private-b" in brief and "private-a" not in brief
            del projects["b"]
            assert svc.voice_context_seed("archive-call-c")[1] == ""
            svc.bind_voice_chat(None)
            assert svc.voice_context_seed("fresh-call") == ([], "")
        finally:
            svc.bind_voice_chat(None)

    asyncio.run(scenario())


def test_archived_voice_privacy_survives_detach_project_deletion_and_restart(tmp_path: Path) -> None:
    from types import SimpleNamespace
    from dodaios.agent_chat.app_service import bind_project_lookup
    from dodaios.agent_chat.project_context import private_voice_call
    from dodaios.core.bus import EventBus
    from dodaios.state.chat_store import ChatStore

    async def scenario() -> None:
        path = tmp_path / "voice-privacy.db"
        store = ChatStore(bus=EventBus(), db_path=path)
        project = store.create_project(name="Private")
        pid = project["id"]
        store.set_voice_project("archive-detached", pid)
        store.set_voice_project("archive-deleted", pid)
        store.set_voice_project("archive-detached", None)
        store.delete_project(pid)
        store.close()

        store = ChatStore(bus=EventBus(), db_path=path)
        svc = bind_project_lookup(_service(tmp_path), SimpleNamespace(chat_store=store))
        try:
            for archive in ("archive-detached", "archive-deleted"):
                assert store.get_voice_project(archive) is None
                assert store.is_private_voice_history(archive)
                svc.bind_voice_chat(None, voice_session=archive, voice_history=lambda: [("user", "private")])
                call_id = "new-" + archive
                assert svc.voice_context_seed(call_id) == ([("user", "private")], "")
                assert private_voice_call(call_id)
                assert store.is_private_voice_history(call_id)
            svc.bind_voice_chat(None, voice_session="unrelated", voice_history=lambda: [])
            svc.voice_context_seed("unrelated-voice-privacy-fixture")
            assert not private_voice_call("unrelated-voice-privacy-fixture")
            assert not store.is_private_voice_history("unrelated-voice-privacy-fixture")
        finally:
            svc.bind_voice_chat(None)
            store.close()

    asyncio.run(scenario())
