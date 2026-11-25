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
