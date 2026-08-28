import type { AppSettings } from "../types";
import { isTauri, native } from "./native";

let audio: HTMLAudioElement | null = null;
let finishPlayback: (() => void) | null = null;

export function stopSpeech(): void {
  speechSynthesis.cancel();
  if (audio) {
    audio.pause();
    audio.src = "";
    audio = null;
  }
  finishPlayback?.();
  finishPlayback = null;
}

function cleanForSpeech(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, " Кодовый блок пропущен. ")
    .replace(/https?:\/\/\S+/g, "ссылка")
    .replace(/[*_#>`|]/g, "")
    .trim();
}

export async function speakText(text: string, settings: AppSettings): Promise<void> {
  stopSpeech();
  const clean = cleanForSpeech(text);
  if (!clean) return;
  if (settings.voiceEngine === "neural" && isTauri()) {
    try {
      const encoded = await native.synthesizeSpeech(clean, settings.voiceId, settings.voiceRate);
      audio = new Audio(`data:audio/mpeg;base64,${encoded}`);
      await new Promise<void>((resolve, reject) => {
        const current = audio!;
        finishPlayback = resolve;
        current.onended = () => resolve();
        current.onerror = () => reject(new Error("Не удалось воспроизвести нейронный голос"));
        void current.play().catch(reject);
      });
      audio = null;
      finishPlayback = null;
      return;
    } catch (error) {
      stopSpeech();
      throw new Error(error instanceof Error ? error.message : "Нейронный голос сейчас недоступен");
    }
  }
  const utterance = new SpeechSynthesisUtterance(clean);
  utterance.lang = "ru-RU";
  utterance.rate = settings.voiceRate;
  speechSynthesis.speak(utterance);
}
