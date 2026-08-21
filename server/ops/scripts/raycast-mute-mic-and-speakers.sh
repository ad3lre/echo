#!/bin/bash

# Required parameters:
# @raycast.schemaVersion 1
# @raycast.title Mute mic & speakers
# @raycast.mode compact

# Optional parameters:
# @raycast.icon 🔇

set -euo pipefail

STATE_DIR="${XDG_STATE_HOME:-$HOME/.local/state}"
STATE_FILE="${STATE_DIR}/raycast-io-audio-levels"
mkdir -p "$STATE_DIR"

read_audio() {
  osascript <<'APPLESCRIPT' 2>/dev/null | tr -d '\r'
set v to get volume settings
set inV to input volume of v
set outV to output volume of v
set muteFlag to 0
if output muted of v then set muteFlag to 1
return (inV as text) & linefeed & (outV as text) & linefeed & (muteFlag as text)
APPLESCRIPT
}

audio="$(read_audio || :)"
in_vol="$(printf '%s' "$audio" | sed -n '1p')"
out_vol="$(printf '%s' "$audio" | sed -n '2p')"
mute_flag="$(printf '%s' "$audio" | sed -n '3p')"

if ! [[ "$in_vol" =~ ^[0-9]+$ && "$out_vol" =~ ^[0-9]+$ && "$mute_flag" =~ ^[01]$ ]]; then
  echo "Could not read volume settings (check Raycast automation / accessibility)."
  exit 1
fi

is_muted=0
if [ "$in_vol" -eq 0 ] && [ "$mute_flag" -eq 1 ]; then
  is_muted=1
fi

if [ "$is_muted" -eq 1 ]; then
  in_restore=75
  out_restore=50
  if [ -f "$STATE_FILE" ]; then
    line1="$(sed -n '1p' "$STATE_FILE")"
    line2="$(sed -n '2p' "$STATE_FILE")"
    [[ "$line1" =~ ^[0-9]+$ && "$line1" -gt 0 ]] && in_restore="$line1"
    [[ "$line2" =~ ^[0-9]+$ && "$line2" -gt 0 ]] && out_restore="$line2"
  fi
  [ "$in_restore" -gt 100 ] && in_restore=100
  [ "$out_restore" -gt 100 ] && out_restore=100
  osascript <<APPLESCRIPT
set volume without output muted
set volume output volume ${out_restore}
set volume input volume ${in_restore}
APPLESCRIPT
  echo "Mic & speakers on (${in_restore}% / ${out_restore}%)"
else
  { echo "$in_vol"; echo "$out_vol"; } >"$STATE_FILE"
  osascript <<'APPLESCRIPT'
set volume input volume 0
set volume with output muted
APPLESCRIPT
  echo "Mic & speakers muted"
fi
