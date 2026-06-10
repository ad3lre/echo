#!/usr/bin/env bash
# Create a small swap file (default 4G) if none is active. Requires sudo.
#
# Usage:
#   sudo bash scripts/setup-swap.sh
#   sudo ECHO_SWAP_SIZE_GB=2 bash scripts/setup-swap.sh
#
# Env:
#   ECHO_SWAP_FILE (/swapfile)
#   ECHO_SWAP_SIZE_GB (4)
#   ECHO_SWAP_SWAPPINESS (10)
set -euo pipefail

if [[ "$(id -u)" -ne 0 ]]; then
  echo "setup-swap: run as root (sudo bash scripts/setup-swap.sh)" >&2
  exit 1
fi

SWAP_FILE="${ECHO_SWAP_FILE:-/swapfile}"
SIZE_GB="${ECHO_SWAP_SIZE_GB:-4}"
SWAPPINESS="${ECHO_SWAP_SWAPPINESS:-10}"

if swapon --show | grep -q .; then
  echo "setup-swap: swap already active:"
  swapon --show
  exit 0
fi

if [[ -f "$SWAP_FILE" ]]; then
  echo "setup-swap: $SWAP_FILE exists; enabling"
  chmod 600 "$SWAP_FILE"
  mkswap "$SWAP_FILE" >/dev/null
  swapon "$SWAP_FILE"
else
  echo "setup-swap: creating ${SIZE_GB}G swap at $SWAP_FILE"
  fallocate -l "${SIZE_GB}G" "$SWAP_FILE"
  chmod 600 "$SWAP_FILE"
  mkswap "$SWAP_FILE"
  swapon "$SWAP_FILE"
fi

if ! grep -qF "$SWAP_FILE" /etc/fstab; then
  echo "$SWAP_FILE none swap sw 0 0" >>/etc/fstab
  echo "setup-swap: appended $SWAP_FILE to /etc/fstab"
fi

SYSCTL_FILE=/etc/sysctl.d/99-echo-swap.conf
if [[ ! -f "$SYSCTL_FILE" ]] || ! grep -q "vm.swappiness" "$SYSCTL_FILE" 2>/dev/null; then
  echo "vm.swappiness=$SWAPPINESS" >"$SYSCTL_FILE"
  sysctl -p "$SYSCTL_FILE"
  echo "setup-swap: set vm.swappiness=$SWAPPINESS"
fi

echo "setup-swap: done"
swapon --show
free -h
