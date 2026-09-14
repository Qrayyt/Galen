import { AppWindow, ChevronRight, Eye, FileSearch, Gauge, Globe2, MonitorCog, RefreshCw, Settings2, Sparkles, TerminalSquare, Timer } from "lucide-react";
import galenLogo from "../assets/galen.svg";
import type { AppSettings, ChatMessage, ContentEngineStatus, OllamaStatus } from "../types";

interface ContextPanelProps {
  model?: string;
  visionModel?: string;
  status: OllamaStatus | null;
  comfyStatus: ContentEngineStatus | null;
  settings: AppSettings;
  lastResponse?: ChatMessage;
  onOpenModels: () => void;
  onOpenSettings: () => void;
  onOpenStudio: () => void;
  onRefresh: () => void;
  onAction: (prompt: string) => void;
}

export function ContextPanel({
  model, visionModel, status, comfyStatus, settings, lastResponse, onOpenModels, onOpenSettings, onOpenStudio, onRefresh, onAction,
}: ContextPanelProps) {
  const ready = Boolean(status?.running && model);
  return (
    <aside className="context-panel">
      <section className="context-card context-model-card">
        <div className="context-card-title context-health-title">
          <span className={`context-health ${ready ? "online" : ""}`}><i />{ready ? "Система готова" : "Нужна настройка"}</span>
          <button onClick={onRefresh} title="Обновить состояние"><RefreshCw size={14} /></button>
        </div>
        <div className="context-kicker">Разговорная модель</div>
        <button className="context-model" onClick={onOpenModels}>
          <span className="context-model-logo"><img src={galenLogo} alt="" /></span>
          <span><strong>{model ?? "Не выбрана"}</strong><small>{status?.running ? "Готова к работе" : "Ollama не подключена"}</small></span>
          <ChevronRight size={15} />
        </button>
        <div className="vision-route"><Eye size={14} /><span><strong>Vision</strong><small>{visionModel ?? "Не настроена"}</small></span><i className={visionModel ? "online" : ""} /></div>
        {lastResponse && (lastResponse.firstTokenMs || lastResponse.tokensPerSecond) && (
          <div className="response-metrics">
            {lastResponse.firstTokenMs && <span title="Время до первого фрагмента ответа"><Timer size={13} />{formatLatency(lastResponse.firstTokenMs)}</span>}
            {lastResponse.tokensPerSecond && <span title="Скорость генерации"><Gauge size={13} />{lastResponse.tokensPerSecond.toFixed(1)} ток/с</span>}
          </div>
        )}
      </section>

      <section className="context-card">
        <div className="context-card-title"><span>Инструменты</span><button onClick={onOpenSettings}><Settings2 size={14} /></button></div>
        <StatusRow icon={MonitorCog} label="Локальная модель" active={Boolean(status?.running)} />
        <StatusRow icon={Globe2} label="Веб-поиск" active={settings.webEnabled} />
        <StatusRow icon={TerminalSquare} label="Терминал" active={settings.terminalEnabled} />
        <StatusRow icon={AppWindow} label="Приложения" active={settings.computerEnabled} />
        <StatusRow icon={Sparkles} label="Генерация" active={Boolean(comfyStatus?.running)} />
      </section>

      <section className="context-card context-actions">
        <div className="context-card-title"><span>Быстрые действия</span></div>
        <button onClick={() => onAction("Найди актуальную информацию по моему вопросу")}><Globe2 size={15} /> Найти в интернете</button>
        <button onClick={onOpenStudio}><Sparkles size={15} /> Открыть Galen Studio</button>
        <button onClick={() => onAction("Помоги проанализировать файл — я прикреплю его следующим сообщением")}><FileSearch size={15} /> Разобрать файл</button>
        <button onClick={() => onAction("Проверь состояние этого компьютера и подскажи, что можно улучшить")}><MonitorCog size={15} /> Проверить компьютер</button>
      </section>

      <div className="context-signature"><span>Порядок — форма свободы.</span><strong>Galenite</strong></div>
    </aside>
  );
}

function formatLatency(milliseconds: number): string {
  if (milliseconds < 1000) return `${milliseconds} мс`;
  return `${(milliseconds / 1000).toFixed(milliseconds < 10_000 ? 1 : 0)} с до ответа`;
}

function StatusRow({ icon: Icon, label, active }: { icon: typeof Globe2; label: string; active: boolean }) {
  return <div className="context-status"><Icon size={15} /><span>{label}</span><i className={active ? "online" : ""} /></div>;
}
