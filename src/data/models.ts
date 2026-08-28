import type { HardwareInfo, ModelCatalogItem } from "../types";

const item = (value: ModelCatalogItem) => value;

export const MODEL_CATALOG: ModelCatalogItem[] = [
  item({ id: "qwen3.5:9b", name: "Qwen 3.5 9B", maker: "Alibaba", description: "Новая мультимодальная модель: сильный русский, код, инструменты и глубокие ответы.", parameters: "9B", downloadSizeGb: 6.6, minRamGb: 16, recommendedVramGb: 10, tags: ["Русский", "Агент", "Thinking"], speed: "Средняя", category: "chat", engine: "ollama", rating: 4.9, reviewCount: 0, quality: 94, capabilities: ["Диалог", "Код", "Инструменты", "Vision"] }),
  item({ id: "qwen3.5:27b", name: "Qwen 3.5 27B", maker: "Alibaba", description: "Глубже понимает сложные инструкции и пишет стабильнее, но часть весов будет выгружаться в RAM и ответы пойдут медленнее.", parameters: "27B", downloadSizeGb: 17.0, minRamGb: 32, recommendedVramGb: 24, tags: ["Максимум качества", "Thinking", "Vision"], speed: "Тяжёлая", category: "chat", engine: "ollama", rating: 4.9, reviewCount: 0, quality: 98, capabilities: ["Диалог", "Код", "Инструменты", "Vision"] }),
  item({ id: "qwen3:14b", name: "Qwen 3 14B", maker: "Alibaba", description: "Очень сильный локальный собеседник для сложных инструкций, анализа и агентных задач.", parameters: "14B", downloadSizeGb: 9.3, minRamGb: 24, recommendedVramGb: 14, tags: ["Русский", "Агент", "Thinking"], speed: "Тяжёлая", category: "chat", engine: "ollama", rating: 4.8, reviewCount: 0, quality: 92, capabilities: ["Диалог", "Код", "Инструменты"] }),
  item({ id: "qwen3:8b", name: "Qwen 3 8B", maker: "Alibaba", description: "Оптимальный баланс качества и скорости для повседневного локального ассистента.", parameters: "8B", downloadSizeGb: 5.2, minRamGb: 16, recommendedVramGb: 8, tags: ["Русский", "Thinking"], speed: "Средняя", category: "chat", engine: "ollama", rating: 4.7, reviewCount: 0, quality: 87, capabilities: ["Диалог", "Инструменты"] }),
  item({ id: "qwen3:4b", name: "Qwen 3 4B", maker: "Alibaba", description: "Быстрый вариант для коротких вопросов и простых действий без долгого ожидания.", parameters: "4B", downloadSizeGb: 2.5, minRamGb: 8, recommendedVramGb: 4, tags: ["Русский", "Быстрая"], speed: "Быстрая", category: "chat", engine: "ollama", rating: 4.4, reviewCount: 0, quality: 76, capabilities: ["Диалог", "Инструменты"] }),
  item({ id: "deepseek-r1:14b", name: "DeepSeek R1 14B", maker: "DeepSeek", description: "Медленнее, но глубже разбирает математику, логику и многошаговые задачи.", parameters: "14B", downloadSizeGb: 9.0, minRamGb: 24, recommendedVramGb: 14, tags: ["Reasoning", "Математика"], speed: "Тяжёлая", category: "chat", engine: "ollama", rating: 4.7, reviewCount: 0, quality: 91, capabilities: ["Анализ", "Математика"] }),
  item({ id: "qwen2.5-coder:14b", name: "Qwen 2.5 Coder 14B", maker: "Alibaba", description: "Специалист по большим проектам, рефакторингу, поиску ошибок и терминалу.", parameters: "14B", downloadSizeGb: 9.0, minRamGb: 24, recommendedVramGb: 14, tags: ["Код", "Агент"], speed: "Тяжёлая", category: "chat", engine: "ollama", rating: 4.8, reviewCount: 0, quality: 93, capabilities: ["Код", "Терминал"] }),

  item({ id: "qwen3-vl:8b", name: "Qwen 3 VL 8B", maker: "Alibaba", description: "Лучший универсальный анализ фото, интерфейсов, схем, документов и OCR на этом классе ПК.", parameters: "8B", downloadSizeGb: 6.1, minRamGb: 16, recommendedVramGb: 10, tags: ["Vision", "OCR", "Интерфейсы"], speed: "Средняя", category: "vision", engine: "ollama", rating: 4.9, reviewCount: 0, quality: 95, capabilities: ["Фото", "OCR", "Скриншоты", "Инструменты"] }),
  item({ id: "qwen3-vl:30b", name: "Qwen 3 VL 30B", maker: "Alibaba", description: "Сильнее разбирает сложные сцены, интерфейсы и документы. На 16 ГБ VRAM запустится с offload, поэтому будет заметно медленнее.", parameters: "30B MoE", downloadSizeGb: 20.0, minRamGb: 32, recommendedVramGb: 24, tags: ["Максимум качества", "Vision", "Thinking"], speed: "Тяжёлая", category: "vision", engine: "ollama", rating: 4.9, reviewCount: 0, quality: 98, capabilities: ["Фото", "OCR", "Скриншоты", "Инструменты"] }),
  item({ id: "qwen3.5:9b", name: "Qwen 3.5 9B Vision", maker: "Alibaba", description: "Одна модель для текста и изображений с сильным рассуждением и tool calling.", parameters: "9B", downloadSizeGb: 6.6, minRamGb: 16, recommendedVramGb: 10, tags: ["Vision", "Агент"], speed: "Средняя", category: "vision", engine: "ollama", rating: 4.9, reviewCount: 0, quality: 94, capabilities: ["Фото", "Текст", "Инструменты"] }),
  item({ id: "gemma3:12b", name: "Gemma 3 12B", maker: "Google", description: "Точный анализ изображений и длинных документов, но заметно тяжелее.", parameters: "12B", downloadSizeGb: 8.1, minRamGb: 20, recommendedVramGb: 13, tags: ["Vision", "140+ языков"], speed: "Тяжёлая", category: "vision", engine: "ollama", rating: 4.7, reviewCount: 0, quality: 91, capabilities: ["Фото", "Документы", "OCR"] }),
  item({ id: "gemma3:4b", name: "Gemma 3 4B", maker: "Google", description: "Компактная vision-модель для быстрых вопросов по фото и скриншотам.", parameters: "4B", downloadSizeGb: 3.3, minRamGb: 8, recommendedVramGb: 5, tags: ["Vision", "Быстрая"], speed: "Быстрая", category: "vision", engine: "ollama", rating: 4.5, reviewCount: 0, quality: 80, capabilities: ["Фото", "OCR"] }),
  item({ id: "minicpm-v:8b", name: "MiniCPM-V 2.6", maker: "OpenBMB", description: "Экономно обрабатывает большие изображения и особенно хорошо читает мелкий текст.", parameters: "8B", downloadSizeGb: 5.5, minRamGb: 16, recommendedVramGb: 9, tags: ["Vision", "OCR"], speed: "Средняя", category: "vision", engine: "ollama", rating: 4.6, reviewCount: 0, quality: 88, capabilities: ["OCR", "Несколько фото"] }),

  item({ id: "comfy:flux-schnell", name: "FLUX.1 Schnell", maker: "Black Forest Labs", description: "Качественные изображения за 4 шага. Хороший базовый генератор для локального ComfyUI.", parameters: "12B", downloadSizeGb: 17.2, minRamGb: 32, recommendedVramGb: 16, tags: ["Фото", "4 шага"], speed: "Тяжёлая", category: "image", engine: "comfyui", rating: 4.8, reviewCount: 0, quality: 93, capabilities: ["Text to image", "Стили"], status: "integration" }),
  item({ id: "comfy:sdxl-turbo", name: "SDXL Turbo", maker: "Stability AI", description: "Очень быстрая генерация и превью, качество ниже FLUX, зато результат почти сразу.", parameters: "3.5B", downloadSizeGb: 6.9, minRamGb: 16, recommendedVramGb: 8, tags: ["Быстрая", "Preview"], speed: "Быстрая", category: "image", engine: "comfyui", rating: 4.4, reviewCount: 0, quality: 78, capabilities: ["Text to image", "Image to image"], status: "integration" }),
  item({ id: "comfy:flux-dev", name: "FLUX.1 Dev", maker: "Black Forest Labs", description: "Медленнее и тяжелее, зато лучше держит детали, композицию и сложные промпты.", parameters: "12B", downloadSizeGb: 23.8, minRamGb: 48, recommendedVramGb: 24, tags: ["Максимум качества"], speed: "Тяжёлая", category: "image", engine: "comfyui", rating: 4.9, reviewCount: 0, quality: 97, capabilities: ["Text to image", "Image to image"], status: "integration" }),

  item({ id: "comfy:wan22-5b", name: "Wan 2.2 TI2V 5B", maker: "Alibaba", description: "Текст или изображение в короткое видео. Версия 5B рассчитана на потребительские GPU.", parameters: "5B", downloadSizeGb: 14.5, minRamGb: 32, recommendedVramGb: 12, tags: ["Видео", "I2V"], speed: "Тяжёлая", category: "video", engine: "comfyui", rating: 4.7, reviewCount: 0, quality: 89, capabilities: ["Text to video", "Image to video"], status: "integration" }),
  item({ id: "comfy:ltx-video", name: "LTX Video 0.9.5", maker: "Lightricks", description: "Лёгкая 2B-версия для быстрых локальных экспериментов. Уступает новым большим LTX, зато реалистичнее по скорости на домашнем ПК.", parameters: "2B", downloadSizeGb: 8.0, minRamGb: 24, recommendedVramGb: 10, tags: ["Видео", "Быстрее"], speed: "Средняя", category: "video", engine: "comfyui", rating: 4.4, reviewCount: 0, quality: 81, capabilities: ["Text to video", "Image to video"], status: "integration" }),
  item({ id: "comfy:ltx-23", name: "LTX 2.3 22B", maker: "Lightricks", description: "Новая тяжёлая модель с более чистым движением, вертикальным видео и синхронным аудио. На 16 ГБ VRAM потребует offload и много времени.", parameters: "22B", downloadSizeGb: 26.0, minRamGb: 48, recommendedVramGb: 24, tags: ["Максимум качества", "Аудио + видео"], speed: "Тяжёлая", category: "video", engine: "comfyui", rating: 4.9, reviewCount: 0, quality: 98, capabilities: ["Text to video", "Image to video", "Аудио"], status: "integration" }),
  item({ id: "comfy:wan22-14b", name: "Wan 2.2 14B", maker: "Alibaba", description: "Существенно лучше по движению и деталям, но для 16 ГБ VRAM будет медленно с offload.", parameters: "14B", downloadSizeGb: 28.0, minRamGb: 48, recommendedVramGb: 24, tags: ["Максимум качества"], speed: "Тяжёлая", category: "video", engine: "comfyui", rating: 4.9, reviewCount: 0, quality: 96, capabilities: ["Text to video", "Image to video"], status: "integration" }),

  item({ id: "voice:galen-neural", name: "Galen Neural", maker: "Microsoft Neural", description: "Глубокий естественный русский голос Дмитрия. Работает через интернет без API-ключа.", parameters: "Neural", downloadSizeGb: 0, minRamGb: 4, recommendedVramGb: 0, tags: ["Русский", "Естественный"], speed: "Быстрая", category: "voice", engine: "builtin", rating: 4.8, reviewCount: 0, quality: 94, capabilities: ["Озвучка", "Интонация"] }),
  item({ id: "voice:system", name: "Системный голос", maker: "Windows / Linux", description: "Полностью офлайн и мгновенно, но звучит заметно более роботизированно.", parameters: "System", downloadSizeGb: 0, minRamGb: 2, recommendedVramGb: 0, tags: ["Офлайн"], speed: "Быстрая", category: "voice", engine: "builtin", rating: 3.4, reviewCount: 0, quality: 55, capabilities: ["Озвучка"] }),
];

export const MODEL_CATEGORIES = [
  { id: "chat" as const, label: "Текст", description: "Диалог, код и агентные задачи" },
  { id: "vision" as const, label: "Vision", description: "Фото, скриншоты и документы" },
  { id: "image" as const, label: "Изображения", description: "Локальная генерация через ComfyUI" },
  { id: "video" as const, label: "Видео", description: "Text-to-video и image-to-video" },
  { id: "voice" as const, label: "Голос", description: "Нейронная озвучка ответов" },
];

export function modelFit(model: ModelCatalogItem, hardware: HardwareInfo): number {
  if (model.engine === "builtin") return 100;
  const availableVram = hardware.vramGb ?? Math.max(0, hardware.ramTotalGb * 0.35);
  const vramRatio = model.recommendedVramGb ? availableVram / model.recommendedVramGb : 1;
  const ramRatio = hardware.ramTotalGb / model.minRamGb;
  const raw = Math.min(1.08, vramRatio) * 68 + Math.min(1.05, ramRatio) * 25 + (model.speed === "Быстрая" ? 7 : 2);
  return Math.max(8, Math.min(100, Math.round(raw)));
}

export function scoreModel(model: ModelCatalogItem, hardware: HardwareInfo): number {
  return modelFit(model, hardware) * 0.62 + model.quality * 0.38;
}

export function recommendModel(hardware: HardwareInfo, category: ModelCatalogItem["category"] = "chat"): ModelCatalogItem {
  return MODEL_CATALOG.filter((model) => model.category === category)
    .sort((a, b) => scoreModel(b, hardware) - scoreModel(a, hardware))[0];
}

export function formatBytes(bytes: number): string {
  if (!bytes) return "0 Б";
  const units = ["Б", "КБ", "МБ", "ГБ", "ТБ"];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** index).toFixed(index > 2 ? 1 : 0)} ${units[index]}`;
}
