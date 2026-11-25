import { parseChartSpec, type ChartSpec } from "./chartSpec";

export const GALEN_UI_FENCE = "galen-ui";
export type NativeBlock =
  | { type: "card"; title: string; text: string }
  | { type: "table"; columns: string[]; rows: string[][] }
  | { type: "progress"; label: string; value: number; max: number }
  | { type: "checklist"; title: string; items: string[] }
  | { type: "diagram"; steps: string[] }
  | { type: "calculator"; label: string; operation: "add" | "subtract" | "multiply" | "divide"; a: number; b: number }
  | { type: "input"; label: string; options: string[] }
  | { type: "chart"; spec: ChartSpec };
export interface NativeUi { version: 1; blocks: NativeBlock[]; fallback: string }

const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const keys = (v: Record<string, unknown>, allowed: string[]) => Object.keys(v).every(k => allowed.includes(k));
const str = (v: unknown, max = 1000): v is string => typeof v === "string" && v.length <= max && v.trim().length > 0;
const strings = (v: unknown, max: number, size = 200): v is string[] => Array.isArray(v) && v.length > 0 && v.length <= max && v.every(x => str(x, size));
const number = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && Math.abs(v) <= 1e12;

function block(v: unknown): NativeBlock | null {
  if (!object(v)) return null;
  switch (v.type) {
    case "card":
      return keys(v, ["type", "title", "text"]) && str(v.title, 120) && str(v.text, 4000) ? { type: v.type, title: v.title, text: v.text } : null;
    case "table":
      return keys(v, ["type", "columns", "rows"]) && strings(v.columns, 8, 80) && Array.isArray(v.rows) && v.rows.length <= 40 &&
        v.rows.every(row => Array.isArray(row) && row.length === (v.columns as string[]).length && row.every(cell => typeof cell === "string" && cell.length <= 500))
        ? { type: v.type, columns: v.columns, rows: v.rows as string[][] } : null;
    case "progress":
      return keys(v, ["type", "label", "value", "max"]) && str(v.label, 120) && number(v.value) && number(v.max) && v.max > 0 && v.value >= 0 && v.value <= v.max
        ? { type: v.type, label: v.label, value: v.value, max: v.max } : null;
    case "checklist":
      return keys(v, ["type", "title", "items"]) && str(v.title, 120) && strings(v.items, 30, 300) ? { type: v.type, title: v.title, items: v.items } : null;
    case "diagram":
      return keys(v, ["type", "steps"]) && strings(v.steps, 12, 200) ? { type: v.type, steps: v.steps } : null;
    case "calculator":
      return keys(v, ["type", "label", "operation", "a", "b"]) && str(v.label, 120) && (v.operation === "add" || v.operation === "subtract" || v.operation === "multiply" || v.operation === "divide") && number(v.a) && number(v.b)
        ? { type: v.type, label: v.label, operation: v.operation, a: v.a, b: v.b } : null;
    case "input":
      return keys(v, ["type", "label", "options"]) && str(v.label, 120) && strings(v.options, 12, 150) && new Set(v.options).size === v.options.length ? { type: v.type, label: v.label, options: v.options } : null;
    case "chart": {
      if (!keys(v, ["type", "spec"]) || !object(v.spec)) return null;
      // The legacy chart parser deliberately accepts aliases and ignores extra
      // fields. Native UI's versioned contract is stricter: reject model-defined
      // properties instead of silently interpreting a different schema.
      if (!keys(v.spec, ["type", "title", "note", "subtitle", "source", "unit", "value", "delta", "x", "labels", "data", "values", "series"])) return null;
      if (Array.isArray(v.spec.series) && v.spec.series.some(item => !object(item) || !keys(item, ["name", "data", "values"]))) return null;
      const spec = parseChartSpec(JSON.stringify(v.spec));
      if (!spec || spec.series.some(series => series.data.some(point => point !== null && !Number.isFinite(point)))) return null;
      return { type: v.type, spec };
    }
    default: return null;
  }
}

/** Prove that this CommonMark code node has its own matching closing marker. */
export function nativeFenceClosed(markdown: string, start?: number, end?: number): boolean {
  if (start === undefined || end === undefined || start < 0 || end <= start || end > markdown.length) return false;
  const lines = markdown.slice(start, end).trimEnd().split("\n");
  if (lines.length < 3) return false;
  const opening = /^[\t >]*(`{3,}|~{3,})[ \t]*galen-ui(?:[ \t].*)?$/i.exec(lines[0].replace(/\r$/, ""));
  const closing = /^[\t >]*(`{3,}|~{3,})[ \t]*$/.exec(lines[lines.length - 1].replace(/\r$/, ""));
  return !!opening && !!closing && opening[1][0] === closing[1][0] && closing[1].length >= opening[1].length;
}

export function parseNativeUi(source: string): NativeUi | null {
  if (source.length > 64000) return null;
  try {
    const value: unknown = JSON.parse(source);
    if (!object(value) || !keys(value, ["version", "blocks", "fallback"]) || value.version !== 1 || !str(value.fallback, 4000) ||
      !Array.isArray(value.blocks) || value.blocks.length === 0 || value.blocks.length > 12) return null;
    const blocks = value.blocks.map(block);
    if (blocks.some(item => item === null)) return null;
    return { version: 1, blocks: blocks as NativeBlock[], fallback: value.fallback };
  } catch { return null; }
}

export function calculate(operation: "add" | "subtract" | "multiply" | "divide", a: number, b: number): number | null {
  if (!number(a) || !number(b) || (operation === "divide" && b === 0)) return null;
  const result = operation === "add" ? a + b : operation === "subtract" ? a - b : operation === "multiply" ? a * b : a / b;
  return Number.isFinite(result) ? result : null;
}
