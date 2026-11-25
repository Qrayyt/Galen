import { beforeEach, describe, expect, it } from "vitest";
import { readControlState, writeControlState, uiBlockKey } from "./nativeUiState";

beforeEach(() => localStorage.clear());
describe("message-scoped native controls", () => {
  it("keeps state across remounts but not across messages or changed blocks", () => {
    const spec = { type: "checklist", title: "A", items: ["x"] };
    const key = uiBlockKey("turn-1/message-1", 0, 0, spec);
    writeControlState(key, { checks: [0] });
    expect(readControlState(key).checks).toEqual([0]);
    expect(readControlState(uiBlockKey("turn-2/message-1", 0, 0, spec))).toEqual({});
    expect(readControlState(uiBlockKey("turn-1/message-1", 0, 0, {...spec, title: "B"}))).toEqual({});
    expect(readControlState(uiBlockKey(undefined, 0, 0, spec))).toEqual({});
  });
  it("bounds and validates persisted values", () => {
    writeControlState("key", { checks: [0, 99, -1], selection: 99, a: "x".repeat(41) });
    expect(readControlState("key")).toEqual({ checks: [0], selection: undefined, a: undefined, b: undefined });
    for (let i = 0; i < 110; i++) writeControlState("k"+i, {checks:[0]});
    expect(readControlState("key")).toEqual({});
  });
});
