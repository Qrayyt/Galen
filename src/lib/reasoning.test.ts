import { describe, expect, it } from "vitest";
import { splitReasoningText, streamingVisibleAnswer, visibleAnswer } from "./reasoning";

describe("reasoning isolation", () => {
  it("removes complete reasoning tags from visible content", () => {
    const result = splitReasoningText("<think>Проверяю факты</think>\n\n## Ответ\nГотово.");
    expect(result.answer).toBe("## Ответ\nГотово.");
    expect(result.reasoning).toBe("Проверяю факты");
  });

  it("hides an unfinished reasoning block instead of leaking it", () => {
    expect(visibleAnswer("Полезный ответ.\n<thinking>Внутренний хвост")).toBe("Полезный ответ.");
  });

  it("supports channel-style reasoning templates", () => {
    const result = splitReasoningText("<|channel|>analysis Скрыто<|channel|>final Итог");
    expect(result.answer).toBe("Итог");
    expect(result.reasoning).toBe("Скрыто");
  });

  it("preserves spaces and newlines that arrive as separate stream chunks", () => {
    const chunks = ["Привет", " ", "Илья", "!\n", "Как", " ", "дела?"];
    let buffer = "";
    const snapshots = chunks.map((chunk) => streamingVisibleAnswer(buffer += chunk));
    expect(snapshots.at(-1)).toBe("Привет Илья!\nКак дела?");
    expect(visibleAnswer(snapshots.at(-1)!)).toBe("Привет Илья!\nКак дела?");
  });
});
