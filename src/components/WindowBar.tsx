import { Menu, Minus, Square, X } from "lucide-react";
import { native } from "../lib/native";

interface WindowBarProps {
  sidebarOpen: boolean;
  onMenu: () => void;
  title?: string;
}

export function WindowBar({ sidebarOpen, onMenu, title }: WindowBarProps) {
  return (
    <header className="window-bar" data-tauri-drag-region>
      {!sidebarOpen && (
        <button className="window-menu" onClick={onMenu} aria-label="Открыть меню">
          <Menu size={19} />
        </button>
      )}
      <span className="window-title">{title}</span>
      <div className="window-drag" data-tauri-drag-region />
      <div className="window-controls">
        <button onClick={() => void native.minimize()} aria-label="Свернуть"><Minus size={15} /></button>
        <button onClick={() => void native.toggleMaximize()} aria-label="Развернуть"><Square size={12} /></button>
        <button onClick={() => void native.close()} aria-label="Закрыть"><X size={16} /></button>
      </div>
    </header>
  );
}

