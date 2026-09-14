import type { OllamaModel } from "../types";

const normalized = (name: string) => name.replace(":latest", "").toLowerCase();

export function isVisionModel(model: OllamaModel | string): boolean {
  if (typeof model !== "string" && model.capabilities?.some((capability) => capability.toLowerCase() === "vision")) {
    return true;
  }
  const name = typeof model === "string" ? model : model.name;
  return /gemma[34]|qwen3\.5|qwen(?:2\.5|3)-?vl|llava|llama3\.2-vision|minicpm-v|moondream|bakllava/i.test(name);
}

export function resolveVisionModel(
  models: OllamaModel[],
  preferred: string | null,
  activeText: string | null,
): string | null {
  const preferredModel = models.find(
    (model) => normalized(model.name) === normalized(preferred ?? "") && isVisionModel(model),
  );
  if (preferredModel) return preferredModel.name;

  const activeTextModel = models.find(
    (model) => normalized(model.name) === normalized(activeText ?? "") && isVisionModel(model),
  );
  return activeTextModel?.name ?? models.find(isVisionModel)?.name ?? null;
}

export function sameModel(left: string | null | undefined, right: string | null | undefined): boolean {
  return normalized(left ?? "") === normalized(right ?? "");
}
