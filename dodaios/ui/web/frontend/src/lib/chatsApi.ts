// Thin client for the Chats conversation-manager REST API
// (dodaios/ui/web/chats_routes.py).
import type { ChatMessage, ConversationKind, ConversationSummary } from "@/store/events";
import {
  replayTrace,
  type StoredTrace,
  type ThinkingTraceSnapshot,
} from "@/lib/thinkingSteps";
import type { MessageRole } from "@/types/messages";
import { createHistoryRequests } from "@/lib/historyRequests";
import { userAttachments } from "@/components/agentchat/reduce";

export interface ChatTurn {
  attachments?: unknown;
  role: string;
  text: string;
  ts_ms: number;
  /** The stored reasoning trace behind an assistant reply, when one was kept. */
  trace?: StoredTrace | null;
}

export interface ConversationDetail {
  kind: ConversationKind;
  id: string;
  title: string;
  messages: ChatTurn[];
  mode?: "chat" | "work";
  project_id?: string | null;
  draft?: string;
  state?: Record<string, unknown>;
}

export interface ChatProject {
  project_id: string;
  name: string;
  icon: string;
  instructions: string;
  context_files: string[];
  context_documents?: Record<string, string>;
  agent_id: string | null;
  collapsed: boolean;
  position: number;
  created_ms: number;
  updated_ms: number;
}

/** Wire format from ProjectResponse in chats_routes.py. Keep the UI's stable
 * project_id field while decoding the backend's canonical id. */
type ChatProjectResponse = Omit<ChatProject, "project_id" | "created_ms" | "updated_ms"> & {
  id: string;
  created_at_ns: number;
  updated_at_ns: number;
};

function decodeChatProject(row: ChatProjectResponse): ChatProject {
  if (typeof row.id !== "string" || !row.id) {
    throw new Error("project-response-invalid-id");
  }
  const { id, created_at_ns, updated_at_ns, ...metadata } = row;
  return {
    ...metadata,
    project_id: id,
    created_ms: Math.floor(created_at_ns / 1_000_000),
    updated_ms: Math.floor(updated_at_ns / 1_000_000),
  };
}

export interface ChatAppState {
  active_kind?: ConversationKind;
  active_id?: string | null;
  [key: string]: unknown;
}

export class ChatsApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = "ChatsApiError";
  }
}

// All context-changing requests share one order. A slow archive load must
// never seed its old context after a later selection or New voice chat.
let contextQueue: Promise<unknown> = Promise.resolve();
function changeContext<T>(request: () => Promise<T>): Promise<T> {
  const result = contextQueue.then(request, request);
  contextQueue = result.then(() => undefined, () => undefined);
  return result;
}

/**
 * The voice/text history. `limit` is deliberately generous: the sidebar shows
 * a handful, but the "All chats" archive promises everything, and a cap that
 * quietly hides old conversations reads as data loss.
 */
const conversationRequests = createHistoryRequests<ConversationSummary[]>();
export const invalidateConversations = () => conversationRequests.invalidate();

export function fetchConversations(days = 0, limit = 500, query = ""): Promise<ConversationSummary[]> {
  const params = new URLSearchParams({ limit: String(limit) });
  if (days > 0) params.set("days", String(days));
  if (query.trim()) params.set("q", query.trim());
  const url = `/api/chats?${params.toString()}`;
  return conversationRequests.read(url, async (signal) => {
    const res = await fetch(url, { signal });
    if (!res.ok) throw new ChatsApiError("list-failed", res.status);
    return (await res.json()) as ConversationSummary[];
  });
}

/** Search the archive in bounded server pages, aborting obsolete queries. */
export async function searchVoiceArchive(query: string, signal: AbortSignal, limit = 100): Promise<ConversationSummary[]> {
  if (!query.trim()) return [];
  const rows: ConversationSummary[] = [];
  let offset: number | null = 0;
  while (offset !== null && rows.length < limit) {
    const params = new URLSearchParams({ q: query.trim(), offset: String(offset) });
    const res = await fetch(`/api/chats/voice-search?${params}`, { signal });
    if (!res.ok) throw new ChatsApiError("voice-search-failed", res.status);
    const page = await res.json() as { rows: ConversationSummary[]; next_offset: number | null };
    rows.push(...page.rows);
    if (page.next_offset !== null && (!Number.isSafeInteger(page.next_offset) || page.next_offset <= offset)) {
      throw new Error("voice-search-invalid-offset");
    }
    offset = page.next_offset;
  }
  return rows.sort((a, b) => b.updated_ms - a.updated_ms).slice(0, limit);
}

export async function patchTextConversation(
  id: string,
  input: { title?: string; mode?: "chat" | "work"; project_id?: string | null; draft?: string; state?: Record<string, unknown> },
): Promise<ConversationDetail> {
  const res = await fetch(`/api/chats/text/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new ChatsApiError("update-failed", res.status);
  invalidateConversations();
  return (await res.json()) as ConversationDetail;
}

export async function fetchChatProjects(): Promise<ChatProject[]> {
  const res = await fetch("/api/chats/projects");
  if (!res.ok) throw new ChatsApiError("projects-failed", res.status);
  return ((await res.json()) as ChatProjectResponse[]).map(decodeChatProject);
}

export async function createChatProject(input: { name: string; icon?: string }): Promise<ChatProject> {
  const res = await fetch("/api/chats/projects", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new ChatsApiError("project-create-failed", res.status);
  return decodeChatProject((await res.json()) as ChatProjectResponse);
}

export async function patchChatProject(projectId: string, input: Partial<Pick<ChatProject, "name" | "icon" | "instructions" | "context_files" | "context_documents" | "agent_id" | "collapsed" | "position">>): Promise<ChatProject> {
  const res = await fetch(`/api/chats/projects/${encodeURIComponent(projectId)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new ChatsApiError("project-update-failed", res.status);
  return decodeChatProject((await res.json()) as ChatProjectResponse);
}

export async function deleteChatProject(projectId: string, deleteChats = false): Promise<void> {
  const query = deleteChats ? "?delete_chats=true" : "";
  const res = await fetch(`/api/chats/projects/${encodeURIComponent(projectId)}${query}`, { method: "DELETE" });
  if (!res.ok) throw new ChatsApiError("project-delete-failed", res.status);
}

export async function fetchChatAppState(): Promise<ChatAppState> {
  const res = await fetch("/api/chats/state");
  if (!res.ok) throw new ChatsApiError("state-failed", res.status);
  return ((await res.json()) as { state: ChatAppState }).state;
}

export async function saveChatAppState(state: ChatAppState): Promise<ChatAppState> {
  const res = await fetch("/api/chats/state", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ state }),
  });
  if (!res.ok) throw new ChatsApiError("state-save-failed", res.status);
  return ((await res.json()) as { state: ChatAppState }).state;
}

export async function resumeConversation(
  kind: ConversationKind,
  id: string,
): Promise<ConversationDetail> {
  return changeContext(async () => {
    const res = await fetch(`/api/chats/${kind}/${encodeURIComponent(id)}/resume`, {
      method: "POST",
    });
    if (!res.ok) throw new ChatsApiError("resume-failed", res.status);
    return (await res.json()) as ConversationDetail;
  });
}

/**
 * Start a call that already remembers this conversation: the backend seeds
 * the brain (and the next live call) with its turns and arms the microphone.
 * Queued with the other context changes so a slower archive load can never
 * re-seed a different thread after it.
 */
export async function speakInConversation(
  kind: ConversationKind,
  id: string,
): Promise<{ armed: boolean; seeded_turns: number }> {
  return changeContext(async () => {
    const res = await fetch(`/api/chats/${kind}/${encodeURIComponent(id)}/speak`, {
      method: "POST",
    });
    if (!res.ok) throw new ChatsApiError("speak-failed", res.status);
    return (await res.json()) as { armed: boolean; seeded_turns: number };
  });
}

/**
 * Begin a fresh voice run: the brain forgets the thread it was seeded with,
 * and a session that is still live is ended so the next wake word opens a new
 * one. The microphone is not re-armed — starting to talk stays the user's move.
 */
export async function startNewVoiceRun(): Promise<{
  cleared: boolean;
  ended: boolean;
}> {
  return changeContext(async () => {
    const res = await fetch("/api/chats/voice/new", { method: "POST" });
    if (!res.ok) throw new ChatsApiError("new-voice-run-failed", res.status);
    invalidateConversations();
    return (await res.json()) as { cleared: boolean; ended: boolean };
  });
}

export async function deleteTextConversation(id: string): Promise<void> {
  const res = await fetch(`/api/chats/text/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
  if (!res.ok) throw new ChatsApiError("delete-failed", res.status);
  invalidateConversations();
}

/** The stable id of the i-th message of a loaded conversation. */
function historyMessageId(detail: ConversationDetail, index: number): string {
  return `hist-${detail.kind}-${detail.id}-${index}`;
}

/** Map a normalized transcript into store ChatMessages with stable ids
 *  (so the live pushMessage dedup never collides with a loaded transcript). */
export function detailToMessages(detail: ConversationDetail): ChatMessage[] {
  return detail.messages.map((m, i) => {
    const message: ChatMessage = {
      id: historyMessageId(detail, i),
      role: m.role as MessageRole,
      content: m.text,
      ts: m.ts_ms,
      thread_id: detail.id,
      attachments: userAttachments(m.attachments),
    };
    const trace = m.role === "assistant" && m.trace ? replayTrace(m.trace) : null;
    if (trace) message.trace = trace;
    return message;
  });
}

/**
 * The stored traces of a loaded conversation, keyed by the same ids
 * `detailToMessages` hands out — replayed through the live reducer so the
 * history shows "Thought for 4s" + steps exactly like the live turn did.
 */
export function detailToTraces(
  detail: ConversationDetail,
): Record<string, ThinkingTraceSnapshot> {
  const out: Record<string, ThinkingTraceSnapshot> = {};
  detail.messages.forEach((m, i) => {
    if (m.role !== "assistant" || !m.trace) return;
    const snapshot = replayTrace(m.trace);
    if (snapshot) out[historyMessageId(detail, i)] = snapshot;
  });
  return out;
}
