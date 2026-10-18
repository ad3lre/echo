#!/usr/bin/env bash
# Sync web channel/UI SVG icons into EchoFeatures EchoIconCatalog.xcassets.
# Mirrors clients/web/src/assets/icons/*.svg as template vector imagesets.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
WEB="$ROOT/clients/web/src/assets/icons"
OUT="$ROOT/clients/apple/Modules/EchoFeatures/Resources/EchoIconCatalog.xcassets"
MAP="$ROOT/clients/apple/Modules/EchoFeatures/Resources/echo-icon-filename-map.json"

if [[ ! -d "$WEB" ]]; then
  echo "missing web icons dir: $WEB" >&2
  exit 1
fi

rm -rf "$OUT"
mkdir -p "$OUT"

cat >"$OUT/Contents.json" <<'EOF'
{
  "info" : {
    "author" : "echo",
    "version" : 1
  }
}
EOF

python3 - <<'PY' "$WEB" "$OUT" "$MAP"
import json, os, re, shutil, sys

web, out, map_path = sys.argv[1:4]
mapping = {}

def asset_name(filename: str) -> str:
    stem = filename[:-4] if filename.lower().endswith(".svg") else filename
    safe = re.sub(r"[^A-Za-z0-9]+", "_", stem).strip("_")
    if not safe:
        safe = "icon"
    if safe[0].isdigit():
        safe = "n_" + safe
    return "EchoIcon_" + safe

for name in sorted(os.listdir(web)):
    if not name.lower().endswith(".svg"):
        continue
    src = os.path.join(web, name)
    if not os.path.isfile(src):
        continue
    asset = asset_name(name)
    imageset = os.path.join(out, f"{asset}.imageset")
    os.makedirs(imageset, exist_ok=True)
    dest_svg = os.path.join(imageset, f"{asset}.svg")
    shutil.copy2(src, dest_svg)
    with open(os.path.join(imageset, "Contents.json"), "w", encoding="utf-8") as f:
        json.dump(
            {
                "images": [{"filename": f"{asset}.svg", "idiom": "universal"}],
                "info": {"author": "echo", "version": 1},
                "properties": {
                    "preserves-vector-representation": True,
                    "template-rendering-intent": "template",
                },
            },
            f,
            indent=2,
        )
        f.write("\n")
    mapping[name] = asset
    # Also index without extension for iconKey lookups.
    mapping[name[:-4]] = asset

with open(map_path, "w", encoding="utf-8") as f:
    json.dump(mapping, f, indent=2, sort_keys=True)
    f.write("\n")

print(f"synced {len({v for v in mapping.values()})} icons → {out}")
print(f"wrote map → {map_path}")
PY
