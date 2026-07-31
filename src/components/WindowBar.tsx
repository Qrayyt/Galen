import { Menu, Minus, Square, X } from "lucide-react";
import { native } from "../lib/native";

interface WindowBarProps {
  onMenu: () => void;
}

export function WindowBar({ onMenu }: WindowBarProps) {
  return (
    <header className="window-bar" data-tauri-drag-region>
      <button className="icon-button menu-button" onClick={onMenu} aria-label="Меню">
        <Menu size={19} strokeWidth={1.8} />
      </button>
      <div className="window-drag" data-tauri-drag-region />
      <div className="window-controls">
        <button onClick={native.minimize} aria-label="Свернуть">
          <Minus size={16} strokeWidth={1.6} />
        </button>
        <button onClick={native.toggleMaximize} aria-label="Развернуть">
          <Square size={13} strokeWidth={1.55} />
        </button>
        <button onClick={native.close} aria-label="Закрыть">
          <X size={16} strokeWidth={1.6} />
        </button>
      </div>
    </header>
  );
}

