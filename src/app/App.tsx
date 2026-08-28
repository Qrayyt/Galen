import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChatView } from "../components/ChatView";
import { Composer } from "../components/Composer";
import { ModelLibrary } from "../components/ModelLibrary";
import { NavRail } from "../components/NavRail";
import { SettingsPanel } from "../components/SettingsPanel";
import { VoiceMode } from "../components/VoiceMode";
import { WindowBar } from "../components/WindowBar";
import { MODEL_CATALOG, recommendModel } from "../data/models";
import { native } from "../lib/native";
import { splitReasoningText, visibleAnswer } from "../lib/reasoning";
import { speakText } from "../lib/speech";
import {
  createConversation, loadActiveChatId, loadActiveModel, loadConversations, loadMemories,
  loadSettings, saveActiveChatId, saveActiveModel, saveConversations, saveMemories,
  saveSettings, titleFromMessage,
} from "../lib/storage";
import type {
  AgentPhase, AppSettings, Attachment, ChatMessage, ContentEngineStatus, Conversation, HardwareInfo,
  MemoryCandidate, MemoryItem, OllamaModel, OllamaStatus, PullProgress, ReasoningLevel,
  ToolApproval, UpdateInfo, ViewId,
} from "../types";

const makeId = () => crypto.randomUUID();
const normalized = (name: string) => name.replace(":latest", "").toLowerCase();
const isVisionModel = (name: string) => /gemma[34]|qwen3\.5|qwen(?:2\.5|3)-?vl|llava|minicpm-v/i.test(name);

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
  const [installed, setInstalled] = useState<OllamaModel[]>([]);
  const [activeModel, setActiveModel] = useState<string | null>(() => loadActiveModel());
  const [pulls, setPulls] = useState<Record<string, PullProgress>>({});
  const [request, setRequest] = useState<{ id: string; chatId: string } | null>(null);
  const [activity, setActivity] = useState<{ phase: AgentPhase; label: string } | null>(null);
  const [approval, setApproval] = useState<ToolApproval | null>(null);
  const [voiceOpen, setVoiceOpen] = useState(false);
  const [update, setUpdate] = useState<UpdateInfo | null>(null);
  const [updatePath, setUpdatePath] = useState<string | null>(null);
  const [updating, setUpdating] = useState(false);
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
      const selected = saved && models.some((model) => normalized(model.name) === normalized(saved))
        ? saved
        : models[0]?.name ?? null;
      setActiveModel(selected);
      if (selected) saveActiveModel(selected);
      if (!models.length) setView("models");
    } catch (error) {
      setStatus({ installed: false, running: false, error: error instanceof Error ? error.message : String(error) });
    }
  }, []);

  const refreshAll = useCallback(async () => {
    await Promise.all([
      native.getHardware().then(setHardware).catch(() => undefined),
      native.getComfyStatus().then(setComfyStatus).catch(() => undefined),
      refreshRuntime(),
    ]);
  }, [refreshRuntime]);

  useEffect(() => {
    void refreshAll();
    void native.checkUpdate().then(setUpdate).catch((error) => setUpdate({
      available: false, currentVersion: "0.4.0", error: error instanceof Error ? error.message : String(error),
    }));
  }, [refreshAll]);

  const selectModel = (model: string) => {
    setActiveModel(model);
    saveActiveModel(model);
    updateChat(activeChatId, (chat) => ({ ...chat, model, updatedAt: Date.now() }));
    setView("chat");
  };

  const pullModel = async (model: string) => {
    setPulls((current) => ({
      ...current,
      [model]: { model, status: "Подготавливаем загрузку", completed: 0, total: 0, percent: 0, done: false },
    }));
    try {
      await native.pullModel(model, (progress) => setPulls((current) => ({ ...current, [model]: progress })));
      await refreshRuntime();
      selectModel(model);
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
    const visionModel = isVisionModel(activeModel)
      ? activeModel
      : installed.find((model) => isVisionModel(model.name))?.name;
    if (needsVision && !visionModel) {
      const now = Date.now();
      const userMessage: ChatMessage = { id: makeId(), role: "user", content, attachments, createdAt: now };
      const warning: ChatMessage = {
        id: makeId(), role: "assistant", createdAt: now + 1, error: true,
        content: "Для анализа изображений нужна vision-модель. Скачай **Gemma 3 4B** в библиотеке моделей — после этого Galen будет автоматически использовать её для картинок.",
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
    const assistantMessage: ChatMessage = { id: assistantId, role: "assistant", content: "", createdAt: Date.now(), pending: true };
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
            answerBuffer = visibleAnswer(`${answerBuffer}${event.content}`);
            updateChat(chatId, (chat) => ({
              ...chat,
              updatedAt: Date.now(),
              messages: chat.messages.map((message) => message.id === assistantId
                ? { ...message, content: visibleAnswer(`${message.content}${event.content}`) }
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
                ? { ...message, pending: false, tokensPerSecond: event.tokensPerSecond }
                : message),
            }));
          }
        },
      );

      if (completed && answerBuffer && settings.memoryEnabled) {
        void native.extractMemories(requestModel, content, answerBuffer).then(mergeMemoryCandidates).catch(() => undefined);
      }
      if (completed && answerBuffer && settings.autoSpeak && !voiceOpen) {
        void speakText(answerBuffer, settings).catch(() => undefined);
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

  const installUpdate = async () => {
    if (updatePath) return native.restartIntoUpdate(updatePath);
    if (!update?.tag) return;
    setUpdating(true);
    try {
      const path = await native.downloadUpdate(update.tag);
      setUpdatePath(path);
      await native.restartIntoUpdate(path);
    } finally { setUpdating(false); }
  };

  const activeLabel = MODEL_CATALOG.find((model) => normalized(model.id) === normalized(activeModel ?? ""))?.name
    ?? activeModel ?? undefined;
  const activeVoiceId = settings.voiceEngine === "system"
    ? "voice:system"
    : settings.voiceId === "ru-RU-DmitryNeural" && settings.voiceRate <= 0.9
      ? "voice:galen-dark"
      : "voice:galen-neural";
  const selectVoice = (model: string) => {
    if (model === "voice:system") {
      setSettings((current) => ({ ...current, voiceEngine: "system" }));
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
        <WindowBar sidebarOpen={sidebarOpen} onMenu={() => setSidebarOpen(true)} title={view === "chat" ? activeChat?.title : view === "models" ? "Модели" : "Настройки"} />
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
              activeVoiceId={activeVoiceId}
              pulls={pulls}
              onPull={(model) => void pullModel(model)}
              onDelete={(model) => void deleteModel(model)}
              onSelect={selectModel}
              onSelectVoice={selectVoice}
              onRetryOllama={() => void refreshRuntime()}
              onRetryComfy={() => void native.getComfyStatus().then(setComfyStatus)}
              onOpenComfy={() => void native.openComfy()}
              onOpenSettings={() => setView("settings")}
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
            onReasoningChange={changeReasoning}
            onSend={(message, attachments) => void sendMessage(message, attachments)}
            onStop={stopAgent}
            onVoiceMode={() => setVoiceOpen(true)}
          />
        )}
      </div>
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
