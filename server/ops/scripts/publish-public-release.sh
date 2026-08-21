#!/usr/bin/env bash
# Append one commit to release/1.0.0 (public mirror) with a descriptive message derived
# from internal origin/main commits since the last publish. Never fast-forwards release
# to main (separate SHA / history). See docs/operations/github-release-mirror.md.
#
# Usage:
#   npm run publish:public-release              # preview only
#   npm run publish:public-release -- --yes       # create commit + push origin
#   npm run publish:public-release -- --rewrite --yes   # rebuild all release messages
#
# Env: GITLAB_REMOTE (origin), BRANCH (release/1.0.0), GIT_AUTHOR_NAME, GIT_AUTHOR_EMAIL, …
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
cd "$ROOT"

GITLAB_REMOTE="${GITLAB_REMOTE:-origin}"
BRANCH="${BRANCH:-release/1.0.0}"
MAIN_BRANCH="${MAIN_BRANCH:-main}"
AUTHOR_NAME="${GIT_AUTHOR_NAME:-ad3lre}"
AUTHOR_EMAIL="${GIT_AUTHOR_EMAIL:-reachbypass@gmail.com}"
SOURCE_TRAILER_PREFIX="Echo-Source:"
MAX_BODY_LINES="${ECHO_PUBLISH_MAX_BODY_LINES:-24}"

DRY_RUN=0
DO_PUSH=0
REWRITE=0
MESSAGE_OVERRIDE=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run) DRY_RUN=1; shift ;;
    --yes | -y) DO_PUSH=1; shift ;;
    --rewrite) REWRITE=1; shift ;;
    -m | --message)
      MESSAGE_OVERRIDE="${2:-}"
      shift 2
      ;;
    -h | --help)
      grep '^#' "$0" | head -n 18 | cut -c3-
      exit 0
      ;;
    *)
      echo "publish-public-release: unknown argument: $1" >&2
      exit 2
      ;;
  esac
done

if [[ "$DO_PUSH" -eq 0 && -z "${ECHO_PUBLISH_RELEASE_CONFIRM:-}" ]]; then
  DO_PUSH=0
fi
if [[ -n "${ECHO_PUBLISH_RELEASE_CONFIRM:-}" ]]; then
  DO_PUSH=1
fi

git fetch "$GITLAB_REMOTE" "$MAIN_BRANCH" "$BRANCH" --quiet

find_main_for_tree() {
  local tree="$1"
  local c
  for c in $(git rev-list "$GITLAB_REMOTE/$MAIN_BRANCH"); do
    if [[ "$(git rev-parse "${c}^{tree}")" == "$tree" ]]; then
      echo "$c"
      return 0
    fi
  done
  return 1
}

read_source_sha() {
  local commit="$1"
  local body line
  body=$(git log -1 --format=%B "$commit" 2>/dev/null || true)
  while IFS= read -r line; do
    if [[ "$line" == "${SOURCE_TRAILER_PREFIX}"* ]]; then
      echo "${line#${SOURCE_TRAILER_PREFIX} }"
      return 0
    fi
  done <<<"$body"
  return 1
}

build_message_for_range() {
  local from_sha="${1:-}"
  local to_sha="$2"
  local range count subject body

  if [[ -z "$from_sha" ]]; then
    echo "publish-public-release: build_message_for_range requires a starting main SHA." >&2
    return 1
  fi

  if [[ "$from_sha" == "$to_sha" ]]; then
    range=""
    count=0
  else
    range="${from_sha}..${to_sha}"
    count=$(git rev-list --count $range 2>/dev/null || echo 0)
  fi
  if [[ "$count" -eq 0 ]]; then
    subject="Update public release snapshot."
    body=""
  elif [[ "$count" -eq 1 ]]; then
    subject=$(git log -1 --format=%s "$to_sha")
    body=$(git log -1 --format=%s "$to_sha")
  else
    subject=$(git log -1 --format=%s "$to_sha")
    body=$(git log --format='- %s' --reverse "$range" | head -n "$MAX_BODY_LINES")
    if [[ "$count" -gt "$MAX_BODY_LINES" ]]; then
      body="${body}"$'\n'"$(printf -- '- …and %d more internal commits' "$((count - MAX_BODY_LINES))")"
    fi
  fi

  if [[ -n "$MESSAGE_OVERRIDE" ]]; then
    subject="$MESSAGE_OVERRIDE"
  fi

  printf '%s\n' "$subject"
  if [[ -n "$body" && "$body" != "$subject" ]]; then
    printf '\n%s\n' "$body"
  elif [[ "$count" -gt 1 ]]; then
    printf '\n%s\n' "$body"
  fi
  printf '\n%s %s\n' "$SOURCE_TRAILER_PREFIX" "$to_sha"
}

make_release_commit() {
  local parent="$1"
  local tree="$2"
  local message="$3"
  local args=()
  if [[ -n "$parent" ]]; then
    args+=(-p "$parent")
  fi
  GIT_AUTHOR_NAME="$AUTHOR_NAME" \
    GIT_AUTHOR_EMAIL="$AUTHOR_EMAIL" \
    GIT_COMMITTER_NAME="$AUTHOR_NAME" \
    GIT_COMMITTER_EMAIL="$AUTHOR_EMAIL" \
    git commit-tree "$tree" "${args[@]}" -F - <<<"$message"
}

publish_append() {
  local parent tree prev_main current_main message new_sha current_branch

  parent=$(git rev-parse "$GITLAB_REMOTE/$BRANCH")
  tree=$(git rev-parse "$GITLAB_REMOTE/$MAIN_BRANCH^{tree}")
  current_main=$(git rev-parse "$GITLAB_REMOTE/$MAIN_BRANCH")

  if [[ "$(git rev-parse "${parent}^{tree}")" == "$tree" ]]; then
    echo "Already published: ${BRANCH} tree matches ${GITLAB_REMOTE}/${MAIN_BRANCH}."
    exit 0
  fi

  if ! prev_main=$(read_source_sha "$parent"); then
    prev_main=$(find_main_for_tree "$(git rev-parse "${parent}^{tree}")" || true)
  fi

  message=$(build_message_for_range "$prev_main" "$current_main")
  echo "=== Proposed public commit on ${BRANCH} ==="
  echo "$message"
  echo "======================================="

  if [[ "$DRY_RUN" -eq 1 ]]; then
    exit 0
  fi
  if [[ "$DO_PUSH" -eq 0 ]]; then
    echo "Dry run (no --yes): not creating a commit. Re-run with --yes to publish." >&2
    exit 0
  fi

  current_branch=$(git branch --show-current)
  if [[ "$current_branch" == "$BRANCH" ]]; then
    echo "publish-public-release: checkout another branch first (cannot -f the checked-out branch)." >&2
    exit 1
  fi

  new_sha=$(make_release_commit "$parent" "$tree" "$message")
  git branch -f "$BRANCH" "$new_sha"
  echo "Created ${BRANCH} -> ${new_sha}"
  git push "$GITLAB_REMOTE" "$BRANCH"
  echo "Pushed ${GITLAB_REMOTE}/${BRANCH} (GitHub mirror runs at scheduled time; see docs/operations/github-release-mirror.md)."
}

bootstrap_message() {
  local to_sha="$1"
  printf '%s\n\n%s\n\n%s %s\n' \
    "Public source tree (flattened history)." \
    "Bootstrap snapshot for the public mirror; internal per-commit history is not linked on this branch." \
    "$SOURCE_TRAILER_PREFIX" "$to_sha"
}

rewrite_release_history() {
  local commits=() c parent="" tree msg prev_main="" to_main new_sha
  local current_branch

  mapfile -t commits < <(git rev-list --reverse "$GITLAB_REMOTE/$BRANCH")
  if [[ "${#commits[@]}" -eq 0 ]]; then
    echo "No commits on ${GITLAB_REMOTE}/${BRANCH}." >&2
    exit 1
  fi

  echo "Will rebuild ${#commits[@]} public commit(s) with messages from ${GITLAB_REMOTE}/${MAIN_BRANCH}."
  parent=""
  prev_main=""
  for c in "${commits[@]}"; do
    tree=$(git rev-parse "${c}^{tree}")
    if ! to_main=$(find_main_for_tree "$tree"); then
      echo "publish-public-release: no ${MAIN_BRANCH} commit with tree ${tree} (at ${c})." >&2
      exit 1
    fi
    if [[ -z "$prev_main" ]]; then
      msg=$(bootstrap_message "$to_main")
    else
      msg=$(build_message_for_range "$prev_main" "$to_main")
    fi
    echo "--- ${c} -> ${prev_main:-root}..${to_main:0:8} ---"
    echo "$msg"
    if [[ "$DRY_RUN" -eq 1 ]]; then
      prev_main="$to_main"
      continue
    fi
    new_sha=$(make_release_commit "$parent" "$tree" "$msg")
    parent="$new_sha"
    prev_main="$to_main"
  done

  if [[ "$DRY_RUN" -eq 1 ]]; then
    exit 0
  fi
  if [[ "$DO_PUSH" -eq 0 ]]; then
    echo "Rewrite preview only. Re-run with --rewrite --yes to replace ${BRANCH}." >&2
    exit 0
  fi

  current_branch=$(git branch --show-current)
  if [[ "$current_branch" == "$BRANCH" ]]; then
    echo "publish-public-release: checkout another branch first." >&2
    exit 1
  fi

  git branch -f "$BRANCH" "$parent"
  echo "Rebuilt ${BRANCH} -> ${parent}"
  local prev_remote
  prev_remote=$(git rev-parse "$GITLAB_REMOTE/$BRANCH")
  git push "$GITLAB_REMOTE" "$BRANCH" --force-with-lease="refs/heads/${BRANCH}:${prev_remote}"
  echo "Force-pushed ${GITLAB_REMOTE}/${BRANCH} (GitHub mirror at scheduled time unless ECHO_RELEASE_MIRROR_NOW=1)."
}

if [[ "$REWRITE" -eq 1 ]]; then
  rewrite_release_history
else
  publish_append
fi
