#!/usr/bin/env bash
# Push origin/release/1.0.0 to github/release/1.0.0 (public mirror). Used by the daily
# cron job and for manual / emergency sync. See docs/operations/github-release-mirror.md.
#
# Usage:
#   npm run mirror:github-release
#   npm run mirror:github-release -- --dry-run
#
# Env:
#   GITLAB_REMOTE (origin), GITHUB_REMOTE (github), BRANCH (release/1.0.0)
#   ECHO_RELEASE_MIRROR_ALLOW_MAIN_TIP=1  — allow tip == origin/main (emergency)
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

GITLAB_REMOTE="${GITLAB_REMOTE:-origin}"
GITHUB_REMOTE="${GITHUB_REMOTE:-github}"
BRANCH="${BRANCH:-release/1.0.0}"
MAIN_BRANCH="${MAIN_BRANCH:-main}"
DRY_RUN=0
EXPLICIT_SHA=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run) DRY_RUN=1; shift ;;
    -h | --help)
      grep '^#' "$0" | head -n 16 | cut -c3-
      exit 0
      ;;
    --)
      shift
      break
      ;;
    -*)
      echo "mirror-release-to-github: unknown argument: $1" >&2
      exit 2
      ;;
    *)
      if [[ -z "$EXPLICIT_SHA" ]]; then
        EXPLICIT_SHA="$1"
        shift
      else
        echo "mirror-release-to-github: unexpected argument: $1" >&2
        exit 2
      fi
      ;;
  esac
done

if ! git remote get-url "$GITHUB_REMOTE" &>/dev/null; then
  echo "mirror-release-to-github: missing git remote '${GITHUB_REMOTE}'." >&2
  echo "  git remote add github https://github.com/ad3lre/echo.git" >&2
  exit 1
fi
if ! git remote get-url "$GITLAB_REMOTE" &>/dev/null; then
  echo "mirror-release-to-github: missing git remote '${GITLAB_REMOTE}'." >&2
  exit 1
fi

git fetch "$GITLAB_REMOTE" "$BRANCH" "$MAIN_BRANCH" --quiet
git fetch "$GITHUB_REMOTE" "$BRANCH" --quiet 2>/dev/null || true

if [[ -n "$EXPLICIT_SHA" ]]; then
  local_sha="$EXPLICIT_SHA"
else
  local_sha=$(git rev-parse "$GITLAB_REMOTE/$BRANCH")
fi
github_sha=$(git rev-parse "$GITHUB_REMOTE/$BRANCH" 2>/dev/null || true)

if [[ -n "$github_sha" && "$local_sha" == "$github_sha" ]]; then
  echo "Already mirrored: ${GITHUB_REMOTE}/${BRANCH} is at ${local_sha:0:12} ($(git log -1 --oneline "$local_sha"))."
  exit 0
fi

if [[ -z "${ECHO_RELEASE_MIRROR_ALLOW_MAIN_TIP:-}" ]]; then
  origin_main=$(git rev-parse "$GITLAB_REMOTE/$MAIN_BRANCH" 2>/dev/null || true)
  if [[ -n "$origin_main" && "$local_sha" == "$origin_main" ]]; then
    echo "mirror-release-to-github: refusing: ${BRANCH} tip matches ${GITLAB_REMOTE}/${MAIN_BRANCH}." >&2
    echo "  That would expose internal per-commit history on GitHub." >&2
    echo "  Publish with npm run publish:public-release, or set ECHO_RELEASE_MIRROR_ALLOW_MAIN_TIP=1." >&2
    exit 1
  fi
fi

echo "Mirror ${GITLAB_REMOTE}/${BRANCH} -> ${GITHUB_REMOTE}/${BRANCH}"
echo "  gitlab: $(git log -1 --oneline "$local_sha")"
if [[ -n "$github_sha" ]]; then
  echo "  github: $(git log -1 --oneline "$github_sha") (will update)"
else
  echo "  github: (no branch yet)"
fi

if [[ "$DRY_RUN" -eq 1 ]]; then
  exit 0
fi

if [[ -n "$github_sha" ]]; then
  git push "$GITHUB_REMOTE" "${local_sha}:refs/heads/${BRANCH}" \
    --force-with-lease="refs/heads/${BRANCH}:${github_sha}"
else
  git push "$GITHUB_REMOTE" "${local_sha}:refs/heads/${BRANCH}"
fi

echo "Done."
