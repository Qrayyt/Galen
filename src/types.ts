export type ViewId = "chat" | "models" | "system";

export type MessageRole = "user" | "assistant" | "system";

export interface ChatMessage {
  id: string;
  role: MessageRole;
  content: string;
  createdAt: number;
  pending?: boolean;
  error?: boolean;
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

export interface ChatToken {
  requestId: string;
  content: string;
  thinking?: string;
  done: boolean;
  error?: string;
  tokensPerSecond?: number;
}

export interface UpdateInfo {
  available: boolean;
  currentVersion: string;
  latestVersion?: string;
  tag?: string;
  error?: string;
}

