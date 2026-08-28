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
    const light = MODEL_CATALOG.find((model) => model.id === "qwen3:4b")!;
    const heavy = MODEL_CATALOG.find((model) => model.id === "deepseek-r1:14b")!;
    expect(scoreModel(light, currentPc)).toBeGreaterThan(scoreModel(heavy, currentPc));
  });
  it("recommends Qwen 3.5 9B for a 16 GB VRAM workstation", () => {
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
    expect(recommendModel(workstation).id).toBe("qwen3.5:9b");
  });

  it("keeps the higher-quality 27B model below the best-fit workstation pick", () => {
    const workstation: HardwareInfo = { ...currentPc, ramTotalGb: 32, vramGb: 16, gpu: "RTX 5060 Ti" };
    const bestFit = recommendModel(workstation);
    const slower = MODEL_CATALOG.find((model) => model.id === "qwen3.5:27b")!;
    expect(bestFit.id).toBe("qwen3.5:9b");
    expect(slower.quality).toBeGreaterThan(bestFit.quality);
    expect(scoreModel(bestFit, workstation)).toBeGreaterThan(scoreModel(slower, workstation));
  });

  it("contains multiple distinct Dark models in every category", () => {
    const categories = ["chat", "vision", "image", "video", "voice"];
    for (const category of categories) {
      const dark = MODEL_CATALOG.filter((model) => model.category === category && model.dark);
      expect(dark.length, `not enough Dark models in ${category}`).toBeGreaterThanOrEqual(2);
      expect(dark.every((model) => model.tags.includes("Dark"))).toBe(true);
    }
  });

  it("offers fast and higher-quality Dark choices in major model categories", () => {
    for (const category of ["chat", "vision", "image", "video"]) {
      const dark = MODEL_CATALOG.filter((model) => model.category === category && model.dark);
      expect(dark.some((model) => model.speed === "Быстрая" || model.tags.includes("Быстрее"))).toBe(true);
      expect(Math.max(...dark.map((model) => model.quality)) - Math.min(...dark.map((model) => model.quality))).toBeGreaterThanOrEqual(8);
    }
  });

  it("does not recommend Dark models unless explicitly requested", () => {
    const workstation: HardwareInfo = { ...currentPc, ramTotalGb: 32, vramGb: 16, gpu: "RTX 5060 Ti" };
    expect(recommendModel(workstation).dark).not.toBe(true);
  });
});
