import { motion } from "motion/react";
import { Bot, Boxes, ChevronLeft, MessageSquarePlus, Search, Settings2, Trash2 } from "lucide-react";
import type { Conversation, ViewId } from "../types";

interface NavRailProps {
  view: ViewId;
  open: boolean;
  chats: Conversation[];
  activeChatId: string;
  onToggle: () => void;
  onChange: (view: ViewId) => void;
  onNewChat: () => void;
  onSelectChat: (id: string) => void;
  onDeleteChat: (id: string) => void;
}

export function NavRail({
  view, open, chats, activeChatId, onToggle, onChange, onNewChat, onSelectChat, onDeleteChat,
}: NavRailProps) {
  return (
    <motion.aside
      className={`sidebar ${open ? "sidebar--open" : "sidebar--closed"}`}
      animate={{ width: open ? 272 : 72 }}
      transition={{ type: "spring", stiffness: 330, damping: 34 }}
    >
      <div className="sidebar-brand">
        <button className="brand-orb" onClick={() => onChange("chat")} aria-label="Galen"><span /></button>
        {open && <strong>Galen</strong>}
        {open && <button className="sidebar-collapse" onClick={onToggle} aria-label="Свернуть"><ChevronLeft size={17} /></button>}
      </div>

      <button className="new-chat" onClick={onNewChat}>
        <MessageSquarePlus size={18} />
        {open && <span>Новый чат</span>}
      </button>

      {open && (
        <div className="sidebar-search">
          <Search size={15} />
          <span>История диалогов</span>
        </div>
      )}

      <div className="chat-history">
        {open && chats.map((chat) => (
          <div className={`chat-row ${view === "chat" && chat.id === activeChatId ? "active" : ""}`} key={chat.id}>
            <button onClick={() => onSelectChat(chat.id)}>
              <span>{chat.title}</span>
              <small>{new Date(chat.updatedAt).toLocaleDateString("ru-RU", { day: "numeric", month: "short" })}</small>
            </button>
            <button className="chat-delete" onClick={() => onDeleteChat(chat.id)} aria-label="Удалить чат">
              <Trash2 size={13} />
            </button>
          </div>
        ))}
      </div>

      <nav className="sidebar-nav">
        <button className={view === "chat" ? "active" : ""} onClick={() => onChange("chat")} title="Чаты">
          <Bot size={18} /><span>Чаты</span>
        </button>
        <button className={view === "models" ? "active" : ""} onClick={() => onChange("models")} title="Модели">
          <Boxes size={18} /><span>Модели</span>
        </button>
        <button className={view === "settings" ? "active" : ""} onClick={() => onChange("settings")} title="Настройки">
          <Settings2 size={18} /><span>Настройки</span>
        </button>
      </nav>

      <div className="privacy-mark"><i />{open && <span>Локально и приватно</span>}</div>
    </motion.aside>
  );
}

