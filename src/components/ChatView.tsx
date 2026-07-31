import { AnimatePresence, motion } from "motion/react";
import { AlertCircle, RotateCcw } from "lucide-react";
import { useEffect, useRef } from "react";
import type { ChatMessage } from "../types";
import { GalenOrb } from "./GalenOrb";

interface ChatViewProps {
  messages: ChatMessage[];
  busy: boolean;
  hasModel: boolean;
  onOpenModels: () => void;
  onClear: () => void;
}

export function ChatView({ messages, busy, hasModel, onOpenModels, onClear }: ChatViewProps) {
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages]);

  if (!messages.length) {
    return (
      <main className="chat-empty page-enter">
        <div className="hero-orb-wrap">
          <GalenOrb active={hasModel} thinking={busy} />
        </div>
        <div className="hero-copy">
          <h1>Привет, я Гален.</h1>
          {hasModel ? (
            <p>Чем займёмся сегодня?</p>
          ) : (
            <>
              <p>Для начала выберем локальную модель.</p>
              <button className="text-action" onClick={onOpenModels}>Открыть библиотеку →</button>
            </>
          )}
        </div>
      </main>
    );
  }

  return (
    <main className="chat-thread page-enter">
      <div className="thread-head">
        <div className="thread-title">
          <GalenOrb compact active thinking={busy} />
          <div>
            <strong>Диалог с Галеном</strong>
            <span>{busy ? "Думает…" : "Локально на этом компьютере"}</span>
          </div>
        </div>
        <button className="subtle-button" onClick={onClear} title="Очистить диалог">
          <RotateCcw size={15} />
          Новый диалог
        </button>
      </div>
      <div className="messages">
        <AnimatePresence initial={false}>
          {messages.map((message) => (
            <motion.article
              key={message.id}
              className={`message message--${message.role} ${message.error ? "message--error" : ""}`}
              initial={{ opacity: 0, y: 18, scale: 0.985 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ type: "spring", stiffness: 240, damping: 24 }}
            >
              {message.role === "assistant" && <span className="message-author">Гален</span>}
              <div className="message-content">
                {message.error && <AlertCircle size={17} />}
                <p>{message.content || (message.pending ? "" : "…")}</p>
                {message.pending && <span className="typing-caret" />}
              </div>
            </motion.article>
          ))}
        </AnimatePresence>
        <div ref={endRef} />
      </div>
    </main>
  );
}

