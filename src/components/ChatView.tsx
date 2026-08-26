import { AnimatePresence, motion } from "motion/react";
import {
  AlertCircle, Check, CheckCircle2, Clipboard, ExternalLink, ShieldCheck,
  TerminalSquare, Volume2, XCircle,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { native } from "../lib/native";
import type { AgentPhase, ChatMessage, ToolApproval } from "../types";
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
}

const SUGGESTIONS = [
  "Найди главные новости об ИИ за сегодня",
  "Помоги разобраться с проектом на компьютере",
  "Проанализируй документ и выдели главное",
];

export function ChatView({
  messages, busy, hasModel, activity, approval, onOpenModels, onResolveApproval, onSuggestion,
}: ChatViewProps) {
  const endRef = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [speaking, setSpeaking] = useState<string | null>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: busy ? "auto" : "smooth", block: "end" });
  }, [messages, activity, approval, busy]);

  const copy = async (message: ChatMessage) => {
    await navigator.clipboard.writeText(message.content);
    setCopied(message.id);
    window.setTimeout(() => setCopied(null), 1400);
  };

  const speak = (message: ChatMessage) => {
    speechSynthesis.cancel();
    if (speaking === message.id) {
      setSpeaking(null);
      return;
    }
    const utterance = new SpeechSynthesisUtterance(message.content.replace(/[*_#`]/g, ""));
    utterance.lang = "ru-RU";
    utterance.rate = 1.02;
    utterance.onend = () => setSpeaking(null);
    utterance.onerror = () => setSpeaking(null);
    setSpeaking(message.id);
    speechSynthesis.speak(utterance);
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
                <div className="assistant-avatar"><span /></div>
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
                <div className="markdown">
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    components={{
                      a: ({ href, children }) => (
                        <button className="inline-link" onClick={() => href && void native.openUrl(href)}>
                          {children}<ExternalLink size={12} />
                        </button>
                      ),
                    }}
                  >
                    {message.content || (message.pending ? "" : "…")}
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
                    {message.tokensPerSecond && <span>{message.tokensPerSecond.toFixed(1)} ток/с</span>}
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
              <span>{activity.label}</span>
              <i /><i /><i />
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {approval && (
            <motion.section className="approval-card" initial={{ opacity: 0, y: 12, scale: 0.985 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0 }}>
              <div className="approval-head">
                <span><TerminalSquare size={18} /></span>
                <div><strong>Разрешить команду?</strong><p>{approval.reason ?? "Galen хочет использовать терминал"}</p></div>
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
