import { describe, expect, it } from "vitest";
import { isVisionModel, resolveVisionModel } from "./modelRouting";
import type { OllamaModel } from "../types";

const model = (name: string, capabilities?: string[]): OllamaModel => ({
  name,
  capabilities,
  size: 1,
  modifiedAt: "",
});

describe("vision model routing", () => {
  it("uses capabilities reported by Ollama even for an unfamiliar model name", () => {
    expect(isVisionModel(model("local-custom:4b", ["completion", "vision"]))).toBe(true);
  });

  it("keeps known multimodal families as a fallback for older Ollama versions", () => {
    expect(isVisionModel(model("qwen3-vl:4b"))).toBe(true);
    expect(isVisionModel(model("qwen3:4b"))).toBe(false);
  });

  it("prefers the dedicated vision model, then the active multimodal chat model", () => {
    const models = [model("qwen3:4b"), model("gemma3:4b", ["vision"]), model("qwen3-vl:8b", ["vision"])];
    expect(resolveVisionModel(models, "qwen3-vl:8b", "gemma3:4b")).toBe("qwen3-vl:8b");
    expect(resolveVisionModel(models, "missing:latest", "gemma3:4b")).toBe("gemma3:4b");
  });
});
