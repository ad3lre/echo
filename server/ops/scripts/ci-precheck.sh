#!/usr/bin/env bash
# Local CI gate: mirrors GitHub Actions checks developers hit on release/main pushes.
# Invoked from server/ops/scripts/githooks/pre-push (see ./server/ops/scripts/setup-githooks.sh).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
cd "$ROOT"

bun_meets_ci() {
  command -v bun >/dev/null 2>&1 || return 1
  bun -e '
    const [maj, min] = Bun.version.split(".").map(Number);
    process.exit(maj > 1 || (maj === 1 && min >= 4) ? 0 : 1);
  ' 2>/dev/null
}

activate_repo_bun() {
  if bun_meets_ci; then
    return 0
  fi

  local bun_bin=""
  if [[ -x "$HOME/.bun/bin/bun" ]]; then
    bun_bin="$HOME/.bun/bin"
  fi
  if [[ -n "$bun_bin" ]]; then
    export PATH="$bun_bin:$PATH"
  fi

  if bun_meets_ci; then
    echo "ci-precheck: using Bun $(bun --version) from ~/.bun" >&2
    return 0
  fi

  echo "ci-precheck: Bun >=1.4.2 required (see .bun-version). Current: $(bun --version 2>/dev/null || echo missing)" >&2
  echo "ci-precheck: install via https://bun.sh (curl -fsSL https://bun.sh/install | bash)." >&2
  return 1
}

activate_repo_bun

echo "ci-precheck: format + guards + builds + unit tests + frontend lint …" >&2
bun run ci:precheck

echo "ci-precheck: passed" >&2
