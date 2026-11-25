import { useMemo } from "react";
import { createStore, useStore } from "zustand";

import type { AgentChatStoreHook } from "@/store/agentChat";
import type { ToolChoice } from "./toolChoices";

export interface MessageDraft {
  text: string;
  choices: ToolChoice[];
}

const EMPTY_DRAFT: MessageDraft = { text: "", choices: [] };
const createDraftStore = () => createStore<{ drafts: Map<string | null, MessageDraft> }>(() => ({ drafts: new Map() }));
// Keep unsent text in memory, owned by its chat store, across view unmounts.
// Separate stores also isolate the front page from IDE panes and other agents.
const stores = new WeakMap<AgentChatStoreHook, ReturnType<typeof createDraftStore>>();
export interface ComposerDraftTarget { sessionId: string | null; superseded?: boolean }
const blankTargets = new WeakMap<AgentChatStoreHook, ComposerDraftTarget>();
const namespaces = new WeakMap<AgentChatStoreHook, string>();

export function registerComposerDraftPersistence(chat: AgentChatStoreHook, namespace: string) {
  namespaces.set(chat, namespace);
}

function storageKey(chat: AgentChatStoreHook, sessionId: string): string | null {
  const ns = namespaces.get(chat);
  return ns ? `galen.composer.text.v1:${encodeURIComponent(ns)}:${encodeURIComponent(sessionId)}` : null;
}

function storedText(chat: AgentChatStoreHook, sessionId: string | null): string {
  const key = sessionId === null ? null : storageKey(chat, sessionId);
  try { return key ? (localStorage.getItem(key) ?? "").slice(0, 200000) : ""; } catch { return ""; }
}

function persistText(chat: AgentChatStoreHook, sessionId: string | null, text: string) {
  const key = sessionId === null ? null : storageKey(chat, sessionId);
  if (!key) return;
  try {
    if (text) localStorage.setItem(key, text.slice(0, 200000));
    else localStorage.removeItem(key);
  } catch { /* local storage unavailable; keep in-memory draft */ }
}

/** Capture before sending so a late failure restores the chat that was created. */
export function captureComposerDraftTarget(chat: AgentChatStoreHook, sessionId: string | null): ComposerDraftTarget {
  if (sessionId !== null) return { sessionId };
  let target = blankTargets.get(chat);
  if (!target || target.sessionId !== null) {
    target = { sessionId: null };
    blankTargets.set(chat, target);
  }
  return target;
}

export function resetBlankComposerDraftTarget(chat: AgentChatStoreHook): void {
  const previous = blankTargets.get(chat);
  if (previous?.sessionId === null) previous.superseded = true;
  writeComposerDraft(chat, null, EMPTY_DRAFT);
  blankTargets.set(chat, { sessionId: null });
}

/** Transfer unsent text/chips before opening the assigned session. */
export function bindComposerDraftTarget(chat: AgentChatStoreHook, target: ComposerDraftTarget, sessionId: string): boolean {
  const currentBlank = target.sessionId === null && blankTargets.get(chat) === target;
  target.sessionId = sessionId;
  target.superseded = false;
  if (!currentBlank) return false;
  const source = readComposerDraft(chat, null);
  const destination = readComposerDraft(chat, sessionId);
  writeComposerDraft(chat, sessionId, {
    text: [source.text, destination.text].filter(Boolean).join("\n"),
    choices: [...source.choices, ...destination.choices.filter((row) => !source.choices.some((sent) => sent.id === row.id))],
  });
  writeComposerDraft(chat, null, EMPTY_DRAFT);
  return true;
}

export function composerDraftsFor(chat: AgentChatStoreHook) {
  let store = stores.get(chat);
  if (!store) {
    store = createDraftStore();
    stores.set(chat, store);
  }
  return store;
}

export function readComposerDraft(chat: AgentChatStoreHook, sessionId: string | null): MessageDraft {
  return composerDraftsFor(chat).getState().drafts.get(sessionId) ?? { text: storedText(chat, sessionId), choices: [] };
}

export function writeComposerDraft(chat: AgentChatStoreHook, sessionId: string | null, draft: MessageDraft) {
  const store = composerDraftsFor(chat);
  const previous = readComposerDraft(chat, sessionId);
  if (previous.text === draft.text && JSON.stringify(previous.choices) === JSON.stringify(draft.choices)) return;
  persistText(chat, sessionId, draft.text);
  store.setState(({ drafts }) => {
    const next = new Map(drafts);
    if (draft.text || draft.choices.length) next.set(sessionId, draft);
    else next.set(sessionId, EMPTY_DRAFT);
    return { drafts: next };
  });
}

export function useComposerDraft(chat: AgentChatStoreHook, sessionId: string | null): MessageDraft {
  const store = composerDraftsFor(chat);
  // Stable fallback object; Zustand selectors must not allocate on every read.
  const fallback = useMemo(() => {
    const text = storedText(chat, sessionId);
    return text ? { text, choices: [] } : EMPTY_DRAFT;
  }, [chat, sessionId]);
  return useStore(store, (state) => state.drafts.get(sessionId) ?? fallback);
}
