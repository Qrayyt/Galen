"""Native desktop labels use the configured UI language, not the reply language."""
from __future__ import annotations


def ui_language() -> str:
    try:
        from dodaios.core.config import load_config

        cfg = load_config()
        return str(getattr(getattr(cfg, "ui", None), "language", None) or "ru").lower().split("-", 1)[0]
    except Exception:
        return "ru"


def desktop_label(english: str, russian: str, *, lang: str | None = None) -> str:
    return russian if (lang or ui_language()) == "ru" else english


_STATE_RU = {
    "idle": "Готов", "listening": "Слушаю", "thinking": "Думаю",
    "speaking": "Говорю", "error": "Ошибка", "paused": "Пауза",
}


def state_label(state: str, *, lang: str | None = None) -> str:
    return desktop_label(state, _STATE_RU.get(state, state), lang=lang)
