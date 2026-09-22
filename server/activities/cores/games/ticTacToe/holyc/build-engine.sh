#!/usr/bin/env bash
set -euo pipefail

repo_root=$(cd "$(dirname "$0")/../../../../../.." && pwd)
output_path=${1:-"$repo_root/server/activities/dist/holyc/echo_ttt_process"}

if ! command -v hcc >/dev/null 2>&1; then
  echo "hcc is required; install github.com/project-solomon/holyc/hcc/cmd/hcc@v0.1.0" >&2
  exit 1
fi

mkdir -p "$(dirname "$output_path")"
cd "$repo_root"
hcc -o "$output_path" \
  server/activities/cores/games/ticTacToe/holyc/echo_ttt_process.HC
chmod 700 "$output_path"
echo "HolyC tic-tac-toe engine built at $output_path"
