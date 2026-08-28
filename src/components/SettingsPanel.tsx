import {
  Bot, Check, Database, Globe2, HardDrive, MemoryStick, Mic2,
  Plus, RefreshCw, Shield, TerminalSquare, Trash2, Volume2,
} from "lucide-react";
import { useState } from "react";
import { speakText } from "../lib/speech";
import type { AppSettings, HardwareInfo, MemoryItem, OllamaStatus, UpdateInfo } from "../types";

interface SettingsPanelProps {
  settings: AppSettings;
  memories: MemoryItem[];
  hardware: HardwareInfo | null;
  status: OllamaStatus | null;
  update: UpdateInfo | null;
  updating: boolean;
  onSettings: (settings: AppSettings) => void;
  onMemories: (memories: MemoryItem[]) => void;
  onRefresh: () => void;
  onInstallUpdate: () => void;
}

const categories: Record<MemoryItem["category"], string> = {
  profile: "О пользователе",
  preference: "Предпочтение",
  project: "Проект",
  other: "Другое",
};

export function SettingsPanel({
  settings, memories, hardware, status, update, updating, onSettings, onMemories, onRefresh, onInstallUpdate,
}: SettingsPanelProps) {
  const [draft, setDraft] = useState({ label: "", value: "" });
  const [voiceTest, setVoiceTest] = useState<"idle" | "playing" | "error">("idle");

  const patch = (next: Partial<AppSettings>) => onSettings({ ...settings, ...next });
  const addMemory = () => {
    if (!draft.label.trim() || !draft.value.trim()) return;
    const now = Date.now();
    onMemories([...memories, {
      id: crypto.randomUUID(), label: draft.label.trim(), value: draft.value.trim(),
      category: "other", enabled: true, createdAt: now, updatedAt: now,
    }]);
    setDraft({ label: "", value: "" });
  };

  const testVoice = () => {
    setVoiceTest("playing");
    void speakText("Привет. Это голос Галена. Я готов помочь.", settings)
      .then(() => setVoiceTest("idle"))
      .catch(() => setVoiceTest("error"));
  };

  return (
    <main className="settings-page page-enter">
      <section className="settings-hero">
        <span className="eyebrow">Настройки Galen</span>
        <h1>Контроль без чёрного ящика</h1>
        <p>Интернет, терминал, память и голос можно отключить независимо.</p>
      </section>

      <div className="settings-layout">
        <section className="settings-main">
          <div className="settings-section">
            <div className="section-heading">
              <span><Bot size={18} /></span><div><h2>Возможности агента</h2><p>Что Galen может использовать во время ответа</p></div>
            </div>
            <Toggle
              icon={<Globe2 size={18} />} title="Доступ в интернет"
              detail="Поиск и чтение актуальных веб-страниц"
              checked={settings.webEnabled} onChange={(checked) => patch({ webEnabled: checked })}
            />
            <Toggle
              icon={<TerminalSquare size={18} />} title="Терминал"
              detail="Каждая команда требует отдельного подтверждения"
              checked={settings.terminalEnabled} onChange={(checked) => patch({ terminalEnabled: checked })}
            />
            <Toggle
              icon={<Database size={18} />} title="Память между чатами"
              detail="Galen предлагает сохранять полезные постоянные факты"
              checked={settings.memoryEnabled} onChange={(checked) => patch({ memoryEnabled: checked })}
            />
          </div>

          <div className="settings-section">
            <div className="section-heading">
              <span><MemoryStick size={18} /></span>
              <div><h2>Память о тебе</h2><p>Можно исправить, отключить или удалить любую запись</p></div>
              {!!memories.length && (
                <button className="danger-text" onClick={() => {
                  if (window.confirm("Удалить всю память Galen о пользователе?")) onMemories([]);
                }}><Trash2 size={14} /> Очистить всё</button>
              )}
            </div>
            <div className="memory-list">
              {memories.map((memory) => (
                <div className={`memory-row ${memory.enabled ? "" : "disabled"}`} key={memory.id}>
                  <button className={`memory-check ${memory.enabled ? "checked" : ""}`} onClick={() => onMemories(memories.map((item) => item.id === memory.id ? { ...item, enabled: !item.enabled } : item))}>
                    {memory.enabled && <Check size={12} />}
                  </button>
                  <div>
                    <input
                      value={memory.label}
                      onChange={(event) => onMemories(memories.map((item) => item.id === memory.id ? { ...item, label: event.target.value, updatedAt: Date.now() } : item))}
                    />
                    <textarea
                      value={memory.value}
                      onChange={(event) => onMemories(memories.map((item) => item.id === memory.id ? { ...item, value: event.target.value, updatedAt: Date.now() } : item))}
                    />
                    <small>{categories[memory.category]}</small>
                  </div>
                  <button className="memory-delete" onClick={() => onMemories(memories.filter((item) => item.id !== memory.id))}><Trash2 size={15} /></button>
                </div>
              ))}
              {!memories.length && <div className="empty-memory"><Database size={24} /><p>Память пока пуста. Она наполнится полезными фактами из разговоров.</p></div>}
            </div>
            <div className="memory-add">
              <Plus size={17} />
              <input placeholder="Название" value={draft.label} onChange={(event) => setDraft({ ...draft, label: event.target.value })} />
              <input placeholder="Что нужно помнить" value={draft.value} onChange={(event) => setDraft({ ...draft, value: event.target.value })} onKeyDown={(event) => event.key === "Enter" && addMemory()} />
              <button onClick={addMemory}>Добавить</button>
            </div>
          </div>

          <div className="settings-section">
            <div className="section-heading"><span><Mic2 size={18} /></span><div><h2>Голос</h2><p>Ввод с микрофона и озвучивание ответов</p></div></div>
            <Toggle icon={<Volume2 size={18} />} title="Озвучивать ответы автоматически" detail="После окончания генерации" checked={settings.autoSpeak} onChange={(checked) => patch({ autoSpeak: checked })} />
            <div className="voice-settings">
              <label><span>Движок</span><select value={settings.voiceEngine} onChange={(event) => patch({ voiceEngine: event.target.value as AppSettings["voiceEngine"] })}><option value="neural">Galen Neural · естественный</option><option value="system">Системный · офлайн</option></select></label>
              {settings.voiceEngine === "neural" && <label><span>Голос</span><select value={settings.voiceId} onChange={(event) => patch({ voiceId: event.target.value })}><option value="ru-RU-DmitryNeural">Дмитрий · мужской</option><option value="ru-RU-SvetlanaNeural">Светлана · женский</option></select></label>}
              <label className="voice-rate"><span>Скорость <b>{settings.voiceRate.toFixed(2)}×</b></span><input type="range" min="0.75" max="1.25" step="0.01" value={settings.voiceRate} onChange={(event) => patch({ voiceRate: Number(event.target.value) })} /></label>
            </div>
            {settings.voiceEngine === "neural" && <p className="security-note"><Globe2 size={14} /> Для синтеза текст отправляется в Microsoft Edge TTS. Ключ и аккаунт не нужны. Системный режим работает офлайн.</p>}
            <button className="settings-action" onClick={testVoice}><Volume2 size={16} /> {voiceTest === "playing" ? "Говорю…" : "Проверить голос"}</button>
            {voiceTest === "error" && <p className="inline-error">Нейронный голос сейчас недоступен. Проверь интернет и повтори — на системного робота Galen больше молча не переключается.</p>}
          </div>

          <div className="settings-section">
            <div className="section-heading"><span><HardDrive size={18} /></span><div><h2>Рабочая папка</h2><p>Базовая папка для команд терминала</p></div></div>
            <label className="workspace-field">
              <span>Путь</span>
              <input value={settings.workspaceDirectory} onChange={(event) => patch({ workspaceDirectory: event.target.value })} placeholder="Например C:\\Users\\Имя\\Projects" />
            </label>
            <p className="security-note"><Shield size={14} /> Путь не даёт автоматического разрешения: каждую команду всё равно нужно подтвердить.</p>
          </div>
        </section>

        <aside className="settings-aside">
          <div className="status-card">
            <div className="status-card-head"><strong>Система</strong><button onClick={onRefresh}><RefreshCw size={15} /></button></div>
            <StatusLine label="Ollama" value={status?.running ? `Работает · ${status.version ?? ""}` : "Не подключена"} ok={Boolean(status?.running)} />
            <StatusLine label="Процессор" value={hardware?.cpu ?? "Определяем…"} />
            <StatusLine label="Память" value={hardware ? `${hardware.ramTotalGb} ГБ` : "—"} />
            <StatusLine label="Графика" value={hardware?.gpu ?? "—"} />
            <StatusLine label="VRAM" value={hardware?.vramGb ? `${hardware.vramGb} ГБ` : "—"} />
          </div>
          <div className="status-card">
            <strong>Обновления</strong>
            <p>Текущая версия {update?.currentVersion ?? "0.4.0"}</p>
            {update?.available ? (
              <button className="primary-button" disabled={updating} onClick={onInstallUpdate}>{updating ? "Загружаем…" : `Установить ${update.latestVersion}`}</button>
            ) : <span className="up-to-date"><Check size={14} /> Актуальная версия</span>}
          </div>
          <div className="privacy-card"><Shield size={22} /><strong>Private by design</strong><p>Чаты, документы и память хранятся на этом компьютере. При включённых функциях наружу уходят веб-запросы и текст для нейронной озвучки — это всегда видно в настройках.</p></div>
        </aside>
      </div>
    </main>
  );
}

function Toggle({ icon, title, detail, checked, onChange }: {
  icon: React.ReactNode; title: string; detail: string; checked: boolean; onChange: (value: boolean) => void;
}) {
  return (
    <div className="toggle-row">
      <span className="toggle-icon">{icon}</span>
      <div><strong>{title}</strong><p>{detail}</p></div>
      <button className={`switch ${checked ? "on" : ""}`} onClick={() => onChange(!checked)}><span /></button>
    </div>
  );
}

function StatusLine({ label, value, ok }: { label: string; value: string; ok?: boolean }) {
  return <div className="status-line"><span>{label}</span><strong>{ok && <i />}{value}</strong></div>;
}
