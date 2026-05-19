#!/usr/bin/env bash
# Keep GitLab `release/1.0.0` aligned with GitHub `release/1.0.0` (canonical public line).
# Uses --force-with-lease so the push fails if GitLab moved since your last fetch.
#
# Remotes: GITHUB_REMOTE (github), GITLAB_REMOTE (origin)
# Branch:  BRANCH (default: release/1.0.0)
# Confirm: --yes or GITLAB_RELEASE_SYNC_CONFIRM=1
#
# Usage:
#   npm run sync:gitlab-release -- --yes
#   GITLAB_RELEASE_SYNC_CONFIRM=1 npm run sync:gitlab-release
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

GITHUB_REMOTE="${GITHUB_REMOTE:-github}"
GITLAB_REMOTE="${GITLAB_REMOTE:-origin}"
BRANCH="${BRANCH:-release/1.0.0}"

if [[ "${1:-}" != "--yes" && -z "${GITLAB_RELEASE_SYNC_CONFIRM:-}" ]]; then
  echo "sync-gitlab-release-from-github: refusing to run without confirmation."
  echo "  This updates ${GITLAB_REMOTE}/${BRANCH} from ${GITHUB_REMOTE}/${BRANCH} (may rewrite divergent history)."
  echo "  Run:  npm run sync:gitlab-release -- --yes"
  echo "  Or:   GITLAB_RELEASE_SYNC_CONFIRM=1 npm run sync:gitlab-release"
  exit 2
fi

if ! git remote get-url "$GITHUB_REMOTE" &>/dev/null; then
  echo "sync-gitlab-release-from-github: missing git remote '${GITHUB_REMOTE}'."
  exit 1
fi
if ! git remote get-url "$GITLAB_REMOTE" &>/dev/null; then
  echo "sync-gitlab-release-from-github: missing git remote '${GITLAB_REMOTE}'."
  exit 1
fi

git fetch "$GITHUB_REMOTE" "$BRANCH"
git fetch "$GITLAB_REMOTE" "$BRANCH"

GH_SHA="$(git rev-parse "$GITHUB_REMOTE/$BRANCH")"
GL_SHA="$(git rev-parse "$GITLAB_REMOTE/$BRANCH")"

echo "github ${GITHUB_REMOTE}/${BRANCH} = ${GH_SHA} $(git log -1 --oneline "$GITHUB_REMOTE/$BRANCH")"
echo "gitlab ${GITLAB_REMOTE}/${BRANCH} = ${GL_SHA} $(git log -1 --oneline "$GITLAB_REMOTE/$BRANCH")"

if [[ "$GH_SHA" == "$GL_SHA" ]]; then
  echo "Already in sync."
  exit 0
fi

echo "Pushing ${GITHUB_REMOTE}/${BRANCH} -> ${GITLAB_REMOTE}/${BRANCH} (--force-with-lease)"
git push "$GITLAB_REMOTE" "$GITHUB_REMOTE/$BRANCH:refs/heads/$BRANCH" --force-with-lease

echo "Done."
