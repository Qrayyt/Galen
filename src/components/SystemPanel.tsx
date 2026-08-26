import { motion } from "motion/react";
import { CheckCircle2, Cpu, HardDrive, MemoryStick, Monitor, RefreshCw, Rocket } from "lucide-react";
import type { HardwareInfo, ModelCatalogItem, OllamaStatus, UpdateInfo } from "../types";

interface SystemPanelProps {
  hardware: HardwareInfo | null;
  recommended: ModelCatalogItem | null;
  status: OllamaStatus | null;
  update: UpdateInfo | null;
  updating: boolean;
  onRefresh: () => void;
  onInstallUpdate: () => void;
}

export function SystemPanel({
  hardware,
  recommended,
  status,
  update,
  updating,
  onRefresh,
  onInstallUpdate,
}: SystemPanelProps) {
  return (
    <main className="system-page page-enter">
      <header className="page-header">
        <div>
          <span className="eyebrow">Диагностика</span>
          <h1>Этот компьютер</h1>
          <p>Galen использует эти данные только локально, чтобы подобрать адекватную модель.</p>
        </div>
        <button className="subtle-button" onClick={onRefresh}>
          <RefreshCw size={15} /> Обновить
        </button>
      </header>

      {hardware ? (
        <section className="hardware-grid">
          <HardwareCard icon={Cpu} label="Процессор" value={hardware.cpu} detail={`${hardware.cpuCores} потоков`} index={0} />
          <HardwareCard icon={MemoryStick} label="Оперативная память" value={`${hardware.ramTotalGb} ГБ`} detail="Доступна локальным моделям" index={1} />
          <HardwareCard icon={Monitor} label="Видеокарта" value={hardware.gpu} detail={hardware.vramGb ? `${hardware.vramGb} ГБ VRAM` : "Общая память"} index={2} />
          <HardwareCard icon={HardDrive} label="Система" value={hardware.operatingSystem} detail={`${hardware.desktop} · ${hardware.architecture}`} index={3} />
        </section>
      ) : (
        <div className="panel-loading"><span /> Анализируем компьютер…</div>
      )}

      <section className="recommendation-panel">
        <div className="recommendation-orb"><span /></div>
        <div>
          <span className="eyebrow">Автоматический подбор</span>
          <h2>{recommended ? recommended.name : "Подбираем модель"}</h2>
          <p>
            {recommended
              ? `${recommended.description} На этом компьютере она даст лучший баланс скорости и качества.`
              : "Как только анализ железа завершится, здесь появится подходящая модель."}
          </p>
        </div>
        {recommended && <div className="fit-badge"><CheckCircle2 size={17} /> Оптимально</div>}
      </section>

      <section className="service-grid">
        <div className="service-card">
          <div className="service-card-head"><span>Ollama</span><i className={status?.running ? "online" : ""} /></div>
          <strong>{status?.running ? `Работает · ${status.version ?? "локально"}` : status?.installed ? "Остановлена" : "Не установлена"}</strong>
          <p>Движок, который запускает и хранит модели на этом компьютере.</p>
        </div>
        <div className="service-card">
          <div className="service-card-head"><span>Обновления Galen</span><Rocket size={17} /></div>
          <strong>
            {update?.available
              ? `Доступна ${update.latestVersion}`
              : update?.error
                ? "Проверка недоступна"
                : "Установлена свежая версия"}
          </strong>
          <p>{update?.available ? "Сборка уже опубликована в GitHub Releases." : "Проверяем релизы при каждом запуске."}</p>
          {update?.available && (
            <button className="black-button" onClick={onInstallUpdate} disabled={updating}>
              {updating ? "Скачиваем…" : "Обновить и перезапустить"}
            </button>
          )}
        </div>
      </section>
    </main>
  );
}

interface HardwareCardProps {
  icon: typeof Cpu;
  label: string;
  value: string;
  detail: string;
  index: number;
}

function HardwareCard({ icon: Icon, label, value, detail, index }: HardwareCardProps) {
  return (
    <motion.article
      className="hardware-card"
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.06, duration: 0.36 }}
    >
      <Icon size={20} strokeWidth={1.55} />
      <span>{label}</span>
      <strong>{value}</strong>
      <p>{detail}</p>
    </motion.article>
  );
}


