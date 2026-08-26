#!/usr/bin/env bash
set -euo pipefail

sudo pacman -Syu --needed \
  webkit2gtk-4.1 \
  base-devel \
  curl \
  wget \
  file \
  openssl \
  appmenu-gtk-module \
  libappindicator-gtk3 \
  librsvg \
  xdotool \
  rustup \
  nodejs \
  npm \
  ollama \
  ollama-cuda

rustup default stable
sudo systemctl enable --now ollama.service
npm ci
npm run tauri dev


