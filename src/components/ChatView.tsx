import { AnimatePresence, motion } from "motion/react";
import {
  AlertCircle, AppWindow, Brain, Check, CheckCircle2, ChevronDown, Clipboard, ExternalLink, Gauge, LoaderCircle, ShieldCheck,
  Sparkles, TerminalSquare, Timer, Volume2, XCircle,
} from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { native } from "../lib/native";
import galenLogo from "../assets/galen.svg";
import { visibleAnswer } from "../lib/reasoning";
import { speakText, stopSpeech } from "../lib/speech";
import type { AgentPhase, AppSettings, ChatMessage, ToolApproval } from "../types";
import { GalenOrb } from "./GalenOrb";

interface ChatViewProps {
  messages: ChatMessage[];
  busy: boolean;
  hasModel: boolean;
  activity: { phase: AgentPhase; label: string } | null;
  approval: ToolApproval | null;
  onOpenModels: () => void;
  onResolveApproval: (approved: boolean) => void;
  onSuggestion: (text: string) => void;
  settings: AppSettings;
}

const SUGGESTIONS = [
  "Нарисуй минималистичный постер для моего проекта",
  "Открой калькулятор на компьютере",
  "Проверь проект и запусти его тесты",
];

export function ChatView({
  messages, busy, hasModel, activity, approval, onOpenModels, onResolveApproval, onSuggestion, settings,
}: ChatViewProps) {
  const endRef = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [speaking, setSpeaking] = useState<string | null>(null);
  const [speechError, setSpeechError] = useState<string | null>(null);
  const [thinkingSeconds, setThinkingSeconds] = useState(0);

  useEffect(() => {
    if (!busy) {
      setThinkingSeconds(0);
      return;
    }
    const started = Date.now();
    const tick = () => setThinkingSeconds(Math.max(0, Math.floor((Date.now() - started) / 1000)));
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [busy]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: busy ? "auto" : "smooth", block: "end" });
  }, [messages, activity, approval, busy]);

  const copy = async (message: ChatMessage) => {
    await navigator.clipboard.writeText(message.content);
    setCopied(message.id);
    window.setTimeout(() => setCopied(null), 1400);
  };

  const speak = (message: ChatMessage) => {
    if (speaking === message.id) {
      stopSpeech();
      setSpeaking(null);
      return;
    }
    setSpeaking(message.id);
    setSpeechError(null);
    void speakText(message.content, settings)
      .catch(() => setSpeechError(message.id))
      .finally(() => setSpeaking(null));
  };

  if (!messages.length) {
    return (
      <main className="chat-empty page-enter">
        <div className="empty-orb"><GalenOrb active={hasModel} thinking={busy} /></div>
        <div className="empty-copy">
          <span className="eyebrow">Твой локальный агент</span>
          <h1>{hasModel ? "Чем могу помочь?" : "Подключим интеллект"}</h1>
          <p>{hasModel ? "Могу искать в интернете, читать файлы и работать с компьютером." : "Скачай модель — и всё останется на твоём компьютере."}</p>
          {!hasModel && <button className="primary-button" onClick={onOpenModels}>Выбрать модель</button>}
        </div>
        {hasModel && (
          <div className="prompt-suggestions">
            {SUGGESTIONS.map((suggestion) => <button key={suggestion} onClick={() => onSuggestion(suggestion)}>{suggestion}</button>)}
          </div>
        )}
      </main>
    );
  }

  return (
    <main className="chat-thread page-enter">
      <div className="messages">
        <AnimatePresence initial={false}>
          {messages.map((message) => (
            <motion.article
              key={message.id}
              className={`message message--${message.role} ${message.error ? "message--error" : ""}`}
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.34, ease: [0.22, 1, 0.36, 1] }}
            >
              {message.role === "assistant" && (
                <div className="assistant-avatar"><img src={galenLogo} alt="Galen" /></div>
              )}
              <div className="message-body">
                {!!message.attachments?.length && (
                  <div className="message-attachments">
                    {message.attachments.map((attachment) => (
                      <div key={attachment.id}>
                        {attachment.kind === "image" && attachment.dataUrl
                          ? <img src={attachment.dataUrl} alt={attachment.name} />
                          : <span>{attachment.name}</span>}
                      </div>
                    ))}
                  </div>
                )}
                {message.error && <div className="message-error-label"><AlertCircle size={15} /> Ошибка</div>}
                {!!message.reasoning && (
                  <details className="reasoning-block">
                    <summary><span><Brain size={15} /> Думал {formatReasoningTime(message.reasoningSeconds)}</span><ChevronDown size={14} /></summary>
                    <div><ReactMarkdown remarkPlugins={[remarkGfm]}>{message.reasoning}</ReactMarkdown></div>
                  </details>
                )}
                {!!message.toolRuns?.length && (
                  <div className="tool-ledger">
                    {message.toolRuns.map((tool) => (
                      <div className={`tool-ledger-row tool-ledger-row--${tool.status}`} key={tool.id}>
                        <span>{tool.name.includes("app") ? <AppWindow size={14} /> : tool.name.includes("generate") ? <Sparkles size={14} /> : <TerminalSquare size={14} />}</span>
                        <div><strong>{tool.label}</strong>{tool.detail && <small>{tool.detail}</small>}</div>
                        {tool.status === "running" ? <LoaderCircle className="spin" size={14} /> : tool.status === "success" ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />}
                        {tool.durationMs != null && <time>{formatToolDuration(tool.durationMs)}</time>}
                      </div>
                    ))}
                  </div>
                )}
                <div className="markdown">
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    components={{
                      a: ({ href, children }) => (
                        <button className="inline-link" onClick={() => href && void native.openUrl(href)}>
                          {children}<ExternalLink size={12} />
                        </button>
                      ),
                      pre: ({ children }) => <CodeBlock>{children}</CodeBlock>,
                      table: ({ children }) => <div className="table-scroll"><table>{children}</table></div>,
                    }}
                  >
                    {visibleAnswer(message.content) || (message.pending ? "" : "…")}
                  </ReactMarkdown>
                  {message.pending && !message.content && <span className="typing-dot"><i /><i /><i /></span>}
                </div>
                {!!message.sources?.length && (
                  <div className="source-cards">
                    {message.sources.slice(0, 5).map((source, index) => (
                      <button key={source.url} onClick={() => void native.openUrl(source.url)}>
                        <span>{index + 1}</span><div><strong>{source.title}</strong><small>{new URL(source.url).hostname}</small></div>
                      </button>
                    ))}
                  </div>
                )}
                {message.role === "assistant" && !message.pending && (
                  <div className="message-actions">
                    <button onClick={() => void copy(message)} title="Копировать">
                      {copied === message.id ? <Check size={14} /> : <Clipboard size={14} />}
                    </button>
                    <button onClick={() => speak(message)} title="Озвучить"><Volume2 size={15} /></button>
                    {speechError === message.id && <span>Нейронный голос недоступен</span>}
                    {message.firstTokenMs && <span title="Время до первого фрагмента"><Timer size={12} />{formatLatency(message.firstTokenMs)}</span>}
                    {message.tokensPerSecond && <span><Gauge size={12} />{message.tokensPerSecond.toFixed(1)} ток/с</span>}
                    {message.usedModel && <span className="message-model" title={message.usedModel}>{message.usedModel}</span>}
                  </div>
                )}
              </div>
            </motion.article>
          ))}
        </AnimatePresence>

        <AnimatePresence>
          {busy && activity && (
            <motion.div className="agent-activity" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
              <div className="activity-orb"><span /></div>
              <span>{activity.phase === "thinking" ? `Думаю${thinkingSeconds ? ` · ${thinkingSeconds} сек` : ""}` : activity.label}</span>
              <i /><i /><i />
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {approval && (
            <motion.section className="approval-card" initial={{ opacity: 0, y: 12, scale: 0.985 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0 }}>
              <div className="approval-head">
                <span><TerminalSquare size={18} /></span>
                <div><strong>{approval.kind === "application" ? "Открыть приложение?" : approval.kind === "file" ? "Изменить файл?" : "Выполнить команду?"}</strong><p>{approval.reason ?? "Galen просит разрешение на действие"}</p></div>
                <ShieldCheck size={20} />
              </div>
              <pre>{approval.command}</pre>
              {approval.cwd && <small>Папка: {approval.cwd}</small>}
              <div className="approval-actions">
                <button onClick={() => onResolveApproval(false)}><XCircle size={16} /> Отклонить</button>
                <button className="approve" onClick={() => onResolveApproval(true)}><CheckCircle2 size={16} /> Выполнить</button>
              </div>
            </motion.section>
          )}
        </AnimatePresence>
        <div ref={endRef} />
      </div>
    </main>
  );
}

function formatReasoningTime(seconds?: number): string {
  if (!seconds) return "несколько секунд";
  const value = Math.max(1, Math.round(seconds));
  return value < 60 ? `${value} сек` : `${Math.floor(value / 60)} мин ${value % 60} сек`;
}

function formatLatency(milliseconds: number): string {
  return milliseconds < 1000 ? `${milliseconds} мс` : `${(milliseconds / 1000).toFixed(1)} с`;
}

function formatToolDuration(milliseconds: number): string {
  return milliseconds < 1000 ? `${milliseconds} мс` : `${(milliseconds / 1000).toFixed(1)} с`;
}

function CodeBlock({ children }: { children?: ReactNode }) {
  const [copied, setCopied] = useState(false);
  const content = String((children as { props?: { children?: unknown } })?.props?.children ?? "").replace(/\n$/, "");
  const language = String((children as { props?: { className?: string } })?.props?.className ?? "").replace("language-", "") || "code";
  return <div className="code-block"><div><span>{language}</span><button onClick={() => { void navigator.clipboard.writeText(content); setCopied(true); window.setTimeout(() => setCopied(false), 1200); }}>{copied ? <Check size={13} /> : <Clipboard size={13} />}{copied ? "Скопировано" : "Копировать"}</button></div><pre>{children}</pre></div>;
}
