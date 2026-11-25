import { useState } from "react";
import { useUiLanguage } from "@/i18n";
import { changeAgentChatMode, type AgentChatSession } from "@/lib/agentChatApi";
import { useAgentChatStore } from "@/store/agentChat";
import { useIdeThreadsStore } from "@/store/ideThreads";
import { useIdeProjectsStore } from "@/store/ideProjects";
import { useEventStore } from "@/store/events";
import { useHomeStore } from "@/store/home";
import { resetTextConversation } from "@/lib/newChat";
import { readComposerDraft } from "./composerDrafts";
import { hasHeldFiles } from "./useChatAttachments";
import { useThreadChatStore } from "@/components/agentic/threads/threadModel";
import { readWorkDraft } from "@/components/agentic/threads/ThreadComposer";

export function ChatModeSwitch({ session, expected }: { session: AgentChatSession; expected: "jarvis" | "agent" }) {
  const ru = useUiLanguage() === "ru";
  const [busy, setBusy] = useState(false);
  const voiceState = useEventStore(s => s.voiceState);
  const target = expected === "jarvis" ? "agent" : "jarvis";
  const label = target === "agent" ? (ru ? "В Work" : "Switch to Work") : (ru ? "В Chat" : "Switch to Chat");
  const change = async () => {
    if (busy) return;
    const id = session.session_id;
    const toast = useEventStore.getState().pushToast;
    const draft = readComposerDraft(useAgentChatStore, id);
    if (draft.text || draft.choices.length || readWorkDraft(id) || hasHeldFiles(useAgentChatStore, id) || hasHeldFiles(useThreadChatStore, id)) {
      toast("error", ru ? "Отправьте или сохраните черновик и вложения перед сменой режима." : "Send or save the draft and attachments before switching modes.");
      return;
    }
    const projects = useIdeProjectsStore.getState();
    const project = projects.projects.find(p => p.id === useIdeThreadsStore.getState().selection.projectId) ?? projects.projects[0];
    if (target === "agent" && !project?.path) {
      toast("error", ru ? "Сначала подключите рабочую папку в Work." : "Connect a Work folder first.");
      return;
    }
    const detail = target === "agent" ? (ru ? "Папка: " : "Folder: ") + project?.path : "";
    if (!window.confirm((ru ? "Переключить режим этого чата? История сохранится. Разрешения будут запрашиваться заново. " : "Switch this conversation? History is retained. Permissions will be requested again. ") + detail)) return;
    setBusy(true);
    try {
      await changeAgentChatMode(id, expected, target, target === "agent" ? project?.path : undefined);
      if (target === "agent") {
        useAgentChatStore.getState().newChat();
        const work = useIdeThreadsStore.getState();
        work.setLayout("threads");
        work.openThread(id, project!.id);
        useEventStore.getState().setActiveSection("agentic-ide");
      } else {
        useThreadChatStore.getState().newChat();
        useIdeThreadsStore.getState().forgetThread(id);
        resetTextConversation();
        useHomeStore.getState().openAgentChat(null);
        useHomeStore.getState().setSurface("chat");
        useAgentChatStore.getState().openSession(id);
        useEventStore.getState().setActiveSection("chats");
      }
    } catch (err) { toast("error", err instanceof Error ? err.message : String(err)); }
    finally { setBusy(false); }
  };
  return <button type="button" disabled={busy || voiceState !== "idle"} onClick={() => void change()} className="shrink-0 rounded-md border border-border px-2 py-1 text-xs text-muted-foreground hover:text-foreground disabled:opacity-40">{label}</button>;
}
