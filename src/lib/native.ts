import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { getVersion } from "@tauri-apps/api/app";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { relaunch } from "@tauri-apps/plugin-process";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { attachmentPrompt, imagePayloads } from "./attachments";
import { isStableVersion, updateProgress } from "./update";
import type {
  AgentEvent,
  AppSettings,
  ChatMessage,
  ContentEngineStatus,
  HardwareInfo,
  MemoryCandidate,
  MemoryItem,
  OllamaModel,
  OllamaStatus,
  PullProgress,
  ReasoningLevel,
  UpdateInfo,
  UpdateProgress,
} from "../types";

let pendingUpdate: Update | null = null;

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

function apiMessages(messages: ChatMessage[]) {
  return messages
    .filter((message) => !message.error && !message.pending && message.role !== "system")
    .slice(-80)
    .map((message) => ({
      role: message.role,
      content: `${message.content}${attachmentPrompt(message.attachments ?? [])}`,
      images: imagePayloads(message.attachments ?? []),
    }));
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
  getComfyStatus: (): Promise<ContentEngineStatus> => safeInvoke("get_comfyui_status"),
  openComfy: (): Promise<void> => safeInvoke("open_comfyui"),
  listModels: (): Promise<OllamaModel[]> => safeInvoke("list_models"),
  deleteModel: (model: string): Promise<void> => safeInvoke("delete_model", { model }),

  pullModel: async (model: string, onProgress: (progress: PullProgress) => void): Promise<void> => {
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

  agentChat: async (
    requestId: string,
    model: string,
    messages: ChatMessage[],
    memories: MemoryItem[],
    reasoning: ReasoningLevel,
    settings: AppSettings,
    onEvent: (event: AgentEvent) => void,
  ): Promise<void> => {
    let unlisten: UnlistenFn | undefined;
    try {
      unlisten = await listen<AgentEvent>("agent-event", (event) => {
        if (event.payload.requestId === requestId) onEvent(event.payload);
      });
      await safeInvoke<void>("agent_chat", {
        request: {
          requestId,
          model,
          messages: apiMessages(messages),
          memories: settings.memoryEnabled
            ? memories.filter((memory) => memory.enabled).map(({ label, value }) => ({ label, value }))
            : [],
          reasoning,
          webEnabled: settings.webEnabled,
          terminalEnabled: settings.terminalEnabled,
          alwaysAllowTerminal: settings.alwaysAllowTerminal,
          workspaceDirectory: settings.workspaceDirectory || null,
          customInstructions: settings.customInstructions.trim() || null,
        },
      });
    } finally {
      unlisten?.();
    }
  },

  resolveApproval: (requestId: string, approvalId: string, approved: boolean): Promise<void> =>
    safeInvoke("resolve_tool_approval", { requestId, approvalId, approved }),

  cancelAgent: (requestId: string): Promise<void> => safeInvoke("cancel_agent", { requestId }),

  extractMemories: (
    model: string,
    userMessage: string,
    assistantMessage: string,
  ): Promise<MemoryCandidate[]> => safeInvoke("extract_memories", { model, userMessage, assistantMessage }),

  openUrl: (url: string): Promise<void> => safeInvoke("open_url", { url }),
  transcribeOnce: (): Promise<string> => safeInvoke("transcribe_once"),
  synthesizeSpeech: (text: string, voice: string, rate: number): Promise<string> =>
    safeInvoke("synthesize_speech", { text, voice, rate }),

  checkUpdate: async (): Promise<UpdateInfo> => {
    if (import.meta.env.VITE_TEST_RELEASE === "true") {
      return { available: false, currentVersion: "0.5.0-beta.1", error: "Тестовая версия: обновление устанавливается вручную" };
    }
    if (!isTauri()) return { available: false, currentVersion: "0.5.0" };
    const currentVersion = await getVersion().catch(() => "0.5.0");
    try {
      pendingUpdate?.close().catch(() => undefined);
      pendingUpdate = await check({ timeout: 30_000 });
      if (!pendingUpdate) return { available: false, currentVersion };
      if (!isStableVersion(pendingUpdate.version)) {
        await pendingUpdate.close();
        pendingUpdate = null;
        return { available: false, currentVersion, error: "Канал обновлений вернул нестабильную версию" };
      }
      return {
        available: true,
        currentVersion: pendingUpdate.currentVersion,
        latestVersion: pendingUpdate.version,
        tag: `v${pendingUpdate.version}`,
        notes: pendingUpdate.body,
        date: pendingUpdate.date,
      };
    } catch (error) {
      return {
        available: false,
        currentVersion,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  },

  installUpdate: async (onProgress: (progress: UpdateProgress) => void): Promise<void> => {
    if (import.meta.env.VITE_TEST_RELEASE === "true") throw new Error("В тестовой версии автообновление отключено");
    const update = pendingUpdate ?? await check({ timeout: 30_000 });
    if (!update) throw new Error("Новая версия больше недоступна");
    let downloaded = 0;
    let total = 0;
    await update.downloadAndInstall((event) => {
      if (event.event === "Started") {
        total = event.data.contentLength ?? 0;
        onProgress(updateProgress(0, total));
      } else if (event.event === "Progress") {
        downloaded += event.data.chunkLength;
        onProgress(updateProgress(downloaded, total));
      } else {
        onProgress(updateProgress(downloaded, total, "installing"));
      }
    }, { timeout: 10 * 60_000 });
    onProgress(updateProgress(downloaded, total, "done"));
    await relaunch();
  },
};
