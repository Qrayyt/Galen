import { motion } from "motion/react";
import { Boxes, ChevronLeft, MessageSquarePlus, Search, Settings2, Sparkles, Trash2, X } from "lucide-react";
import { useMemo, useState } from "react";
import galenLogo from "../assets/galen.svg";
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
  const [query, setQuery] = useState("");
  const visibleChats = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("ru-RU");
    return needle ? chats.filter((chat) => chat.title.toLocaleLowerCase("ru-RU").includes(needle)) : chats;
  }, [chats, query]);

  return (
    <motion.aside
      className={`sidebar ${open ? "sidebar--open" : "sidebar--closed"}`}
      animate={{ width: open ? 292 : 72 }}
      transition={{ type: "spring", stiffness: 330, damping: 34 }}
    >
      <div className="sidebar-brand">
        <button className="brand-orb" onClick={() => onChange("chat")} aria-label="Galen"><img src={galenLogo} alt="" /></button>
        {open && <div className="brand-copy"><strong>Galen</strong><span>AI Assistant</span></div>}
        {open && <button className="sidebar-collapse" onClick={onToggle} aria-label="Свернуть"><ChevronLeft size={17} /></button>}
      </div>

      <button className="new-chat" onClick={onNewChat}>
        <MessageSquarePlus size={18} />
        {open && <span>Новый чат</span>}
      </button>

      {open && (
        <label className="sidebar-search">
          <Search size={15} />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Поиск по чатам" />
          {query && <button onClick={() => setQuery("")} aria-label="Очистить поиск"><X size={14} /></button>}
        </label>
      )}

      <nav className="sidebar-nav sidebar-nav--primary">
        <button className={view === "studio" ? "active" : ""} onClick={() => onChange("studio")} title="Studio">
          <Sparkles size={18} /><span>Studio</span>
        </button>
        <button className={view === "models" ? "active" : ""} onClick={() => onChange("models")} title="Модели">
          <Boxes size={18} /><span>Модели</span>
        </button>
        <button className={view === "settings" ? "active" : ""} onClick={() => onChange("settings")} title="Настройки">
          <Settings2 size={18} /><span>Настройки</span>
        </button>
      </nav>

      {open && <div className="sidebar-section-label"><span>Недавние чаты</span></div>}

      <div className="chat-history">
        {open && visibleChats.map((chat) => (
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
        {open && !visibleChats.length && <div className="chat-history-empty">Ничего не найдено</div>}
      </div>

      <div className="privacy-mark"><i />{open && <span>Локально и приватно</span>}</div>
    </motion.aside>
  );
}
