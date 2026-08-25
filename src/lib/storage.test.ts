import { describe, expect, it } from "vitest";
import { titleFromMessage } from "./storage";

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

