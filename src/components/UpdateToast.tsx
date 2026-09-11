import { ArrowDownToLine, Check, RotateCw } from "lucide-react";
import type { UpdateInfo, UpdateProgress } from "../types";

interface UpdateToastProps {
  update: UpdateInfo | null;
  progress: UpdateProgress | null;
  updating: boolean;
  onUpdate: () => void;
}

const formatBytes = (value: number) => {
  if (!value) return "";
  const mb = value / 1024 / 1024;
  return mb >= 100 ? `${Math.round(mb)} МБ` : `${mb.toFixed(1)} МБ`;
};

export function UpdateToast({ update, progress, updating, onUpdate }: UpdateToastProps) {
  if (!update?.available) return null;
  const percent = Math.round(progress?.percent ?? 0);
  return (
    <aside className="update-toast" role="status" aria-live="polite">
      <div className="update-toast-icon">
        {updating ? <RotateCw size={17} className="spin" /> : <ArrowDownToLine size={17} />}
      </div>
      <div className="update-toast-content">
        <strong>{updating ? progress?.status ?? "Обновляю Galen" : `Доступен Galen ${update.latestVersion ?? ""}`}</strong>
        {updating ? (
          <>
            <div className="update-progress-track"><span style={{ width: `${percent}%` }} /></div>
            <small>
              {progress?.error
                ? progress.error
                : `${percent}%${progress?.total ? ` · ${formatBytes(progress.downloaded)} / ${formatBytes(progress.total)}` : ""}`}
            </small>
          </>
        ) : (
          <small>Обновление установится тихо и перезапустит приложение.</small>
        )}
      </div>
      {!updating && (
        <button className="update-toast-button" onClick={onUpdate}>
          <Check size={14} /> Обновить
        </button>
      )}
    </aside>
  );
}
