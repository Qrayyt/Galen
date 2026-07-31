import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import type {
  ChatMessage,
  ChatToken,
  HardwareInfo,
  OllamaModel,
  OllamaStatus,
  PullProgress,
  UpdateInfo,
} from "../types";

export const isTauri = (): boolean => "__TAURI_INTERNALS__" in window;

const fallbackHardware: HardwareInfo = {
  cpu: "Доступно в приложении",
  cpuCores: 0,
  ramTotalGb: 0,
  gpu: "Доступно в приложении",
  vramGb: null,
  operatingSystem: "Web preview",
  desktop: "Browser",
  architecture: "x86_64",
};

async function safeInvoke<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  if (!isTauri()) throw new Error("Эта функция доступна только в приложении Galen");
  return invoke<T>(command, args);
}

export const native = {
  minimize: () => (isTauri() ? getCurrentWindow().minimize() : Promise.resolve()),
  toggleMaximize: () => (isTauri() ? getCurrentWindow().toggleMaximize() : Promise.resolve()),
  close: () => (isTauri() ? getCurrentWindow().close() : Promise.resolve()),

  getHardware: async (): Promise<HardwareInfo> => {
    if (!isTauri()) return fallbackHardware;
    return safeInvoke<HardwareInfo>("get_hardware_info");
  },

  getOllamaStatus: (): Promise<OllamaStatus> => safeInvoke("get_ollama_status"),
  startOllama: (): Promise<OllamaStatus> => safeInvoke("start_ollama"),
  listModels: (): Promise<OllamaModel[]> => safeInvoke("list_models"),
  deleteModel: (model: string): Promise<void> => safeInvoke("delete_model", { model }),

  pullModel: async (
    model: string,
    onProgress: (progress: PullProgress) => void,
  ): Promise<void> => {
    let unlisten: UnlistenFn | undefined;
    try {
      unlisten = await listen<PullProgress>("model-pull-progress", (event) => {
        if (event.payload.model === model) onProgress(event.payload);
      });
      await safeInvoke<void>("pull_model", { model });
    } finally {
      unlisten?.();
    }
  },

  chat: async (
    requestId: string,
    model: string,
    messages: ChatMessage[],
    onToken: (token: ChatToken) => void,
  ): Promise<void> => {
    let unlisten: UnlistenFn | undefined;
    try {
      unlisten = await listen<ChatToken>("chat-token", (event) => {
        if (event.payload.requestId === requestId) onToken(event.payload);
      });
      await safeInvoke<void>("chat", {
        request: {
          requestId,
          model,
          messages: messages
            .filter((message) => !message.error && !message.pending)
            .map(({ role, content }) => ({ role, content })),
        },
      });
    } finally {
      unlisten?.();
    }
  },

  checkUpdate: (): Promise<UpdateInfo> => safeInvoke("check_for_update"),
  downloadUpdate: (tag: string): Promise<string> => safeInvoke("download_update", { tag }),
  restartIntoUpdate: (path: string): Promise<void> => safeInvoke("restart_into_update", { path }),
};

