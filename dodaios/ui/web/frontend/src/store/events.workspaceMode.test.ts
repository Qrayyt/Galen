import { describe, expect, it } from "vitest";
import { initialSectionFromSearch } from "./events";

describe("workspace mode restoration", () => {
  it("restores Work on ordinary launch", () => {
    expect(initialSectionFromSearch("", "agentic-ide")).toBe("agentic-ide");
    expect(initialSectionFromSearch("", "chats")).toBe("chats");
  });
  it("preserves explicit deep links and defaults outside workspace", () => {
    expect(initialSectionFromSearch("?view=chats&solo=1", "agentic-ide")).toBe("chats");
    expect(initialSectionFromSearch("?doc=notes", "agentic-ide")).toBe("docs");
    expect(initialSectionFromSearch("", "settings")).toBe("chats");
  });
});
