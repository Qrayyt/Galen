import { describe, expect, it } from "vitest";
import { calculate, nativeFenceClosed, parseNativeUi } from "./galenUiSpec";

const wrap = (block: unknown) => JSON.stringify({ version: 1, fallback: "Summary", blocks: [block] });
describe("Galen native UI v1", () => {
  it("accepts all bounded native block types", () => {
    for (const block of [
      { type: "card", title: "A", text: "B" },
      { type: "table", columns: ["A"], rows: [["B"]] },
      { type: "progress", label: "A", value: 1, max: 2 },
      { type: "checklist", title: "A", items: ["B"] },
      { type: "diagram", steps: ["A", "B"] },
      { type: "calculator", label: "A", operation: "multiply", a: 2, b: 3 },
      { type: "input", label: "A", options: ["B"] },
      { type: "chart", spec: { type: "line", x: ["a", "b"], data: [1, 2] } },
    ]) expect(parseNativeUi(wrap(block))).not.toBeNull();
  });
  it("rejects malformed, unknown, executable, and oversized blocks", () => {
    for (const source of [
      "{", wrap({ type: "html", html: "<script>alert(1)</script>" }),
      wrap({ type: "card", title: "A", text: "B", onClick: "evil()" }),
      wrap({ type: "calculator", label: "A", operation: "eval", a: 1, b: 2 }),
      wrap({ type: "progress", label: "A", value: 3, max: 2 }),
      wrap({ type: "input", label: "A", options: ["same", "same"] }),
      wrap({ type: "chart", spec: { type: "line", x: ["a", "b"], data: [1, 2], onClick: "evil()" } }),
      wrap({ type: "chart", spec: { type: "line", x: ["a", "b"], series: [{ name: "A", data: [1, 2], url: "https://example.test" }] } }),
      wrap({ type: "table", columns: ["A"], rows: [["A", "B"]] }),
      wrap({ type: "card", title: "A", text: "x".repeat(64001) }),
      JSON.stringify({ version: 2, fallback: "A", blocks: [] }),
    ]) expect(parseNativeUi(source)).toBeNull();
  });
  it("evaluates only fixed arithmetic and guards invalid input", () => {
    expect(calculate("multiply", 4, 5)).toBe(20);
    expect(calculate("divide", 5, 0)).toBeNull();
    expect(calculate("add", Infinity, 1)).toBeNull();
  });
});


describe("native fence closure", () => {
  const payload = wrap({ type: "checklist", title: "Steps", items: ["Test"] });
  it.each(["```", "````", "~~~"] )("requires a matching %s closing marker", marker => {
    const open = marker + "galen-ui\n" + payload;
    expect(nativeFenceClosed(open, 0, open.length)).toBe(false);
    const closed = open + "\n" + marker;
    expect(nativeFenceClosed(closed, 0, closed.length)).toBe(true);
  });
  it("does not use a later or shorter fence as proof of closure", () => {
    const text = "````galen-ui\n" + payload + "\n```";
    expect(nativeFenceClosed(text, 0, text.length)).toBe(false);
    expect(nativeFenceClosed(text + "\n````", 0, text.length)).toBe(false);
  });
  it("accepts a matching quoted closing marker", () => {
    const text = "> ```galen-ui\n> " + payload + "\n> ```";
    expect(nativeFenceClosed(text, 2, text.length)).toBe(true);
  });
});
