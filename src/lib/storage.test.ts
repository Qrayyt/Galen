import { describe, expect, it } from "vitest";
import type { Conversation } from "../types";
import { DEFAULT_SETTINGS } from "../types";
import { loadConversations, loadSettings, saveConversations, titleFromMessage } from "./storage";

function mockStorage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
      clear: () => values.clear(),
    },
  });
  return values;
}

describe("conversation titles", () => {
  it("normalizes whitespace and keeps short prompts readable", () => {
    expect(titleFromMessage("  Помоги   с проектом  ")).toBe("Помоги с проектом");
  });

  it("truncates long titles without splitting the layout", () => {
    const title = titleFromMessage("Очень длинный запрос пользователя, который должен стать компактным названием нового диалога");
    expect(title.endsWith("…")).toBe(true);
    expect(title.length).toBeLessThanOrEqual(43);
  });
});

describe("non-destructive v0.5 storage migration", () => {
  it("adds the new permission setting disabled without overwriting old preferences", () => {
    mockStorage({
      "galen.settings.v2": JSON.stringify({ webEnabled: false, customInstructions: "Отвечай кратко" }),
    });
    expect(loadSettings()).toMatchObject({
      ...DEFAULT_SETTINGS,
      webEnabled: false,
      customInstructions: "Отвечай кратко",
      alwaysAllowTerminal: false,
    });
  });

  it("retains attachment payloads needed after an installer update", () => {
    const values = mockStorage();
    const now = Date.now();
    const chats: Conversation[] = [{
      id: "chat-1",
      title: "Фото",
      createdAt: now,
      updatedAt: now,
      reasoning: "medium",
      messages: [{
        id: "message-1",
        role: "user",
        content: "Что на фото?",
        createdAt: now,
        attachments: [{
          id: "attachment-1",
          name: "photo.png",
          mime: "image/png",
          size: 3,
          kind: "image",
          dataUrl: "data:image/png;base64,AAEC",
        }],
      }],
    }];

    saveConversations(chats);
    expect(values.get("galen.conversations.v2")).toContain("data:image/png;base64,AAEC");
    expect(loadConversations()[0].messages[0].attachments?.[0].dataUrl).toBe("data:image/png;base64,AAEC");
  });
});

