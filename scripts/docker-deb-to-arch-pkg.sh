#!/usr/bin/env bash
# Convert Tauri .deb to Arch Linux pacman package (.pkg.tar.zst) using fpm in Docker.
# Requires Docker. Default input: repo/linux-dist/Echo_1.0.0_amd64.deb
# Output: linux-dist/echo-desktop-1.0.0-1-x86_64.pkg.tar.zst
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DEB="${DEB:-$ROOT/linux-dist/Echo_1.0.0_amd64.deb}"
if [[ ! -f "$DEB" ]]; then
  echo "Missing deb: $DEB" >&2
  exit 1
fi
OUTDIR="$(dirname "$DEB")"
DEB_BASE="$(basename "$DEB")"
docker run --rm \
  -e "DEB_FILE=$DEB_BASE" \
  -v "$OUTDIR:/pkgs" \
  ruby:3.3-bookworm \
  bash -lc 'export DEBIAN_FRONTEND=noninteractive
  apt-get update -qq
  apt-get install -y --no-install-recommends libarchive-tools zstd >/dev/null
  gem install --no-document fpm
  export PATH=/usr/local/bundle/bin:$PATH
  cd /pkgs
  fpm -s deb -t pacman -n echo-desktop --version 1.0.0 --iteration 1 --architecture x86_64 "$DEB_FILE"
  ls -lh echo-desktop-*.pkg.tar.zst'
