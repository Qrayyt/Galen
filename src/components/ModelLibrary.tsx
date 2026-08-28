import { AnimatePresence, motion } from "motion/react";
import {
  AudioLines, Check, ChevronRight, Cpu, Download, ExternalLink, Eye, Film, Gauge,
  HardDrive, Image, LoaderCircle, MessageCircle, RefreshCw, Search, Sparkles, Star, Trash2, X,
} from "lucide-react";
import { useMemo, useState } from "react";
import {
  MODEL_CATALOG, MODEL_CATEGORIES, formatBytes, modelFit, recommendModel,
} from "../data/models";
import { native } from "../lib/native";
import type {
  ContentEngineStatus, HardwareInfo, ModelCatalogItem, OllamaModel, OllamaStatus, PullProgress,
} from "../types";

interface ModelLibraryProps {
  hardware: HardwareInfo | null;
  recommendedId: string | null;
  status: OllamaStatus | null;
  comfyStatus: ContentEngineStatus | null;
  installed: OllamaModel[];
  activeModel: string | null;
  pulls: Record<string, PullProgress>;
  onPull: (model: string) => void;
  onDelete: (model: string) => void;
  onSelect: (model: string) => void;
  onRetryOllama: () => void;
  onRetryComfy: () => void;
  onOpenComfy: () => void;
  onOpenSettings: () => void;
}

const normalized = (name: string) => name.replace(":latest", "").toLowerCase();
const CATEGORY_ICONS = {
  chat: MessageCircle,
  vision: Eye,
  image: Image,
  video: Film,
  voice: AudioLines,
};

const COMFY_GUIDES: Record<string, string> = {
  "comfy:flux-schnell": "https://docs.comfy.org/tutorials/flux/flux-1-text-to-image",
  "comfy:flux-dev": "https://docs.comfy.org/tutorials/flux/flux-1-text-to-image",
  "comfy:sdxl-turbo": "https://docs.comfy.org/tutorials/overview",
  "comfy:wan22-5b": "https://docs.comfy.org/tutorials/video/wan/wan2_2",
  "comfy:wan22-14b": "https://docs.comfy.org/tutorials/video/wan/wan2_2",
  "comfy:ltx-video": "https://docs.comfy.org/tutorials/video/ltxv",
  "comfy:ltx-23": "https://docs.comfy.org/tutorials/video/ltx/ltx-2-3",
};

export function ModelLibrary(props: ModelLibraryProps) {
  const {
    hardware, status, comfyStatus, installed, activeModel, pulls, onPull, onDelete, onSelect,
    onRetryOllama, onRetryComfy, onOpenComfy, onOpenSettings,
  } = props;
  const [category, setCategory] = useState<ModelCatalogItem["category"]>("chat");
  const [query, setQuery] = useState("");
  const [customModel, setCustomModel] = useState("");
  const installedNames = useMemo(() => new Set(installed.map((model) => normalized(model.name))), [installed]);
  const categoryMeta = MODEL_CATEGORIES.find((entry) => entry.id === category)!;

  const models = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return MODEL_CATALOG.filter((model) => model.category === category && (!needle ||
      [model.name, model.id, model.maker, model.description, ...model.tags, ...model.capabilities]
        .join(" ").toLowerCase().includes(needle)));
  }, [category, query]);

  const recommended = hardware && models.length
    ? recommendModel(hardware, category)
    : models[0];
  const qualityPick = [...models]
    .filter((model) => model.id !== recommended?.id && model.quality > (recommended?.quality ?? 0))
    .sort((a, b) => b.quality - a.quality)[0];
  const rest = models.filter((model) => model.id !== recommended?.id && model.id !== qualityPick?.id);

  const renderCard = (model: ModelCatalogItem, index: number, variant?: "recommended" | "quality") => (
    <ModelRow
      key={`${model.category}:${model.id}`}
      model={model}
      index={index}
      variant={variant}
      fit={hardware ? modelFit(model, hardware) : null}
      installed={installedNames.has(normalized(model.id)) || model.engine === "builtin"}
      active={normalized(activeModel ?? "") === normalized(model.id)}
      progress={pulls[model.id]}
      disabled={!status?.running}
      comfyRunning={Boolean(comfyStatus?.running)}
      onPull={() => onPull(model.id)}
      onDelete={() => onDelete(model.id)}
      onSelect={() => onSelect(model.id)}
      onOpenSettings={onOpenSettings}
      onOpenComfy={onOpenComfy}
    />
  );

  return (
    <main className="library page-enter">
      <header className="library-header">
        <div>
          <span className="eyebrow">Model studio</span>
          <h1>Модели</h1>
          <p>Один каталог для текста, зрения, генерации и голоса.</p>
        </div>
        {hardware && (
          <div className="machine-chip">
            <span className="machine-icon"><Cpu size={17} /></span>
            <div><strong>{hardware.gpu}</strong><small>{hardware.ramTotalGb} ГБ RAM · {hardware.vramGb ?? "?"} ГБ VRAM</small></div>
          </div>
        )}
      </header>

      {status && (!status.installed || !status.running) && (category === "chat" || category === "vision") && (
        <section className="service-notice">
          <div><strong>{status.installed ? "Ollama не запущена" : "Нужна Ollama"}</strong><p>Запусти локальный движок, чтобы устанавливать и подключать модели.</p></div>
          <button className="black-button" onClick={onRetryOllama}>{status.installed ? "Запустить" : "Проверить"}</button>
        </section>
      )}

      {(category === "image" || category === "video") && (
        <section className={`engine-banner ${comfyStatus?.running ? "engine-banner--online" : ""}`}>
          <div className="engine-status-dot" />
          <div>
            <strong>{comfyStatus?.running ? "ComfyUI подключён" : "Для генерации нужен ComfyUI"}</strong>
            <p>{comfyStatus?.running
              ? "Galen видит локальный движок. Template Library устанавливает модели вместе с готовыми workflow."
              : "Ollama генерирует текст и анализирует фото, но не создаёт изображения или видео. ComfyUI отвечает именно за генерацию."}</p>
          </div>
          <div className="engine-actions">
            <button className="subtle-button" onClick={onRetryComfy}><RefreshCw size={15} /> Проверить</button>
            {comfyStatus?.running
              ? <button className="black-button" onClick={onOpenComfy}>Открыть ComfyUI <ExternalLink size={14} /></button>
              : <button className="black-button" onClick={() => void native.openUrl("https://www.comfy.org/download")}>Установить движок <ExternalLink size={14} /></button>}
          </div>
        </section>
      )}

      <nav className="model-categories" aria-label="Категории моделей">
        {MODEL_CATEGORIES.map((entry) => (
          <CategoryButton key={entry.id} entry={entry} active={category === entry.id} onClick={() => { setCategory(entry.id); setQuery(""); }} />
        ))}
      </nav>

      <div className="model-toolbar">
        <div><h2>{categoryMeta.label}</h2><span>{models.length} вариантов</span></div>
        <label className="search-field"><Search size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={`Поиск в «${categoryMeta.label}»`} />{query && <button onClick={() => setQuery("")}><X size={15} /></button>}</label>
      </div>
      <p className="catalog-method"><Star size={12} fill="currentColor" /> Оценка Galen основана на качестве и возможностях модели; совместимость рассчитывается отдельно по RAM и VRAM этого компьютера.</p>

      <AnimatePresence mode="wait">
        <motion.section key={category} className="model-list" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -5 }}>
          {recommended && renderCard(recommended, 0, "recommended")}
          {qualityPick && renderCard(qualityPick, 1, "quality")}
          {!!rest.length && <div className="model-list-label">Другие варианты</div>}
          {rest.map((model, index) => renderCard(model, index + 2))}
        </motion.section>
      </AnimatePresence>

      {category === "chat" && (
        <section className="custom-model">
          <div><span className="eyebrow">Ollama registry</span><h2>Любая другая модель</h2><p>Вставь точное имя из каталога Ollama.</p></div>
          <div className="custom-model-action"><input value={customModel} onChange={(event) => setCustomModel(event.target.value)} placeholder="model:tag" /><button className="black-button" disabled={!customModel.trim() || !status?.running} onClick={() => onPull(customModel.trim())}>Скачать</button></div>
        </section>
      )}
    </main>
  );
}

function CategoryButton({ entry, active, onClick }: {
  entry: (typeof MODEL_CATEGORIES)[number]; active: boolean; onClick: () => void;
}) {
  const Icon = CATEGORY_ICONS[entry.id];
  return <button className={active ? "active" : ""} onClick={onClick}><Icon size={17} /><div><span>{entry.label}</span><small>{entry.description}</small></div></button>;
}

function ModelRow({ model, index, variant, fit, installed, active, progress, disabled, comfyRunning, onPull, onDelete, onSelect, onOpenSettings, onOpenComfy }: {
  model: ModelCatalogItem; index: number; variant?: "recommended" | "quality"; fit: number | null;
  installed: boolean; active: boolean; progress?: PullProgress; disabled: boolean; comfyRunning: boolean;
  onPull: () => void; onDelete: () => void; onSelect: () => void; onOpenSettings: () => void; onOpenComfy: () => void;
}) {
  const downloading = progress && !progress.done && !progress.error;
  const isComfy = model.engine === "comfyui";
  const isVoice = model.category === "voice";
  const comfyGuide = COMFY_GUIDES[model.id] ?? "https://docs.comfy.org/tutorials/overview";
  return (
    <motion.article className={`model-row ${variant ? `model-row--${variant}` : ""} ${active ? "active" : ""}`} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(index * 0.035, 0.18) }}>
      {variant && <div className="model-ribbon">{variant === "recommended" ? <><Sparkles size={13} /> Лучший выбор для этого ПК</> : <><Gauge size={13} /> Медленнее, но качественнее</>}</div>}
      <div className="model-row-main">
        <div className="model-monogram">{model.name.slice(0, 1)}</div>
        <div className="model-copy">
          <div className="model-name-line"><h3>{model.name}</h3><span>{model.maker}</span>{active && <i><Check size={12} /> Активна</i>}</div>
          <p>{model.description}</p>
          <div className="capability-list">{model.capabilities.map((value) => <span key={value}>{value}</span>)}</div>
        </div>
        <div className="model-score">
          <div className="rating"><Star size={15} fill="currentColor" /><strong>{model.rating.toFixed(1)}</strong><span>оценка Galen</span></div>
          {fit !== null && <div className={`fit ${fit < 70 ? "fit--warn" : ""}`}><strong>{fit}%</strong><span>подходит</span></div>}
        </div>
      </div>
      <div className="model-row-footer">
        <div className="model-specs"><span><HardDrive size={14} /> {model.downloadSizeGb ? `≈ ${model.downloadSizeGb} ГБ` : "без загрузки"}</span><span><Cpu size={14} /> {model.parameters}</span><span>{model.speed}</span></div>
        {downloading && progress ? (
          <div className="row-progress"><div><span>{progress.status || "Скачиваем"}</span><strong>{Math.round(progress.percent)}%</strong></div><i><b style={{ width: `${progress.percent}%` }} /></i><small>{progress.total ? `${formatBytes(progress.completed)} из ${formatBytes(progress.total)}` : "Подготавливаем…"}</small></div>
        ) : isComfy ? (
          <div className="model-buttons">
            <button className={comfyRunning ? "black-button" : "model-secondary"} onClick={comfyRunning ? onOpenComfy : () => void native.openUrl("https://www.comfy.org/download")}><span>{comfyRunning ? "Открыть ComfyUI" : "Установить ComfyUI"}</span><ChevronRight size={16} /></button>
            <button className="model-secondary" onClick={() => void native.openUrl(comfyGuide)}><span>Модель и workflow</span><ExternalLink size={14} /></button>
          </div>
        ) : isVoice ? (
          <button className="model-secondary" onClick={onOpenSettings}><span>Настроить голос</span><ChevronRight size={16} /></button>
        ) : installed ? (
          <div className="model-buttons"><button className={active ? "model-secondary" : "black-button"} onClick={onSelect}>{active ? "Используется" : "Подключить"}</button><button className="icon-danger" onClick={onDelete} aria-label={`Удалить ${model.name}`}><Trash2 size={15} /></button></div>
        ) : (
          <button className="black-button" disabled={disabled} onClick={onPull}>{progress?.error ? <LoaderCircle size={16} /> : <Download size={16} />} {progress?.error ? "Повторить" : "Скачать"}</button>
        )}
      </div>
      {progress?.error && <p className="inline-error">{progress.error}</p>}
    </motion.article>
  );
}
