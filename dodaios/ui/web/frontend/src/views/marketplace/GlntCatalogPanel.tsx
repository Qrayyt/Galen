import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

type Item = { id: string; name: string; title: string; description: string; type: string;
  version: string; min_galen: string; category: string; author: string; repository_url: string;
  commit: string; icon_url?: string | null; manifest_sha256: string; permissions: string[]; local_status?: string; installed_version?: string | null };
type Page = { configured: boolean; items: Item[]; staged: Item[]; stale: boolean; next_offset: number | null };

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch("/api/marketplace/glnt/" + path, init);
  const data = await response.json();
  if (!response.ok) throw new Error(typeof data.detail === "string" ? data.detail : "GLNT request failed");
  return data as T;
}

export function GlntCatalogPanel({ onClose, onSignIn, signedIn }: {
  onClose: () => void; onSignIn: () => void; signedIn: boolean;
}) {
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState("");
  const [offset, setOffset] = useState(0);
  const [page, setPage] = useState<Page | null>(null);
  const [selected, setSelected] = useState<Item | null>(null);
  const [repo, setRepo] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refresh, setRefresh] = useState(0);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    setLoading(true);
    setPage(null);
    setSelected(null);
    setError("");
    const timer = window.setTimeout(() => {
      void call<Page>("catalog?" + new URLSearchParams({ q: query, kind, offset: String(offset) }))
        .then(data => { if (active) setPage(data); })
        .catch(err => { if (active) setError(String(err.message)); })
        .finally(() => { if (active) setLoading(false); });
    }, 200);
    return () => { active = false; window.clearTimeout(timer); };
  }, [query, kind, offset, refresh]);

  async function run(action: () => Promise<unknown>, success: string, reload = true) {
    setBusy(true); setError(""); setMessage("");
    try {
      await action();
      setMessage(success);
      if (reload) setRefresh(n => n + 1);
    } catch (err) { setError(err instanceof Error ? err.message : String(err)); }
    finally { setBusy(false); }
  }
  return <section className="min-h-0 flex-1 overflow-y-auto px-6 py-5 space-y-5">
    <div className="flex items-center justify-between gap-3">
      <div><h1 className="text-xl font-semibold">GLNT Marketplace</h1>
        <p className="text-sm text-muted-foreground">Каталог проверенных расширений Galenite</p></div>
      <Button variant="outline" onClick={onClose}>Назад</Button>
    </div>
    <div className="flex flex-wrap gap-2">
      <input aria-label="Поиск GLNT" value={query} maxLength={100} onChange={e => { setQuery(e.target.value); setOffset(0); }}
        className="min-w-0 flex-1 rounded-md border border-border bg-background px-3 py-2 text-sm" placeholder="Найти расширение" />
      <select aria-label="Тип расширения" value={kind} onChange={e => { setKind(e.target.value); setOffset(0); }}
        className="rounded-md border border-border bg-background px-3 text-sm">
        <option value="">Все</option><option value="plugin">Плагины</option><option value="skill">Навыки</option>
      </select>
      <Button variant="outline" disabled={busy || loading} onClick={() => setRefresh(n => n + 1)}>Обновить</Button>
    </div>
    {loading && <p role="status" className="text-sm text-muted-foreground">Загрузка каталога…</p>}
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    {message && <p role="status" className="text-sm">{message}</p>}
    {page && !page.configured && <p className="rounded-lg border border-border p-4 text-sm text-muted-foreground">Сервер GLNT ещё не настроен. Старый каталог остаётся доступным.</p>}
    {page?.stale && <p className="text-sm text-warning">Офлайн-копия. Скачивание недоступно до обновления каталога.</p>}
    {page?.configured && !page.items.length && <p className="text-sm text-muted-foreground">Расширения не найдены.</p>}
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {page?.items.map(item => <button key={item.id} type="button" disabled={busy} onClick={() => setSelected(item)}
        className="rounded-lg border border-border bg-card p-4 text-left hover:bg-muted/40">
        <div className="flex items-center gap-3"><span className="relative flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-muted text-lg font-medium">{item.title.slice(0, 1).toUpperCase()}{item.icon_url && !page.stale && <img className="absolute inset-0 h-full w-full bg-card object-contain" alt="" loading="lazy" src={"/api/marketplace/glnt/icon/" + item.id + "?commit=" + item.commit} onError={e => {e.currentTarget.style.display = "none";}} />}</span><p className="font-medium">{item.title}</p></div><p className="text-xs text-muted-foreground">{item.author} · {item.version} · {item.type}</p>
        <p className="mt-2 text-sm text-muted-foreground">{item.description}</p>
      </button>)}
    </div>
    {selected && <div className="space-y-3 rounded-xl border border-border bg-card p-5">
      <h2 className="font-semibold">{selected.title} · {selected.version}</h2>
      <p className="text-sm">{selected.description}</p>
      <p className="break-all text-xs text-muted-foreground">{selected.repository_url}<br />Commit: {selected.commit}<br />Galen ≥ {selected.min_galen}</p>
      <p className="text-sm">Запрашиваемые разрешения: {selected.permissions.join(", ") || "нет"}</p>
      <p className="text-sm text-muted-foreground">Пакет скачивается напрямую с GitHub и проверяется по SHA-256. Скачивание не активирует расширение.</p>
      <div className="flex gap-2">
        <Button disabled={busy || page?.stale} onClick={() => void run(() => call("stage", {
          method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
            entry_id: selected.id, commit: selected.commit, manifest_sha256: selected.manifest_sha256, consent: true
          })
        }), "Пакет проверен и сохранён локально. Не активирован.")}>Скачать и проверить</Button>
        <Button variant="outline" onClick={() => setSelected(null)}>Закрыть</Button>
      </div>
    </div>}
    {page?.configured && <div className="flex gap-2">
      <Button variant="outline" disabled={offset === 0 || busy || loading} onClick={() => setOffset(n => Math.max(0, n - 30))}>Предыдущая</Button>
      <Button variant="outline" disabled={page.next_offset == null || busy || loading} onClick={() => setOffset(page.next_offset ?? offset)}>Следующая</Button>
    </div>}
    <h2 className="font-semibold">Локальные проверенные пакеты</h2>
    {page?.staged.length === 0 && <p className="text-sm text-muted-foreground">Пока пусто.</p>}
    {page?.staged.map(item => <div key={item.type + item.name} className="flex items-center justify-between gap-3 rounded-lg border border-border p-3">
      <div><p className="text-sm font-medium">{item.title} · {item.version}</p><p className="text-xs text-muted-foreground">{item.installed_version ? "Установлена версия " + item.installed_version : "Скачан и проверен · не установлен"}</p></div>
      <div className="flex flex-wrap gap-2"><Button disabled={busy || !page.configured || page.stale || item.installed_version === item.version} onClick={() => {
        if (!window.confirm("Установить " + item.title + " " + item.version + "? Разрешения: " + (item.permissions.join(", ") || "нет") + ". Плагин останется отключённым, навык — черновиком.")) return;
        void run(() => call("install", {method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({name:item.name,kind:item.type,commit:item.commit,consent:true})}), "Установлено. Включение доступно отдельно в Плагинах или Навыках.");
      }}>{item.installed_version ? "Обновить" : "Установить"}</Button><Button variant="outline" disabled={busy} onClick={() => void run(() => call("staged/" + item.type + "/" + item.name, {method:"DELETE"}), "Локальный пакет удалён.")}>Удалить архив</Button></div>
    </div>)}
    {page?.configured && <div className="space-y-2 rounded-lg border border-border p-4">
      <h2 className="font-semibold">Предложить расширение</h2>
      <p className="text-sm text-muted-foreground">Публичный репозиторий GitHub с galen-extension.json. Публикация после модерации.</p>
      {!signedIn ? <Button onClick={onSignIn}>Войти через GitHub</Button> :
      <div className="flex gap-2"><input aria-label="Репозиторий GitHub" maxLength={250} value={repo} onChange={e => setRepo(e.target.value)}
        placeholder="https://github.com/owner/repo" className="min-w-0 flex-1 rounded border border-border bg-background px-3 py-2 text-sm"/>
      <Button disabled={busy || !repo.trim()} onClick={() => void run(() => call("submit",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({repository_url:repo.trim()})}), "Запрос принят. Статус зависит от модерации.", false)}>Отправить</Button></div>}
    </div>}
  </section>;
}
