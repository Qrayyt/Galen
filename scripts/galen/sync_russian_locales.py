#!/usr/bin/env python3
"""Complete Russian UI locale files from the authoritative English catalogs.

Existing Russian copy is always preserved. Missing strings are translated in
bounded batches, with placeholders, URLs, tags, keyboard tokens and inline code
masked before they leave the process. The output mirrors every English locale
file exactly, which makes future upstream additions visible to the parity gate.

This is a maintainer tool, not a build step. Run it manually when English
catalogs gain keys; CI only runs ``check_russian_locales.py`` offline.
"""

from __future__ import annotations

import argparse
import concurrent.futures
import json
import os
import re
import subprocess
import tempfile
import threading
import time
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[2]
LOCALES = ROOT / "dodaios" / "ui" / "web" / "frontend" / "src" / "i18n" / "locales"
CACHE = Path(tempfile.gettempdir()) / "galen-russian-locale-cache-v2.json"
TRANSLATE_URL = (
    "https://edge.microsoft.com/translate/translatetext"
    "?from=en&to=ru&isEnterpriseClient=false"
)
TOKEN_RE = re.compile(
    r"https?://[^\s)\]}]+|"
    r"`[^`]*`|"
    r"\{\{[^{}]+\}\}|"
    r"\{[^{}]+\}|"
    r"<[^>]+>"
)
CYRILLIC_RE = re.compile(r"[А-Яа-яЁё]")
ENGLISH_RE = re.compile(r"[A-Za-z]")
LOCK = threading.Lock()

TRANSLATION_OVERRIDES = {
    # Product names and channel names are identifiers, not ordinary words.
    "Slack": "Slack",
    "Telegram": "Telegram",
    "Ollama": "Ollama",
    "Claude": "Claude",
    "Codex": "Codex",
    "ChatGPT": "ChatGPT",
    # The front page is the first surface people see. Keep its short copy
    # deliberate rather than accepting context-free machine translation.
    "Working": "Работает",
    "Needs you": "Требуется ваше действие",
    "Paused": "Приостановлено",
    "Automations": "Автоматизации",
    "None yet. Ask Galen to set one up.": "Пока ничего нет. Попросите Galen создать автоматизацию.",
    "Routines": "Сценарии",
    "1 agent at work": "1 агент работает",
    "{count} agents at work": "Работают агенты: {count}",
    "{assistant} runs here": "{assistant} работает здесь",
    "Nothing yet. Chats in the Agentic IDE that {assistant} hands a task to show up here.": "Пока ничего нет. Здесь появятся чаты Agentic IDE, которым {assistant} передаст задачу.",
    "Nothing yet. Files {assistant} makes show up here.": "Пока ничего нет. Здесь появятся файлы, созданные {assistant}.",
    "Connect {channel}": "Подключить {channel}",
    "{channel} is connected": "{channel} подключён",
    "Open the chat with {assistant} in {channel}": "Открыть чат с {assistant} в {channel}",
    "Open {workspace} in {channel}": "Открыть {workspace} в {channel}",
    "Conversation or Agentic IDE": "Диалог или агентная IDE",
    "Pin chat": "Закрепить чат",
    "Unpin chat": "Открепить чат",
    "Dev instance — a second, freely restartable copy of the app with its own data, ports and icon. The regular app keeps running beside it.": "Dev-экземпляр — отдельная копия приложения со своими данными, портами и значком. Её можно свободно перезапускать, не прерывая основную Galen.",
    "Open API Keys": "Открыть API-ключи",
    "Dictate": "Диктовка",
    # Permission modes arrive from the Python catalog at runtime, so their
    # English source strings must also have stable Russian equivalents.
    "Bypass permissions": "Без подтверждений",
    "Nothing asks. Blacklisted actions stay blocked.": "Подтверждения не запрашиваются. Запрещённые действия остаются заблокированными.",
    "Everything runs without asking.": "Все действия выполняются без запросов.",
    "Ask before edits": "Спрашивать перед изменениями",
    "Ask before acting": "Спрашивать перед действиями",
    "Ask (auto-review)": "Спрашивать (автопроверка)",
    "Auto": "Автоматически",
    "Plan": "Планирование",
    "Full access": "Полный доступ",
    "Auto-accept edits": "Автопринятие изменений",
    "Skip permissions": "Без проверок разрешений",
    "CLI's own policy": "Правила CLI",
    "Harness policy": "Правила среды запуска",
    "Agent": "Агент",
    "Ask before actions": "Спрашивать перед действиями",
    "Ask with auto-review": "Спрашивать с автопроверкой",
    "Automatic": "Автоматически",
    "Plan only": "Только планирование",
    "No confirmations": "Без подтверждений",
    "Skip permission checks": "Без проверок разрешений",
    "Use the CLI policy": "Использовать правила CLI",
    "Use the harness policy": "Использовать правила среды запуска",
    "Agent mode": "Режим агента",
    "Reads run freely; edits and commands ask first.": "Чтение выполняется свободно; изменения и команды сначала запрашивают подтверждение.",
    "Reads run freely; changes and other actions ask first.": "Чтение выполняется свободно; изменения и другие действия сначала запрашивают подтверждение.",
    "The agent reviews actions that would otherwise ask you.": "Агент сам проверяет действия, которые иначе потребовали бы вашего подтверждения.",
    "Routine actions run automatically; risky actions still ask.": "Обычные действия выполняются автоматически, а рискованные по-прежнему требуют подтверждения.",
    "Reads and plans without changing anything.": "Читает и составляет план, ничего не изменяя.",
    "Nothing asks; blocked actions remain blocked.": "Подтверждения не запрашиваются; запрещённые действия остаются заблокированными.",
    "Edits run automatically; commands may still ask.": "Изменения применяются автоматически; команды всё ещё могут запрашивать подтверждение.",
    "Tools run without asking or using a protective sandbox.": "Инструменты работают без подтверждений и без защитной песочницы.",
    "The connected CLI decides which actions may run.": "Подключённый CLI сам определяет, какие действия можно выполнять.",
    "The runner's own settings decide which actions may run.": "Настройки среды запуска определяют, какие действия можно выполнять.",
    # First-run tour copy needs natural imperative Russian; it is prominently
    # displayed over the whole application.
    "A walk through {name}": "Знакомство с {name}",
    "Your pet walks you through the app and explains each section.": "Ваш помощник проведёт экскурсию по приложению и объяснит каждый раздел.",
    "Let's go": "Начать",
    "Hi, I'm {pet}! Let me show you around. This is your chat with {name}. Type anything here: a question, a task, a file to look at. You never pick a tool or a model yourself; {name} decides what's needed.": "Привет, я {pet}! Давайте покажу всё вокруг. Это ваш чат с {name}. Здесь можно написать вопрос, поставить задачу или прикрепить файл. Выбирать инструмент или модель не нужно — {name} сам решит, что потребуется.",
    "Rather talk? This is voice chat. Click the bar, say your wake word or press your Call shortcut, then just speak. The wave shows who is talking.": "Удобнее говорить? Это голосовой чат. Нажмите на панель, произнесите фразу активации или используйте горячую клавишу звонка, а затем просто говорите. Волна показывает, кто сейчас говорит.",
    "The Agentic IDE runs coding agents such as Claude Code and Codex in real terminals, on your own projects. Type to them directly, or let {name} steer them by voice.": "Агентная IDE запускает Claude Code, Codex и других агентов программирования в настоящих терминалах ваших проектов. Пишите им напрямую или управляйте ими голосом через {name}.",
    "Plugins connect {name} to the apps you use: mail, calendar, notes, smart home and more. Each one becomes a new tool, and anything that sends or changes something asks you first.": "Плагины подключают {name} к почте, календарю, заметкам, умному дому и другим приложениям. Каждый плагин становится новым инструментом, а перед отправкой или изменением данных Galen сначала запросит подтверждение.",
    'Your wake word lives here in Settings. Say "Hey {name}" and {name} listens. Change the word, pick its language or test it anytime.': 'Фраза активации находится здесь, в настройках. Скажите «Привет, {name}», и {name} начнёт слушать. Фразу и язык можно изменить или проверить в любое время.',
    "That's the tour! Talk to {name} whenever you like, and if you're ever stuck, just ask. Settings → App runs this guide again.": "Экскурсия завершена! Обращайтесь к {name} в любое время, а если возникнут трудности — просто спросите. Повторно запустить подсказки можно в разделе «Настройки → Приложение».",
    "Pixelate": "Пикселизация",
    "Bcc": "Скрытая копия",
    "Cc": "Копия",
    "Raw": "Исходный вид",
    "{n} d": "{n} дн.",
    "{n} h": "{n} ч.",
    "{n} d ago": "{n} дн. назад",
    "{count} d ago": "{count} дн. назад",
    "d": "дн.",
    "h": "ч.",
    "s": "с",
    "Blank": "Пустой",
    "Document Digester": "Обработчик документов",
    "Translator": "Переводчик",
    "Ln {line}, Col {column}": "Стр. {line}, столб. {column}",
    "Shell": "Командная оболочка",
    "{days}d": "{days} дн.",
    "{count}d": "{count} дн.",
    "{count}h": "{count} ч.",
    "{count}m": "{count} мин.",
    "{count}w": "{count} нед.",
    "{count}s": "{count} с",
    "{seconds} s": "{seconds} с",
    "-{seconds} s": "−{seconds} с",
    "{clock} ({seconds} s)": "{clock} ({seconds} с)",
    "Pull request": "Запрос на слияние",
    "Pull request #{number}": "Запрос на слияние №{number}",
    "Commit, push, pull request, worktrees": "Коммит, отправка, запрос на слияние, рабочие деревья",
    "Unpin project": "Открепить проект",
    "Plain Terminal": "Обычный терминал",
    "Cherry Pick": "Перенести коммит",
    "Commit All": "Закоммитить всё",
    "Commit & Push": "Закоммитить и отправить",
    "Pull (Rebase)": "Получить (с перебазированием)",
    "Sharp": "Резкий",
    "10x Engineer": "Инженер 10×",
    "C{column} · R{row}": "Столбец {column} · строка {row}",
    "Stacked": "С накоплением",
    "Wipe": "Вытеснение",
    "Hard": "Сложно",
    "Dodge roll": "Уклонение кувком",
    "Pixel Raiders": "Пиксельные рейдеры",
    "Longsight": "Дальнозоркость",
    "Raw Markdown": "Исходный Markdown",
    "Galaxy": "Галактика",
    "Lv {0}": "Ур. {0}",
    "{0} s": "{0} с",
    "{0} m": "{0} м",
    "Dodaios Hub": "Центр Galen",
    "Agent Foundry": "Фабрика агентов",
    "Sink": "Снизиться",
    "Fly": "Лететь",
    "{days}D": "{days} дн.",
    "Ledger": "Реестр",
    "Hands-free": "Без рук",
    "Ember": "Уголёк",
    "Deny (Esc)": "Отклонить (Esc)",
    "· Shift to swap": "· Shift — поменять местами",
    "CLI Test Hub": "Центр тестирования CLI",
    "Mouse Fwd": "Кнопка мыши «Вперёд»",
    "Galen Tools": "Инструменты Galen",
    "Left to {name}.": "Осталось до {name}.",
    "Paste Twilio Auth Token": "Вставьте токен авторизации Twilio",
    "iter #{n}": "итерация №{n}",
    "Switch Realtime provider": "Сменить провайдера реального времени",
    "Open CI run": "Открыть запуск CI",
    'Message ({key}+Enter to commit on "{branch}")': 'Сообщение ({key}+Enter — коммит в ветку «{branch}»)',
    "Connect project": "Подключить проект",
}


def english_files() -> list[Path]:
    found: list[Path] = []
    for path in LOCALES.rglob("*.json"):
        if path.name == "en.json" or path.name.endswith(".en.json"):
            found.append(path)
    return sorted(found)


def russian_path(english: Path) -> Path:
    if english.name == "en.json":
        return english.with_name("ru.json")
    return english.with_name(english.name.removesuffix(".en.json") + ".ru.json")


def read_json(path: Path) -> dict[str, Any]:
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError:
        return {}
    if not isinstance(value, dict):
        raise SystemExit(f"Locale root must be an object: {path}")
    return value


def flatten(value: Any, prefix: str = "") -> dict[str, str]:
    result: dict[str, str] = {}
    if isinstance(value, dict):
        for key, child in value.items():
            name = f"{prefix}.{key}" if prefix else key
            result.update(flatten(child, name))
    elif isinstance(value, str):
        result[prefix] = value
    return result


def lookup(value: dict[str, Any], dotted: str) -> Any:
    current: Any = value
    for part in dotted.split("."):
        if not isinstance(current, dict) or part not in current:
            return None
        current = current[part]
    return current


def needs_translation(text: str) -> bool:
    if not ENGLISH_RE.search(text):
        return False
    stripped = text.strip()
    if re.fullmatch(r"https?://\S+", stripped):
        return False
    if re.fullmatch(r"[A-Z0-9_.+/#:-]{1,24}", stripped):
        return False
    return True


def usable_translation(source: str, translated: str) -> bool:
    if any(marker in translated for marker in ("GALEN_TOKEN", "GALEN_ITEM", "\ufffd")):
        return False
    if sorted(TOKEN_RE.findall(source)) != sorted(TOKEN_RE.findall(translated)):
        return False
    return not (needs_translation(source) and source == translated)


def batches(values: list[str], max_chars: int = 5000, max_items: int = 30) -> list[list[str]]:
    result: list[list[str]] = []
    current: list[str] = []
    size = 0
    for value in values:
        extra = len(value) + 32
        if current and (len(current) >= max_items or size + extra > max_chars):
            result.append(current)
            current = []
            size = 0
        current.append(value)
        size += extra
    if current:
        result.append(current)
    return result


def request_translation(values: list[str]) -> list[str]:
    segments: list[str] = []
    layouts: list[list[tuple[bool, str | int]]] = []
    for value in values:
        layout: list[tuple[bool, str | int]] = []
        cursor = 0
        for match in TOKEN_RE.finditer(value):
            if match.start() > cursor:
                layout.append((True, len(segments)))
                segments.append(value[cursor : match.start()])
            layout.append((False, match.group(0)))
            cursor = match.end()
        if cursor < len(value):
            layout.append((True, len(segments)))
            segments.append(value[cursor:])
        layouts.append(layout)
    if not segments:
        return values

    last_error: Exception | None = None
    for attempt in range(4):
        try:
            request = urllib.request.Request(
                TRANSLATE_URL,
                data=json.dumps(segments, ensure_ascii=False).encode("utf-8"),
                headers={
                    "Content-Type": "application/json",
                    "User-Agent": "Galen-Locale-Sync/1.0",
                },
                method="POST",
            )
            with urllib.request.urlopen(request, timeout=20) as response:
                data = json.loads(response.read().decode("utf-8"))
            translated = [entry["translations"][0]["text"] for entry in data]
            if len(translated) != len(segments):
                raise ValueError(
                    f"translation batch returned {len(translated)} of {len(segments)} segments"
                )
            output: list[str] = []
            for layout in layouts:
                output.append(
                    cleanup(
                        "".join(
                            translated[int(value)] if is_segment else str(value)
                            for is_segment, value in layout
                        ).strip()
                    )
                )
            return output
        except (OSError, ValueError, KeyError, IndexError, TypeError, json.JSONDecodeError) as exc:
            last_error = exc
            print(f"  translation retry {attempt + 1}/4: {exc}", flush=True)
            time.sleep(min(8.0, 2.0**attempt))
    raise RuntimeError(f"translation failed after retries: {last_error}")


def cleanup(text: str) -> str:
    replacements = {
        "Connect with ChatGPT": "Подключение через ChatGPT",
        "Take Control": "Взять управление",
        "Agent Foundry": "Фабрика агентов",
        "Pull requests": "запросы на слияние",
        "Pull request": "запрос на слияние",
        "Commit All": "Закоммитить всё",
        "Delete": "Удалить",
        "Нажмите Start": "Нажмите «Начать»",
        "нажмите Start": "нажмите «Начать»",
        "Start для разговора": "«Начать», чтобы говорить",
        "Используйте «New»": "Используйте «Создать»",
        "Начните с New": "Начните с «Создать»",
        "Model Context": "контекста модели",
        "Tool Model": "модель инструментов",
        "Voice Input": "голосового ввода",
        "Voice Output": "голосового вывода",
        "провайдера Realtime": "провайдера реального времени",
        "режим Realtime": "режим реального времени",
        "API Realtime": "API реального времени",
        "протоколе Realtime": "протоколе реального времени",
        "Realtime не": "режим реального времени не",
        "Realtime при": "режим реального времени при",
        "включите Realtime": "включите режим реального времени",
        "Включите Realtime": "Включите режим реального времени",
        "Pipeline": "голосовой конвейер",
        "Brain": "модель мышления",
        "Computer-Use": "управление компьютером",
        "Picker": "список выбора",
        "режиме Automatic": "автоматическом режиме",
        "TTS/Brain Cloud": "TTS и облачная модель мышления",
        "TTS/модель мышления Cloud": "TTS и облачная модель мышления",
        "Стихи Додайос": "Galen Verse",
        "стих Додайоса": "Galen Verse",
        "Додайосом": "Galen",
        "Додайосу": "Galen",
        "Додайосе": "Galen",
        "Додайоса": "Galen",
        "Джарвис": "Galen",
        "Джервис": "Galen",
        "Галена": "Galen",
        "Galenа": "Galen",
        "Гален": "Galen",
        "Додайос": "Galen",
        "Dodaios": "Galen",
        "PersonalJarvis": "Galen",
        "Jarvis": "Galen",
        "Гитхаб": "GitHub",
        "Github": "GitHub",
        "Openrouter": "OpenRouter",
        "Кодекс": "Codex",
        "Клод": "Claude",
    }
    for old, new in replacements.items():
        text = text.replace(old, new)
    return text


def load_cache() -> dict[str, str]:
    try:
        data = json.loads(CACHE.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {}
    if not isinstance(data, dict):
        return {}
    cache = {str(k): str(v) for k, v in data.items()}
    return {
        source: translated
        for source, translated in cache.items()
        if usable_translation(source, translated)
    }


def save_cache(cache: dict[str, str]) -> None:
    temporary = CACHE.with_suffix(".tmp")
    temporary.write_text(json.dumps(cache, ensure_ascii=False, indent=2), encoding="utf-8")
    os.replace(temporary, CACHE)


def translated_catalog() -> dict[str, str]:
    cache = load_cache()
    cache.update(TRANSLATION_OVERRIDES)
    missing: list[str] = []
    seen: set[str] = set()
    for path in english_files():
        english = flatten(read_json(path))
        russian = read_json(russian_path(path))
        for key, value in english.items():
            existing = lookup(russian, key)
            if isinstance(existing, str) and usable_translation(value, existing):
                cache.setdefault(value, existing)
            elif value not in cache and value not in seen:
                seen.add(value)
                missing.append(value)

    direct = [value for value in missing if not needs_translation(value)]
    for value in direct:
        cache[value] = value
    work = [value for value in missing if needs_translation(value)]
    packs = batches(work)
    print(f"Translating {len(work)} unique strings in {len(packs)} batches...")

    completed = 0
    # Keep concurrency deliberately low: this is an occasional maintainer
    # operation and the endpoint is shared with the browser.
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
        futures = {pool.submit(request_translation, pack): pack for pack in packs}
        for future in concurrent.futures.as_completed(futures):
            pack = futures[future]
            translated = future.result()
            with LOCK:
                cache.update(zip(pack, translated, strict=True))
                completed += 1
                if completed % 10 == 0 or completed == len(packs):
                    save_cache(cache)
                    print(f"  {completed}/{len(packs)} batches")
    save_cache(cache)
    return cache


def rebuild(english: Any, existing: Any, translations: dict[str, str]) -> Any:
    if isinstance(english, dict):
        old = existing if isinstance(existing, dict) else {}
        return {key: rebuild(value, old.get(key), translations) for key, value in english.items()}
    if isinstance(english, list):
        return english
    if isinstance(english, str):
        if english in TRANSLATION_OVERRIDES:
            return TRANSLATION_OVERRIDES[english]
        if isinstance(existing, str) and usable_translation(english, existing):
            return cleanup(existing)
        return cleanup(translations[english])
    return english


def write_locales(translations: dict[str, str]) -> None:
    for english_path in english_files():
        target = russian_path(english_path)
        english = read_json(english_path)
        existing = read_json(target)
        output = rebuild(english, existing, translations)
        target.write_text(
            json.dumps(output, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
            newline="\n",
        )
        print(target.relative_to(ROOT))


def restore_repository_locales() -> None:
    """Restore the human-maintained locale baseline before a clean refresh."""

    for english_path in english_files():
        target = russian_path(english_path)
        relative = target.relative_to(ROOT).as_posix()
        result = subprocess.run(
            ["git", "show", f"HEAD:{relative}"],
            cwd=ROOT,
            capture_output=True,
            check=False,
        )
        content = result.stdout if result.returncode == 0 else b"{}\n"
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(content)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--cache", type=Path, help="Override the translation cache location")
    parser.add_argument(
        "--refresh",
        action="store_true",
        help="Rebuild from the committed human-maintained Russian catalogs",
    )
    args = parser.parse_args()
    global CACHE
    if args.cache:
        CACHE = args.cache.resolve()
    if args.refresh:
        restore_repository_locales()
    write_locales(translated_catalog())


if __name__ == "__main__":
    main()
