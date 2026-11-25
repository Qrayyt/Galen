import { lazy, Suspense, useState } from "react";
import { calculate, type NativeBlock, type NativeUi } from "@/lib/galenUiSpec";
import { useUiLanguage } from "@/i18n";
import { robustCopy } from "@/lib/clipboard";

const Chart = lazy(() => import("./ChartFence").then(m => ({ default: m.ChartFence })));

function labels(ru: boolean) {
  return ru ? { copy: "Копировать результат", copied: "Скопировано", first: "Первое число", second: "Второе число", invalid: "Некорректное значение", choose: "Выберите вариант", text: "Текстовое описание" } :
    { copy: "Copy result", copied: "Copied", first: "First number", second: "Second number", invalid: "Invalid value", choose: "Choose an option", text: "Text description" };
}

function CopyValue({ value }: { value: string }) {
  const t = labels(useUiLanguage() === "ru");
  const [copied, setCopied] = useState(false);
  return <button type="button" disabled={!value} className="rounded-md border border-border px-3 py-1.5 text-xs hover:bg-muted disabled:opacity-50"
    onClick={() => { void robustCopy(value).then(ok => setCopied(ok)); }}>{copied ? t.copied : t.copy}</button>;
}

function Block({ block }: { block: NativeBlock }) {
  const t = labels(useUiLanguage() === "ru");
  const [checks, setChecks] = useState<number[]>([]);
  const [selection, setSelection] = useState("");
  const [a, setA] = useState(block.type === "calculator" ? String(block.a) : "");
  const [b, setB] = useState(block.type === "calculator" ? String(block.b) : "");
  switch (block.type) {
    case "card": return <section><h3 className="font-medium">{block.title}</h3><p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">{block.text}</p></section>;
    case "table": return <div className="max-h-72 overflow-auto"><table className="w-full text-left text-sm"><thead><tr>{block.columns.map((column, i) => <th scope="col" className="border-b border-border px-2 py-2" key={i}>{column}</th>)}</tr></thead><tbody>{block.rows.map((row, i) => <tr key={i}>{row.map((cell, j) => <td className="border-b border-border/50 px-2 py-2" key={j}>{cell}</td>)}</tr>)}</tbody></table></div>;
    case "progress": return <div><label className="flex justify-between gap-2 text-sm"><span>{block.label}</span><span className="tabular-nums">{block.value} / {block.max}</span></label><progress aria-label={block.label} className="mt-2 h-2 w-full accent-foreground" value={block.value} max={block.max}/></div>;
    case "checklist": return <fieldset className="space-y-2"><legend className="font-medium">{block.title}</legend>{block.items.map((item, i) => <label key={i} className="flex items-start gap-2 text-sm"><input type="checkbox" checked={checks.includes(i)} onChange={event => setChecks(old => event.target.checked ? [...old, i] : old.filter(x => x !== i))} className="mt-1 accent-foreground"/><span>{item}</span></label>)}<CopyValue value={block.items.map((item, i) => (checks.includes(i) ? "[x] " : "[ ] ") + item).join("\n")}/></fieldset>;
    case "diagram": return <ol className="space-y-2">{block.steps.map((step, i) => <li key={i} className="flex items-center gap-2"><span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-muted text-xs">{i + 1}</span><span className="min-w-0 flex-1 rounded-lg border border-border p-2 text-sm">{step}</span></li>)}</ol>;
    case "calculator": {
      const result = a.trim() && b.trim() ? calculate(block.operation, Number(a), Number(b)) : null;
      return <section className="space-y-2"><h3 className="font-medium">{block.label}</h3><div className="grid grid-cols-2 gap-2"><label className="text-xs">{t.first}<input type="number" value={a} onChange={e => setA(e.target.value)} className="mt-1 w-full rounded-md border border-border bg-background p-2 text-sm"/></label><label className="text-xs">{t.second}<input type="number" value={b} onChange={e => setB(e.target.value)} className="mt-1 w-full rounded-md border border-border bg-background p-2 text-sm"/></label></div><output className="block text-xl font-semibold tabular-nums">{result === null ? t.invalid : Number(result.toPrecision(12)).toLocaleString()}</output><CopyValue value={result === null ? "" : String(result)}/></section>;
    }
    case "input": return <section className="space-y-2"><label className="block text-sm">{block.label}<select value={selection} onChange={event => setSelection(event.target.value)} className="mt-1 block w-full rounded-md border border-border bg-background p-2"><option value="">{t.choose}</option>{block.options.map((option, i) => <option key={i} value={option}>{option}</option>)}</select></label><CopyValue value={selection}/></section>;
    case "chart": return <Suspense fallback={<p>{block.spec.title}</p>}><Chart spec={block.spec}/></Suspense>;
  }
}

export function NativeUiFence({ spec }: { spec: NativeUi }) {
  const t = labels(useUiLanguage() === "ru");
  return <div className="not-prose my-3 space-y-4 rounded-xl border border-border bg-card p-4 text-foreground" data-testid="galen-native-ui">
    {spec.blocks.map((block, i) => <Block key={i + ":" + JSON.stringify(block)} block={block}/>)}
    <details className="text-xs text-muted-foreground"><summary className="cursor-pointer">{t.text}</summary><p className="mt-2 whitespace-pre-wrap">{spec.fallback}</p></details>
  </div>;
}
