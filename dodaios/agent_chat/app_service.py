"""The one agent-chat service of an app, built on first use from ``app.state``.

Building the service carries on the thread turns the turn host kept running
across a restart (``AgentChatService._seal_orphaned_turns``). Two services
built side by side both attach to those turns: the host hands each turn to
the later one, and the earlier one forgets it was running. When the earlier
one is the service the window talks to, a message typed while the agent works
no longer waits in the queue; it starts a second turn at once beside the one
that still runs (2026-11-14). So every builder goes through
:func:`service_from_state`, which builds under one lock.
"""

from __future__ import annotations

import logging
import threading
from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from dodaios.agent_chat.service import AgentChatService

log = logging.getLogger(__name__)

# Sync HTTP routes run in worker threads, while boot, WebSockets and the
# agents' MCP tools use the event loop or threads of their own.
BUILD_LOCK = threading.Lock()


def bind_project_lookup(svc: AgentChatService, state: Any) -> AgentChatService:
    # Resolve the store lazily: the application may initialize it after the service.
    def lookup(project_id: str) -> dict[str, Any] | None:
        store = getattr(state, "chat_store", None)
        return store.get_project(project_id) if store is not None else None

    svc.project_lookup = lookup
    return svc


def service_from_state(state: Any) -> AgentChatService | None:
    """The service on ``state.agent_chat``, built once from ``state.agent_chat_factory``.

    ``None`` when the app has no factory or the build failed (the reason is in
    the log).
    """
    svc = getattr(state, "agent_chat", None)
    if svc is not None:
        return bind_project_lookup(svc, state)
    if getattr(state, "agent_chat_factory", None) is not None:
        # Resolve the app's loop while NOT holding the lock: from a worker
        # thread this waits for the loop, and the loop may itself be waiting
        # for the lock in an async route — a deadlock that froze every route.
        from dodaios.agent_chat.service import remember_app_loop

        remember_app_loop()
    with BUILD_LOCK:
        svc = getattr(state, "agent_chat", None)
        if svc is not None:
            return bind_project_lookup(svc, state)
        factory = getattr(state, "agent_chat_factory", None)
        if factory is None:
            return None
        try:
            svc = factory()
        except Exception as exc:  # noqa: BLE001 — callers answer "unavailable"; the reason is logged
            log.warning("agent chat: service could not be built: %s", exc)
            return None
        state.agent_chat = svc
        return bind_project_lookup(svc, state)
