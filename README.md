<div align="center">
  <img src="src-tauri/icons/galen-icon.svg" width="92" alt="Galen" />
  <h1>Galen</h1>
  <p>Локальный AI-десктоп для Arch Linux. Приватный, быстрый и полностью на твоём компьютере.</p>

  ![Release](https://img.shields.io/github/v/release/Qrayyt/Galen?style=flat-square&color=111111&label=release)
  ![Arch Linux](https://img.shields.io/badge/Arch_Linux-ready-111111?style=flat-square&logo=archlinux&logoColor=white)
  ![Tauri](https://img.shields.io/badge/Tauri_2-desktop-111111?style=flat-square&logo=tauri&logoColor=white)
  ![Ollama](https://img.shields.io/badge/Ollama-local_models-111111?style=flat-square)
</div>

## Что уже работает

- Настоящий локальный чат с потоковой выдачей ответа через Ollama.
- Библиотека моделей: Qwen, Llama, Gemma, Phi, Mistral, DeepSeek и точный поиск по идентификатору.
- Чёрный progress bar показывает фактические байты, полученные от Ollama.
- Анализ CPU, RAM, GPU, VRAM, Linux-окружения и архитектуры компьютера.
- Автоматический подбор модели. Для GTX 1650 SUPER 4 ГБ + 24 ГБ RAM приложение рекомендует `qwen3:4b`.
- История диалога и выбранная модель сохраняются локально.
- Проверка GitHub Releases при старте; новая AppImage скачивается в фоне и устанавливается после перезапуска.
- Плавные GPU-friendly анимации только через `transform` и `opacity`.

## Установка на Arch / Manjaro

Репозиторий приватный, поэтому сначала нужен вход в GitHub:

```bash
sudo pacman -S --needed git github-cli
gh auth login
gh repo clone Qrayyt/Galen
cd Galen
chmod +x scripts/install-arch.sh
./scripts/install-arch.sh
galen
```

Скрипт установит `ollama` + `ollama-cuda`, запустит сервис, скачает последнюю AppImage из Releases и добавит Galen в меню приложений.

## Первый запуск

1. Открой вкладку «Модели».
2. Galen проанализирует железо и пометит оптимальную модель.
3. Нажми «Скачать» — появится фактический прогресс загрузки.
4. После статуса `100%` модель автоматически подключится.
5. Вернись в диалог и напиши «Привет».

## Разработка

```bash
chmod +x scripts/dev-arch.sh
./scripts/dev-arch.sh
```

Или вручную:

```bash
npm ci
npm test
npm run tauri dev
```

## Архитектура

```text
React + TypeScript + Motion
            ↓ Tauri IPC
Rust core ──┬── hardware detection
            ├── Ollama lifecycle / model pulls
            ├── streaming local chat
            └── GitHub Release updater
```

Секреты и API-ключи не нужны. Модели, история и запросы остаются на компьютере.

## Релизы

Обычный коммит не выпускает новую сборку. GitHub Actions создаёт релиз только тогда, когда версия в `package.json` ещё не имеет соответствующего тега. Для следующего релиза нужно синхронно поднять версии в `package.json`, `src-tauri/Cargo.toml` и `src-tauri/tauri.conf.json`.

---

<div align="center"><sub>Galenite · порядок — форма свободы</sub></div>
