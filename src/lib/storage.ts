import type { AppSettings, Conversation, MemoryItem, ReasoningLevel } from "../types";
import { DEFAULT_SETTINGS } from "../types";

const CHATS_KEY = "galen.conversations.v2";
const ACTIVE_CHAT_KEY = "galen.active-chat.v2";
const MEMORY_KEY = "galen.memory.v2";
const SETTINGS_KEY = "galen.settings.v2";
const MODEL_KEY = "galen.active-model.v1";

const id = () => crypto.randomUUID();

export function createConversation(reasoning: ReasoningLevel = DEFAULT_SETTINGS.reasoning): Conversation {
  const now = Date.now();
  return { id: id(), title: "Новый диалог", messages: [], createdAt: now, updatedAt: now, reasoning };
}

export function loadConversations(): Conversation[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(CHATS_KEY) ?? "[]") as Conversation[];
    if (Array.isArray(parsed) && parsed.length) return parsed;
  } catch { /* recover with a fresh chat */ }
  try {
    const legacy = JSON.parse(localStorage.getItem("galen.chat.history.v1") ?? "[]") as Conversation["messages"];
    if (Array.isArray(legacy) && legacy.length) {
      const migrated = createConversation();
      migrated.title = titleFromMessage(legacy.find((message) => message.role === "user")?.content ?? "Предыдущий диалог");
      migrated.messages = legacy;
      migrated.updatedAt = legacy.at(-1)?.createdAt ?? Date.now();
      return [migrated];
    }
  } catch { /* ignore broken legacy data */ }
  return [createConversation()];
}

export function saveConversations(chats: Conversation[]): void {
  const stable = chats.map((chat) => ({
    ...chat,
    // Attachment payloads are intentionally retained. Tauri updates replace
    // application binaries, not the WebView profile that owns this storage.
    messages: chat.messages.filter((message) => !message.pending).slice(-250),
  }));
  try { localStorage.setItem(CHATS_KEY, JSON.stringify(stable)); } catch { /* storage quota must not break chat */ }
}

export function loadActiveChatId(chats: Conversation[]): string {
  const saved = localStorage.getItem(ACTIVE_CHAT_KEY);
  return chats.some((chat) => chat.id === saved) ? saved! : chats[0].id;
}

export function saveActiveChatId(chatId: string): void {
  localStorage.setItem(ACTIVE_CHAT_KEY, chatId);
}

export function loadMemories(): MemoryItem[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(MEMORY_KEY) ?? "[]") as MemoryItem[];
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
}

export function saveMemories(memories: MemoryItem[]): void {
  localStorage.setItem(MEMORY_KEY, JSON.stringify(memories.slice(-300)));
}

export function loadSettings(): AppSettings {
  try {
    return { ...DEFAULT_SETTINGS, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? "{}") };
  } catch { return { ...DEFAULT_SETTINGS }; }
}

export function saveSettings(settings: AppSettings): void {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

export function loadActiveModel(): string | null {
  return localStorage.getItem(MODEL_KEY);
}

export function saveActiveModel(model: string): void {
  localStorage.setItem(MODEL_KEY, model);
}

export function titleFromMessage(content: string): string {
  const cleaned = content.replace(/\s+/g, " ").trim();
  return cleaned.length > 42 ? `${cleaned.slice(0, 42).trim()}…` : cleaned || "Новый диалог";
}
