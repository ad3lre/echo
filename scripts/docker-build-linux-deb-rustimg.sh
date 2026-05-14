#!/usr/bin/env bash
set -euo pipefail

export DEBIAN_FRONTEND=noninteractive

apt-get update
apt-get install -y --no-install-recommends curl ca-certificates gnupg rsync

mkdir -p /etc/apt/keyrings
curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key \
  | gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg
cat >/etc/apt/sources.list.d/nodesource.list <<'EOF'
deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_22.x nodistro main
EOF

apt-get update
apt-get install -y --no-install-recommends \
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
  libasound2-dev \
  xdg-utils \
  file \
  wget

export PATH="/usr/local/cargo/bin:/usr/local/rustup/bin:${PATH}"

rustc -V
cargo -V
node -v
npm -v

# Copy source to a native Linux ext4 path to avoid NTFS permission issues from the Windows bind-mount.
BUILD_DIR=/build/echo
rm -rf "$BUILD_DIR"
mkdir -p "$BUILD_DIR"
echo "Copying source to $BUILD_DIR ..."
# Use rsync if available, else cp; skip node_modules and Rust target dir to avoid copying GBs.
rsync -a --exclude='node_modules' --exclude='src-tauri/target' /work/ "$BUILD_DIR/" 2>/dev/null \
  || cp -a /work/. "$BUILD_DIR/"

cd "$BUILD_DIR"
npm ci

# Build only the .deb (skip AppImage which needs xdg-mime not available in this container).
VITE_ECHO_DESKTOP=1 \
VITE_API_URL=https://api.example.com \
VITE_SOCKET_IO_URL=https://api.example.com \
npm run tauri:build

# Copy the built artifacts back to the Windows mount so the user can access them.
echo "Copying .deb artifacts back to /work ..."
mkdir -p /work/linux-dist
find "$BUILD_DIR/src-tauri/target/release/bundle" -name "*.deb" \
  -exec cp -v {} /work/linux-dist/ \;
echo "Done. Artifacts:"
ls -lh /work/linux-dist/
