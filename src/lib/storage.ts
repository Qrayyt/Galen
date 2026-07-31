import type { ChatMessage } from "../types";

const HISTORY_KEY = "galen.chat.history.v1";
const MODEL_KEY = "galen.active-model.v1";

export function loadHistory(): ChatMessage[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as ChatMessage[];
    return Array.isArray(parsed) ? parsed.slice(-100) : [];
  } catch {
    return [];
  }
}

export function saveHistory(messages: ChatMessage[]): void {
  const stable = messages.filter((message) => !message.pending).slice(-100);
  localStorage.setItem(HISTORY_KEY, JSON.stringify(stable));
}

export function loadActiveModel(): string | null {
  return localStorage.getItem(MODEL_KEY);
}

export function saveActiveModel(model: string): void {
  localStorage.setItem(MODEL_KEY, model);
}

