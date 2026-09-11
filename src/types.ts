export type ViewId = "chat" | "models" | "settings";
export type MessageRole = "user" | "assistant" | "system";
export type ReasoningLevel = "light" | "medium" | "heavy";
export type AttachmentKind = "image" | "pdf" | "document" | "text";
export type AgentPhase =
  | "idle"
  | "thinking"
  | "searching"
  | "reading"
  | "terminal"
  | "writing"
  | "waiting"
  | "done";

export interface Attachment {
  id: string;
  name: string;
  mime: string;
  size: number;
  kind: AttachmentKind;
  text?: string;
  dataUrl?: string;
}

export interface SourceLink {
  title: string;
  url: string;
  snippet?: string;
}

export interface ChatMessage {
  id: string;
  role: MessageRole;
  content: string;
  createdAt: number;
  attachments?: Attachment[];
  sources?: SourceLink[];
  pending?: boolean;
  error?: boolean;
  tokensPerSecond?: number;
  reasoning?: string;
  reasoningSeconds?: number;
}

export interface Conversation {
  id: string;
  title: string;
  messages: ChatMessage[];
  createdAt: number;
  updatedAt: number;
  model?: string | null;
  reasoning: ReasoningLevel;
}

export interface MemoryItem {
  id: string;
  label: string;
  value: string;
  category: "profile" | "preference" | "project" | "other";
  enabled: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface AppSettings {
  reasoning: ReasoningLevel;
  webEnabled: boolean;
  terminalEnabled: boolean;
  memoryEnabled: boolean;
  autoSpeak: boolean;
  workspaceDirectory: string;
  voiceEngine: "neural" | "system";
  voiceId: string;
  voiceRate: number;
  customInstructions: string;
}

export interface OllamaModel {
  name: string;
  size: number;
  modifiedAt: string;
  parameterSize?: string;
  quantization?: string;
}

export interface OllamaStatus {
  installed: boolean;
  running: boolean;
  version?: string;
  error?: string;
}

export interface ContentEngineStatus {
  installed: boolean;
  running: boolean;
  name: string;
  endpoint: string;
  error?: string;
}

export interface HardwareInfo {
  cpu: string;
  cpuCores: number;
  ramTotalGb: number;
  gpu: string;
  vramGb: number | null;
  operatingSystem: string;
  desktop: string;
  architecture: string;
}

export interface ModelCatalogItem {
  id: string;
  name: string;
  maker: string;
  description: string;
  parameters: string;
  downloadSizeGb: number;
  minRamGb: number;
  recommendedVramGb: number;
  tags: string[];
  speed: "Быстрая" | "Средняя" | "Тяжёлая";
  category: "chat" | "vision" | "image" | "video" | "voice";
  engine: "ollama" | "comfyui" | "builtin";
  rating: number;
  reviewCount: number;
  quality: number;
  capabilities: string[];
  status?: "available" | "integration";
  dark?: boolean;
}

export interface PullProgress {
  model: string;
  status: string;
  completed: number;
  total: number;
  percent: number;
  done: boolean;
  error?: string;
}

export interface ToolApproval {
  requestId: string;
  approvalId: string;
  command: string;
  cwd?: string;
  reason?: string;
}

export interface AgentEvent {
  requestId: string;
  kind: "status" | "reasoning" | "token" | "sources" | "approval" | "done" | "error";
  phase?: AgentPhase;
  label?: string;
  content?: string;
  sources?: SourceLink[];
  approval?: ToolApproval;
  tokensPerSecond?: number;
  reasoningSeconds?: number;
  error?: string;
}

export interface MemoryCandidate {
  label: string;
  value: string;
  category: MemoryItem["category"];
}

export interface UpdateInfo {
  available: boolean;
  currentVersion: string;
  latestVersion?: string;
  tag?: string;
  assetName?: string;
  assetSize?: number;
  error?: string;
}

export interface UpdateProgress {
  status: string;
  downloaded: number;
  total: number;
  percent: number;
  done: boolean;
  error?: string;
}

export const DEFAULT_SETTINGS: AppSettings = {
  reasoning: "medium",
  webEnabled: true,
  terminalEnabled: true,
  memoryEnabled: true,
  autoSpeak: false,
  workspaceDirectory: "",
  voiceEngine: "neural",
  voiceId: "ru-RU-DmitryNeural",
  voiceRate: 0.96,
  customInstructions: "",
};
