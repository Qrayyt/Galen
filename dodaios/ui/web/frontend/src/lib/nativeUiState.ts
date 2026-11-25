/** Local-only, bounded UI state. Never accepts model-provided storage keys. */
const KEY = "galen.native-ui.state.v1";
const LIMIT = 100;
export type ControlState = { checks?: number[]; selection?: number; a?: string; b?: string };
type RecordState = { key: string; state: ControlState };

function readAll(): RecordState[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw || raw.length > 200000) return [];
    const records: unknown = JSON.parse(raw);
    return Array.isArray(records) ? records.filter(r => r && typeof r.key === "string" && r.key.length < 1000 && r.state && typeof r.state === "object").slice(-LIMIT) : [];
  } catch { return []; }
}
export function readControlState(key?: string): ControlState {
  if (!key) return {};
  const state = readAll().find(r => r.key === key)?.state;
  if (!state) return {};
  return {
    checks: Array.isArray(state.checks) ? state.checks.filter(i => Number.isInteger(i) && i >= 0 && i < 30).slice(0, 30) : [],
    selection: Number.isInteger(state.selection) && Number(state.selection) >= 0 && Number(state.selection) < 12 ? state.selection : undefined,
    a: typeof state.a === "string" && state.a.length <= 40 ? state.a : undefined,
    b: typeof state.b === "string" && state.b.length <= 40 ? state.b : undefined,
  };
}
export function writeControlState(key: string | undefined, state: ControlState) {
  if (!key || key.length >= 1000) return;
  try { localStorage.setItem(KEY, JSON.stringify([...readAll().filter(r => r.key !== key), { key, state }].slice(-LIMIT))); }
  catch { /* local storage unavailable; controls remain usable */ }
}
export function uiBlockKey(messageId: string | undefined, offset: number | undefined, index: number, spec: unknown): string | undefined {
  if (!messageId || messageId.length > 500 || offset === undefined) return undefined;
  // Two independent hashes make accidental schema-revision collisions unlikely.
  // The full model payload is never written to localStorage.
  let a = 2166136261, b = 5381;
  for (const ch of JSON.stringify(spec)) { a = Math.imul(a ^ ch.charCodeAt(0), 16777619); b = Math.imul(b, 33) ^ ch.charCodeAt(0); }
  return JSON.stringify([messageId, offset, index, a >>> 0, b >>> 0]);
}
