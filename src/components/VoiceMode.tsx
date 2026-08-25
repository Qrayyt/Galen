import { Mic, MicOff, PhoneOff, Volume2 } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import type { AgentPhase, ChatMessage } from "../types";
import { GalenOrb } from "./GalenOrb";
import { isTauri, native } from "../lib/native";

interface Recognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start(): void;
  stop(): void;
  onresult: ((event: { results: ArrayLike<{ 0: { transcript: string }; isFinal: boolean }> }) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
}

export function VoiceMode({
  open, busy, activity, lastAssistant, onClose, onSend,
}: {
  open: boolean;
  busy: boolean;
  activity: { phase: AgentPhase; label: string } | null;
  lastAssistant?: ChatMessage;
  onClose: () => void;
  onSend: (text: string) => void;
}) {
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const recognitionRef = useRef<Recognition | null>(null);
  const spokenRef = useRef<string | null>(null);

  useEffect(() => {
    if (!open || !lastAssistant?.content || lastAssistant.pending || spokenRef.current === lastAssistant.id) return;
    spokenRef.current = lastAssistant.id;
    speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(lastAssistant.content.replace(/[*_#`]/g, ""));
    utterance.lang = "ru-RU";
    utterance.rate = 1.03;
    speechSynthesis.speak(utterance);
  }, [lastAssistant, open]);

  useEffect(() => () => {
    recognitionRef.current?.stop();
    speechSynthesis.cancel();
  }, []);

  const start = async () => {
    if (isTauri()) {
      setListening(true);
      speechSynthesis.cancel();
      try {
        const text = await native.transcribeOnce();
        setTranscript("");
        setListening(false);
        if (text.trim() && !busy) onSend(text.trim());
        return;
      } catch {
        setListening(false);
        // Use Web Speech as a fallback when the native recognizer is unavailable.
      }
    }
    const Constructor = (window as unknown as {
      SpeechRecognition?: new () => Recognition;
      webkitSpeechRecognition?: new () => Recognition;
    }).SpeechRecognition ?? (window as unknown as { webkitSpeechRecognition?: new () => Recognition }).webkitSpeechRecognition;
    if (!Constructor) {
      window.alert("Распознавание речи недоступно в WebView2. Обнови Microsoft Edge WebView2 Runtime.");
      return;
    }
    speechSynthesis.cancel();
    const recognition = new Constructor();
    recognition.lang = "ru-RU";
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.onresult = (event) => {
      const next = Array.from(event.results).map((result) => result[0].transcript).join("");
      setTranscript(next);
    };
    recognition.onend = () => {
      setListening(false);
      setTranscript((current) => {
        if (current.trim() && !busy) onSend(current.trim());
        return "";
      });
    };
    recognition.onerror = () => setListening(false);
    recognitionRef.current = recognition;
    setListening(true);
    recognition.start();
  };

  const stop = () => {
    recognitionRef.current?.stop();
    setListening(false);
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div className="voice-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <motion.div className="voice-panel" initial={{ y: 24, scale: 0.97 }} animate={{ y: 0, scale: 1 }} exit={{ y: 20, scale: 0.98 }}>
            <div className="voice-top"><span>Голосовой режим</span><i>Локальный диалог</i></div>
            <div className="voice-orb"><GalenOrb active thinking={busy || listening} /></div>
            <div className="voice-state">
              <strong>{busy ? activity?.label ?? "Думаю" : listening ? "Слушаю" : "Нажми на микрофон"}</strong>
              <p>{transcript || (lastAssistant?.content ? lastAssistant.content.slice(0, 160) : "Можно говорить естественно — Galen ответит голосом.")}</p>
            </div>
            <div className="voice-wave" aria-hidden>{Array.from({ length: 21 }, (_, index) => <i key={index} style={{ animationDelay: `${index * 34}ms` }} />)}</div>
            <div className="voice-actions">
              <button className={`voice-mic ${listening ? "active" : ""}`} onClick={listening ? stop : () => void start()} disabled={busy}>
                {listening ? <MicOff size={23} /> : <Mic size={23} />}
              </button>
              <button onClick={() => {
                if (!lastAssistant) return;
                const utterance = new SpeechSynthesisUtterance(lastAssistant.content.replace(/[*_#\`]/g, ""));
                utterance.lang = "ru-RU";
                speechSynthesis.cancel();
                speechSynthesis.speak(utterance);
              }}><Volume2 size={20} /></button>
              <button className="voice-end" onClick={onClose}><PhoneOff size={20} /></button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
