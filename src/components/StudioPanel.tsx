import {
  AppWindow, ArrowUpRight, CheckCircle2, ChevronRight, CircleAlert, Command, Cpu,
  FileImage, Image as ImageIcon, LoaderCircle, Play, RefreshCw, Search, Sparkles,
  TerminalSquare, Video, WandSparkles, X,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { imagePayloads, prepareAttachment } from "../lib/attachments";
import { isTauri, native } from "../lib/native";
import type { AppSettings, Attachment, CommandRunResult, GeneratedMedia, GenerationStatus, InstalledApplication } from "../types";

type StudioTab = "create" | "apps" | "terminal";

interface StudioPanelProps {
  generation: GenerationStatus | null;
  settings: AppSettings;
  onRefresh: () => void;
  onOpenModels: () => void;
  onAskGalen: (prompt: string) => void;
}

const previewApps: InstalledApplication[] = [
  { id: "preview-calculator", name: "Калькулятор", path: "Системное приложение", source: "Windows" },
  { id: "preview-browser", name: "Google Chrome", path: "Браузер", source: "Пользователь" },
  { id: "preview-code", name: "Visual Studio Code", path: "Редактор кода", source: "Пользователь" },
  { id: "preview-files", name: "Проводник", path: "Файлы", source: "Windows" },
];

export function StudioPanel({ generation, settings, onRefresh, onOpenModels, onAskGalen }: StudioPanelProps) {
  const [tab, setTab] = useState<StudioTab>("create");
  const [apps, setApps] = useState<InstalledApplication[]>([]);
  const [appsLoading, setAppsLoading] = useState(false);
  const [appQuery, setAppQuery] = useState("");
  const [appMessage, setAppMessage] = useState<string | null>(null);
  const [prompt, setPrompt] = useState("");
  const [mediaMode, setMediaMode] = useState<"image" | "video">("image");
  const [reference, setReference] = useState<Attachment | null>(null);
  const [media, setMedia] = useState<GeneratedMedia | null>(null);
  const [mediaBusy, setMediaBusy] = useState(false);
  const [mediaError, setMediaError] = useState<string | null>(null);
  const [command, setCommand] = useState("");
  const [shell, setShell] = useState<"powershell" | "cmd" | "sh">("powershell");
  const [run, setRun] = useState<CommandRunResult | null>(null);
  const [commandBusy, setCommandBusy] = useState(false);
  const [commandError, setCommandError] = useState<string | null>(null);
  const referenceInput = useRef<HTMLInputElement>(null);

  const refreshApps = async () => {
    setAppsLoading(true);
    setAppMessage(null);
    try {
      setApps(isTauri() ? await native.listApplications() : previewApps);
    } catch (error) {
      setAppMessage(error instanceof Error ? error.message : String(error));
    } finally { setAppsLoading(false); }
  };

  useEffect(() => { void refreshApps(); }, []);

  const visibleApps = useMemo(() => {
    const needle = appQuery.trim().toLocaleLowerCase("ru-RU");
    return (needle ? apps.filter((app) => app.name.toLocaleLowerCase("ru-RU").includes(needle)) : apps).slice(0, 18);
  }, [apps, appQuery]);

  const chooseReference = async (file?: File) => {
    if (!file) return;
    setMediaError(null);
    try {
      const prepared = await prepareAttachment(file);
      if (prepared.kind !== "image") throw new Error("Для reference нужен PNG, JPG или WebP.");
      setReference(prepared);
    } catch (error) { setMediaError(error instanceof Error ? error.message : String(error)); }
  };

  const generate = async () => {
    if (!prompt.trim() || mediaBusy) return;
    setMediaBusy(true);
    setMediaError(null);
    setMedia(null);
    try {
      const result = await native.generateMedia(prompt.trim(), imagePayloads(reference ? [reference] : []), mediaMode, 4);
      setMedia(result);
    } catch (error) { setMediaError(error instanceof Error ? error.message : String(error)); }
    finally { setMediaBusy(false); }
  };

  const launch = async (application: InstalledApplication) => {
    if (!settings.computerEnabled) { setAppMessage("Запуск приложений отключён в настройках Galen."); return; }
    if (!isTauri()) { setAppMessage("В web-preview запуск отключён. В установленном Galen приложение откроется сразу."); return; }
    setAppMessage(`Открываю ${application.name}…`);
    try {
      await native.launchApplication(application.id);
      setAppMessage(`${application.name} открыто.`);
    } catch (error) { setAppMessage(error instanceof Error ? error.message : String(error)); }
  };

  const execute = async () => {
    if (!command.trim() || commandBusy) return;
    setCommandBusy(true);
    setCommandError(null);
    setRun(null);
    try { setRun(await native.runCommand(command.trim(), settings.workspaceDirectory, shell)); }
    catch (error) { setCommandError(error instanceof Error ? error.message : String(error)); }
    finally { setCommandBusy(false); }
  };

  const imageReady = Boolean(generation?.imageReady);
  const videoReady = Boolean(generation?.videoI2vReady || generation?.videoT2vReady);

  return (
    <main className="studio-page page-enter">
      <header className="studio-hero">
        <div>
          <span className="eyebrow">Galen Studio</span>
          <h1>Делай, а не объясняй.</h1>
          <p>Генерация, приложения и консоль — напрямую. Модель не нужна для каждого клика.</p>
        </div>
        <button className="studio-refresh" onClick={onRefresh}><RefreshCw size={15} /> Проверить систему</button>
      </header>

      <section className="studio-readiness">
        <ReadyState icon={WandSparkles} label="Изображения" ready={imageReady} detail={imageReady ? "Qwen pipeline готов" : "Нужен image pack"} />
        <ReadyState icon={AppWindow} label="Приложения" ready={settings.computerEnabled && apps.length > 0} detail={!settings.computerEnabled ? "Отключены в настройках" : apps.length ? `${apps.length} найдено` : "Сканируем меню Пуск"} />
        <ReadyState icon={TerminalSquare} label="Консоль" ready={settings.terminalEnabled} detail={settings.terminalEnabled ? "PowerShell готов" : "Отключена в настройках"} />
      </section>

      <nav className="studio-tabs" aria-label="Разделы Studio">
        <button className={tab === "create" ? "active" : ""} onClick={() => setTab("create")}><Sparkles size={16} /> Создать</button>
        <button className={tab === "apps" ? "active" : ""} onClick={() => setTab("apps")}><AppWindow size={16} /> Приложения</button>
        <button className={tab === "terminal" ? "active" : ""} onClick={() => setTab("terminal")}><TerminalSquare size={16} /> Консоль</button>
      </nav>

      <AnimatePresence mode="wait">
        {tab === "create" && (
          <motion.section key="create" className="studio-grid" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -5 }}>
            <div className="studio-primary-card creation-card">
              <div className="studio-card-head">
                <div><span>Локальная генерация</span><h2>Что создаём?</h2></div>
                <div className="media-mode">
                  <button className={mediaMode === "image" ? "active" : ""} onClick={() => setMediaMode("image")}><ImageIcon size={14} /> Изображение</button>
                  <button className={mediaMode === "video" ? "active" : ""} onClick={() => setMediaMode("video")}><Video size={14} /> Видео</button>
                </div>
              </div>
              <textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder="Например: спокойная предметная фотография часов на тёмном камне, мягкий боковой свет…" />
              <div className="creation-actions">
                <input ref={referenceInput} hidden type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => void chooseReference(event.target.files?.[0])} />
                {reference ? (
                  <div className="reference-chip">
                    {reference.dataUrl && <img src={reference.dataUrl} alt="Reference" />}
                    <span><strong>{reference.name}</strong><small>Reference</small></span>
                    <button onClick={() => setReference(null)}><X size={13} /></button>
                  </div>
                ) : <button className="reference-button" onClick={() => referenceInput.current?.click()}><FileImage size={15} /> Добавить reference</button>}
                <button className="studio-run-button" onClick={() => void generate()} disabled={!prompt.trim() || mediaBusy || (mediaMode === "image" ? !imageReady : !videoReady)}>
                  {mediaBusy ? <LoaderCircle className="spin" size={16} /> : <WandSparkles size={16} />}
                  {mediaBusy ? "Создаю…" : "Сгенерировать"}
                </button>
              </div>
              {!imageReady && mediaMode === "image" && <SetupNotice onOpenModels={onOpenModels} text="Установи Image Pack один раз — после этого генерация работает локально из Studio и из чата." />}
              {!videoReady && mediaMode === "video" && <SetupNotice onOpenModels={onOpenModels} text="Для видео нужен WAN Pack. Galen покажет размер и готовность до запуска." />}
              {mediaError && <div className="studio-error"><CircleAlert size={15} />{mediaError}</div>}
            </div>
            <aside className="studio-output-card">
              {media ? (
                <>
                  {media.kind === "image" && media.dataUrl ? <img className="generated-preview" src={media.dataUrl} alt={media.name} /> : <div className="generated-placeholder"><Video size={28} /></div>}
                  <span className="success-label"><CheckCircle2 size={14} /> Готово локально</span>
                  <strong>{media.name}</strong><small>{media.engine}</small><code>{media.path}</code>
                </>
              ) : (
                <div className="studio-output-empty"><div><Sparkles size={26} /></div><strong>Результат появится здесь</strong><p>Без облака, подписки и отдельного интерфейса ComfyUI.</p></div>
              )}
            </aside>
          </motion.section>
        )}

        {tab === "apps" && (
          <motion.section key="apps" className="studio-primary-card apps-card" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -5 }}>
            <div className="apps-toolbar">
              <div><span>Запуск без команд</span><h2>Приложения этого компьютера</h2></div>
              <label><Search size={15} /><input value={appQuery} onChange={(event) => setAppQuery(event.target.value)} placeholder="Найти приложение" /></label>
              <button onClick={() => void refreshApps()} title="Обновить">{appsLoading ? <LoaderCircle className="spin" size={16} /> : <RefreshCw size={16} />}</button>
            </div>
            {appMessage && <div className="studio-message">{appMessage}</div>}
            <div className="app-grid">
              {visibleApps.map((application) => (
                <button key={application.id} onClick={() => void launch(application)} disabled={!settings.computerEnabled}>
                  <span className="app-monogram">{application.name.slice(0, 1).toLocaleUpperCase("ru-RU")}</span>
                  <span><strong>{application.name}</strong><small>{application.source}</small></span>
                  <ArrowUpRight size={15} />
                </button>
              ))}
              {!visibleApps.length && !appsLoading && <div className="apps-empty">Ничего не найдено. Попробуй часть названия.</div>}
            </div>
          </motion.section>
        )}

        {tab === "terminal" && (
          <motion.section key="terminal" className="studio-grid" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -5 }}>
            <div className="studio-primary-card terminal-card">
              <div className="studio-card-head"><div><span>Galen Console</span><h2>Команда с понятным результатом</h2></div><Command size={20} /></div>
              <div className="terminal-input-shell">
                <select value={shell} onChange={(event) => setShell(event.target.value as typeof shell)}><option value="powershell">PowerShell</option><option value="cmd">CMD</option><option value="sh">Shell</option></select>
                <textarea value={command} onChange={(event) => setCommand(event.target.value)} placeholder="Get-ChildItem | Select-Object -First 10" onKeyDown={(event) => { if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) void execute(); }} />
                <button onClick={() => void execute()} disabled={!command.trim() || commandBusy || !settings.terminalEnabled}>{commandBusy ? <LoaderCircle className="spin" size={16} /> : <Play size={15} fill="currentColor" />} Выполнить</button>
              </div>
              <div className="terminal-meta"><span>Папка: {settings.workspaceDirectory || "по умолчанию"}</span><span>Ctrl + Enter</span></div>
              {!settings.terminalEnabled && <SetupNotice onOpenModels={() => onAskGalen("Открой настройки и помоги включить терминал безопасно")} text="Консоль отключена. Включи её в настройках возможностей агента." />}
              {commandError && <div className="studio-error"><CircleAlert size={15} />{commandError}</div>}
            </div>
            <aside className={`console-output ${run?.success ? "success" : run ? "failed" : ""}`}>
              <div><span>{run ? (run.success ? "Успешно" : "Ошибка") : "Вывод"}</span>{run && <strong>exit {run.exitCode} · {run.durationMs} мс</strong>}</div>
              {run ? <pre>{[run.stdout, run.stderr].filter(Boolean).join("\n\n") || "Команда завершилась без вывода."}</pre> : <div className="console-empty"><Cpu size={24} /><p>stdout, stderr и код выхода будут видны здесь — без чёрного ящика.</p></div>}
            </aside>
          </motion.section>
        )}
      </AnimatePresence>
    </main>
  );
}

function ReadyState({ icon: Icon, label, ready, detail }: { icon: typeof Sparkles; label: string; ready: boolean; detail: string }) {
  return <div><span className={ready ? "ready" : ""}><Icon size={15} /></span><p><strong>{label}</strong><small>{detail}</small></p><i className={ready ? "online" : ""} /></div>;
}

function SetupNotice({ text, onOpenModels }: { text: string; onOpenModels: () => void }) {
  return <div className="studio-setup"><CircleAlert size={16} /><span>{text}</span><button onClick={onOpenModels}>Настроить <ChevronRight size={14} /></button></div>;
}
