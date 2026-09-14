import { AnimatePresence, motion } from "motion/react";
import {
  AudioLines, Check, ChevronRight, Cpu, Download, ExternalLink, Eye, Film, Gauge,
  HardDrive, Image, LoaderCircle, MessageCircle, RefreshCw, Search, Sparkles, Star, Trash2, X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  MODEL_CATALOG, MODEL_CATEGORIES, formatBytes, modelFit, recommendModel, scoreModel,
} from "../data/models";
import { native } from "../lib/native";
import type {
  ContentEngineStatus, GenerationStatus, HardwareInfo, ModelCatalogItem, OllamaModel, OllamaStatus, PullProgress,
} from "../types";

interface ModelLibraryProps {
  hardware: HardwareInfo | null;
  recommendedId: string | null;
  status: OllamaStatus | null;
  comfyStatus: ContentEngineStatus | null;
  installed: OllamaModel[];
  activeModel: string | null;
  activeVisionModel: string | null;
  activeVoiceId: string;
  pulls: Record<string, PullProgress>;
  onPull: (model: string, category: "chat" | "vision") => void;
  onDelete: (model: string) => void;
  onSelect: (model: string, category: "chat" | "vision") => void;
  onSelectVoice: (model: string) => void;
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
  "comfy:juggernaut-xl-dark": "https://civitai.com/models/133005/juggernaut-xl",
  "comfy:cyberrealistic-dark-fast": "https://civitai.com/models/15003/cyberrealistic",
  "comfy:cyberrealistic-xl-dark": "https://civitai.com/models/312530/cyberrealistic-xl",
  "comfy:wan22-dark-5b": "https://docs.comfy.org/tutorials/video/wan/wan2_2",
  "comfy:wan22-dark": "https://huggingface.co/rzgar/Wan2.2_I2V_R1_base_v2",
};

export function ModelLibrary(props: ModelLibraryProps) {
  const {
    hardware, status, comfyStatus, installed, activeModel, activeVisionModel, activeVoiceId, pulls, onPull, onDelete, onSelect, onSelectVoice,
    onRetryOllama, onRetryComfy, onOpenComfy, onOpenSettings,
  } = props;
  const [category, setCategory] = useState<ModelCatalogItem["category"]>("chat");
  const [query, setQuery] = useState("");
  const [darkOnly, setDarkOnly] = useState(false);
  const [customModel, setCustomModel] = useState("");
  const [generation, setGeneration] = useState<GenerationStatus | null>(null);
  const [generationBusy, setGenerationBusy] = useState<"comfy" | "image" | "video" | null>(null);
  const [generationProgress, setGenerationProgress] = useState("");
  const installedNames = useMemo(() => new Set(installed.map((model) => normalized(model.name))), [installed]);
  const categoryMeta = MODEL_CATEGORIES.find((entry) => entry.id === category)!;

  const refreshGeneration = async () => {
    try { setGeneration(await native.getGenerationStatus()); } catch { setGeneration(null); }
  };

  useEffect(() => {
    if (category === "image" || category === "video") void refreshGeneration();
  }, [category]);

  const installComfy = async () => {
    setGenerationBusy("comfy");
    setGenerationProgress("Подготавливаем ComfyUI…");
    try {
      const next = await native.installComfy((progress) => {
        setGenerationProgress(`${progress.component}: ${progress.status}${progress.total ? ` · ${progress.percent.toFixed(0)}%` : ""}`);
      });
      setGeneration(next);
      onRetryComfy();
    } finally {
      setGenerationBusy(null);
    }
  };

  const installGenerationPack = async (pack: "image" | "video") => {
    setGenerationBusy(pack);
    setGenerationProgress(pack === "image" ? "Подготавливаем Qwen image pack…" : "Подготавливаем WAN video pack…");
    try {
      let current = generation ?? await native.getGenerationStatus();
      if (!current.installed) {
        current = await native.installComfy((progress) => {
          setGenerationProgress(`${progress.component}: ${progress.status}${progress.total ? ` · ${progress.percent.toFixed(0)}%` : ""}`);
        });
      }
      if (!current.running) current = await native.startComfy();
      const next = await native.installGenerationPack(pack, (progress) => {
        setGenerationProgress(`${progress.component}: ${progress.status}${progress.total ? ` · ${progress.percent.toFixed(0)}%` : ""}`);
      });
      setGeneration(next);
      onRetryComfy();
    } finally {
      setGenerationBusy(null);
    }
  };

  const models = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return MODEL_CATALOG.filter((model) => model.category === category && (!darkOnly || model.dark) && (!needle ||
      [model.name, model.id, model.maker, model.description, ...model.tags, ...model.capabilities]
        .join(" ").toLowerCase().includes(needle)));
  }, [category, darkOnly, query]);

  const regularModels = models.filter((model) => !model.dark);
  const darkModels = models.filter((model) => model.dark);
  const recommended = hardware && regularModels.length ? recommendModel(hardware, category) : regularModels[0];
  const qualityPick = [...regularModels]
    .filter((model) => model.id !== recommended?.id && model.quality > (recommended?.quality ?? 0))
    .sort((a, b) => b.quality - a.quality)[0];
  const rest = regularModels.filter((model) => model.id !== recommended?.id && model.id !== qualityPick?.id);
  const darkRecommended = darkModels.length
    ? hardware
      ? [...darkModels].sort((a, b) => scoreModel(b, hardware) - scoreModel(a, hardware))[0]
      : darkModels[0]
    : undefined;
  const darkQualityPick = [...darkModels]
    .filter((model) => model.id !== darkRecommended?.id && model.quality > (darkRecommended?.quality ?? 0))
    .sort((a, b) => b.quality - a.quality)[0];
  const darkRest = darkModels.filter((model) => model.id !== darkRecommended?.id && model.id !== darkQualityPick?.id);

  const renderCard = (model: ModelCatalogItem, index: number, variant?: "recommended" | "quality" | "dark" | "darkRecommended" | "darkQuality") => (
    <ModelRow
      key={`${model.category}:${model.id}`}
      model={model}
      index={index}
      variant={variant}
      fit={hardware ? modelFit(model, hardware) : null}
      installed={installedNames.has(normalized(model.id)) || model.engine === "builtin"}
      active={model.category === "voice"
        ? activeVoiceId === model.id
        : model.category === "vision"
          ? normalized(activeVisionModel ?? "") === normalized(model.id)
          : normalized(activeModel ?? "") === normalized(model.id)}
      progress={pulls[model.id]}
      disabled={!status?.running}
      comfyRunning={Boolean(comfyStatus?.running)}
      onPull={() => onPull(model.id, model.category === "vision" ? "vision" : "chat")}
      onDelete={() => onDelete(model.id)}
      onSelect={() => onSelect(model.id, model.category === "vision" ? "vision" : "chat")}
      onSelectVoice={() => onSelectVoice(model.id)}
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
        <section className={`engine-banner ${generation?.running || comfyStatus?.running ? "engine-banner--online" : ""}`}>
          <div className="engine-status-dot" />
          <div>
            <strong>{generation?.running || comfyStatus?.running ? "ComfyUI подключён" : generation?.installed || comfyStatus?.installed ? "ComfyUI установлен" : "Для генерации нужен ComfyUI"}</strong>
            <p>{generation?.running || comfyStatus?.running
              ? category === "image"
                ? generation?.imageReady ? "Qwen pipeline готов — можно просить Galen генерировать изображения прямо в чате." : "ComfyUI работает. Установи готовый Qwen pack одной кнопкой."
                : generation?.videoI2vReady && generation?.videoT2vReady ? "WAN 2.2 pipeline готов — доступны T2V и I2V прямо из чата." : "ComfyUI работает. Установи готовый WAN pack одной кнопкой."
              : "Galen может сам установить локальный движок и готовые пайплайны — ручная настройка ComfyUI не нужна."}</p>
          </div>
          <div className="engine-actions">
            <button className="subtle-button" onClick={() => { onRetryComfy(); void refreshGeneration(); }}><RefreshCw size={15} /> Проверить</button>
            {!generation?.installed && !comfyStatus?.installed ? (
              <button className="black-button" disabled={generationBusy !== null} onClick={() => void installComfy()}><Download size={14} /> {generationBusy === "comfy" ? "Устанавливаем…" : "Установить ComfyUI"}</button>
            ) : !(generation?.running || comfyStatus?.running) ? (
              <button className="black-button" disabled={generationBusy !== null} onClick={() => void native.startComfy().then(setGeneration)}><span>Запустить ComfyUI</span><ChevronRight size={14} /></button>
            ) : (
              <button className="black-button" onClick={onOpenComfy}>Открыть ComfyUI <ExternalLink size={14} /></button>
            )}
            {category === "image" && (
              <button className="model-secondary" disabled={generationBusy !== null || Boolean(generation?.imageReady)} onClick={() => void installGenerationPack("image")}>
                {generation?.imageReady ? "Qwen готов" : generationBusy === "image" ? "Ставим Qwen…" : "Установить Qwen pack"}
              </button>
            )}
            {category === "video" && (
              <button className="model-secondary" disabled={generationBusy !== null || Boolean(generation?.videoI2vReady && generation?.videoT2vReady)} onClick={() => void installGenerationPack("video")}>
                {generation?.videoI2vReady && generation?.videoT2vReady ? "WAN готов" : generationBusy === "video" ? "Ставим WAN…" : "Установить WAN pack"}
              </button>
            )}
          </div>
          {generationBusy && generationProgress && <p className="catalog-method"><LoaderCircle size={12} /> {generationProgress}</p>}
        </section>
      )}

      <nav className="model-categories" aria-label="Категории моделей">
        {MODEL_CATEGORIES.map((entry) => (
          <CategoryButton key={entry.id} entry={entry} active={category === entry.id} onClick={() => { setCategory(entry.id); setQuery(""); setDarkOnly(false); }} />
        ))}
      </nav>

      <div className="model-toolbar">
        <div><h2>{categoryMeta.label}</h2><span>{models.length} вариантов</span></div>
        <div className="model-toolbar-actions">
          <button className={`dark-filter ${darkOnly ? "active" : ""}`} onClick={() => setDarkOnly((value) => !value)}><Sparkles size={15} /> Dark</button>
          <label className="search-field"><Search size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={`Поиск в «${categoryMeta.label}»`} />{query && <button onClick={() => setQuery("")}><X size={15} /></button>}</label>
        </div>
      </div>
      <p className="catalog-method"><Star size={12} fill="currentColor" /> Оценка Galen основана на качестве и возможностях модели; совместимость рассчитывается отдельно по RAM и VRAM этого компьютера.</p>

      {darkOnly && <section className="dark-notice"><strong>Dark Models</strong><p>Локальные модели с минимальным alignment-фильтром и поддержкой NSFW. Galen не добавляет к их ответам отдельную цензуру; ответственность за законность и согласие остаётся у пользователя.</p></section>}

      <AnimatePresence mode="wait">
        <motion.section key={category} className="model-list" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -5 }}>
          {recommended && renderCard(recommended, 0, "recommended")}
          {qualityPick && renderCard(qualityPick, 1, "quality")}
          {!!rest.length && <div className="model-list-label">Другие варианты</div>}
          {rest.map((model, index) => renderCard(model, index + 2))}
          {!!darkModels.length && !darkOnly && <div className="model-list-label model-list-label--dark">Dark Models · без встроенной цензуры</div>}
          {darkRecommended && renderCard(darkRecommended, regularModels.length, "darkRecommended")}
          {darkQualityPick && renderCard(darkQualityPick, regularModels.length + 1, "darkQuality")}
          {darkRest.map((model, index) => renderCard(model, index + regularModels.length + 2, "dark"))}
        </motion.section>
      </AnimatePresence>

      {category === "chat" && (
        <section className="custom-model">
          <div><span className="eyebrow">Ollama registry</span><h2>Любая другая модель</h2><p>Вставь точное имя из каталога Ollama.</p></div>
          <div className="custom-model-action"><input value={customModel} onChange={(event) => setCustomModel(event.target.value)} placeholder="model:tag" /><button className="black-button" disabled={!customModel.trim() || !status?.running} onClick={() => onPull(customModel.trim(), "chat")}>Скачать</button></div>
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

function ModelRow({ model, index, variant, fit, installed, active, progress, disabled, comfyRunning, onPull, onDelete, onSelect, onSelectVoice, onOpenSettings, onOpenComfy }: {
  model: ModelCatalogItem; index: number; variant?: "recommended" | "quality" | "dark" | "darkRecommended" | "darkQuality"; fit: number | null;
  installed: boolean; active: boolean; progress?: PullProgress; disabled: boolean; comfyRunning: boolean;
  onPull: () => void; onDelete: () => void; onSelect: () => void; onSelectVoice: () => void; onOpenSettings: () => void; onOpenComfy: () => void;
}) {
  const downloading = progress && !progress.done && !progress.error;
  const isComfy = model.engine === "comfyui";
  const isVoice = model.category === "voice";
  const comfyGuide = COMFY_GUIDES[model.id] ?? "https://docs.comfy.org/tutorials/overview";
  return (
    <motion.article className={`model-row ${variant ? `model-row--${variant}` : ""} ${active ? "active" : ""}`} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(index * 0.035, 0.18) }}>
      {variant && <div className="model-ribbon">{variant === "recommended" ? <><Sparkles size={13} /> Лучший выбор для этого ПК</> : variant === "quality" ? <><Gauge size={13} /> Медленнее, но качественнее</> : variant === "darkRecommended" ? <><Sparkles size={13} /> Dark · лучший выбор для этого ПК</> : variant === "darkQuality" ? <><Gauge size={13} /> Dark · медленнее, но качественнее</> : <><Sparkles size={13} /> Dark model · быстрый вариант</>}</div>}
      <div className="model-row-main">
        <div className="model-monogram">{model.name.slice(0, 1)}</div>
        <div className="model-copy">
          <div className="model-name-line"><h3>{model.name}</h3><span>{model.maker}</span>{model.dark && <b className="dark-badge">Dark</b>}{active && <i><Check size={12} /> Активна</i>}</div>
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
            <button className={comfyRunning ? "black-button" : "model-secondary"} onClick={comfyRunning ? onOpenComfy : onOpenSettings}><span>{comfyRunning ? "Открыть ComfyUI" : "Настроить генерацию"}</span><ChevronRight size={16} /></button>
            <button className="model-secondary" onClick={() => void native.openUrl(comfyGuide)}><span>О модели</span><ExternalLink size={14} /></button>
          </div>
        ) : isVoice ? (
          <div className="model-buttons"><button className={active ? "model-secondary" : "black-button"} onClick={onSelectVoice}><span>{active ? "Используется" : "Подключить"}</span><ChevronRight size={16} /></button><button className="model-secondary" onClick={onOpenSettings}>Настроить</button></div>
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
