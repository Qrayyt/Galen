import { ArrowUp, Plus, Square } from "lucide-react";
import { useEffect, useRef, useState, type KeyboardEvent } from "react";

interface ComposerProps {
  disabled?: boolean;
  busy?: boolean;
  modelLabel?: string;
  onSend: (message: string) => void;
}

export function Composer({ disabled, busy, modelLabel, onSend }: ComposerProps) {
  const [value, setValue] = useState("");
  const areaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const area = areaRef.current;
    if (!area) return;
    area.style.height = "24px";
    area.style.height = `${Math.min(area.scrollHeight, 112)}px`;
  }, [value]);

  const submit = () => {
    const next = value.trim();
    if (!next || disabled || busy) return;
    onSend(next);
    setValue("");
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      submit();
    }
  };

  return (
    <div className="composer-wrap">
      <div className={`composer ${disabled ? "composer--disabled" : ""}`}>
        <button className="composer-icon" aria-label="Добавить" title="Вложения появятся в следующей версии">
          <Plus size={23} strokeWidth={1.7} />
        </button>
        <textarea
          ref={areaRef}
          value={value}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={handleKeyDown}
          rows={1}
          disabled={disabled}
          placeholder={disabled ? "Сначала скачай модель" : "Напиши сообщение…"}
          aria-label="Сообщение"
        />
        <span className="composer-model">{modelLabel ?? "Нет модели"}</span>
        <button
          className={`send-button ${value.trim() ? "send-button--ready" : ""}`}
          onClick={submit}
          disabled={!value.trim() || disabled || busy}
          aria-label={busy ? "Гален отвечает" : "Отправить"}
        >
          {busy ? <Square size={13} fill="currentColor" /> : <ArrowUp size={20} strokeWidth={1.7} />}
        </button>
      </div>
      <div className="composer-hint">
        <span>Enter — отправить</span>
        <span>Shift + Enter — новая строка</span>
        <span>Все данные остаются на этом ПК</span>
      </div>
    </div>
  );
}

