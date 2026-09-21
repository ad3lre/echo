#!/usr/bin/env bash
# Sync Echo UI SFX + call ringtone pack from web assets into the Apple module bundle.
# Ogg Vorbis is converted to AAC (.m4a) for reliable AVAudioPlayer playback on iOS.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
WEB="$ROOT/clients/web/src/assets/sounds"
APPLE="$ROOT/clients/apple/Modules/EchoFeatures/Resources/Sounds"
RING_OUT="$APPLE/Ringtones"

if ! command -v ffmpeg >/dev/null 2>&1; then
  echo "ffmpeg is required" >&2
  exit 1
fi

mkdir -p "$APPLE"
for f in "$WEB"/*.ogg; do
  base="$(basename "$f" .ogg)"
  ffmpeg -y -hide_banner -loglevel error -i "$f" -c:a aac -b:a 128k -movflags +faststart "$APPLE/${base}.m4a"
done
find "$APPLE" -maxdepth 1 -name '*.ogg' -delete

rm -rf "$RING_OUT"
mkdir -p "$RING_OUT"

convert_one() {
  local pack="$1"
  local file="$2"
  local src="$WEB/Ringtones/$pack/$file"
  local dest_dir="$RING_OUT/$pack"
  mkdir -p "$dest_dir"
  local ext="${file##*.}"
  local stem="${file%.*}"
  if [[ "$ext" == "mp3" ]]; then
    cp -f "$src" "$dest_dir/$file"
  else
    ffmpeg -y -hide_banner -loglevel error -i "$src" -c:a aac -b:a 128k -movflags +faststart "$dest_dir/${stem}.m4a"
  fi
}

convert_one Bops "Beach Bowling.mp3"
convert_one Bops "Kiki.mp3"
convert_one Bops "Steal yo girl.mp3"
convert_one Dialtone "Digi-date.ogg"
convert_one Dialtone "Echo Machine.ogg"
convert_one Dialtone "Ed Sharron.ogg"
convert_one Dialtone "FMTY Sonic.ogg"
convert_one Dialtone "FNC Dance.ogg"
convert_one Dialtone "Glitch Dance.ogg"
convert_one Dialtone "Glitchy Banger.ogg"
convert_one Dialtone "HTRAG.ogg"
convert_one Dialtone "Indian Mafia.mp3"
convert_one Dialtone "Ping Me Again.mp3"
convert_one Retro "8-Bit Battle.ogg"
convert_one Retro "80s Commerical.ogg"
convert_one Retro "Pixel Dance.mp3"
convert_one Retro "Pixel Party.mp3"
convert_one Retro "Quick Bit.mp3"
convert_one Retro "RSL.mp3"
convert_one Vibes "Downward Spiraling.ogg"
convert_one Vibes "Galactic Drake.ogg"
convert_one Vibes "Galaxy Dance.ogg"
convert_one Vibes "Glass Wait.ogg"
convert_one Vibes "Groovey Glass.ogg"
convert_one Vibes "Modest Ring.ogg"
convert_one Vibes "Neutron.ogg"
convert_one Vibes "One Eight Nine.ogg"
convert_one Vibes "Royal Mess.mp3"
convert_one Vibes "State Farm.mp3"
convert_one Vibes "Wobbly Glass.mp3"

echo "Synced sound pack → $APPLE"
du -sh "$APPLE" "$RING_OUT"
