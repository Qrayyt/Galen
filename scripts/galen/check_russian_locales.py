#!/usr/bin/env python3
"""Offline completeness gate for the Galen Russian interface."""

from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[2]
LOCALES = ROOT / "dodaios" / "ui" / "web" / "frontend" / "src" / "i18n" / "locales"
I18N_INDEX = ROOT / "dodaios" / "ui" / "web" / "frontend" / "src" / "i18n" / "index.ts"
PLACEHOLDER_RE = re.compile(r"\{\{[^{}]+\}\}|\{[^{}]+\}")
CYRILLIC_RE = re.compile(r"[А-Яа-яЁё]")
ENGLISH_RE = re.compile(r"[A-Za-z]")

# Product names, protocols and code-shaped labels are intentionally the same in
# every language. Sentences and ordinary UI words are not allowed here.
UNCHANGED_RE = re.compile(
    r"^(?:"
    r"https?://\S+|"
    r"[A-Z0-9_.+/#:-]{1,32}|"
    r"(?:Galen|Galen X|Dodaios|OpenAI|OpenRouter|ChatGPT|Claude|Codex|Gemini|GitHub|GitLab|"
    r"Google|Microsoft|Apple|Windows|macOS|Linux|Android|iOS|Slack|Telegram|Discord|"
    r"WhatsApp|Signal|Notion|Figma|Stripe|Supabase|PostgreSQL|Docker|Cloudflare|"
    r"YouTube|Spotify|Zoom|Jira|Confluence|Linear|Obsidian|Home Assistant|Ollama|"
    r"LM Studio|ElevenLabs|Deepgram|Groq|Hugging Face|App Store|Google Play|Google Sheets|"
    r"OVHcloud|Shopify|OpenClaw|OpenAI GPT-Live|GPT-Live|Markdown|Times New Roman|Top P|"
    r"uvx|mcp\.json|git|en)"
    r")$"
)

UNCHANGED_VALUES = {
    "Windows · macOS · Linux",
    "Ctrl/Cmd + Enter",
    "Esc",
    "{0} × {0} px",
    "{xp} XP",
    "{fps} FPS",
    "{0} / {1} XP",
    "example.com",
    "Gmail",
    "RabbitMQ",
    "AWS Lightsail",
    "DigitalOcean",
    "Hostinger",
    "Akamai Linode",
    "Oracle Cloud",
    "Raspberry Pi",
    "Vultr",
    "~{0} GB",
    "Apple Silicon",
    "OpenAI Codex CLI",
    "YouTube Music",
    "Twilio",
}


def english_files() -> list[Path]:
    return sorted(
        path
        for path in LOCALES.rglob("*.json")
        if path.name == "en.json" or path.name.endswith(".en.json")
    )


def russian_path(english: Path) -> Path:
    if english.name == "en.json":
        return english.with_name("ru.json")
    return english.with_name(english.name.removesuffix(".en.json") + ".ru.json")


def flatten(value: Any, prefix: str = "") -> dict[str, str]:
    result: dict[str, str] = {}
    if isinstance(value, dict):
        for key, child in value.items():
            name = f"{prefix}.{key}" if prefix else key
            result.update(flatten(child, name))
    elif isinstance(value, str):
        result[prefix] = value
    return result


def load(path: Path) -> dict[str, str]:
    return flatten(json.loads(path.read_text(encoding="utf-8")))


def main() -> None:
    problems: list[str] = []
    total = 0
    for english_path in english_files():
        target = russian_path(english_path)
        label = target.relative_to(ROOT).as_posix()
        if not target.is_file():
            problems.append(f"{label}: missing Russian catalog")
            continue
        english = load(english_path)
        russian = load(target)
        total += len(english)
        missing = sorted(set(english) - set(russian))
        extra = sorted(set(russian) - set(english))
        if missing:
            problems.append(f"{label}: {len(missing)} missing keys, first: {missing[:5]}")
        if extra:
            problems.append(f"{label}: {len(extra)} extra keys, first: {extra[:5]}")
        for key in sorted(set(english) & set(russian)):
            source = english[key]
            translated = russian[key]
            visible_source = PLACEHOLDER_RE.sub("", source)
            if sorted(PLACEHOLDER_RE.findall(source)) != sorted(PLACEHOLDER_RE.findall(translated)):
                problems.append(f"{label}:{key}: placeholders changed")
            if (
                source == translated
                and ENGLISH_RE.search(visible_source)
                and not CYRILLIC_RE.search(source)
                and source.strip() not in UNCHANGED_VALUES
                and not UNCHANGED_RE.fullmatch(source.strip())
            ):
                problems.append(f"{label}:{key}: untranslated English value {source!r}")

    index = I18N_INDEX.read_text(encoding="utf-8")
    english_fallbacks = re.findall(r"\bru\s*:\s*[^\n]*?(?:/en\.json|Locale\(\"en\"\))", index)
    if english_fallbacks:
        problems.append(f"i18n/index.ts: {len(english_fallbacks)} Russian chunks still load English")

    if problems:
        raise SystemExit("Russian locale gate failed:\n- " + "\n- ".join(problems))
    print(f"Russian locale gate OK: {len(english_files())} files, {total} strings.")


if __name__ == "__main__":
    main()
