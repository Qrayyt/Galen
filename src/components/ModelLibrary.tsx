import { motion } from "motion/react";
import { Check, Cpu, Download, HardDrive, LoaderCircle, Search, Trash2, X } from "lucide-react";
import { useMemo, useState } from "react";
import { MODEL_CATALOG, formatBytes } from "../data/models";
import type {
  HardwareInfo,
  ModelCatalogItem,
  OllamaModel,
  OllamaStatus,
  PullProgress,
} from "../types";

interface ModelLibraryProps {
  hardware: HardwareInfo | null;
  recommendedId: string | null;
  status: OllamaStatus | null;
  installed: OllamaModel[];
  activeModel: string | null;
  pulls: Record<string, PullProgress>;
  onPull: (model: string) => void;
  onDelete: (model: string) => void;
  onSelect: (model: string) => void;
  onRetryOllama: () => void;
}

const normalized = (name: string) => name.replace(":latest", "").toLowerCase();

export function ModelLibrary({
  hardware,
  recommendedId,
  status,
  installed,
  activeModel,
  pulls,
  onPull,
  onDelete,
  onSelect,
  onRetryOllama,
}: ModelLibraryProps) {
  const [query, setQuery] = useState("");
  const [customModel, setCustomModel] = useState("");

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return MODEL_CATALOG;
    return MODEL_CATALOG.filter((item) =>
      [item.name, item.id, item.maker, item.description, ...item.tags]
        .join(" ")
        .toLowerCase()
        .includes(needle),
    );
  }, [query]);

  const installedNames = useMemo(
    () => new Set(installed.map((model) => normalized(model.name))),
    [installed],
  );

  const isInstalled = (id: string) => installedNames.has(normalized(id));

  return (
    <main className="library page-enter">
      <header className="page-header">
        <div>
          <span className="eyebrow">Локальные модели</span>
          <h1>Библиотека</h1>
          <p>Скачай модель один раз — дальше Гален работает без облака и подписок.</p>
        </div>
        {hardware && (
          <div className="hardware-pill">
            <Cpu size={16} />
            <span>{hardware.gpu}</span>
            <i />
            <span>{hardware.ramTotalGb} ГБ RAM</span>
          </div>
        )}
      </header>

      {status && (!status.installed || !status.running) && (
        <section className="service-notice">
          <div>
            <strong>{status.installed ? "Ollama не запущен" : "Нужно установить Ollama"}</strong>
            <p>
              {status.installed
                ? "Гален нашёл Ollama, но локальный сервис сейчас не отвечает."
                : "Установщик Galen обычно делает это сам. На Arch можно выполнить: sudo pacman -S ollama"}
            </p>
          </div>
          <button className="black-button" onClick={onRetryOllama}>
            {status.installed ? "Запустить" : "Проверить снова"}
          </button>
        </section>
      )}

      <div className="model-tools">
        <label className="search-field">
          <Search size={18} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Найти Llama, Qwen, модель для кода…"
          />
          {query && (
            <button onClick={() => setQuery("")} aria-label="Очистить поиск">
              <X size={16} />
            </button>
          )}
        </label>
        <span>{filtered.length} моделей</span>
      </div>

      <section className="model-grid">
        {filtered.map((model, index) => (
          <ModelCard
            key={model.id}
            model={model}
            index={index}
            installed={isInstalled(model.id)}
            active={normalized(activeModel ?? "") === normalized(model.id)}
            recommended={recommendedId === model.id}
            progress={pulls[model.id]}
            disabled={!status?.running}
            onPull={() => onPull(model.id)}
            onDelete={() => onDelete(model.id)}
            onSelect={() => onSelect(model.id)}
          />
        ))}
      </section>

      {!filtered.length && (
        <section className="custom-model">
          <div>
            <span className="eyebrow">Точная модель из Ollama</span>
            <h2>Не нашли в базовом списке?</h2>
            <p>Вставь идентификатор модели — например, <code>llama3.2:1b</code>.</p>
          </div>
          <div className="custom-model-action">
            <input
              value={customModel}
              onChange={(event) => setCustomModel(event.target.value)}
              placeholder="model:tag"
            />
            <button
              className="black-button"
              disabled={!customModel.trim() || !status?.running}
              onClick={() => onPull(customModel.trim())}
            >
              Скачать
            </button>
          </div>
        </section>
      )}
    </main>
  );
}

interface ModelCardProps {
  model: ModelCatalogItem;
  index: number;
  installed: boolean;
  active: boolean;
  recommended: boolean;
  progress?: PullProgress;
  disabled: boolean;
  onPull: () => void;
  onDelete: () => void;
  onSelect: () => void;
}

function ModelCard({
  model,
  index,
  installed,
  active,
  recommended,
  progress,
  disabled,
  onPull,
  onDelete,
  onSelect,
}: ModelCardProps) {
  const downloading = progress && !progress.done && !progress.error;
  return (
    <motion.article
      className={`model-card ${active ? "model-card--active" : ""}`}
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index * 0.035, 0.22), duration: 0.36 }}
    >
      <div className="model-card-top">
        <div className="model-icon">{model.name.charAt(0)}</div>
        <div className="model-title">
          <div>
            <h2>{model.name}</h2>
            {recommended && <span className="recommended-label">Подходит этому ПК</span>}
          </div>
          <p>{model.maker} · {model.parameters}</p>
        </div>
        {active && <span className="active-check"><Check size={14} /> Активна</span>}
      </div>
      <p className="model-description">{model.description}</p>
      <div className="model-tags">
        {model.tags.map((tag) => <span key={tag}>{tag}</span>)}
      </div>
      <div className="model-facts">
        <span><HardDrive size={15} /> ≈ {model.downloadSizeGb} ГБ</span>
        <span><Cpu size={15} /> от {model.minRamGb} ГБ RAM</span>
        <span>{model.speed}</span>
      </div>

      {downloading && progress ? (
        <div className="download-progress">
          <div className="progress-copy">
            <span>{progress.status || "Скачиваем слои модели"}</span>
            <strong>{Math.round(progress.percent)}%</strong>
          </div>
          <div className="progress-track"><span style={{ width: `${progress.percent}%` }} /></div>
          <small>
            {progress.total > 0
              ? `${formatBytes(progress.completed)} из ${formatBytes(progress.total)}`
              : "Подготавливаем загрузку…"}
          </small>
        </div>
      ) : (
        <div className="model-actions">
          {installed ? (
            <>
              <button className={active ? "outline-button selected" : "black-button"} onClick={onSelect}>
                {active ? "Используется" : "Подключить"}
              </button>
              <button className="delete-button" onClick={onDelete} aria-label={`Удалить ${model.name}`}>
                <Trash2 size={16} />
              </button>
            </>
          ) : (
            <button className="black-button download-button" disabled={disabled} onClick={onPull}>
              {progress?.error ? <><LoaderCircle size={16} /> Повторить</> : <><Download size={16} /> Скачать</>}
            </button>
          )}
        </div>
      )}
      {progress?.error && <p className="inline-error">{progress.error}</p>}
    </motion.article>
  );
}

