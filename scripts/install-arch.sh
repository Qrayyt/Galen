#!/usr/bin/env bash
set -euo pipefail

readonly REPOSITORY="Qrayyt/Galen"
readonly INSTALL_DIR="${XDG_DATA_HOME:-$HOME/.local/share}/galen"
readonly BIN_DIR="$HOME/.local/bin"
readonly APP_DIR="$HOME/.local/share/applications"
readonly ICON_DIR="$HOME/.local/share/icons/hicolor/512x512/apps"

if ! command -v pacman >/dev/null 2>&1; then
  echo "Galen v0.1 поддерживает Arch Linux и системы на его базе."
  exit 1
fi

echo "[1/5] Устанавливаем локальный AI-движок и GitHub CLI"
sudo pacman -Syu --needed --noconfirm git github-cli ollama ollama-cuda

if ! gh auth status >/dev/null 2>&1; then
  echo "Репозиторий приватный — один раз войди в GitHub."
  gh auth login
fi

echo "[2/5] Запускаем Ollama"
sudo systemctl enable --now ollama.service

echo "[3/5] Скачиваем свежий релиз Galen"
mkdir -p "$INSTALL_DIR" "$BIN_DIR" "$APP_DIR" "$ICON_DIR"
work_dir="$(mktemp -d)"
trap 'rm -rf "$work_dir"' EXIT
gh release download --repo "$REPOSITORY" --pattern '*.AppImage' --dir "$work_dir" --clobber
appimage="$(find "$work_dir" -maxdepth 1 -type f -name '*.AppImage' -print -quit)"
if [[ -z "$appimage" ]]; then
  echo "В последнем релизе не найден AppImage."
  exit 1
fi
install -m 755 "$appimage" "$INSTALL_DIR/Galen.AppImage"
ln -sfn "$INSTALL_DIR/Galen.AppImage" "$BIN_DIR/galen"

echo "[4/5] Добавляем приложение в меню"
repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
install -m 644 "$repo_root/src-tauri/icons/icon.png" "$ICON_DIR/galen.png"
desktop_file="$APP_DIR/galen.desktop"
{
  echo '[Desktop Entry]'
  echo 'Type=Application'
  echo 'Name=Galen'
  echo 'Comment=Private local AI desktop'
  echo "Exec=$BIN_DIR/galen"
  echo 'Icon=galen'
  echo 'Terminal=false'
  echo 'Categories=Utility;Development;'
  echo 'StartupWMClass=Galen'
} > "$desktop_file"
chmod 644 "$desktop_file"

echo "[5/5] Готово"
echo "Запуск: galen"
echo "Galen сам предложит Qwen 3 4B для GTX 1650 SUPER и покажет загрузку модели."

