"""Durable, segmented chat store backed by sqlite3.

History: this began as an in-memory dict for Phase 1a, with the explicit plan
to swap in SQLite for Phase 2 ("Persistenz (SQLite) kommt in Phase 2 …"). The
Chats conversation manager (2026-05-30) is that swap. The public async API is
unchanged (``create_thread`` / ``ensure_thread`` / ``add_message`` /
``list_threads`` / ``get_thread``) so the launcher + desktop wiring is
untouched; new capabilities (``delete_thread``, ``prune_older_than``,
per-thread ``preview`` / ``title`` / ``updated_at_ns``) are additive.

Storage mirrors ``dodaios/sessions/store.py``: a single ``sqlite3`` connection
in WAL mode, guarded by a ``threading.Lock`` (writes happen from the asyncio
loop, reads from FastAPI route handlers — both on the same in-process loop, but
the lock keeps us safe if a future caller reads from a worker thread). The
``db_path`` defaults to ``:memory:`` so existing callers/tests that construct
``ChatStore(bus=...)`` keep working in-process without touching disk; the boot
path passes ``data/chats.db`` for real persistence.

Ordering is by SQLite ``rowid`` (strictly monotonic per insert), not by
wall-clock — Windows ``time_ns()`` resolution can otherwise tie two fast
appends and make message/thread order non-deterministic.
"""
from __future__ import annotations

import json
import sqlite3
import threading
import uuid
from dataclasses import dataclass
from pathlib import Path
from time import time_ns
from typing import TYPE_CHECKING, Any

from dodaios.core.events import MessageSent, ThreadCreated

if TYPE_CHECKING:
    from dodaios.core.bus import EventBus


@dataclass(slots=True)
class ChatMessage:
    message_id: str
    thread_id: str
    role: str  # "user" | "assistant" | "system"
    text: str
    timestamp_ns: int
    # The reasoning trace that produced an assistant reply (the event list
    # ``dodaios.state.turn_trace`` records); None for every other message.
    trace: dict[str, Any] | None = None


# Titles we treat as auto-derivable: the first user message replaces them.
# An explicitly chosen title is never overwritten.
_PLACEHOLDER_TITLES: frozenset[str] = frozenset({"", "New Thread", "New Chat"})

CHAT_MODE_CHAT = "chat"
CHAT_MODE_WORK = "work"
CHAT_MODES: frozenset[str] = frozenset({CHAT_MODE_CHAT, CHAT_MODE_WORK})

_TITLE_MAX_CHARS = 80

_SCHEMA = """
CREATE TABLE IF NOT EXISTS chat_threads (
    thread_id      TEXT PRIMARY KEY,
    title          TEXT NOT NULL DEFAULT '',
    kind           TEXT NOT NULL DEFAULT 'text',
    created_at_ns  INTEGER NOT NULL,
    updated_at_ns  INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS chat_messages (
    message_id    TEXT PRIMARY KEY,
    thread_id     TEXT NOT NULL,
    role          TEXT NOT NULL,
    text          TEXT NOT NULL,
    timestamp_ns  INTEGER NOT NULL,
    FOREIGN KEY (thread_id) REFERENCES chat_threads(thread_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_chat_messages_thread
    ON chat_messages(thread_id);
CREATE TABLE IF NOT EXISTS chat_projects (
    project_id          TEXT PRIMARY KEY,
    name                TEXT NOT NULL,
    icon                TEXT NOT NULL DEFAULT '',
    instructions        TEXT NOT NULL DEFAULT '',
    context_files_json  TEXT NOT NULL DEFAULT '[]',
    context_documents_json TEXT NOT NULL DEFAULT '{}',
    agent_id            TEXT,
    collapsed           INTEGER NOT NULL DEFAULT 0,
    position            REAL NOT NULL DEFAULT 0,
    created_at_ns       INTEGER NOT NULL,
    updated_at_ns       INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS voice_project_links (
    voice_session_id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES chat_projects(project_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_voice_project_links_project ON voice_project_links(project_id);
CREATE TABLE IF NOT EXISTS chat_app_state (
    key    TEXT PRIMARY KEY,
    value  TEXT NOT NULL
);
"""

# Columns added after the first release, applied by ``_migrate`` when missing.
# ``trace_json`` (2026-08-23): the reasoning trace behind an assistant reply —
# tool calls, worker dispatch, the brain's rationale — as the JSON event list
# the UI replays into "Thought for 4s" + steps when a chat is reopened.
_COLUMN_MIGRATIONS: tuple[tuple[str, str, str], ...] = (
    ("chat_messages", "trace_json", "TEXT"),
    ("chat_threads", "mode", "TEXT NOT NULL DEFAULT 'chat'"),
    ("chat_threads", "project_id", "TEXT"),
    ("chat_threads", "draft", "TEXT NOT NULL DEFAULT ''"),
    ("chat_threads", "state_json", "TEXT NOT NULL DEFAULT '{}'"),
    ("chat_projects", "context_documents_json", "TEXT NOT NULL DEFAULT '{}'"),
)


def default_chats_db_path(data_dir: str = "./data") -> Path:
    """Resolve ``chats.db`` to sit beside ``sessions.db``: inside ``data_dir``.

    ``data_dir`` is ``cfg.memory.data_dir`` — the one directory every SQLite
    store of a running app lives in. The formula used to be
    ``Path(data_dir).parent / "data"``, which silently assumed that directory is
    *named* ``data``; a second instance of the app (``dodaios.core.instance``,
    ``data-dev/``) would have written its chats into the default app's folder.
    The session store (``server.py``) anchors the same way, so the two files stay
    together. With the default ``./data`` this is still repo-root ``data/chats.db``.
    """
    return Path(data_dir) / "chats.db"


def _derive_title(text: str) -> str:
    """First user message → a one-line title, truncated."""
    single = " ".join(text.split())
    if len(single) <= _TITLE_MAX_CHARS:
        return single
    return single[: _TITLE_MAX_CHARS - 1].rstrip() + "…"


def _migrate(conn: sqlite3.Connection) -> None:
    """Add the columns a pre-existing ``chats.db`` lacks. Idempotent."""
    for table, column, decl in _COLUMN_MIGRATIONS:
        have = {row["name"] for row in conn.execute(f"PRAGMA table_info({table})")}
        if column not in have:
            conn.execute(f"ALTER TABLE {table} ADD COLUMN {column} {decl}")


def _dump_trace(trace: dict[str, Any] | None) -> str | None:
    # A trace without events has nothing to show — store nothing.
    if not trace or not trace.get("events"):
        return None
    try:
        return json.dumps(trace, ensure_ascii=False, default=str)
    except (TypeError, ValueError):
        import logging

        logging.getLogger(__name__).warning(
            "chat trace not serialisable — stored the message without it"
        )
        return None


def _load_trace(raw: Any) -> dict[str, Any] | None:
    if not raw or not isinstance(raw, str):
        return None
    try:
        data = json.loads(raw)
    except ValueError:
        return None
    return data if isinstance(data, dict) else None


def _load_object(raw: Any) -> dict[str, Any]:
    if not raw or not isinstance(raw, str):
        return {}
    try:
        data = json.loads(raw)
    except ValueError:
        return {}
    return data if isinstance(data, dict) else {}


def _load_string_list(raw: Any) -> list[str]:
    if not raw or not isinstance(raw, str):
        return []
    try:
        data = json.loads(raw)
    except ValueError:
        return []
    if not isinstance(data, list):
        return []
    return [str(item) for item in data if isinstance(item, str)]


def _clean_mode(value: str) -> str:
    mode = str(value or CHAT_MODE_CHAT).strip().lower()
    if mode not in CHAT_MODES:
        raise ValueError(f"Unsupported chat mode: {value}")
    return mode


class ChatStore:
    """sqlite3-backed thread/message store. Sync DB ops under a threading.Lock,
    async public mutators (they also publish on the EventBus)."""

    def __init__(self, *, bus: EventBus, db_path: str | Path = ":memory:") -> None:
        self._bus = bus
        self._db_path = str(db_path)
        self._conn: sqlite3.Connection | None = None
        self._lock = threading.Lock()

    # ------- Lifecycle ------------------------------------------------
    def open(self) -> None:
        """Open the connection + create the schema. Idempotent.

        Optional to call explicitly — every method lazy-opens via
        :meth:`_ensure_conn`. The boot path calls it so any error surfaces
        at startup rather than on the first message.
        """
        self._ensure_conn()

    def _ensure_conn(self) -> sqlite3.Connection:
        with self._lock:
            if self._conn is not None:
                return self._conn
            if self._db_path != ":memory:":
                Path(self._db_path).parent.mkdir(parents=True, exist_ok=True)
            conn = sqlite3.connect(
                self._db_path,
                check_same_thread=False,
                isolation_level=None,  # autocommit; WAL is the lock manager
            )
            if self._db_path != ":memory:":
                conn.execute("PRAGMA journal_mode=WAL")
            conn.execute("PRAGMA synchronous=NORMAL")
            conn.execute("PRAGMA busy_timeout=5000")
            conn.execute("PRAGMA foreign_keys=ON")
            conn.row_factory = sqlite3.Row
            conn.executescript(_SCHEMA)
            _migrate(conn)
            self._conn = conn
            return conn

    def close(self) -> None:
        with self._lock:
            if self._conn is not None:
                self._conn.close()
                self._conn = None

    # ------- Queries (sync, reads are idempotent) ---------------------
    def list_threads(
        self, *, include_empty: bool = True, query: str = ""
    ) -> list[dict[str, Any]]:
        """All threads, most-recently-active first.

        Recency uses the largest message ``rowid`` per thread (monotonic with
        insertion across all threads), so it is deterministic regardless of
        clock granularity. Empty threads sort last by creation order.

        Conversation-history surfaces pass ``include_empty=False``. For text
        chats, a conversation starts with a user turn: rows with no persisted
        user message are either unsent drafts or legacy assistant-only residue
        and must not masquerade as real text conversations.
        """
        conn = self._ensure_conn()
        with self._lock:
            pattern = f"%{query.strip().lower()}%"
            rows = conn.execute(
                """
                SELECT
                    t.thread_id      AS thread_id,
                    t.title          AS title,
                    t.kind           AS kind,
                    t.created_at_ns  AS created_at_ns,
                    t.updated_at_ns  AS updated_at_ns,
                    t.mode           AS mode,
                    t.project_id     AS project_id,
                    t.draft          AS draft,
                    t.state_json     AS state_json,
                    (SELECT COUNT(*) FROM chat_messages m
                        WHERE m.thread_id = t.thread_id) AS message_count,
                    (SELECT COUNT(*) FROM chat_messages m
                        WHERE m.thread_id = t.thread_id
                          AND m.role = 'user'
                          AND TRIM(m.text) != ''
                    ) AS user_message_count,
                    (SELECT m.text FROM chat_messages m
                        WHERE m.thread_id = t.thread_id AND m.role = 'user'
                        ORDER BY m.rowid LIMIT 1) AS preview,
                    (SELECT MAX(m.rowid) FROM chat_messages m
                        WHERE m.thread_id = t.thread_id) AS last_seq
                FROM chat_threads t
                WHERE (
                    ? = 1 OR EXISTS (
                        SELECT 1 FROM chat_messages visible
                        WHERE visible.thread_id = t.thread_id
                          AND visible.role = 'user'
                          AND TRIM(visible.text) != ''
                    )
                ) AND (
                    ? = '%%'
                    OR LOWER(t.title) LIKE ?
                    OR EXISTS (
                        SELECT 1 FROM chat_messages searched
                        WHERE searched.thread_id = t.thread_id
                          AND LOWER(searched.text) LIKE ?
                    )
                )
                ORDER BY (last_seq IS NULL), last_seq DESC, t.rowid DESC
                """,
                (1 if include_empty else 0, pattern, pattern, pattern),
            ).fetchall()
        return [
            {
                "thread_id": r["thread_id"],
                "title": r["title"],
                "kind": r["kind"],
                "created_at_ns": r["created_at_ns"],
                "updated_at_ns": r["updated_at_ns"],
                "mode": r["mode"] or CHAT_MODE_CHAT,
                "project_id": r["project_id"],
                "draft": r["draft"] or "",
                "state": _load_object(r["state_json"]),
                "message_count": r["message_count"],
                "user_message_count": r["user_message_count"],
                "preview": r["preview"] or "",
            }
            for r in rows
        ]

    def get_thread(self, thread_id: str) -> dict[str, Any] | None:
        conn = self._ensure_conn()
        with self._lock:
            head = conn.execute(
                "SELECT thread_id, title, kind, created_at_ns, updated_at_ns, "
                "mode, project_id, draft, state_json "
                "FROM chat_threads WHERE thread_id = ?",
                (thread_id,),
            ).fetchone()
            if head is None:
                return None
            msgs = conn.execute(
                "SELECT message_id, thread_id, role, text, timestamp_ns, trace_json "
                "FROM chat_messages WHERE thread_id = ? ORDER BY rowid",
                (thread_id,),
            ).fetchall()
        return {
            "thread_id": head["thread_id"],
            "title": head["title"],
            "kind": head["kind"],
            "created_at_ns": head["created_at_ns"],
            "updated_at_ns": head["updated_at_ns"],
            "mode": head["mode"] or CHAT_MODE_CHAT,
            "project_id": head["project_id"],
            "draft": head["draft"] or "",
            "state": _load_object(head["state_json"]),
            "messages": [
                {
                    "message_id": m["message_id"],
                    "thread_id": m["thread_id"],
                    "role": m["role"],
                    "text": m["text"],
                    "timestamp_ns": m["timestamp_ns"],
                    "trace": _load_trace(m["trace_json"]),
                }
                for m in msgs
            ],
        }

    # ------- Mutations ------------------------------------------------
    async def create_thread(
        self,
        *,
        title: str,
        thread_id: str | None = None,
        kind: str = "text",
        mode: str = CHAT_MODE_CHAT,
        project_id: str | None = None,
    ) -> dict[str, Any]:
        tid = thread_id or str(uuid.uuid4())
        mode = _clean_mode(mode)
        conn = self._ensure_conn()
        now = time_ns()
        with self._lock:
            existing = conn.execute(
                "SELECT created_at_ns, title, kind, mode, project_id "
                "FROM chat_threads WHERE thread_id = ?",
                (tid,),
            ).fetchone()
            if existing is None:
                conn.execute(
                    "INSERT INTO chat_threads "
                    "(thread_id, title, kind, created_at_ns, updated_at_ns, mode, project_id) "
                    "VALUES (?, ?, ?, ?, ?, ?, ?)",
                    (tid, title, kind, now, now, mode, project_id),
                )
                created_at = now
                final_title = title
            else:
                created_at = existing["created_at_ns"]
                final_title = existing["title"]
        await self._bus.publish(
            ThreadCreated(source_layer="chat", thread_id=tid, title=final_title)
        )
        return {
            "thread_id": tid,
            "title": final_title,
            "created_at_ns": created_at,
            "message_count": 0,
            "mode": existing["mode"] if existing is not None else mode,
            "project_id": existing["project_id"] if existing is not None else project_id,
        }

    async def ensure_thread(
        self, thread_id: str, *, title: str = "New Thread", kind: str = "text"
    ) -> None:
        conn = self._ensure_conn()
        with self._lock:
            exists = conn.execute(
                "SELECT 1 FROM chat_threads WHERE thread_id = ?", (thread_id,)
            ).fetchone()
        if exists is not None:
            return
        await self.create_thread(title=title, thread_id=thread_id, kind=kind)

    async def add_message(
        self,
        *,
        thread_id: str,
        role: str,
        text: str,
        publish_event: bool = True,
        trace: dict[str, Any] | None = None,
    ) -> ChatMessage:
        """Append a message; ``trace`` is the reasoning trace behind a reply.

        The trace is stored as JSON next to the text and handed back by
        :meth:`get_thread` so a reopened chat shows the steps again. It is
        UI sugar, never history: a trace that fails to serialise is dropped
        with a log line, the message itself always lands.
        """
        await self.ensure_thread(thread_id)
        msg = ChatMessage(
            message_id=str(uuid.uuid4()),
            thread_id=thread_id,
            role=role,
            text=text,
            timestamp_ns=time_ns(),
            trace=trace if trace and trace.get("events") else None,
        )
        trace_json = _dump_trace(trace)
        conn = self._ensure_conn()
        with self._lock:
            conn.execute(
                "INSERT INTO chat_messages "
                "(message_id, thread_id, role, text, timestamp_ns, trace_json) "
                "VALUES (?, ?, ?, ?, ?, ?)",
                (msg.message_id, thread_id, role, text, msg.timestamp_ns, trace_json),
            )
            conn.execute(
                "UPDATE chat_threads SET updated_at_ns = ? WHERE thread_id = ?",
                (msg.timestamp_ns, thread_id),
            )
            # Auto-title from the first user message, unless a real title was set.
            if role == "user":
                head = conn.execute(
                    "SELECT title FROM chat_threads WHERE thread_id = ?",
                    (thread_id,),
                ).fetchone()
                if head is not None and head["title"] in _PLACEHOLDER_TITLES:
                    conn.execute(
                        "UPDATE chat_threads SET title = ? WHERE thread_id = ?",
                        (_derive_title(text), thread_id),
                    )
        if publish_event:
            await self._bus.publish(
                MessageSent(
                    source_layer="chat",
                    thread_id=thread_id,
                    role=role,
                    text=text,
                )
            )
        return msg

    async def delete_thread(self, thread_id: str) -> bool:
        """Delete a thread and (via ON DELETE CASCADE) its messages."""
        conn = self._ensure_conn()
        with self._lock:
            cur = conn.execute(
                "DELETE FROM chat_threads WHERE thread_id = ?", (thread_id,)
            )
            return cur.rowcount > 0

    def update_thread(
        self,
        thread_id: str,
        *,
        title: str | None = None,
        mode: str | None = None,
        project_id: str | None | object = ...,
        draft: str | None = None,
        state: dict[str, Any] | None = None,
    ) -> dict[str, Any] | None:
        """Update safe chat metadata without touching its messages."""
        conn = self._ensure_conn()
        changes: list[str] = []
        values: list[Any] = []
        if title is not None:
            changes.append("title = ?")
            values.append(" ".join(title.split())[:_TITLE_MAX_CHARS])
        if mode is not None:
            changes.append("mode = ?")
            values.append(_clean_mode(mode))
        if project_id is not ...:
            changes.append("project_id = ?")
            values.append(project_id)
        if draft is not None:
            changes.append("draft = ?")
            values.append(draft[:100_000])
        if state is not None:
            changes.append("state_json = ?")
            values.append(json.dumps(state, ensure_ascii=False, default=str))
        if not changes:
            return self.get_thread(thread_id)
        changes.append("updated_at_ns = ?")
        values.append(time_ns())
        values.append(thread_id)
        with self._lock:
            cur = conn.execute(
                f"UPDATE chat_threads SET {', '.join(changes)} WHERE thread_id = ?",
                values,
            )
        return self.get_thread(thread_id) if cur.rowcount else None

    def get_voice_project(self, voice_session_id: str) -> str | None:
        conn = self._ensure_conn()
        with self._lock:
            row = conn.execute("SELECT project_id FROM voice_project_links WHERE voice_session_id = ?", (voice_session_id,)).fetchone()
        return str(row["project_id"]) if row is not None else None

    def set_voice_project(self, voice_session_id: str, project_id: str | None) -> None:
        """Associate metadata only; never modify or delete archived voice recordings."""
        conn = self._ensure_conn()
        with self._lock:
            if project_id is None:
                conn.execute("DELETE FROM voice_project_links WHERE voice_session_id = ?", (voice_session_id,))
                return
            if conn.execute("SELECT 1 FROM chat_projects WHERE project_id = ?", (project_id,)).fetchone() is None:
                raise ValueError("project-not-found")
            conn.execute("INSERT INTO voice_project_links (voice_session_id, project_id) VALUES (?, ?) "
                         "ON CONFLICT(voice_session_id) DO UPDATE SET project_id = excluded.project_id", (voice_session_id, project_id))

    # ------- Projects --------------------------------------------------
    def list_projects(self) -> list[dict[str, Any]]:
        conn = self._ensure_conn()
        with self._lock:
            rows = conn.execute(
                """
                SELECT p.*,
                       (SELECT COUNT(*) FROM chat_threads t
                        WHERE t.project_id = p.project_id) AS chat_count
                FROM chat_projects p
                ORDER BY p.position, p.updated_at_ns DESC, p.name COLLATE NOCASE
                """
            ).fetchall()
        return [self._project_row(row) for row in rows]

    def get_project(self, project_id: str) -> dict[str, Any] | None:
        conn = self._ensure_conn()
        with self._lock:
            row = conn.execute(
                """
                SELECT p.*,
                       (SELECT COUNT(*) FROM chat_threads t
                        WHERE t.project_id = p.project_id) AS chat_count
                FROM chat_projects p WHERE p.project_id = ?
                """,
                (project_id,),
            ).fetchone()
        return self._project_row(row) if row is not None else None

    @staticmethod
    def _project_row(row: sqlite3.Row) -> dict[str, Any]:
        return {
            "id": row["project_id"],
            "name": row["name"],
            "icon": row["icon"] or "",
            "instructions": row["instructions"] or "",
            "context_files": _load_string_list(row["context_files_json"]),
            "context_documents": _load_object(row["context_documents_json"]),
            "agent_id": row["agent_id"],
            "collapsed": bool(row["collapsed"]),
            "position": float(row["position"] or 0),
            "created_at_ns": int(row["created_at_ns"]),
            "updated_at_ns": int(row["updated_at_ns"]),
            "chat_count": int(row["chat_count"]),
        }

    def create_project(
        self,
        *,
        name: str,
        icon: str = "",
        instructions: str = "",
        context_files: list[str] | None = None,
        context_documents: dict[str, str] | None = None,
        agent_id: str | None = None,
        project_id: str | None = None,
    ) -> dict[str, Any]:
        cleaned = " ".join(name.split())[:_TITLE_MAX_CHARS]
        if not cleaned:
            raise ValueError("Project name is required")
        from dodaios.agent_chat.project_context import validate_documents

        documents = validate_documents(context_documents or {})
        pid = project_id or str(uuid.uuid4())
        now = time_ns()
        conn = self._ensure_conn()
        with self._lock:
            conn.execute(
                """
                INSERT INTO chat_projects
                    (project_id, name, icon, instructions, context_files_json,
                     context_documents_json, agent_id, created_at_ns, updated_at_ns)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    pid,
                    cleaned,
                    icon.strip()[:200],
                    instructions[:100_000],
                    json.dumps(context_files or [], ensure_ascii=False),
                    json.dumps(documents, ensure_ascii=False),
                    agent_id or None,
                    now,
                    now,
                ),
            )
        return self.get_project(pid) or {}

    def update_project(self, project_id: str, **changes: Any) -> dict[str, Any] | None:
        allowed = {
            "name": "name",
            "icon": "icon",
            "instructions": "instructions",
            "agent_id": "agent_id",
            "collapsed": "collapsed",
            "position": "position",
        }
        sets: list[str] = []
        values: list[Any] = []
        for key, column in allowed.items():
            if key not in changes or changes[key] is None:
                continue
            value = changes[key]
            if key == "name":
                value = " ".join(str(value).split())[:_TITLE_MAX_CHARS]
                if not value:
                    raise ValueError("Project name is required")
            elif key == "icon":
                value = str(value).strip()[:200]
            elif key == "instructions":
                value = str(value)[:100_000]
            elif key == "agent_id":
                value = str(value).strip() or None
            elif key == "collapsed":
                value = int(bool(value))
            elif key == "position":
                value = float(value)
            sets.append(f"{column} = ?")
            values.append(value)
        if "context_files" in changes and changes["context_files"] is not None:
            sets.append("context_files_json = ?")
            values.append(json.dumps(list(changes["context_files"]), ensure_ascii=False))
        if "context_documents" in changes and changes["context_documents"] is not None:
            from dodaios.agent_chat.project_context import validate_documents

            sets.append("context_documents_json = ?")
            values.append(json.dumps(validate_documents(changes["context_documents"]), ensure_ascii=False))
        if not sets:
            return self.get_project(project_id)
        sets.append("updated_at_ns = ?")
        values.extend((time_ns(), project_id))
        conn = self._ensure_conn()
        with self._lock:
            cur = conn.execute(
                f"UPDATE chat_projects SET {', '.join(sets)} WHERE project_id = ?",
                values,
            )
        return self.get_project(project_id) if cur.rowcount else None

    def delete_project(self, project_id: str, *, delete_chats: bool = False) -> bool:
        """Delete project metadata, either ungrouping or deleting its chats."""
        conn = self._ensure_conn()
        with self._lock:
            if delete_chats:
                conn.execute("DELETE FROM chat_threads WHERE project_id = ?", (project_id,))
            else:
                conn.execute(
                    "UPDATE chat_threads SET project_id = NULL WHERE project_id = ?",
                    (project_id,),
                )
            cur = conn.execute(
                "DELETE FROM chat_projects WHERE project_id = ?", (project_id,)
            )
        return cur.rowcount > 0

    # ------- Restorable UI state --------------------------------------
    def get_app_state(self) -> dict[str, Any]:
        conn = self._ensure_conn()
        with self._lock:
            rows = conn.execute("SELECT key, value FROM chat_app_state").fetchall()
        out: dict[str, Any] = {}
        for row in rows:
            try:
                out[row["key"]] = json.loads(row["value"])
            except ValueError:
                continue
        return out

    def set_app_state(self, state: dict[str, Any]) -> dict[str, Any]:
        conn = self._ensure_conn()
        with self._lock:
            for key, value in state.items():
                if not isinstance(key, str) or len(key) > 80:
                    continue
                conn.execute(
                    "INSERT INTO chat_app_state (key, value) VALUES (?, ?) "
                    "ON CONFLICT(key) DO UPDATE SET value = excluded.value",
                    (key, json.dumps(value, ensure_ascii=False, default=str)),
                )
        return self.get_app_state()

    # ------- Retention / maintenance ----------------------------------
    def prune_older_than(self, days: int) -> int:
        """Delete threads whose last activity is older than ``days``.

        ``days <= 0`` disables pruning (returns 0), matching SessionStore.
        """
        if days <= 0:
            return 0
        cutoff = time_ns() - int(days) * 86_400 * 1_000_000_000
        conn = self._ensure_conn()
        with self._lock:
            cur = conn.execute(
                "DELETE FROM chat_threads WHERE updated_at_ns < ?", (cutoff,)
            )
            return cur.rowcount

    def _backdate_for_test(self, thread_id: str, *, days: int) -> None:
        """Test helper: move a thread's timestamps into the past."""
        conn = self._ensure_conn()
        past = time_ns() - int(days) * 86_400 * 1_000_000_000
        with self._lock:
            conn.execute(
                "UPDATE chat_threads SET created_at_ns = ?, updated_at_ns = ? "
                "WHERE thread_id = ?",
                (past, past, thread_id),
            )
