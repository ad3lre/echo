#!/usr/bin/env bash
# Point this repo at committed hooks under scripts/githooks:
#   pre-push — GitHub leak guard + CI precheck + release/1.0.0 mirror policy
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"
git config core.hooksPath scripts/githooks
chmod +x scripts/githooks/pre-push scripts/githooks/prepare-commit-msg scripts/githooks/github-push-guard.sh scripts/ci-precheck.sh 2>/dev/null || true

# Plain `git push` must never target GitHub for main or release (GitLab first, then mirror script).
if git show-ref --verify --quiet refs/heads/main; then
  git branch --set-upstream-to=origin/main main 2>/dev/null || true
fi
if git show-ref --verify --quiet refs/heads/release/1.0.0; then
  git branch --set-upstream-to=origin/release/1.0.0 release/1.0.0 2>/dev/null || true
fi

echo "core.hooksPath set to scripts/githooks for $(pwd)"
echo "GitHub push guard: blocks main on github, local main→github, release tip == origin/main"
echo "pre-push CI: npm run ci:precheck (skip with ECHO_SKIP_CI_PRECHECK=1)"
echo "Branch upstream: main → origin/main, release/1.0.0 → origin/release/1.0.0"
