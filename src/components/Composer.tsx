import {
  ArrowUp, Brain, ChevronDown, FileText, Globe2, Headphones, Image as ImageIcon,
  LoaderCircle, Mic, Paperclip, Square, WandSparkles, X,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState, type ClipboardEvent, type DragEvent, type KeyboardEvent } from "react";
import { prepareAttachment } from "../lib/attachments";
import { isTauri, native } from "../lib/native";
import type { Attachment, ReasoningLevel } from "../types";

interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start(): void;
  stop(): void;
  onresult: ((event: { results: ArrayLike<{ 0: { transcript: string }; isFinal: boolean }> }) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
}

interface ComposerProps {
  disabled?: boolean;
  busy?: boolean;
  modelLabel?: string;
  reasoning: ReasoningLevel;
  webEnabled: boolean;
  visionModelLabel?: string;
  onReasoningChange: (level: ReasoningLevel) => void;
  onSend: (message: string, attachments: Attachment[]) => void;
  onStop: () => void;
  onVoiceMode: () => void;
  onOpenStudio: () => void;
}

const LEVELS: Array<{ id: ReasoningLevel; label: string; detail: string }> = [
  { id: "light", label: "Лёгкий", detail: "Максимальная скорость" },
  { id: "medium", label: "Средний", detail: "Баланс скорости и качества" },
  { id: "heavy", label: "Тяжёлый", detail: "Глубокий анализ и больше шагов" },
];

export function Composer({
  disabled, busy, modelLabel, reasoning, webEnabled, visionModelLabel, onReasoningChange, onSend, onStop, onVoiceMode, onOpenStudio,
}: ComposerProps) {
  const [value, setValue] = useState("");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [processing, setProcessing] = useState(false);
  const [listening, setListening] = useState(false);
  const [reasoningOpen, setReasoningOpen] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [attachmentError, setAttachmentError] = useState<string | null>(null);
  const areaRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);

  useEffect(() => {
    const area = areaRef.current;
    if (!area) return;
    area.style.height = "24px";
    area.style.height = `${Math.min(area.scrollHeight, 168)}px`;
  }, [value]);

  const submit = () => {
    const next = value.trim();
    if ((!next && !attachments.length) || disabled || busy || processing) return;
    onSend(next || "Проанализируй вложение.", attachments);
    setValue("");
    setAttachments([]);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      submit();
    }
  };

  const pickFiles = async (files: File[]) => {
    if (!files.length) return;
    const slots = Math.max(0, 8 - attachments.length);
    if (!slots) {
      setAttachmentError("Можно прикрепить не больше 8 файлов за сообщение.");
      return;
    }
    setProcessing(true);
    setAttachmentError(null);
    try {
      const prepared: Attachment[] = [];
      const errors: string[] = [];
      for (const file of files.slice(0, slots)) {
        try { prepared.push(await prepareAttachment(file)); }
        catch (error) { errors.push(error instanceof Error ? error.message : String(error)); }
      }
      setAttachments((current) => [...current, ...prepared].slice(0, 8));
      if (errors.length) setAttachmentError(errors.join(" "));
    } finally {
      setProcessing(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const handlePaste = (event: ClipboardEvent<HTMLTextAreaElement>) => {
    const files = Array.from(event.clipboardData.files);
    if (!files.length) return;
    event.preventDefault();
    void pickFiles(files);
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragActive(false);
    if (!disabled && !busy) void pickFiles(Array.from(event.dataTransfer.files));
  };

  const toggleListening = async () => {
    if (listening) {
      recognitionRef.current?.stop();
      setListening(false);
      return;
    }
    if (isTauri()) {
      setListening(true);
      try {
        const transcript = await native.transcribeOnce();
        setValue((current) => current ? `${current} ${transcript}` : transcript);
        setListening(false);
        return;
      } catch {
        setListening(false);
        // Fall through to Web Speech when the Windows language pack is unavailable.
      }
    }
    const SpeechRecognition = (window as unknown as {
      SpeechRecognition?: new () => SpeechRecognitionLike;
      webkitSpeechRecognition?: new () => SpeechRecognitionLike;
    }).SpeechRecognition ?? (window as unknown as {
      webkitSpeechRecognition?: new () => SpeechRecognitionLike;
    }).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      window.alert("Голосовой ввод недоступен в этой версии WebView2. Используй голосовой режим или обнови WebView2.");
      return;
    }
    const recognition = new SpeechRecognition();
    recognition.lang = "ru-RU";
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.onresult = (event) => {
      const transcript = Array.from(event.results).map((result) => result[0].transcript).join("");
      setValue(transcript);
    };
    recognition.onend = () => setListening(false);
    recognition.onerror = () => setListening(false);
    recognitionRef.current = recognition;
    setListening(true);
    recognition.start();
  };

  const selected = LEVELS.find((level) => level.id === reasoning)!;

  return (
    <div
      className={`composer-dock ${dragActive ? "composer-dock--drag" : ""}`}
      onDragEnter={(event) => { event.preventDefault(); setDragActive(true); }}
      onDragOver={(event) => event.preventDefault()}
      onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragActive(false); }}
      onDrop={handleDrop}
    >
      <AnimatePresence>
        {!!attachments.length && (
          <motion.div className="attachment-strip" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            {attachments.map((attachment) => (
              <div className="attachment-chip" key={attachment.id}>
                {attachment.kind === "image" && attachment.dataUrl
                  ? <img src={attachment.dataUrl} alt="" />
                  : attachment.kind === "image" ? <ImageIcon size={15} /> : <FileText size={15} />}
                <span><strong>{attachment.name}</strong><small>{attachment.kind === "image" ? "Изображение для Vision" : "Вложение"}</small></span>
                <button onClick={() => setAttachments((items) => items.filter((item) => item.id !== attachment.id))}><X size={13} /></button>
              </div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      {attachmentError && <div className="attachment-error"><X size={13} /><span>{attachmentError}</span><button onClick={() => setAttachmentError(null)}>Скрыть</button></div>}

      <div className={`composer ${disabled ? "composer--disabled" : ""}`}>
        {dragActive && <div className="composer-drop"><Paperclip size={19} /><span>Отпусти файлы здесь</span></div>}
        <textarea
          ref={areaRef}
          value={value}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          rows={1}
          disabled={disabled}
          placeholder={disabled ? "Сначала скачай и подключи модель" : "Спроси что угодно"}
          aria-label="Сообщение"
        />

        <div className="composer-toolbar">
          <div className="composer-tools">
            <input
              ref={fileRef}
              type="file"
              multiple
              hidden
              accept="image/*,.pdf,.docx,.txt,.md,.csv,.json,.js,.ts,.tsx,.py,.rs"
              onChange={(event) => void pickFiles(Array.from(event.target.files ?? []))}
            />
            <button onClick={() => fileRef.current?.click()} disabled={processing} title="Прикрепить файл">
              {processing ? <LoaderCircle className="spin" size={18} /> : <Paperclip size={18} />}
            </button>
            <button className={listening ? "active" : ""} onClick={() => void toggleListening()} title="Голосовой ввод"><Mic size={18} /></button>
            <button onClick={onVoiceMode} title="Голосовой чат"><Headphones size={18} /></button>
            <button onClick={onOpenStudio} title="Galen Studio"><WandSparkles size={18} /></button>
            {webEnabled && <span className="tool-indicator" title="Интернет включён"><Globe2 size={14} /> Веб</span>}
            {attachments.some((attachment) => attachment.kind === "image") && (
              <span className={`tool-indicator ${visionModelLabel ? "tool-indicator--vision" : "tool-indicator--warning"}`}>
                <ImageIcon size={14} /> {visionModelLabel ? `Vision · ${visionModelLabel}` : "Vision не настроена"}
              </span>
            )}
          </div>

          <div className="composer-actions">
            <div className="reasoning-control">
              <button className="reasoning-trigger" onClick={() => setReasoningOpen((open) => !open)}>
                <Brain size={15} />
                <span>{selected.label}</span>
                <ChevronDown size={13} />
              </button>
              <AnimatePresence>
                {reasoningOpen && (
                  <motion.div className="reasoning-menu" initial={{ opacity: 0, y: 8, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 5 }}>
                    {LEVELS.map((level) => (
                      <button
                        key={level.id}
                        className={reasoning === level.id ? "active" : ""}
                        onClick={() => { onReasoningChange(level.id); setReasoningOpen(false); }}
                      >
                        <span>{level.label}</span><small>{level.detail}</small>
                      </button>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
            <span className="composer-model" title={modelLabel}>{modelLabel ?? "Нет модели"}</span>
            <button
              className={`send-button ${value.trim() || attachments.length ? "send-button--ready" : ""}`}
              onClick={busy ? onStop : submit}
              disabled={!busy && ((!value.trim() && !attachments.length) || disabled || processing)}
              aria-label={busy ? "Остановить" : "Отправить"}
            >
              {busy ? <Square size={12} fill="currentColor" /> : <ArrowUp size={19} />}
            </button>
          </div>
        </div>
      </div>
      <div className="composer-footnote">Galen работает локально. Команды терминала выполняются только после твоего подтверждения.</div>
    </div>
  );
}
