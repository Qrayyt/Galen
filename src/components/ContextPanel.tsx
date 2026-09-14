import { ChevronRight, Eye, FileSearch, Globe2, MonitorCog, Settings2, Sparkles, TerminalSquare } from "lucide-react";
import galenLogo from "../assets/galen.svg";
import type { AppSettings, ContentEngineStatus, OllamaStatus } from "../types";

interface ContextPanelProps {
  model?: string;
  visionModel?: string;
  status: OllamaStatus | null;
  comfyStatus: ContentEngineStatus | null;
  settings: AppSettings;
  onOpenModels: () => void;
  onOpenSettings: () => void;
  onAction: (prompt: string) => void;
}

export function ContextPanel({
  model, visionModel, status, comfyStatus, settings, onOpenModels, onOpenSettings, onAction,
}: ContextPanelProps) {
  return (
    <aside className="context-panel">
      <section className="context-card context-model-card">
        <div className="context-kicker">Разговорная модель</div>
        <button className="context-model" onClick={onOpenModels}>
          <span className="context-model-logo"><img src={galenLogo} alt="" /></span>
          <span><strong>{model ?? "Не выбрана"}</strong><small>{status?.running ? "Готова к работе" : "Ollama не подключена"}</small></span>
          <ChevronRight size={15} />
        </button>
        <div className="vision-route"><Eye size={14} /><span><strong>Vision</strong><small>{visionModel ?? "Не настроена"}</small></span><i className={visionModel ? "online" : ""} /></div>
      </section>

      <section className="context-card">
        <div className="context-card-title"><span>Инструменты</span><button onClick={onOpenSettings}><Settings2 size={14} /></button></div>
        <StatusRow icon={MonitorCog} label="Локальная модель" active={Boolean(status?.running)} />
        <StatusRow icon={Globe2} label="Веб-поиск" active={settings.webEnabled} />
        <StatusRow icon={TerminalSquare} label="Терминал" active={settings.terminalEnabled} />
        <StatusRow icon={Sparkles} label="Генерация" active={Boolean(comfyStatus?.running)} />
      </section>

      <section className="context-card context-actions">
        <div className="context-card-title"><span>Быстрые действия</span></div>
        <button onClick={() => onAction("Найди актуальную информацию по моему вопросу")}><Globe2 size={15} /> Найти в интернете</button>
        <button onClick={() => onAction("Помоги проанализировать файл — я прикреплю его следующим сообщением")}><FileSearch size={15} /> Разобрать файл</button>
        <button onClick={() => onAction("Проверь состояние этого компьютера и подскажи, что можно улучшить")}><MonitorCog size={15} /> Проверить компьютер</button>
      </section>

      <div className="context-signature"><span>Порядок — форма свободы.</span><strong>Galenite</strong></div>
    </aside>
  );
}

function StatusRow({ icon: Icon, label, active }: { icon: typeof Globe2; label: string; active: boolean }) {
  return <div className="context-status"><Icon size={15} /><span>{label}</span><i className={active ? "online" : ""} /></div>;
}
