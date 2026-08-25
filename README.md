<div align="center">
  <img src="src-tauri/icons/galen-icon.svg" width="92" alt="Galen" />
  <h1>Galen</h1>
  <p><b>Локальный AI-агент для Windows 11 и Arch Linux.</b><br/>Слышит, говорит, читает документы, ищет в интернете и работает с терминалом.</p>

  ![Release](https://img.shields.io/github/v/release/Qrayyt/Galen?style=flat-square&color=111111&label=release)
  ![Windows](https://img.shields.io/badge/Windows_11-ready-111111?style=flat-square&logo=windows&logoColor=white)
  ![Arch Linux](https://img.shields.io/badge/Arch_Linux-ready-111111?style=flat-square&logo=archlinux&logoColor=white)
  ![Tauri](https://img.shields.io/badge/Tauri_2-desktop-111111?style=flat-square&logo=tauri&logoColor=white)
  ![Ollama](https://img.shields.io/badge/Ollama-local_models-111111?style=flat-square)
</div>

## Что умеет Galen 0.3

- Локальный агентный цикл на Ollama с вызовом инструментов.
- Актуальный веб-поиск и чтение страниц без API-ключа.
- Терминал в стиле coding agents: модель предлагает команду, приложение показывает папку и причину, пользователь отдельно подтверждает запуск.
- Три настоящих режима: **Лёгкий**, **Средний**, **Тяжёлый** — разный thinking, контекст и лимит инструментальных шагов.
- Внутренние рассуждения скрыты. В интерфейсе остаются короткие статусы: «Думаю», «Ищу в интернете», «Читаю страницу», «Выполняю команду».
- Несколько чатов с локальной историей.
- Долговременная память между чатами: автоматическое извлечение полезных фактов, ручное добавление, редактирование, отключение и полная очистка.
- Вложения: изображения, PDF, DOCX, TXT, Markdown, CSV, JSON и исходный код.
- Анализ изображений через установленную vision-модель, например **gemma3:4b**.
- Голосовой ввод, отдельный голосовой режим и озвучивание любого ответа.
- Библиотека моделей с реальным чёрным progress bar загрузки.
- Анализ CPU, RAM, GPU, VRAM, ОС и автоматический подбор модели.
- Светлый монохромный интерфейс с GPU-friendly анимациями только через transform и opacity.

## Рекомендуемая модель для мощного ПК

Для Ryzen 9 5950X, RTX 5060 Ti 16 ГБ и 32 ГБ RAM Galen рекомендует:

~~~text
qwen3:14b
~~~

Она заметно умнее 4B-модели и помещается в видеопамять в стандартной квантизации. Для анализа картинок дополнительно скачай **gemma3:4b**: Galen автоматически переключится на неё, когда в сообщении есть изображение.

## Установка на Windows 11

1. Установи Ollama в обычном PowerShell:

~~~powershell
irm https://ollama.com/install.ps1 | iex
~~~

2. Открой [последний релиз](https://github.com/Qrayyt/Galen/releases/latest).
3. Скачай **Galen_*_x64-setup.exe** и установи поверх предыдущей версии.
4. Если SmartScreen покажет предупреждение для неподписанной сборки: «Подробнее» → «Выполнить в любом случае».

Модели Ollama не удаляются при обновлении Galen.

## Первый запуск

1. Открой раздел «Модели».
2. Нажми «Скачать» у рекомендованной модели.
3. Дождись 100% — только после полной загрузки модель станет активной.
4. Создай новый чат.
5. Проверь веб запросом «Что произошло сегодня в мире ИИ?».
6. Проверь терминал запросом «Покажи характеристики этого компьютера через консоль».

Команды терминала никогда не запускаются молча: перед выполнением появляется отдельная карточка подтверждения.

## Голос на Windows

Galen сначала использует встроенное распознавание Windows через System.Speech, затем Web Speech как запасной вариант. Для русского ввода должен быть установлен русский речевой пакет Windows. Озвучивание использует системные голоса Windows.

## Приватность

Локально остаются:

- история чатов;
- память о пользователе;
- текст извлечённых документов;
- изображения;
- запросы к модели;
- вывод команд терминала.

Когда включён веб, наружу уходят только поисковые запросы и URL страниц, которые агент решил прочитать. Веб, терминал и память независимо отключаются в настройках.

## Arch / Manjaro

~~~bash
sudo pacman -S --needed git github-cli
gh auth login
gh repo clone Qrayyt/Galen
cd Galen
chmod +x scripts/install-arch.sh
./scripts/install-arch.sh
galen
~~~

## Разработка

~~~bash
npm ci
npm test
npm run build
cargo check --manifest-path src-tauri/Cargo.toml
npm run tauri dev
~~~

## Архитектура

~~~text
React 19 + TypeScript + Motion
       │
       ├── local chats / memory / settings
       ├── PDF.js + Mammoth (lazy loaded)
       ├── Web Speech + Windows System.Speech
       │
       ▼ Tauri IPC events
Rust agent runtime
       ├── Ollama chat + hidden thinking
       ├── tool loop (2 / 5 / 8 steps)
       ├── DuckDuckGo search + page reader
       ├── terminal approval gate
       ├── hardware / model lifecycle
       └── GitHub Release updater
~~~

## Безопасность инструментов

- локальные и приватные IP блокируются для веб-инструмента;
- разрешены только HTTP/HTTPS URL;
- число redirect ограничено;
- вывод команды ограничен по размеру;
- команда останавливается по таймауту;
- каждая команда требует явного разрешения.

---

<div align="center"><sub>Galenite · local first</sub></div>

