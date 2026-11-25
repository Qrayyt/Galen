from types import SimpleNamespace

import pytest

from dodaios.agent_chat.project_context import project_brief, validate_documents


def test_project_context_is_scoped_and_never_reads_old_paths():
    projects = {
        "a": {"id": "a", "instructions": "private-a", "context_documents": {"notes.txt": "alpha"}, "context_files": ["/etc/passwd"]},
        "b": {"id": "b", "instructions": "private-b"},
    }
    def brief(project_id, surface="jarvis"):
        return project_brief(SimpleNamespace(project_id=project_id, surface=surface), projects.get)

    assert "private-a" in brief("a") and "alpha" in brief("a")
    assert "private-b" not in brief("a")
    assert "/etc/passwd" not in brief("a")
    assert "private-a" not in brief("b", "agent")
    assert brief(None) == brief("missing") == brief("a", "society") == ""
    del projects["a"]
    assert brief("a") == ""


@pytest.mark.parametrize("docs", [{"../bad": "x"}, {"a": "x" * 16001}, {"a": "\x00"}, {str(i): "" for i in range(9)}, {str(i): "x" * 16000 for i in range(4)}])
def test_document_limits(docs):
    with pytest.raises(ValueError):
        validate_documents(docs)
