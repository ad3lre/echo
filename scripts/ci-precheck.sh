#!/usr/bin/env bash
# Local CI gate: mirrors GitHub Actions checks developers hit on release/main pushes.
# Invoked from scripts/githooks/pre-push (see ./scripts/setup-githooks.sh).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

node_meets_ci() {
  node -e '
    const [maj, min] = process.versions.node.split(".").map(Number);
    process.exit(maj > 22 || (maj === 22 && min >= 13) ? 0 : 1);
  ' 2>/dev/null
}

# When the shell default is Node 20 (IDE, system), use the repo .nvmrc via nvm or PATH.
activate_repo_node() {
  if node_meets_ci; then
    return 0
  fi

  local nvm_dir="${NVM_DIR:-$HOME/.nvm}"
  if [[ -s "$nvm_dir/nvm.sh" ]]; then
    # shellcheck source=/dev/null
    . "$nvm_dir/nvm.sh"
    if [[ -f "$ROOT/.nvmrc" ]]; then
      nvm use --install 2>/dev/null || nvm use 2>/dev/null || true
    fi
  fi

  if node_meets_ci; then
    return 0
  fi

  local nvmrc="$ROOT/.nvmrc"
  local base="$nvm_dir/versions/node"
  if [[ -f "$nvmrc" && -d "$base" ]]; then
    local want
    want="$(tr -d 'v \t\r\n' <"$nvmrc")"
    local best_name="" best_bin=""
    local d name rest
    for d in "$base"/v*; do
      [[ -d "$d/bin" && -x "$d/bin/node" ]] || continue
      name="$(basename "$d")"
      rest="${name#v}"
      if [[ "$rest" == "$want" || "$rest" == "$want."* || "$rest" == ${want}* ]]; then
        if [[ -z "$best_name" || "$name" > "$best_name" ]]; then
          best_name="$name"
          best_bin="$d/bin"
        fi
      fi
    done
    if [[ -n "$best_bin" ]]; then
      export PATH="$best_bin:$PATH"
    fi
  fi

  if node_meets_ci; then
    echo "ci-precheck: using Node $(node -v) from .nvmrc" >&2
    return 0
  fi

  echo "ci-precheck: Node 22.13+ required (GitHub CI uses 22.13.1). Current: $(node -v 2>/dev/null || echo missing)" >&2
  echo "ci-precheck: install via nvm (nvm install; nvm use) or set PATH to a 22.13+ node binary." >&2
  return 1
}

activate_repo_node

echo "ci-precheck: format + guards + builds + unit tests + frontend lint …" >&2
npm run ci:precheck

echo "ci-precheck: passed" >&2
