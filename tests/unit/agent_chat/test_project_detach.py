from dodaios.agent_chat.store import AgentChatStore


def test_detach_project_preserves_sessions_and_other_projects():
    store = AgentChatStore()
    try:
        def create(surface, project_id):
            return store.create_session(
                provider="test", model="test", effort="", cwd="", surface=surface,
                project_id=project_id, title="Keep me", draft="draft",
            )

        chat = create("jarvis", "p1")
        work = create("agent", "p1")
        other = create("agent", "p2")
        assert store.detach_project("p1") == 2
        assert store.detach_project("p1") == 0
        for original in (chat, work):
            current = store.get_session(original.session_id)
            assert current is not None
            assert current.project_id is None
            assert current.title == original.title
            assert current.draft == original.draft
            assert current.updated_ms == original.updated_ms
        assert store.get_session(other.session_id).project_id == "p2"
    finally:
        store.close()
