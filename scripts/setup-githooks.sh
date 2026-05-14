#!/usr/bin/env bash
# Point this repo at committed hooks under scripts/githooks (pre-push mirrors release to GitHub).
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"
git config core.hooksPath scripts/githooks
echo "core.hooksPath set to scripts/githooks for $(pwd)"
