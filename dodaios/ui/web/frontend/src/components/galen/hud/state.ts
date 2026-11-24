export type DexStatus =
  | "idle" // very brief — before auto-engage fires
  | "listening_wake" // continuous recognition waiting for the wake word
  | "active_listening" // captured wake word, listening for command
  | "follow_up_listening" // listening for a follow-up turn after a reply
  | "thinking" // querying the agent
  | "speaking" // audio playing
  | "muted" // wake-word loop paused
  | "error" // unrecoverable error
  | "unsupported"; // browser doesn't support SpeechRecognition

export interface TranscriptTurn {
  id: string;
  role: "user" | "assistant";
  content: string;
}

/** Localized labels shared with the main voice interface. */
export const STATUS_LABEL_KEYS: Record<DexStatus, string> = {
  idle: "voice_state.idle",
  listening_wake: "voice_state.idle",
  active_listening: "voice_state.listening",
  follow_up_listening: "voice_state.listening",
  thinking: "voice_state.thinking",
  speaking: "voice_state.speaking",
  muted: "voice_state.paused",
  error: "voice_state.error",
  unsupported: "voice_state.offline",
};
