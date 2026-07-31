import { Boxes, MessageCircle, Settings2 } from "lucide-react";
import type { ViewId } from "../types";

interface NavRailProps {
  view: ViewId;
  open: boolean;
  onChange: (view: ViewId) => void;
}

const items: Array<{ id: ViewId; label: string; icon: typeof MessageCircle }> = [
  { id: "chat", label: "Диалог", icon: MessageCircle },
  { id: "models", label: "Модели", icon: Boxes },
  { id: "system", label: "Система", icon: Settings2 },
];

export function NavRail({ view, open, onChange }: NavRailProps) {
  return (
    <aside className={`nav-rail ${open ? "nav-rail--open" : ""}`}>
      <div className="brand-mark" aria-label="Galen">
        <span />
      </div>
      <nav>
        {items.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            className={view === id ? "active" : ""}
            onClick={() => onChange(id)}
            aria-label={label}
            title={label}
          >
            <Icon size={20} strokeWidth={1.65} />
            <span className="nav-label">{label}</span>
          </button>
        ))}
      </nav>
      <div className="nav-spacer" />
      <div className="local-status">
        <i />
        <span className="nav-label">Локально</span>
      </div>
    </aside>
  );
}

