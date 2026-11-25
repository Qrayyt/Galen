import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createAgentChatStore } from "@/store/agentChat";
import { readComposerDraft, writeComposerDraft } from "@/components/agentchat/composerDrafts";

const KEY = "jarvis.agentChat.leadSession.v1";
const session = { session_id: "saved", surface: "jarvis", title: "Saved", provider: "claude-api", model: "", effort: "", cwd: "", permission_mode: "ask", created_ms: 1, updated_ms: 2, message_count: 1, preview: "" };
class Socket { close() {} }
beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal("WebSocket", Socket);
  vi.stubGlobal("fetch", vi.fn(async (input: string) => new Response(JSON.stringify(
    String(input).includes("/sessions/saved") ? { session, events: [] } : { providers: [], sessions: [] }
  ), { status: 200 })));
});
afterEach(() => { vi.unstubAllGlobals(); localStorage.clear(); });

describe("restore selected ordinary chat without resurrecting a new blank chat", () => {
  it("restores the selected durable session once", async () => {
    localStorage.setItem(KEY, "saved");
    const store = createAgentChatStore("jarvis");
    await store.getState().restoreLastChat();
    expect(store.getState().activeSessionId).toBe("saved");
    store.getState().disconnect();
  });
  it("does not reopen an old conversation after explicitly starting new", async () => {
    localStorage.setItem(KEY, "saved");
    const store = createAgentChatStore("jarvis");
    store.getState().newChat();
    await store.getState().restoreLastChat();
    expect(store.getState().activeSessionId).toBeNull();
    expect(localStorage.getItem(KEY)).toBeNull();
    store.getState().disconnect();
  });
  it("restores draft text only for its own chat and store namespace", () => {
    const store = createAgentChatStore("jarvis", "draft-test");
    writeComposerDraft(store, "saved", { text: "unsent", choices: [] });
    const restarted = createAgentChatStore("jarvis", "draft-test");
    expect(readComposerDraft(restarted, "saved").text).toBe("unsent");
    expect(readComposerDraft(restarted, "other").text).toBe("");
    expect(readComposerDraft(createAgentChatStore("jarvis", "other"), "saved").text).toBe("");
    writeComposerDraft(restarted, "saved", { text: "", choices: [] });
    expect(readComposerDraft(createAgentChatStore("jarvis", "draft-test"), "saved").text).toBe("");
  });
});
