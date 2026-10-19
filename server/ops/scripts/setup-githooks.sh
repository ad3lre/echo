#!/usr/bin/env bash
# Point this repo at committed hooks under server/ops/scripts/githooks:
#   pre-push — GitHub leak guard + VERSION gate + CI precheck + release→GitHub main mirror policy
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"
HOOKS_PATH="server/ops/scripts/githooks"
git config core.hooksPath "$HOOKS_PATH"
# Push annotated version tags created by `bun run version:bump` with the branch.
git config push.followTags true
chmod +x \
  "$HOOKS_PATH/pre-commit" \
  "$HOOKS_PATH/pre-push" \
  "$HOOKS_PATH/prepare-commit-msg" \
  "$HOOKS_PATH/github-push-guard.sh" \
  server/ops/scripts/ci-precheck.sh \
  2>/dev/null || true

# Plain `git push` must never target GitHub for main or release (GitLab first, then mirror script).
if git show-ref --verify --quiet refs/heads/main; then
  git branch --set-upstream-to=origin/main main 2>/dev/null || true
fi
if git show-ref --verify --quiet refs/heads/release/1.0.0; then
  git branch --set-upstream-to=origin/release/1.0.0 release/1.0.0 2>/dev/null || true
fi

echo "core.hooksPath set to $HOOKS_PATH for $(pwd)"
echo "GitHub push guard: GitHub main only; blocks local main→github and tip == origin/main"
echo "pre-commit: god-file ratchet + new-code charter on staged paths"
echo "  skip god-file: ECHO_GOD_FILE_RATCHET_BYPASS=1"
echo "  skip charter: ECHO_NEW_CODE_CHARTER_BYPASS=1"
echo "  skip placement: ECHO_CODE_PLACEMENT_BYPASS=1"
echo "pre-push VERSION: main requires one attested bump (docs/operations/versioning.md)"
echo "  bun run version:bump -- <level> --attest … --summary \"…\" --why \"…\""
echo "  skip: ECHO_SKIP_VERSION_GATE=1"
echo "pre-push CI: bun run ci:precheck (skip with ECHO_SKIP_CI_PRECHECK=1)"
echo "push.followTags: true (version tags ride along with branch push)"
echo "Branch upstream: main → origin/main, release/1.0.0 → origin/release/1.0.0"
