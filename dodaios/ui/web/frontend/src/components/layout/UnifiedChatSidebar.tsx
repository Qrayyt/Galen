import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  Folder,
  MessageSquare,
  Pencil,
  Plus,
  Search,
  Trash2,
  Wrench,
} from "lucide-react";

import { useChatRows, chatRowLabel, type ChatRow } from "@/components/home/chatRows";
import { openCodingThread } from "@/components/agentic/threads/openCodingThread";
import { startNewTextChat } from "@/lib/newChat";
import {
  createChatProject,
  deleteChatProject,
  fetchChatProjects,
  patchChatProject,
  type ChatProject,
} from "@/lib/chatsApi";
import {
  deleteAgentChatSession,
  fetchAgentChatSessions,
  patchAgentChatSession,
  type AgentChatSession,
} from "@/lib/agentChatApi";
import { useT } from "@/i18n";
import { cn } from "@/lib/utils";
import { useEventStore } from "@/store/events";
import { useIdeThreadsStore } from "@/store/ideThreads";

const REFRESH_MS = 5000;

/** One history row, regardless of whether Galen or a coding agent answers it. */
interface UnifiedRow {
  id: string;
  mode: "chat" | "work";
  title: string;
  preview: string;
  updatedMs: number;
  projectId: string;
  chat?: ChatRow;
  session: AgentChatSession | null;
}

/**
 * The primary ChatGPT-style history column. It deliberately reads the two
 * compatibility stores rather than copying their records: current Galen
 * chats keep their rich agent-chat timelines, Work keeps CLI resume handles,
 * and both appear in one ordered list.
 */
export function UnifiedChatSidebar() {
  const t = useT();
  const { rows: chatRows, isActive, open: openChat, remove: removeChat } = useChatRows({ poll: true });
  const activeWorkId = useIdeThreadsStore((state) => state.selection.sessionId);
  const setActiveSection = useEventStore((state) => state.setActiveSection);
  const [sessions, setSessions] = useState<AgentChatSession[]>([]);
  const [projects, setProjects] = useState<ChatProject[]>([]);
  const [query, setQuery] = useState("");
  const [newMode, setNewMode] = useState<"chat" | "work">("chat");
  const [creatingProject, setCreatingProject] = useState(false);
  const [projectName, setProjectName] = useState("");
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const [nextSessions, nextProjects] = await Promise.all([
        fetchAgentChatSessions(500),
        fetchChatProjects(),
      ]);
      setSessions(nextSessions.filter((session) => session.surface === "jarvis" || session.surface === "agent"));
      setProjects(nextProjects);
    } catch {
      // During a backend restart the last complete list remains visible.
    }
  }, []);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => void refresh(), REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [refresh]);

  const sessionsById = useMemo(
    () => new Map(sessions.map((session) => [session.session_id, session])),
    [sessions],
  );

  const rows = useMemo<UnifiedRow[]>(() => {
    const chats = chatRows.map((row) => {
      const session = row.kind === "agent" ? sessionsById.get(row.id) ?? null : null;
      const label = chatRowLabel(row, t);
      return {
        id: row.id,
        mode: "chat" as const,
        title: label.text,
        preview: row.preview,
        updatedMs: row.updatedMs,
        projectId: session?.project_id ?? "",
        chat: row,
        session,
      };
    });
    const work = sessions
      .filter((session) => session.surface === "agent")
      .map((session) => ({
        id: session.session_id,
        mode: "work" as const,
        title: session.cli_title || session.title || t("ide_threads.new_thread"),
        preview: session.preview,
        updatedMs: session.updated_ms,
        projectId: session.project_id ?? "",
        session,
      }));
    return [...chats, ...work].sort((a, b) => b.updatedMs - a.updatedMs);
  }, [chatRows, sessions, sessionsById, t]);

  const visible = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    if (!needle) return rows;
    return rows.filter((row) => `${row.title}\n${row.preview}`.toLocaleLowerCase().includes(needle));
  }, [query, rows]);

  const ungrouped = visible.filter((row) => !row.projectId || !projects.some((project) => project.project_id === row.projectId));
  const start = (projectId?: string) => {
    if (newMode === "chat") {
      startNewTextChat(projectId);
      return;
    }
    useIdeThreadsStore.getState().newThread("");
    setActiveSection("agentic-ide");
  };

  const createProject = async () => {
    const name = projectName.trim();
    if (!name || busy) return;
    setBusy(true);
    try {
      await createChatProject({ name });
      setProjectName("");
      setCreatingProject(false);
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  const renameProject = async (project: ChatProject) => {
    const name = renameValue.trim();
    if (!name || busy) return;
    setBusy(true);
    try {
      await patchChatProject(project.project_id, { name });
      setRenaming(null);
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  const moveRow = async (row: UnifiedRow, projectId: string) => {
    if (!row.session) return;
    await patchAgentChatSession(row.id, { project_id: projectId });
    await refresh();
  };

  const removeRow = async (row: UnifiedRow) => {
    if (row.mode === "work") {
      await deleteAgentChatSession(row.id);
    } else if (row.chat) {
      removeChat(row.chat);
    }
    await refresh();
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col" data-testid="unified-chat-sidebar">
      <div className="space-y-2 px-3 pb-3 pt-1">
        <div className="flex items-center gap-2">
          <select
            value={newMode}
            onChange={(event) => setNewMode(event.target.value === "work" ? "work" : "chat")}
            aria-label={t("sidebar.mode_aria")}
            className="h-9 min-w-0 flex-1 rounded-lg border border-border bg-background px-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <option value="chat">{t("sidebar.surface_chat")}</option>
            <option value="work">{t("sidebar.mode_ide")}</option>
          </select>
          <button
            type="button"
            onClick={() => start()}
            aria-label={t("sidebar.new_chat")}
            title={t("sidebar.new_chat")}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Plus aria-hidden className="h-4 w-4" />
          </button>
        </div>
        <label className="relative block">
          <span className="sr-only">{t("quick_switch.sidebar_search")}</span>
          <Search aria-hidden className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t("all_chats.search_placeholder")}
            className="h-9 w-full rounded-lg border border-border bg-background pl-8 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </label>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3 scrollbar-jarvis">
        <div className="mb-2 flex items-center justify-between px-1">
          <span className="text-xs font-semibold text-muted-foreground">{t("ide_threads.projects")}</span>
          <button
            type="button"
            onClick={() => setCreatingProject(true)}
            aria-label={t("ide_threads.connect_a_project")}
            title={t("ide_threads.connect_a_project")}
            className="rounded-md p-1 text-muted-foreground hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Plus aria-hidden className="h-3.5 w-3.5" />
          </button>
        </div>

        {creatingProject && (
          <form
            className="mb-2 flex items-center gap-1 px-1"
            onSubmit={(event) => { event.preventDefault(); void createProject(); }}
          >
            <input
              autoFocus
              value={projectName}
              onChange={(event) => setProjectName(event.target.value)}
              aria-label={t("ide_threads.projects")}
              className="h-8 min-w-0 flex-1 rounded-md border border-border bg-background px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
            <button type="submit" disabled={!projectName.trim() || busy} className="h-8 rounded-md bg-primary px-2 text-xs text-primary-foreground disabled:opacity-50">
              {t("ide_threads.save_name")}
            </button>
          </form>
        )}

        <div className="space-y-1">
          {projects.map((project) => {
            const projectRows = visible.filter((row) => row.projectId === project.project_id);
            const editing = renaming === project.project_id;
            return (
              <section key={project.project_id} className="rounded-lg" aria-label={project.name}>
                <div className="group flex min-h-8 items-center gap-1 rounded-md px-1 hover:bg-secondary">
                  <button
                    type="button"
                    onClick={() => void patchChatProject(project.project_id, { collapsed: !project.collapsed }).then(refresh)}
                    aria-expanded={!project.collapsed}
                    className="rounded p-1 text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {project.collapsed ? <ChevronRight aria-hidden className="h-3.5 w-3.5" /> : <ChevronDown aria-hidden className="h-3.5 w-3.5" />}
                  </button>
                  <span aria-hidden className="flex h-5 w-5 items-center justify-center text-sm">{project.icon || <Folder className="h-4 w-4" />}</span>
                  {editing ? (
                    <form className="flex min-w-0 flex-1" onSubmit={(event) => { event.preventDefault(); void renameProject(project); }}>
                      <input autoFocus value={renameValue} onChange={(event) => setRenameValue(event.target.value)}
                        aria-label={t("ide_threads.rename")} className="h-7 min-w-0 flex-1 rounded border border-border bg-background px-1.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
                    </form>
                  ) : (
                    <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">{project.name}</span>
                  )}
                  {!editing && (
                    <>
                      <button type="button" onClick={() => { setNewMode("chat"); startNewTextChat(project.project_id); }}
                        aria-label={t("sidebar.new_chat")} title={t("sidebar.new_chat")}
                        className="rounded p-1 text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                        <Plus aria-hidden className="h-3 w-3" />
                      </button>
                      <button type="button" onClick={() => { setRenaming(project.project_id); setRenameValue(project.name); }}
                        aria-label={t("ide_threads.rename")} title={t("ide_threads.rename")}
                        className="hidden rounded p-1 text-muted-foreground hover:text-foreground focus-visible:block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring group-hover:block">
                        <Pencil aria-hidden className="h-3 w-3" />
                      </button>
                      <button type="button" onClick={() => void deleteChatProject(project.project_id).then(refresh)}
                        aria-label={t("ide_threads.remove_project")} title={t("ide_threads.remove_project")}
                        className="hidden rounded p-1 text-muted-foreground hover:text-destructive focus-visible:block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring group-hover:block">
                        <Trash2 aria-hidden className="h-3 w-3" />
                      </button>
                    </>
                  )}
                </div>
                {!project.collapsed && (
                  <ul className="ml-4 border-l border-border pl-1">
                    {projectRows.map((row) => <HistoryRow key={`${row.mode}-${row.id}`} row={row} projects={projects}
                      active={row.mode === "work" ? activeWorkId === row.id : Boolean(row.chat && isActive(row.chat))}
                      onOpen={() => row.mode === "work" ? openCodingThread(row.id) : row.chat && openChat(row.chat)}
                      onMove={(projectId) => void moveRow(row, projectId)} onDelete={() => void removeRow(row)} t={t} />)}
                  </ul>
                )}
              </section>
            );
          })}
        </div>

        <div className="mb-1 mt-4 px-2 text-xs font-semibold text-muted-foreground">{t("sidebar.recent_chats")}</div>
        {ungrouped.length ? (
          <ul>{ungrouped.map((row) => <HistoryRow key={`${row.mode}-${row.id}`} row={row} projects={projects}
            active={row.mode === "work" ? activeWorkId === row.id : Boolean(row.chat && isActive(row.chat))}
            onOpen={() => row.mode === "work" ? openCodingThread(row.id) : row.chat && openChat(row.chat)}
            onMove={(projectId) => void moveRow(row, projectId)} onDelete={() => void removeRow(row)} t={t} />)}</ul>
        ) : (
          <p className="px-2 py-4 text-center text-xs text-muted-foreground">{t("sidebar.no_chats")}</p>
        )}
      </div>
    </div>
  );
}

function HistoryRow({ row, projects, active, onOpen, onMove, onDelete, t }: {
  row: UnifiedRow;
  projects: ChatProject[];
  active: boolean;
  onOpen: () => void;
  onMove: (projectId: string) => void;
  onDelete: () => void;
  t: (key: string) => string;
}) {
  const Icon = row.mode === "work" ? Wrench : MessageSquare;
  return (
    <li className="group relative rounded-md">
      <button type="button" onClick={onOpen} title={row.title} aria-current={active ? "page" : undefined}
        className={cn("flex w-full items-start gap-2 rounded-md px-2 py-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", active ? "bg-secondary" : "hover:bg-secondary")}>
        <Icon aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm text-foreground">{row.title}</span>
          {row.preview && <span className="mt-0.5 block truncate text-xs text-muted-foreground">{row.preview}</span>}
        </span>
      </button>
      <div className="absolute right-1 top-1 hidden items-center gap-0.5 rounded bg-secondary p-0.5 group-hover:flex group-focus-within:flex">
        {row.session && (
          <select value={row.projectId} onChange={(event) => onMove(event.target.value)} aria-label={t("ide_threads.projects")}
            className="h-6 max-w-20 rounded border border-border bg-background px-1 text-xs text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <option value="">—</option>
            {projects.map((project) => <option key={project.project_id} value={project.project_id}>{project.name}</option>)}
          </select>
        )}
        {row.mode !== "chat" || row.chat?.kind === "agent" ? (
          <button type="button" onClick={(event) => { event.stopPropagation(); onDelete(); }} aria-label={t("chats_view.delete")}
            title={t("chats_view.delete")} className="rounded p-1 text-muted-foreground hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <Trash2 aria-hidden className="h-3 w-3" />
          </button>
        ) : null}
      </div>
    </li>
  );
}
