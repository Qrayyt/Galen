<div align="center">
  <img src="src-tauri/icons/galen-icon.svg" width="92" alt="Galen" />
  <h1>Galen</h1>
  <p>Приватный локальный AI-десктоп для Windows 11 и Arch Linux.</p>

  ![Release](https://img.shields.io/github/v/release/Qrayyt/Galen?style=flat-square&color=111111&label=release)
  ![Windows](https://img.shields.io/badge/Windows_11-ready-111111?style=flat-square&logo=windows&logoColor=white)
  ![Arch Linux](https://img.shields.io/badge/Arch_Linux-ready-111111?style=flat-square&logo=archlinux&logoColor=white)
  ![Tauri](https://img.shields.io/badge/Tauri_2-desktop-111111?style=flat-square&logo=tauri&logoColor=white)
  ![Ollama](https://img.shields.io/badge/Ollama-local_models-111111?style=flat-square)
</div>

## Что работает

- Настоящий локальный чат с потоковой выдачей ответа через Ollama.
- Библиотека моделей: Qwen, Llama, Gemma, Phi, Mistral, DeepSeek и точный поиск по идентификатору.
- Чёрный progress bar показывает фактически скачанные байты.
- Анализ CPU, RAM, GPU, VRAM, операционной системы и архитектуры.
- Автоматический подбор модели: для RTX 5060 Ti 16 ГБ + 32 ГБ RAM рекомендуется `qwen3:14b`.
- История диалога и выбранная модель сохраняются только локально.
- Плавные GPU-friendly анимации через `transform` и `opacity`.

## Установка на Windows 11

1. Установи Ollama в обычном PowerShell:

```powershell
irm https://ollama.com/install.ps1 | iex
```

2. Открой [последний релиз](https://github.com/Qrayyt/Galen/releases/latest), скачай файл `Galen_*_x64-setup.exe` и запусти его.
3. Если SmartScreen покажет предупреждение для неподписанного тестового MVP: «Подробнее» → «Выполнить в любом случае».

## Первый запуск

1. Открой вкладку «Модели».
2. Galen проанализирует железо и пометит оптимальную модель.
3. Нажми «Скачать» — появится фактический прогресс загрузки.
4. После 100% модель автоматически подключится.
5. Вернись в диалог и напиши «Привет».

## Arch / Manjaro

```bash
sudo pacman -S --needed git github-cli
gh auth login
gh repo clone Qrayyt/Galen
cd Galen
chmod +x scripts/install-arch.sh
./scripts/install-arch.sh
galen
```

## Разработка

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

---

<div align="center"><sub>Galenite · порядок — форма свободы</sub></div>
