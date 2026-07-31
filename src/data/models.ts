import type { HardwareInfo, ModelCatalogItem } from "../types";

export const MODEL_CATALOG: ModelCatalogItem[] = [
  {
    id: "qwen3:4b",
    name: "Qwen 3 4B",
    maker: "Alibaba",
    description: "Лучший баланс русского языка, рассуждений и скорости для обычного компьютера.",
    parameters: "4B",
    downloadSizeGb: 2.5,
    minRamGb: 8,
    recommendedVramGb: 4,
    tags: ["Рекомендуем", "Русский", "Универсальная"],
    speed: "Быстрая",
  },
  {
    id: "gemma3:4b",
    name: "Gemma 3 4B",
    maker: "Google",
    description: "Компактная универсальная модель с хорошим качеством диалога и анализа.",
    parameters: "4B",
    downloadSizeGb: 3.3,
    minRamGb: 8,
    recommendedVramGb: 4,
    tags: ["Универсальная", "Vision"],
    speed: "Быстрая",
  },
  {
    id: "llama3.2:3b",
    name: "Llama 3.2 3B",
    maker: "Meta",
    description: "Очень быстрая модель для коротких ответов и простых повседневных задач.",
    parameters: "3B",
    downloadSizeGb: 2.0,
    minRamGb: 6,
    recommendedVramGb: 3,
    tags: ["Лёгкая", "Быстрая"],
    speed: "Быстрая",
  },
  {
    id: "phi4-mini:3.8b",
    name: "Phi 4 Mini",
    maker: "Microsoft",
    description: "Небольшая модель с упором на точные инструкции, код и логические задачи.",
    parameters: "3.8B",
    downloadSizeGb: 2.5,
    minRamGb: 8,
    recommendedVramGb: 4,
    tags: ["Код", "Логика"],
    speed: "Быстрая",
  },
  {
    id: "qwen3:8b",
    name: "Qwen 3 8B",
    maker: "Alibaba",
    description: "Более глубокие ответы и лучшее выполнение сложных инструкций, если хватает памяти.",
    parameters: "8B",
    downloadSizeGb: 5.2,
    minRamGb: 16,
    recommendedVramGb: 8,
    tags: ["Русский", "Рассуждения"],
    speed: "Средняя",
  },
  {
    id: "mistral:7b",
    name: "Mistral 7B",
    maker: "Mistral AI",
    description: "Проверенная универсальная модель для текста, идей и деловых задач.",
    parameters: "7B",
    downloadSizeGb: 4.1,
    minRamGb: 12,
    recommendedVramGb: 6,
    tags: ["Универсальная"],
    speed: "Средняя",
  },
  {
    id: "qwen2.5-coder:7b",
    name: "Qwen 2.5 Coder 7B",
    maker: "Alibaba",
    description: "Специализированная локальная модель для программирования и работы с терминалом.",
    parameters: "7B",
    downloadSizeGb: 4.7,
    minRamGb: 12,
    recommendedVramGb: 6,
    tags: ["Код", "Агент"],
    speed: "Средняя",
  },
  {
    id: "deepseek-r1:7b",
    name: "DeepSeek R1 7B",
    maker: "DeepSeek",
    description: "Модель с рассуждениями для анализа, математики и многошаговых задач.",
    parameters: "7B",
    downloadSizeGb: 4.7,
    minRamGb: 16,
    recommendedVramGb: 8,
    tags: ["Рассуждения"],
    speed: "Тяжёлая",
  },
];

export function scoreModel(model: ModelCatalogItem, hardware: HardwareInfo): number {
  const effectiveMemory = hardware.vramGb ?? Math.max(0, hardware.ramTotalGb * 0.35);
  const fitsRam = hardware.ramTotalGb >= model.minRamGb;
  const memoryDelta = effectiveMemory - model.recommendedVramGb;
  const fitScore = fitsRam ? 40 : -80;
  const gpuScore = memoryDelta >= 0 ? 35 - memoryDelta * 1.5 : memoryDelta * 14;
  const qualityScore = Number.parseFloat(model.parameters) * 2.2;
  const languageBonus = model.tags.includes("Русский") ? 18 : 0;
  const speedBonus = model.speed === "Быстрая" ? 8 : model.speed === "Средняя" ? 3 : -4;
  return fitScore + gpuScore + qualityScore + languageBonus + speedBonus;
}

export function recommendModel(hardware: HardwareInfo): ModelCatalogItem {
  return [...MODEL_CATALOG].sort((a, b) => scoreModel(b, hardware) - scoreModel(a, hardware))[0];
}

export function formatBytes(bytes: number): string {
  if (!bytes) return "0 Б";
  const units = ["Б", "КБ", "МБ", "ГБ", "ТБ"];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** index).toFixed(index > 2 ? 1 : 0)} ${units[index]}`;
}

