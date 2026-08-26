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
  it("recommends Qwen 3 14B for a 16 GB VRAM workstation", () => {
    const workstation: HardwareInfo = {
      cpu: "AMD Ryzen 9 5950X",
      cpuCores: 32,
      ramTotalGb: 32,
      gpu: "NVIDIA GeForce RTX 5060 Ti",
      vramGb: 16,
      operatingSystem: "Windows 11",
      desktop: "Windows",
      architecture: "x86_64",
    };
    expect(recommendModel(workstation).id).toBe("qwen3:14b");
  });
});

