#!/bin/bash

# Required parameters:
# @raycast.schemaVersion 1
# @raycast.title Mute mic
# @raycast.mode compact

# Optional parameters:
# @raycast.icon 🤖

set -euo pipefail

STATE_FILE="${XDG_STATE_HOME:-$HOME/.local/state}/raycast-mic-input-volume"
mkdir -p "$(dirname "$STATE_FILE")"

current="$(osascript -e 'input volume of (get volume settings)' 2>/dev/null | tr -d '\r' || true)"

if ! [[ "$current" =~ ^[0-9]+$ ]]; then
  echo "Could not read input volume (grant Terminal/Raycast microphone & automation access if needed)."
  exit 1
fi

if [ "$current" -eq 0 ]; then
  if [ -f "$STATE_FILE" ] && restore="$(cat "$STATE_FILE")" && [[ "$restore" =~ ^[0-9]+$ ]] && [ "$restore" -gt 0 ]; then
    :
  else
    restore=75
  fi
  [ "$restore" -gt 100 ] && restore=100
  osascript -e "set volume input volume ${restore}"
  echo "Mic on (${restore}%)"
else
  printf '%s' "$current" > "$STATE_FILE"
  osascript -e 'set volume input volume 0'
  echo "Mic muted"
fi
