"""ChatStore SQLite persistence (Chats conversation manager, Slice 2).

The store moved from an in-memory dict to a sync sqlite3 backing (mirroring
``dodaios/sessions/store.py``) so typed chats survive a restart and are
segmented into distinct conversations. The public async API is unchanged;
``db_path`` defaults to ``:memory:`` so existing callers/tests keep working
in-process without touching disk.
"""
from __future__ import annotations

import sqlite3

from dodaios.core.bus import EventBus
from dodaios.core.events import MessageSent
from dodaios.state.chat_store import ChatStore


def _db(tmp_path) -> str:
    return str(tmp_path / "chats.db")


async def test_round_trip_survives_new_instance(tmp_path) -> None:
    """A fresh ChatStore on the same file sees prior threads + messages."""
    path = _db(tmp_path)
    s1 = ChatStore(bus=EventBus(), db_path=path)
    await s1.add_message(thread_id="t1", role="user", text="Remember me")
    await s1.add_message(thread_id="t1", role="assistant", text="I will")

    s2 = ChatStore(bus=EventBus(), db_path=path)
    detail = s2.get_thread("t1")
    assert detail is not None
    assert [(m["role"], m["text"]) for m in detail["messages"]] == [
        ("user", "Remember me"),
        ("assistant", "I will"),
    ]


async def test_threads_are_segmented(tmp_path) -> None:
    s = ChatStore(bus=EventBus(), db_path=_db(tmp_path))
    await s.add_message(thread_id="a", role="user", text="alpha")
    await s.add_message(thread_id="b", role="user", text="bravo")
    assert [m["text"] for m in s.get_thread("a")["messages"]] == ["alpha"]
    assert [m["text"] for m in s.get_thread("b")["messages"]] == ["bravo"]


async def test_list_threads_newest_first_with_preview(tmp_path) -> None:
    s = ChatStore(bus=EventBus(), db_path=_db(tmp_path))
    await s.add_message(thread_id="old", role="user", text="first conversation")
    await s.add_message(thread_id="new", role="user", text="second conversation")
    # Touch "old" again so it becomes the most recently updated.
    await s.add_message(thread_id="old", role="assistant", text="reply")

    rows = s.list_threads()
    assert [r["thread_id"] for r in rows] == ["old", "new"]
    old = next(r for r in rows if r["thread_id"] == "old")
    assert old["preview"] == "first conversation"
    assert old["message_count"] == 2
    assert old["updated_at_ns"] >= old["created_at_ns"]


async def test_history_filter_hides_drafts_and_assistant_only_residue(tmp_path) -> None:
    s = ChatStore(bus=EventBus(), db_path=_db(tmp_path))
    await s.create_thread(title="New Chat", thread_id="draft")
    await s.add_message(thread_id="orphan", role="assistant", text="internal reply")
    await s.add_message(thread_id="blank", role="user", text="   ")
    await s.add_message(thread_id="real", role="user", text="visible conversation")

    assert {r["thread_id"] for r in s.list_threads()} == {
        "blank",
        "draft",
        "orphan",
        "real",
    }
    assert [r["thread_id"] for r in s.list_threads(include_empty=False)] == ["real"]


async def test_title_derived_from_first_user_message(tmp_path) -> None:
    s = ChatStore(bus=EventBus(), db_path=_db(tmp_path))
    await s.add_message(
        thread_id="t", role="user", text="How do I deploy to a VPS?"
    )
    row = next(r for r in s.list_threads() if r["thread_id"] == "t")
    assert row["title"] == "How do I deploy to a VPS?"


async def test_explicit_title_not_overwritten(tmp_path) -> None:
    s = ChatStore(bus=EventBus(), db_path=_db(tmp_path))
    await s.create_thread(title="My pinned chat", thread_id="t")
    await s.add_message(thread_id="t", role="user", text="hello")
    row = next(r for r in s.list_threads() if r["thread_id"] == "t")
    assert row["title"] == "My pinned chat"


async def test_add_message_publishes_message_sent(tmp_path) -> None:
    bus = EventBus()
    seen: list[MessageSent] = []

    async def _collect(e: MessageSent) -> None:
        seen.append(e)

    bus.subscribe(MessageSent, _collect)
    s = ChatStore(bus=bus, db_path=_db(tmp_path))
    await s.add_message(thread_id="t", role="user", text="ping")
    assert any(e.text == "ping" and e.thread_id == "t" for e in seen)


async def test_add_message_can_persist_an_already_published_event(tmp_path) -> None:
    bus = EventBus()
    seen: list[MessageSent] = []

    async def _collect(e: MessageSent) -> None:
        seen.append(e)

    bus.subscribe(MessageSent, _collect)
    s = ChatStore(bus=bus, db_path=_db(tmp_path))
    await s.add_message(
        thread_id="t",
        role="user",
        text="persist once",
        publish_event=False,
    )

    assert s.get_thread("t")["messages"][0]["text"] == "persist once"
    assert seen == []


async def test_delete_thread(tmp_path) -> None:
    s = ChatStore(bus=EventBus(), db_path=_db(tmp_path))
    await s.add_message(thread_id="t", role="user", text="bye")
    await s.delete_thread("t")
    assert s.get_thread("t") is None
    assert [r["thread_id"] for r in s.list_threads()] == []


async def test_prune_older_than(tmp_path) -> None:
    s = ChatStore(bus=EventBus(), db_path=_db(tmp_path))
    await s.add_message(thread_id="t", role="user", text="ancient")
    # Backdate the thread well beyond the retention window.
    s._backdate_for_test("t", days=99)
    removed = s.prune_older_than(30)
    assert removed == 1
    assert s.get_thread("t") is None


async def test_in_memory_default_still_works() -> None:
    """No db_path → process-local in-memory DB, backward compatible."""
    s = ChatStore(bus=EventBus())
    await s.add_message(thread_id="t", role="user", text="ephemeral")
    assert s.get_thread("t")["messages"][0]["text"] == "ephemeral"


async def test_legacy_database_migrates_without_losing_messages(tmp_path) -> None:
    path = _db(tmp_path)
    conn = sqlite3.connect(path)
    conn.executescript(
        """
        CREATE TABLE chat_threads (
            thread_id TEXT PRIMARY KEY,
            title TEXT NOT NULL DEFAULT '',
            kind TEXT NOT NULL DEFAULT 'text',
            created_at_ns INTEGER NOT NULL,
            updated_at_ns INTEGER NOT NULL
        );
        CREATE TABLE chat_messages (
            message_id TEXT PRIMARY KEY,
            thread_id TEXT NOT NULL,
            role TEXT NOT NULL,
            text TEXT NOT NULL,
            timestamp_ns INTEGER NOT NULL
        );
        INSERT INTO chat_threads VALUES ('legacy', 'Old chat', 'text', 1, 2);
        INSERT INTO chat_messages VALUES ('m1', 'legacy', 'user', 'keep me', 2);
        """
    )
    conn.close()

    first = ChatStore(bus=EventBus(), db_path=path)
    first.open()
    first.close()
    second = ChatStore(bus=EventBus(), db_path=path)
    detail = second.get_thread("legacy")

    assert detail is not None
    assert detail["mode"] == "chat"
    assert detail["project_id"] is None
    assert detail["draft"] == ""
    assert detail["state"] == {}
    assert [message["text"] for message in detail["messages"]] == ["keep me"]


async def test_search_matches_title_and_message_text(tmp_path) -> None:
    store = ChatStore(bus=EventBus(), db_path=_db(tmp_path))
    await store.create_thread(title="Release planning", thread_id="title")
    await store.add_message(thread_id="title", role="user", text="timeline")
    await store.add_message(thread_id="body", role="user", text="Discuss migration safety")

    assert [row["thread_id"] for row in store.list_threads(query="release")] == ["title"]
    assert [row["thread_id"] for row in store.list_threads(query="MIGRATION")] == ["body"]


async def test_chat_metadata_and_app_state_survive_restart(tmp_path) -> None:
    path = _db(tmp_path)
    first = ChatStore(bus=EventBus(), db_path=path)
    project = first.create_project(name="Galen", icon="sparkles", agent_id="future-agent")
    await first.create_thread(
        title="Implementation", thread_id="work", mode="work", project_id=project["id"]
    )
    first.update_thread(
        "work", draft="continue here", state={"panel": "files"}
    )
    first.set_app_state({"active_chat_id": "work", "sidebar_width": 288})
    first.close()

    second = ChatStore(bus=EventBus(), db_path=path)
    detail = second.get_thread("work")
    assert detail is not None
    assert detail["mode"] == "work"
    assert detail["project_id"] == project["id"]
    assert detail["draft"] == "continue here"
    assert detail["state"] == {"panel": "files"}
    assert second.get_app_state() == {"active_chat_id": "work", "sidebar_width": 288}
    assert second.get_project(project["id"])["agent_id"] == "future-agent"


async def test_deleting_project_ungroups_chats_by_default(tmp_path) -> None:
    store = ChatStore(bus=EventBus(), db_path=_db(tmp_path))
    project = store.create_project(name="Keep the chat")
    await store.create_thread(title="Chat", thread_id="chat", project_id=project["id"])

    assert store.delete_project(project["id"])
    assert store.get_thread("chat")["project_id"] is None


async def test_deleting_project_can_explicitly_delete_its_chats(tmp_path) -> None:
    store = ChatStore(bus=EventBus(), db_path=_db(tmp_path))
    project = store.create_project(name="Delete all")
    await store.create_thread(title="Chat", thread_id="chat", project_id=project["id"])

    assert store.delete_project(project["id"], delete_chats=True)
    assert store.get_thread("chat") is None
