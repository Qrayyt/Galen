import { describe, expect, it } from "vitest";
import { calculate, parseNativeUi } from "./galenUiSpec";

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
