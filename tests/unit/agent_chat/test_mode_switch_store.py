import pytest
from dodaios.agent_chat.events import make_event
from dodaios.agent_chat.store import AgentChatStore


def session(store):
    return store.create_session(provider="openai-api", model="test", effort="", cwd="/chat",
                                surface="jarvis", project_id="project", draft="keep", state={"x": 1})


def test_change_surface_preserves_identity_and_events(tmp_path):
    path = tmp_path / "chat.db"
    store = AgentChatStore(path)
    row = session(store)
    sid = row.session_id
    store.set_lead_session_id(sid)
    store.append_event(sid, make_event("user_message", {"text": "hello"}))
    before = store.list_events(sid)
    changed = store.change_surface(sid, "jarvis", "agent", cwd="/work", permission_mode="ask")
    assert changed.session_id == sid and changed.surface == "agent"
    assert changed.project_id == "project" and changed.draft == "keep"
    assert store.lead_session_id() is None
    assert store.list_events(sid) == before
    store.close()
    store = AgentChatStore(path)
    assert store.get_session(sid).surface == "agent"
    restored = store.change_surface(sid, "agent", "jarvis", cwd="/chat", permission_mode="ask")
    assert restored.surface == "jarvis" and store.list_events(sid) == before
    store.close()


def test_change_surface_refuses_vendor_and_approval_state():
    store = AgentChatStore()
    sid = session(store).session_id
    store.update_session(sid, vendor_session="vendor")
    with pytest.raises(ValueError):
        store.change_surface(sid, "jarvis", "agent", cwd="/work", permission_mode="ask")
    store.update_session(sid, vendor_session="")
    store.set_permission_override(sid, "bypass")
    with pytest.raises(ValueError):
        store.change_surface(sid, "jarvis", "agent", cwd="/work", permission_mode="ask")
    assert store.get_session(sid).surface == "jarvis"
    store.close()


def test_project_history_stays_private_after_detach_and_restart(tmp_path):
    path = tmp_path / "chat.db"
    store = AgentChatStore(path)
    sid = session(store).session_id
    assert store.get_session(sid).private_project_history
    store.detach_project("project")
    store.close()
    store = AgentChatStore(path)
    row = store.get_session(sid)
    assert row.project_id is None and row.private_project_history
    store.close()


def test_preview5_work_database_migrates_without_losing_vendor_resume(tmp_path):
    import sqlite3

    path = tmp_path / "preview5.db"
    with sqlite3.connect(path) as conn:
        # Schema from the release baseline, before project/draft/state columns.
        conn.executescript("""
CREATE TABLE IF NOT EXISTS agent_chat_sessions (
    session_id       TEXT PRIMARY KEY,
    title            TEXT NOT NULL DEFAULT '',
    provider         TEXT NOT NULL DEFAULT '',
    model            TEXT NOT NULL DEFAULT '',
    effort           TEXT NOT NULL DEFAULT '',
    cwd              TEXT NOT NULL DEFAULT '',
    permission_mode  TEXT NOT NULL DEFAULT 'bypass',
    vendor_session   TEXT,
    created_ms       INTEGER NOT NULL,
    updated_ms       INTEGER NOT NULL,
    message_count    INTEGER NOT NULL DEFAULT 0,
    preview          TEXT NOT NULL DEFAULT '',
    surface          TEXT NOT NULL DEFAULT 'agent',
    account_id       TEXT NOT NULL DEFAULT '',
    runtime          TEXT NOT NULL DEFAULT '',
    computer_id      TEXT NOT NULL DEFAULT '',
    last_message_ms  INTEGER NOT NULL DEFAULT 0,
    speed            TEXT NOT NULL DEFAULT '',
    started_by       TEXT NOT NULL DEFAULT '',
    build_mode       TEXT NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS agent_chat_events (
    session_id  TEXT NOT NULL,
    seq         INTEGER NOT NULL,
    ts_ms       INTEGER NOT NULL,
    kind        TEXT NOT NULL,
    payload     TEXT NOT NULL,
    PRIMARY KEY (session_id, seq)
);
        """)
        conn.execute(
            """INSERT INTO agent_chat_sessions
               (session_id, title, provider, model, cwd, vendor_session,
                created_ms, updated_ms, surface, message_count, account_id)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            ("old-work", "Legacy Work", "codex", "old-model", "/old/work",
             "vendor-resume", 1, 2, "agent", 1, "old-account"),
        )
        conn.execute(
            "INSERT INTO agent_chat_events VALUES (?, ?, ?, ?, ?)",
            ("old-work", 1, 2, "user_message", '{"text":"keep my original history"}'),
        )
        conn.execute("PRAGMA user_version = 3")
    expected_events = [{"seq": 1, "ts_ms": 2, "kind": "user_message",
                        "payload": {"text": "keep my original history"}}]
    first = AgentChatStore(path)
    row = first.get_session("old-work")
    assert row.surface == "agent" and row.vendor_session == "vendor-resume"
    assert row.cwd == "/old/work" and row.account_id == "old-account"
    assert row.project_id is None and row.draft == "" and row.state == {}
    assert not row.private_project_history
    assert first.list_events("old-work") == expected_events
    first.close()
    second = AgentChatStore(path)
    assert second.get_session("old-work") == row
    assert second.list_events("old-work") == expected_events
    second.close()
    with sqlite3.connect(path) as conn:
        assert conn.execute("PRAGMA user_version").fetchone()[0] == 3
        assert conn.execute("PRAGMA integrity_check").fetchone()[0] == "ok"
