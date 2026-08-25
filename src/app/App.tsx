import { useCallback, useEffect, useMemo, useState } from "react";
import { Composer } from "../components/Composer";
import { ChatView } from "../components/ChatView";
import { ModelLibrary } from "../components/ModelLibrary";
import { NavRail } from "../components/NavRail";
import { SystemPanel } from "../components/SystemPanel";
import { WindowBar } from "../components/WindowBar";
import { MODEL_CATALOG, recommendModel } from "../data/models";
import { native } from "../lib/native";
import { loadActiveModel, loadHistory, saveActiveModel, saveHistory } from "../lib/storage";
import type {
  ChatMessage,
  HardwareInfo,
  OllamaModel,
  OllamaStatus,
  PullProgress,
  UpdateInfo,
  ViewId,
} from "../types";

const makeId = () => `${Date.now()}-${crypto.randomUUID()}`;
const normalized = (name: string) => name.replace(":latest", "").toLowerCase();

export function App() {
  const [view, setView] = useState<ViewId>("chat");
  const [navOpen, setNavOpen] = useState(false);
  const [hardware, setHardware] = useState<HardwareInfo | null>(null);
  const [status, setStatus] = useState<OllamaStatus | null>(null);
  const [installed, setInstalled] = useState<OllamaModel[]>([]);
  const [activeModel, setActiveModel] = useState<string | null>(() => loadActiveModel());
  const [messages, setMessages] = useState<ChatMessage[]>(() => loadHistory());
  const [pulls, setPulls] = useState<Record<string, PullProgress>>({});
  const [busy, setBusy] = useState(false);
  const [update, setUpdate] = useState<UpdateInfo | null>(null);
  const [updatePath, setUpdatePath] = useState<string | null>(null);
  const [updating, setUpdating] = useState(false);

  const recommended = useMemo(
    () => (hardware && hardware.ramTotalGb > 0 ? recommendModel(hardware) : null),
    [hardware],
  );

  useEffect(() => {
    if (!busy) saveHistory(messages);
  }, [busy, messages]);

  const refreshRuntime = useCallback(async () => {
    try {
      const ollama = await native.getOllamaStatus();
      let resolved = ollama;
      if (ollama.installed && !ollama.running) {
        try {
          resolved = await native.startOllama();
        } catch {
          resolved = ollama;
        }
      }
      setStatus(resolved);
      if (!resolved.running) return;
      const models = await native.listModels();
      setInstalled(models);
      const saved = loadActiveModel();
      const selected = saved && models.some((model) => normalized(model.name) === normalized(saved))
        ? saved
        : models[0]?.name ?? null;
      if (selected) {
        setActiveModel(selected);
        saveActiveModel(selected);
      } else {
        setActiveModel(null);
      }
      if (!models.length) setView("models");
    } catch (error) {
      setStatus({
        installed: false,
        running: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }, []);

  const refreshAll = useCallback(async () => {
    const hardwareRequest = native.getHardware().then(setHardware).catch(() => undefined);
    await Promise.all([hardwareRequest, refreshRuntime()]);
  }, [refreshRuntime]);

  useEffect(() => {
    void refreshAll();
    void native.checkUpdate()
      .then(async (info) => {
        setUpdate(info);
        if (info.available && info.tag) {
          setUpdating(true);
          try {
            const path = await native.downloadUpdate(info.tag);
            setUpdatePath(path);
          } finally {
            setUpdating(false);
          }
        }
      })
      .catch((error) => setUpdate({
        available: false,
        currentVersion: "0.2.3",
        error: error instanceof Error ? error.message : String(error),
      }));
  }, [refreshAll]);

  const selectModel = (model: string) => {
    setActiveModel(model);
    saveActiveModel(model);
    setView("chat");
  };

  const pullModel = async (model: string) => {
    setPulls((current) => ({
      ...current,
      [model]: { model, status: "Подготавливаем загрузку", completed: 0, total: 0, percent: 0, done: false },
    }));
    try {
      await native.pullModel(model, (progress) => {
        setPulls((current) => ({ ...current, [model]: progress }));
      });
      await refreshRuntime();
      selectModel(model);
    } catch (error) {
      setPulls((current) => ({
        ...current,
        [model]: {
          ...(current[model] ?? { model, completed: 0, total: 0, percent: 0 }),
          status: "Ошибка загрузки",
          done: true,
          error: error instanceof Error ? error.message : String(error),
        },
      }));
    }
  };

  const deleteModel = async (model: string) => {
    if (!window.confirm(`Удалить модель ${model} с этого компьютера?`)) return;
    await native.deleteModel(model);
    await refreshRuntime();
  };

  const sendMessage = async (content: string) => {
    if (!activeModel || busy) return;
    const userMessage: ChatMessage = {
      id: makeId(),
      role: "user",
      content,
      createdAt: Date.now(),
    };
    const assistantId = makeId();
    const assistantMessage: ChatMessage = {
      id: assistantId,
      role: "assistant",
      content: "",
      createdAt: Date.now(),
      pending: true,
    };
    const conversation = [...messages, userMessage];
    setMessages([...conversation, assistantMessage]);
    setBusy(true);

    try {
      await native.chat(makeId(), activeModel, conversation, (token) => {
        setMessages((current) => current.map((message) => {
          if (message.id !== assistantId) return message;
          return {
            ...message,
            content: `${message.content}${token.content}`,
            pending: !token.done,
            error: Boolean(token.error),
          };
        }));
      });
      setMessages((current) => current.map((message) =>
        message.id === assistantId ? { ...message, pending: false } : message,
      ));
    } catch (error) {
      setMessages((current) => current.map((message) =>
        message.id === assistantId
          ? {
              ...message,
              content: error instanceof Error ? error.message : String(error),
              pending: false,
              error: true,
            }
          : message,
      ));
    } finally {
      setBusy(false);
    }
  };

  const installUpdate = async () => {
    if (updatePath) {
      await native.restartIntoUpdate(updatePath);
      return;
    }
    if (!update?.tag) return;
    setUpdating(true);
    try {
      const path = await native.downloadUpdate(update.tag);
      setUpdatePath(path);
      await native.restartIntoUpdate(path);
    } finally {
      setUpdating(false);
    }
  };

  const activeLabel = MODEL_CATALOG.find((model) => normalized(model.id) === normalized(activeModel ?? ""))?.name
    ?? activeModel
    ?? undefined;

  return (
    <div className="app-shell">
      <NavRail view={view} open={navOpen} onChange={(next) => { setView(next); setNavOpen(false); }} />
      <div className="workspace">
        <WindowBar onMenu={() => setNavOpen((open) => !open)} />
        <div className="view-stage">
          {view === "chat" && (
            <ChatView
              messages={messages}
              busy={busy}
              hasModel={Boolean(activeModel)}
              onOpenModels={() => setView("models")}
              onClear={() => setMessages([])}
            />
          )}
          {view === "models" && (
            <ModelLibrary
              hardware={hardware}
              recommendedId={recommended?.id ?? null}
              status={status}
              installed={installed}
              activeModel={activeModel}
              pulls={pulls}
              onPull={(model) => void pullModel(model)}
              onDelete={(model) => void deleteModel(model)}
              onSelect={selectModel}
              onRetryOllama={() => void refreshRuntime()}
            />
          )}
          {view === "system" && (
            <SystemPanel
              hardware={hardware}
              recommended={recommended}
              status={status}
              update={update}
              updating={updating}
              onRefresh={() => void refreshAll()}
              onInstallUpdate={() => void installUpdate()}
            />
          )}
        </div>
        {view === "chat" && (
          <Composer
            disabled={!activeModel || !status?.running}
            busy={busy}
            modelLabel={activeLabel}
            onSend={(message) => void sendMessage(message)}
          />
        )}
      </div>
    </div>
  );
}
