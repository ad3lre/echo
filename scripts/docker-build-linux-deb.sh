#!/usr/bin/env bash
set -euo pipefail

export DEBIAN_FRONTEND=noninteractive

apt-get update
apt-get install -y curl ca-certificates gnupg

mkdir -p /etc/apt/keyrings
curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key \
  | gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg
cat >/etc/apt/sources.list.d/nodesource.list <<'EOF'
deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_22.x nodistro main
EOF

apt-get update
apt-get install -y \
  nodejs \
  build-essential \
  pkg-config \
  libwebkit2gtk-4.1-dev \
  libgtk-3-dev \
  libayatana-appindicator3-dev \
  librsvg2-dev \
  patchelf \
  libssl-dev \
  libxdo-dev \
  file \
  wget

curl https://sh.rustup.rs -sSf | sh -s -- -y --profile minimal --default-toolchain stable
source /root/.cargo/env

cd /work
rustc -V
node -v
npm -v
npm ci

VITE_ECHO_DESKTOP=1 \
VITE_API_URL=https://api.example.com \
VITE_SOCKET_IO_URL=https://api.example.com \
npm run tauri:build
