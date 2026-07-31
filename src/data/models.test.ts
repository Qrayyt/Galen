import { describe, expect, it } from "vitest";
import { MODEL_CATALOG, recommendModel, scoreModel } from "./models";
import type { HardwareInfo } from "../types";

const currentPc: HardwareInfo = {
  cpu: "Intel Core i5",
  cpuCores: 8,
  ramTotalGb: 24,
  gpu: "NVIDIA GeForce GTX 1650 SUPER",
  vramGb: 4,
  operatingSystem: "Arch Linux",
  desktop: "Hyprland",
  architecture: "x86_64",
};

describe("model recommendation", () => {
  it("recommends Qwen 3 4B for the current 4 GB VRAM PC", () => {
    expect(recommendModel(currentPc).id).toBe("qwen3:4b");
  });

  it("penalizes models that do not fit available memory", () => {
    const light = MODEL_CATALOG.find((model) => model.id === "llama3.2:3b")!;
    const heavy = MODEL_CATALOG.find((model) => model.id === "deepseek-r1:7b")!;
    expect(scoreModel(light, currentPc)).toBeGreaterThan(scoreModel(heavy, currentPc));
  });
});

