import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChatView } from "../components/ChatView";
import { Composer } from "../components/Composer";
import { ContextPanel } from "../components/ContextPanel";
import { ModelLibrary } from "../components/ModelLibrary";
import { NavRail } from "../components/NavRail";
import { SettingsPanel } from "../components/SettingsPanel";
import { StudioPanel } from "../components/StudioPanel";
import { VoiceMode } from "../components/VoiceMode";
import { WindowBar } from "../components/WindowBar";
import { UpdateToast } from "../components/UpdateToast";
import { MODEL_CATALOG, recommendModel } from "../data/models";
import { native } from "../lib/native";
import { resolveVisionModel, sameModel } from "../lib/modelRouting";
import { useAppUpdater } from "../lib/updater";
import { splitReasoningText, streamingVisibleAnswer, visibleAnswer } from "../lib/reasoning";
import { speakText } from "../lib/speech";
import {
  createConversation, loadActiveChatId, loadActiveModel, loadActiveVisionModel, loadConversations, loadMemories,
  loadSettings, saveActiveChatId, saveActiveModel, saveConversations, saveMemories,
  saveActiveVisionModel, saveSettings, titleFromMessage,
} from "../lib/storage";
import type {
  AgentPhase, AppSettings, Attachment, ChatMessage, ContentEngineStatus, Conversation, GenerationStatus, HardwareInfo,
  MemoryCandidate, MemoryItem, OllamaModel, OllamaStatus, PullProgress, ReasoningLevel,
  ToolApproval, ViewId,
} from "../types";

const makeId = () => crypto.randomUUID();
export function App() {
  const initialChats = useMemo(() => loadConversations(), []);
  const [view, setView] = useState<ViewId>("chat");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [chats, setChats] = useState<Conversation[]>(initialChats);
  const [activeChatId, setActiveChatId] = useState(() => loadActiveChatId(initialChats));
  const [memories, setMemories] = useState<MemoryItem[]>(() => loadMemories());
  const [settings, setSettings] = useState<AppSettings>(() => loadSettings());
  const [hardware, setHardware] = useState<HardwareInfo | null>(null);
  const [status, setStatus] = useState<OllamaStatus | null>(null);
  const [comfyStatus, setComfyStatus] = useState<ContentEngineStatus | null>(null);
  const [generationStatus, setGenerationStatus] = useState<GenerationStatus | null>(null);
  const [installed, setInstalled] = useState<OllamaModel[]>([]);
  const [activeModel, setActiveModel] = useState<string | null>(() => loadActiveModel());
  const [activeVisionModel, setActiveVisionModel] = useState<string | null>(() => loadActiveVisionModel());
  const [pulls, setPulls] = useState<Record<string, PullProgress>>({});
  const [request, setRequest] = useState<{ id: string; chatId: string } | null>(null);
  const [activity, setActivity] = useState<{ phase: AgentPhase; label: string } | null>(null);
  const [approval, setApproval] = useState<ToolApproval | null>(null);
  const [voiceOpen, setVoiceOpen] = useState(false);
  const { update, progress: updateProgress, updating, installUpdate } = useAppUpdater();
  const requestRef = useRef(request);
  requestRef.current = request;

  const activeChat = chats.find((chat) => chat.id === activeChatId) ?? chats[0];
  const busy = Boolean(request);
  const recommended = useMemo(
    () => (hardware && hardware.ramTotalGb > 0 ? recommendModel(hardware) : null),
    [hardware],
  );

  useEffect(() => saveConversations(chats), [chats]);
  useEffect(() => saveActiveChatId(activeChatId), [activeChatId]);
  useEffect(() => saveMemories(memories), [memories]);
  useEffect(() => saveSettings(settings), [settings]);

  const updateChat = useCallback((chatId: string, updater: (chat: Conversation) => Conversation) => {
    setChats((current) => current.map((chat) => chat.id === chatId ? updater(chat) : chat));
  }, []);

  const refreshRuntime = useCallback(async () => {
    try {
      const ollama = await native.getOllamaStatus();
      let resolved = ollama;
      if (ollama.installed && !ollama.running) {
        try { resolved = await native.startOllama(); } catch { resolved = ollama; }
      }
      setStatus(resolved);
      if (!resolved.running) return;
      const models = await native.listModels();
      setInstalled(models);
      const saved = loadActiveModel();
      const selected = saved && models.some((model) => sameModel(model.name, saved))
        ? saved
        : models[0]?.name ?? null;
      setActiveModel(selected);
      if (selected) saveActiveModel(selected);
      const savedVision = loadActiveVisionModel();
      const selectedVision = resolveVisionModel(models, savedVision, selected);
      setActiveVisionModel(selectedVision);
      if (selectedVision) saveActiveVisionModel(selectedVision);
      if (!models.length) setView("models");
    } catch (error) {
      setStatus({ installed: false, running: false, error: error instanceof Error ? error.message : String(error) });
    }
  }, []);

  const refreshAll = useCallback(async () => {
    await Promise.all([
      native.getHardware().then(setHardware).catch(() => undefined),
      native.getComfyStatus().then(setComfyStatus).catch(() => undefined),
      native.getGenerationStatus().then(setGenerationStatus).catch(() => undefined),
      refreshRuntime(),
    ]);
  }, [refreshRuntime]);

  useEffect(() => {
    void refreshAll();
  }, [refreshAll]);

  useEffect(() => {
    if (!activeModel) return;
    void native.warmModel(activeModel).catch(() => undefined);
  }, [activeModel]);

  const selectModel = (model: string, category: "chat" | "vision" = "chat") => {
    if (category === "vision") {
      setActiveVisionModel(model);
      saveActiveVisionModel(model);
      setView("chat");
      return;
    }
    setActiveModel(model);
    saveActiveModel(model);
    updateChat(activeChatId, (chat) => ({ ...chat, model, updatedAt: Date.now() }));
    setView("chat");
  };

  const pullModel = async (model: string, category: "chat" | "vision" = "chat") => {
    setPulls((current) => ({
      ...current,
      [model]: { model, status: "Подготавливаем загрузку", completed: 0, total: 0, percent: 0, done: false },
    }));
    try {
      await native.pullModel(model, (progress) => setPulls((current) => ({ ...current, [model]: progress })));
      await refreshRuntime();
      selectModel(model, category);
    } catch (error) {
      setPulls((current) => ({
        ...current,
        [model]: {
          ...(current[model] ?? { model, completed: 0, total: 0, percent: 0 }),
          status: "Ошибка загрузки", done: true, error: error instanceof Error ? error.message : String(error),
        },
      }));
    }
  };

  const deleteModel = async (model: string) => {
    if (!window.confirm(`Удалить модель ${model} с этого компьютера?`)) return;
    await native.deleteModel(model);
    await refreshRuntime();
  };

  const mergeMemoryCandidates = (candidates: MemoryCandidate[]) => {
    if (!candidates.length) return;
    setMemories((current) => {
      const next = [...current];
      for (const candidate of candidates) {
        if (/парол|password|токен|token|api.?key|секрет|secret|cvv|номер карты/i.test(`${candidate.label} ${candidate.value}`)) continue;
        const label = candidate.label.trim().toLowerCase();
        if (next.some((item) => item.label.trim().toLowerCase() === label)) continue;
        const now = Date.now();
        next.push({ ...candidate, id: makeId(), enabled: true, createdAt: now, updatedAt: now });
      }
      return next;
    });
  };

  const sendMessage = async (content: string, attachments: Attachment[] = []) => {
    if (!activeModel || request || !activeChat) return;
    const needsVision = attachments.some((attachment) => attachment.kind === "image");
    const visionModel = resolveVisionModel(installed, activeVisionModel, activeModel);
    if (needsVision && !visionModel) {
      const now = Date.now();
      const userMessage: ChatMessage = { id: makeId(), role: "user", content, attachments, createdAt: now };
      const warning: ChatMessage = {
        id: makeId(), role: "assistant", createdAt: now + 1, error: true,
        content: "Для анализа изображений нужна vision-модель. Открой раздел **Vision**, скачай подходящую модель и нажми «Подключить». Galen запомнит её отдельно от разговорной модели.",
      };
      updateChat(activeChat.id, (chat) => ({
        ...chat,
        title: chat.messages.length ? chat.title : titleFromMessage(content || attachments[0]?.name || "Изображение"),
        messages: [...chat.messages, userMessage, warning],
        updatedAt: now,
      }));
      return;
    }
    const requestModel = needsVision ? visionModel! : activeModel;
    const chatId = activeChat.id;
    const userMessage: ChatMessage = { id: makeId(), role: "user", content, attachments, createdAt: Date.now() };
    const assistantId = makeId();
    const assistantMessage: ChatMessage = {
      id: assistantId,
      role: "assistant",
      content: "",
      createdAt: Date.now(),
      pending: true,
      usedModel: requestModel,
    };
    const conversation = [...activeChat.messages, userMessage, assistantMessage];
    updateChat(chatId, (chat) => ({
      ...chat,
      title: chat.messages.length ? chat.title : titleFromMessage(content || attachments[0]?.name || ""),
      messages: conversation,
      updatedAt: Date.now(),
      model: activeModel,
    }));

    const requestId = makeId();
    setRequest({ id: requestId, chatId });
    setActivity({ phase: "thinking", label: "Думаю" });
    setApproval(null);
    let answerBuffer = "";
    let completed = false;
    const requestStartedAt = performance.now();
    let firstTokenMs: number | undefined;

    try {
      await native.agentChat(
        requestId,
        requestModel,
        conversation,
        memories,
        activeChat.reasoning,
        settings,
        (event) => {
          if (event.kind === "status" && event.phase && event.label) {
            if (requestRef.current?.id === requestId) setActivity({ phase: event.phase, label: event.label });
          }
          if (event.kind === "reasoning" && event.content) {
            const separated = splitReasoningText(event.content);
            updateChat(chatId, (chat) => ({
              ...chat,
              messages: chat.messages.map((message) => message.id === assistantId
                ? {
                    ...message,
                    reasoning: [message.reasoning, separated.reasoning || separated.answer].filter(Boolean).join("\n\n"),
                    reasoningSeconds: event.reasoningSeconds,
                  }
                : message),
            }));
          }
          if (event.kind === "token" && event.content) {
            firstTokenMs ??= Math.round(performance.now() - requestStartedAt);
            answerBuffer += event.content;
            const visible = streamingVisibleAnswer(answerBuffer);
            updateChat(chatId, (chat) => ({
              ...chat,
              updatedAt: Date.now(),
              messages: chat.messages.map((message) => message.id === assistantId
                ? { ...message, content: visible, firstTokenMs }
                : message),
            }));
          }
          if (event.kind === "sources" && event.sources) {
            updateChat(chatId, (chat) => ({
              ...chat,
              messages: chat.messages.map((message) => message.id === assistantId ? { ...message, sources: event.sources } : message),
            }));
          }
          if (event.kind === "approval" && event.approval && requestRef.current?.id === requestId) setApproval(event.approval);
          if (event.kind === "tool" && event.tool) {
            updateChat(chatId, (chat) => ({
              ...chat,
              messages: chat.messages.map((message) => message.id === assistantId
                ? {
                    ...message,
                    toolRuns: [
                      ...(message.toolRuns ?? []).filter((tool) => tool.id !== event.tool!.id),
                      event.tool!,
                    ],
                  }
                : message),
            }));
          }
          if (event.kind === "error") {
            updateChat(chatId, (chat) => ({
              ...chat,
              messages: chat.messages.map((message) => message.id === assistantId
                ? { ...message, content: message.content || event.error || "Неизвестная ошибка", error: true, pending: false }
                : message),
            }));
          }
          if (event.kind === "done") {
            completed = true;
            updateChat(chatId, (chat) => ({
              ...chat,
              updatedAt: Date.now(),
              messages: chat.messages.map((message) => message.id === assistantId
                ? {
                    ...message,
                    content: visibleAnswer(answerBuffer) || message.content,
                    pending: false,
                    tokensPerSecond: event.tokensPerSecond,
                    firstTokenMs,
                    totalDurationMs: Math.round(performance.now() - requestStartedAt),
                  }
                : message),
            }));
          }
        },
      );

      const finalAnswer = visibleAnswer(answerBuffer);
      if (completed && finalAnswer && settings.memoryEnabled) {
        void native.extractMemories(requestModel, content, finalAnswer).then(mergeMemoryCandidates).catch(() => undefined);
      }
      if (completed && finalAnswer && settings.autoSpeak && !voiceOpen) {
        void speakText(finalAnswer, settings).catch(() => undefined);
      }
    } catch (error) {
      updateChat(chatId, (chat) => ({
        ...chat,
        messages: chat.messages.map((message) => message.id === assistantId
          ? { ...message, content: message.content || (error instanceof Error ? error.message : String(error)), pending: false, error: true }
          : message),
      }));
    } finally {
      setRequest((current) => {
        if (current?.id !== requestId) return current;
        setActivity(null);
        setApproval(null);
        return null;
      });
    }
  };

  const stopAgent = () => {
    if (!requestRef.current) return;
    const current = requestRef.current;
    void native.cancelAgent(current.id);
    updateChat(current.chatId, (chat) => ({
      ...chat,
      messages: chat.messages.map((message) => message.pending ? {
        ...message, pending: false, content: message.content || "Остановлено.",
      } : message),
    }));
    setRequest(null);
    setActivity(null);
    setApproval(null);
  };

  const resolveApproval = (approved: boolean) => {
    if (!approval) return;
    void native.resolveApproval(approval.requestId, approval.approvalId, approved);
    setApproval(null);
  };

  const newChat = () => {
    const chat = createConversation(settings.reasoning);
    setChats((current) => [chat, ...current]);
    setActiveChatId(chat.id);
    setView("chat");
  };

  const deleteChat = (id: string) => {
    if (!window.confirm("Удалить этот диалог?")) return;
    if (requestRef.current?.chatId === id) stopAgent();
    setChats((current) => {
      const next = current.filter((chat) => chat.id !== id);
      if (next.length) {
        if (id === activeChatId) setActiveChatId(next[0].id);
        return next;
      }
      const fresh = createConversation(settings.reasoning);
      setActiveChatId(fresh.id);
      return [fresh];
    });
  };

  const changeReasoning = (reasoning: ReasoningLevel) => {
    updateChat(activeChatId, (chat) => ({ ...chat, reasoning, updatedAt: Date.now() }));
    setSettings((current) => ({ ...current, reasoning }));
  };

  const activeLabel = MODEL_CATALOG.find((model) => sameModel(model.id, activeModel))?.name
    ?? activeModel ?? undefined;
  const visionLabel = MODEL_CATALOG.find((model) => model.category === "vision" && sameModel(model.id, activeVisionModel))?.name
    ?? activeVisionModel ?? undefined;
  const activeVoiceId = settings.voiceEngine === "system"
    ? settings.voiceRate <= 0.9 ? "voice:dark-offline" : "voice:system"
    : settings.voiceId === "ru-RU-DmitryNeural" && settings.voiceRate <= 0.9
      ? "voice:galen-dark"
      : "voice:galen-neural";
  const selectVoice = (model: string) => {
    if (model === "voice:system") {
      setSettings((current) => ({ ...current, voiceEngine: "system", voiceRate: 0.96 }));
    } else if (model === "voice:dark-offline") {
      setSettings((current) => ({ ...current, voiceEngine: "system", voiceRate: 0.86 }));
    } else if (model === "voice:galen-dark") {
      setSettings((current) => ({ ...current, voiceEngine: "neural", voiceId: "ru-RU-DmitryNeural", voiceRate: 0.86 }));
    } else {
      setSettings((current) => ({ ...current, voiceEngine: "neural", voiceId: "ru-RU-DmitryNeural", voiceRate: 0.96 }));
    }
  };
  const lastAssistant = [...(activeChat?.messages ?? [])].reverse().find((message) => message.role === "assistant");

  return (
    <div className="app-shell">
      <NavRail
        view={view}
        open={sidebarOpen}
        chats={chats}
        activeChatId={activeChatId}
        onToggle={() => setSidebarOpen((open) => !open)}
        onChange={setView}
        onNewChat={newChat}
        onSelectChat={(id) => { setActiveChatId(id); setView("chat"); }}
        onDeleteChat={deleteChat}
      />
      <div className="workspace">
        <WindowBar
          sidebarOpen={sidebarOpen}
          onMenu={() => setSidebarOpen(true)}
          title={view === "chat" ? activeChat?.title : view === "studio" ? "Studio" : view === "models" ? "Модели" : "Настройки"}
          subtitle={view === "chat" ? `Galen · ${activeLabel ?? "локальная модель"}` : undefined}
        />
        <div className="workspace-body">
          <div className="primary-pane">
            <div className="view-stage">
              {view === "chat" && activeChat && (
                <ChatView
                  messages={activeChat.messages}
                  busy={request?.chatId === activeChat.id}
                  hasModel={Boolean(activeModel)}
                  activity={request?.chatId === activeChat.id ? activity : null}
                  approval={request?.chatId === activeChat.id ? approval : null}
                  settings={settings}
                  onOpenModels={() => setView("models")}
                  onResolveApproval={resolveApproval}
                  onSuggestion={(text) => void sendMessage(text)}
                />
              )}
              {view === "models" && (
                <ModelLibrary
                  hardware={hardware}
                  recommendedId={recommended?.id ?? null}
                  status={status}
                  comfyStatus={comfyStatus}
                  installed={installed}
                  activeModel={activeModel}
                  activeVisionModel={activeVisionModel}
                  activeVoiceId={activeVoiceId}
                  pulls={pulls}
                  onPull={(model, category) => void pullModel(model, category)}
                  onDelete={(model) => void deleteModel(model)}
                  onSelect={selectModel}
                  onSelectVoice={selectVoice}
                  onRetryOllama={() => void refreshRuntime()}
                  onRetryComfy={() => void native.getComfyStatus().then(setComfyStatus)}
                  onOpenComfy={() => void native.openComfy()}
                  onOpenSettings={() => setView("settings")}
                />
              )}
              {view === "studio" && (
                <StudioPanel
                  generation={generationStatus}
                  settings={settings}
                  onRefresh={() => void refreshAll()}
                  onOpenModels={() => setView("models")}
                  onAskGalen={(prompt) => { setView("chat"); void sendMessage(prompt); }}
                />
              )}
              {view === "settings" && (
                <SettingsPanel
                  settings={settings}
                  memories={memories}
                  hardware={hardware}
                  status={status}
                  update={update}
                  updating={updating}
                  onSettings={setSettings}
                  onMemories={setMemories}
                  onRefresh={() => void refreshAll()}
                  onInstallUpdate={() => void installUpdate()}
                />
              )}
            </div>
            {view === "chat" && activeChat && (
              <Composer
                disabled={!activeModel || !status?.running}
                busy={busy}
                modelLabel={activeLabel}
                reasoning={activeChat.reasoning}
                webEnabled={settings.webEnabled}
                visionModelLabel={visionLabel}
                onReasoningChange={changeReasoning}
                onSend={(message, attachments) => void sendMessage(message, attachments)}
                onStop={stopAgent}
                onVoiceMode={() => setVoiceOpen(true)}
                onOpenStudio={() => setView("studio")}
              />
            )}
          </div>
          {view === "chat" && (
            <ContextPanel
              model={activeLabel}
              visionModel={visionLabel}
              status={status}
              comfyStatus={comfyStatus}
              settings={settings}
              lastResponse={lastAssistant}
              onOpenModels={() => setView("models")}
              onOpenSettings={() => setView("settings")}
              onOpenStudio={() => setView("studio")}
              onRefresh={() => void refreshAll()}
              onAction={(prompt) => void sendMessage(prompt)}
            />
          )}
        </div>
      </div>
      <UpdateToast update={update} progress={updateProgress} updating={updating} onUpdate={() => void installUpdate()} />
      <VoiceMode
        open={voiceOpen}
        busy={busy}
        activity={activity}
        lastAssistant={lastAssistant}
        settings={settings}
        onClose={() => setVoiceOpen(false)}
        onSend={(text) => void sendMessage(text)}
      />
    </div>
  );
}
