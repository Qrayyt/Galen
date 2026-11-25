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
  searchVoiceArchive,
  moveVoiceConversation,
  invalidateConversations,
  patchChatProject,
  type ChatProject,
} from "@/lib/chatsApi";
import {
  deleteAgentChatSession,
  fetchAgentChatSessions,
  patchAgentChatSession,
  searchAgentChatSessions,
  type ChatSearchHit,
  type AgentChatSession,
} from "@/lib/agentChatApi";
import { fill, useT, useUiLanguage } from "@/i18n";
import { cn } from "@/lib/utils";
import { useEventStore, type ConversationSummary } from "@/store/events";
import { useIdeThreadsStore } from "@/store/ideThreads";

const REFRESH_MS = 5000;

// Keep this feature's small, safety-sensitive copy together across all six UI locales.
const projectCopy: Record<string, { icon: string; remove: string; move: string }> = {
  en: { icon: "Project icon (optional)", remove: "Chats move to recent history. Files and conversations are not deleted.", move: "Moving this chat changes its available project context." },
  ru: { icon: "Иконка проекта (необязательно)", remove: "Чаты переместятся в недавние. Файлы и переписки не удаляются.", move: "При перемещении изменится доступный контекст проекта." },
  de: { icon: "Projektsymbol (optional)", remove: "Chats werden in den letzten Verlauf verschoben. Dateien und Unterhaltungen bleiben erhalten.", move: "Beim Verschieben ändert sich der verfügbare Projektkontext." },
  es: { icon: "Icono del proyecto (opcional)", remove: "Los chats pasarán al historial reciente. No se eliminarán archivos ni conversaciones.", move: "Mover el chat cambia el contexto del proyecto disponible." },
  pt: { icon: "Ícone do projeto (opcional)", remove: "As conversas serão movidas para o histórico recente. Os arquivos e as conversas não serão excluídos.", move: "Mover esta conversa altera o contexto de projeto disponível." },
  zh: { icon: "项目图标（可选）", remove: "聊天将移至最近记录，不会删除文件或对话。", move: "移动此聊天将更改其可用的项目上下文。" },
};

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
  const copy = projectCopy[useUiLanguage()] ?? projectCopy.en;
  const { rows: chatRows, isActive, open: openChat, remove: removeChat } = useChatRows({ poll: true });
  const activeWorkId = useIdeThreadsStore((state) => state.selection.sessionId);
  const setActiveSection = useEventStore((state) => state.setActiveSection);
  const activeSection = useEventStore((state) => state.activeSection);
  const pushToast = useEventStore((state) => state.pushToast);
  const [sessions, setSessions] = useState<AgentChatSession[]>([]);
  const [projects, setProjects] = useState<ChatProject[]>([]);
  const [query, setQuery] = useState("");
  const [voiceProjectOverrides, setVoiceProjectOverrides] = useState<Record<string, string>>({});
  const [hits, setHits] = useState<{ query: string; rows: Array<ChatSearchHit & { mode: "chat" | "work" }>; voice: ConversationSummary[]; failed: boolean } | null>(null);
  const [newMode, setNewMode] = useState<"chat" | "work">(activeSection === "agentic-ide" ? "work" : "chat");
  const [creatingProject, setCreatingProject] = useState(false);
  const [projectName, setProjectName] = useState("");
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [iconValue, setIconValue] = useState("");
  const [instructions, setInstructions] = useState("");
  const [documents, setDocuments] = useState<Record<string, string>>({});
  const [readingFiles, setReadingFiles] = useState(false);
  const locale = useUiLanguage();
  const contextCopy = ({ ru: ["Инструкции проекта", "Текстовые файлы проекта", "Текст файлов сохраняется локально и передаётся модели только в чатах проекта. До 8 файлов, 16 000 символов на файл, 48 000 всего.", "Не удалось добавить файл: проверьте формат и лимиты."], en: ["Project instructions", "Project text files", "Text snapshots are stored locally and sent to the model only in project chats. Up to 8 files, 16,000 characters each, 48,000 total.", "Could not add the file: check format and limits."] } as Record<string, string[]>)[locale] ?? ["Project instructions", "Project text files", "Text snapshots are stored locally and sent to the model only in project chats. Up to 8 files, 16,000 characters each, 48,000 total.", "Could not add the file: check format and limits."];
  const [confirmProject, setConfirmProject] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const [nextSessions, nextProjects] = await Promise.allSettled([
        fetchAgentChatSessions(500),
        fetchChatProjects(),
      ]);
      if (nextSessions.status === "fulfilled") setSessions(nextSessions.value.filter((session) => session.surface === "jarvis" || session.surface === "agent"));
      if (nextProjects.status === "fulfilled") setProjects(nextProjects.value);
    } catch {
      // During a backend restart the last complete list remains visible.
    }
  }, []);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => void refresh(), REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [refresh]);

  const needle = query.trim();
  useEffect(() => {
    if (!needle) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      void Promise.allSettled([
        searchAgentChatSessions(needle, { surface: "jarvis", signal: controller.signal, limit: 100 }),
        searchAgentChatSessions(needle, { surface: "agent", signal: controller.signal, limit: 100 }),
        searchVoiceArchive(needle, controller.signal, 100),
      ]).then(([chat, work, voice]) => {
        if (controller.signal.aborted) return;
        setHits({ query: needle, failed: chat.status === "rejected" || work.status === "rejected" || voice.status === "rejected", voice: voice.status === "fulfilled" ? voice.value : [], rows: [
          ...(chat.status === "fulfilled" ? chat.value.map((hit) => ({ ...hit, mode: "chat" as const })) : []),
          ...(work.status === "fulfilled" ? work.value.map((hit) => ({ ...hit, mode: "work" as const })) : []),
        ] });
      });
    }, 250);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [needle]);

  const sessionsById = useMemo(
    () => new Map(sessions.map((session) => [session.session_id, session])),
    [sessions],
  );

  const rows = useMemo<UnifiedRow[]>(() => {
    const known = new Map(chatRows.filter((row) => row.kind === "voice" || sessionsById.get(row.id)?.surface !== "agent").map((row) => [`${row.kind}:${row.id}`, row]));
    for (const session of sessions) {
      if (session.surface !== "jarvis" || known.has(`agent:${session.session_id}`)) continue;
      known.set(`agent:${session.session_id}`, { kind: "agent", id: session.session_id, title: session.title, preview: session.preview,
        updatedMs: session.updated_ms, messageCount: session.message_count, provider: session.provider, raw: null });
    }
    const chats = [...known.values()].map((row) => {
      const session = row.kind === "agent" ? sessionsById.get(row.id) ?? null : null;
      const label = chatRowLabel(row, t);
      return {
        id: row.id,
        mode: "chat" as const,
        title: label.text,
        preview: row.preview,
        updatedMs: row.updatedMs,
        projectId: row.kind === "voice" ? voiceProjectOverrides[row.id] ?? row.raw?.project_id ?? "" : session?.project_id ?? "",
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
  }, [chatRows, sessions, sessionsById, t, voiceProjectOverrides]);

  const rowKey = (row: UnifiedRow) => `${row.chat?.kind === "voice" ? "voice" : row.mode}:${row.id}`;
  const visible = useMemo(() => {
    const folded = needle.toLocaleLowerCase();
    if (!folded) return rows;
    const results = new Map(rows.filter((row) => `${row.title}\n${row.preview}`.toLocaleLowerCase().includes(folded)).map((row) => [rowKey(row), row]));
    const byKey = new Map(rows.map((row) => [rowKey(row), row]));
    for (const hit of hits?.query === needle ? hits.rows : []) {
      const key = `${hit.mode}:${hit.session_id}`;
      const existing = byKey.get(key);
      if (existing) { results.set(key, { ...existing, preview: hit.snippet || existing.preview }); continue; }
      const fallback: UnifiedRow = { id: hit.session_id, mode: hit.mode, title: hit.title, preview: hit.snippet, updatedMs: hit.updated_ms, projectId: "", session: null };
      if (hit.mode === "chat") fallback.chat = { kind: "agent", id: hit.session_id, title: hit.title, preview: hit.snippet,
        updatedMs: hit.updated_ms, messageCount: hit.matches, provider: "", raw: null };
      results.set(key, fallback);
    }
    for (const hit of hits?.query === needle ? hits.voice : []) {
      const chat: ChatRow = { kind: "voice", id: hit.id, title: hit.title, preview: hit.preview, updatedMs: hit.updated_ms, messageCount: hit.message_count, provider: "", raw: hit };
      const existing = byKey.get(`voice:${hit.id}`);
      results.set(`voice:${hit.id}`, { id: hit.id, mode: "chat", title: existing?.title ?? chatRowLabel(chat, t).text, preview: hit.preview, updatedMs: hit.updated_ms, projectId: voiceProjectOverrides[hit.id] ?? hit.project_id ?? "", chat, session: null });
    }
    return [...results.values()].sort((a, b) => b.updatedMs - a.updatedMs);
  }, [needle, rows, hits, t, voiceProjectOverrides]);

  const ungrouped = visible.filter((row) => !row.projectId || !projects.some((project) => project.project_id === row.projectId));
  const start = (projectId?: string) => {
    if (newMode === "chat") {
      startNewTextChat(projectId);
      return;
    }
    const work = useIdeThreadsStore.getState();
    work.setLayout("threads");
    work.newThread("", projectId);
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
    } catch { pushToast("error", t("common.save_failed")); } finally {
      setBusy(false);
    }
  };

  const addDocuments = async (files: FileList | null) => {
    if (!files || readingFiles) return;
    setReadingFiles(true);
    try {
      const next = { ...documents };
      for (const file of Array.from(files)) {
        if (!/\.(txt|md|csv|json|log|yaml|yml|tsv)$/i.test(file.name) || file.size > 64000 || file.name.length > 180) throw new Error("format");
        const body = await file.text();
        if (body.length > 16000 || body.includes("\0")) throw new Error("length");
        next[file.name] = body;
      }
      if (Object.keys(next).length > 8 || Object.values(next).reduce((sum, value) => sum + value.length, 0) > 48000) throw new Error("total");
      setDocuments(next);
    } catch { pushToast("error", contextCopy[3]); } finally { setReadingFiles(false); }
  };

  const renameProject = async (project: ChatProject) => {
    const name = renameValue.trim();
    if (!name || busy || readingFiles) return;
    setBusy(true);
    try {
      await patchChatProject(project.project_id, { name, icon: iconValue.trim(), instructions, context_documents: documents });
      setRenaming(null);
      await refresh();
    } catch { pushToast("error", t("common.save_failed")); } finally {
      setBusy(false);
    }
  };

  const removeProject = async (project: ChatProject) => {
    if (busy) return;
    setBusy(true);
    try {
      await deleteChatProject(project.project_id);
      invalidateConversations();
      setVoiceProjectOverrides(previous => Object.fromEntries(Object.entries(previous).map(([id, pid]) => [id, pid === project.project_id ? "" : pid])));
      setConfirmProject(null);
      await refresh();
    } catch { pushToast("error", t("common.delete_failed")); } finally { setBusy(false); }
  };

  const moveRow = async (row: UnifiedRow, projectId: string) => {
    if (!row.session && row.chat?.kind !== "voice") return;
    try {
      if (row.chat?.kind === "voice") {
        await moveVoiceConversation(row.id, projectId || null);
        setVoiceProjectOverrides(previous => ({ ...previous, [row.id]: projectId }));
      } else {
        await patchAgentChatSession(row.id, { project_id: projectId });
      }
      await refresh();
    } catch { pushToast("error", t("common.save_failed")); }
  };

  const removeRow = async (row: UnifiedRow) => {
    try {
      if (row.mode === "work") {
        await deleteAgentChatSession(row.id);
        useIdeThreadsStore.getState().forgetThread(row.id);
      } else if (row.chat) {
        removeChat(row.chat);
      }
      await refresh();
    } catch { pushToast("error", t("common.delete_failed")); }
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
            maxLength={200}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t("all_chats.search_placeholder")}
            className="h-9 w-full rounded-lg border border-border bg-background pl-8 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </label>
        {needle && hits?.query !== needle && <p role="status" className="text-xs text-muted-foreground">{t("common.loading")}</p>}
        {needle && hits?.query === needle && hits.failed && <p role="status" className="text-xs text-muted-foreground">{t("common.error_generic")}</p>}
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
              maxLength={80}
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
                  <span aria-hidden className="flex h-5 w-5 shrink-0 items-center justify-center overflow-hidden text-sm">{project.icon || <Folder className="h-4 w-4" />}</span>
                  <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">{project.name}</span>
                  {!editing && (
                    <>
                      <button type="button" onClick={() => start(project.project_id)}
                        aria-label={t("sidebar.new_chat")} title={t("sidebar.new_chat")}
                        className="rounded p-1 text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                        <Plus aria-hidden className="h-3 w-3" />
                      </button>
                      <button type="button" onClick={() => { setRenaming(project.project_id); setRenameValue(project.name); setIconValue(project.icon); setInstructions(project.instructions ?? ""); setDocuments(project.context_documents ?? {}); setConfirmProject(null); }}
                        aria-label={t("common.edit")} title={t("common.edit")}
                        className="rounded p-1 text-muted-foreground hover:text-foreground focus-visible:block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring group-hover:block">
                        <Pencil aria-hidden className="h-3 w-3" />
                      </button>
                      <button type="button" onClick={() => { setConfirmProject(project.project_id); setRenaming(null); }}
                        aria-label={t("ide_threads.remove_project")} title={t("ide_threads.remove_project")}
                        className="rounded p-1 text-muted-foreground hover:text-destructive focus-visible:block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring group-hover:block">
                        <Trash2 aria-hidden className="h-3 w-3" />
                      </button>
                    </>
                  )}
                </div>
                {editing && (
                  <form className="space-y-2 rounded-md border border-border p-2" onSubmit={(event) => { event.preventDefault(); void renameProject(project); }}>
                    <label className="block text-xs text-muted-foreground">{t("ide_threads.rename")}
                      <input autoFocus value={renameValue} maxLength={80} onChange={(event) => setRenameValue(event.target.value)}
                        className="mt-1 h-8 w-full rounded border border-border bg-background px-2 text-sm text-foreground" />
                    </label>
                    <label className="block text-xs text-muted-foreground">{copy.icon}
                      <input value={iconValue} maxLength={16} onChange={(event) => setIconValue(event.target.value)}
                        className="mt-1 h-8 w-full rounded border border-border bg-background px-2 text-sm text-foreground" />
                    </label>
                    <label className="block text-xs text-muted-foreground">{contextCopy[0]}
                      <textarea value={instructions} maxLength={100000} rows={4} onChange={(event) => setInstructions(event.target.value)}
                        className="mt-1 w-full rounded border border-border bg-background p-2 text-sm text-foreground" />
                    </label>
                    <label className="block text-xs text-muted-foreground">{contextCopy[1]}
                      <input type="file" multiple accept=".txt,.md,.csv,.json,.log,.yaml,.yml,.tsv" disabled={busy || readingFiles}
                        onChange={(event) => { void addDocuments(event.target.files); event.target.value = ""; }} className="mt-1 w-full text-xs" />
                    </label>
                    <p className="text-xs text-muted-foreground">{contextCopy[2]}</p>
                    {Object.keys(documents).map((name) => <div key={name} className="flex items-center gap-1 text-xs">
                      <span className="min-w-0 flex-1 truncate" title={name}>{name}</span>
                      <button type="button" disabled={busy || readingFiles} aria-label={`${t("common.delete")} ${name}`} onClick={() => setDocuments((current) => Object.fromEntries(Object.entries(current).filter(([key]) => key !== name)))} className="rounded p-1 hover:bg-secondary"><Trash2 className="h-3 w-3" /></button>
                    </div>)}
                    <div className="flex justify-end gap-2">
                      <button type="button" disabled={busy || readingFiles} onClick={() => setRenaming(null)} className="rounded px-2 py-1 text-xs hover:bg-secondary">{t("common.cancel")}</button>
                      <button type="submit" disabled={busy || readingFiles || !renameValue.trim()} className="rounded bg-primary px-2 py-1 text-xs text-primary-foreground disabled:opacity-50">{t("common.save")}</button>
                    </div>
                  </form>
                )}
                {confirmProject === project.project_id && (
                  <div className="space-y-2 rounded-md border border-border p-2" role="group" aria-label={t("ide_threads.remove_project")}>
                    <p className="text-xs text-foreground">{fill(t("ide_threads.remove_project_title"), { project: project.name })}</p>
                    <p className="text-xs text-muted-foreground">{copy.remove}</p>
                    <div className="flex justify-end gap-2">
                      <button type="button" autoFocus disabled={busy} onClick={() => setConfirmProject(null)} className="rounded px-2 py-1 text-xs hover:bg-secondary">{t("common.cancel")}</button>
                      <button type="button" disabled={busy} onClick={() => void removeProject(project)} className="rounded bg-destructive px-2 py-1 text-xs text-destructive-foreground disabled:opacity-50">{t("common.delete")}</button>
                    </div>
                  </div>
                )}
                {(!project.collapsed || Boolean(needle)) && (
                  <ul className="ml-4 border-l border-border pl-1">
                    {projectRows.map((row) => <HistoryRow key={rowKey(row)} row={row} projects={projects}
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
          <ul>{ungrouped.map((row) => <HistoryRow key={rowKey(row)} row={row} projects={projects}
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
  const copy = projectCopy[useUiLanguage()] ?? projectCopy.en;
  const [pending, setPending] = useState<{ kind: "move"; projectId: string } | { kind: "delete" } | null>(null);
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
        {(row.session || row.chat?.kind === "voice") && (
          <select value={row.projectId} onChange={(event) => { if (event.target.value !== row.projectId) setPending({ kind: "move", projectId: event.target.value }); }} aria-label={t("ide_threads.projects")}
            className="h-6 max-w-20 rounded border border-border bg-background px-1 text-xs text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <option value="">—</option>
            {projects.map((project) => <option key={project.project_id} value={project.project_id}>{project.name}</option>)}
          </select>
        )}
        {row.mode !== "chat" || row.chat?.kind === "agent" ? (
          <button type="button" onClick={(event) => { event.stopPropagation(); setPending({ kind: "delete" }); }} aria-label={t("chats_view.delete")}
            title={t("chats_view.delete")} className="rounded p-1 text-muted-foreground hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <Trash2 aria-hidden className="h-3 w-3" />
          </button>
        ) : null}
      </div>
      {pending && <div role="group" className="space-y-2 rounded-md border border-border p-2 text-xs">
        <p>{pending.kind === "move" ? copy.move : t("ide_threads.delete_confirm")}</p>
        <div className="flex justify-end gap-2">
          <button type="button" autoFocus onClick={() => setPending(null)} className="rounded px-2 py-1 hover:bg-secondary">{t("common.cancel")}</button>
          <button type="button" onClick={() => { if (pending.kind === "move") onMove(pending.projectId); else onDelete(); setPending(null); }} className={cn("rounded px-2 py-1", pending.kind === "delete" ? "bg-destructive text-destructive-foreground" : "bg-primary text-primary-foreground")}>{t(pending.kind === "move" ? "common.apply" : "common.delete")}</button>
        </div>
      </div>}
    </li>
  );
}
