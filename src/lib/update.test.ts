import { describe, expect, it } from "vitest";
import { isStableVersion, updateProgress } from "./update";

describe("signed update policy", () => {
  it("accepts only stable semantic versions", () => {
    expect(isStableVersion("0.5.0")).toBe(true);
    expect(isStableVersion("v1.2.3")).toBe(true);
    expect(isStableVersion("0.5.0-beta.1")).toBe(false);
    expect(isStableVersion("nightly")).toBe(false);
  });

  it("reports bounded download progress", () => {
    expect(updateProgress(25, 100).percent).toBe(25);
    expect(updateProgress(150, 100).percent).toBe(100);
    expect(updateProgress(0, 0).percent).toBe(0);
    expect(updateProgress(100, 100, "installing")).toMatchObject({ percent: 100, status: "installing" });
  });
});
