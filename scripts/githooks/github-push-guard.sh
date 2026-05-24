#!/usr/bin/env bash
# Refuse pushes that would expose GitLab main history on GitHub.
# Sourced from scripts/githooks/pre-push (see docs/operations/github-release-mirror.md).
set -euo pipefail

github_push_guard() {
  local remote_name="${1:-}"
  local push_url="${2:-}"
  local ref_updates="${3:-}"
  local root="${4:-.}"
  local zero=0000000000000000000000000000000000000000

  if ! is_github_push_remote "$remote_name" "$push_url"; then
    return 0
  fi

  local origin_main=""
  origin_main="$(git -C "$root" rev-parse origin/main 2>/dev/null || true)"

  while IFS=' ' read -r local_ref local_sha remote_ref remote_sha; do
    [[ -z "${local_ref:-}" ]] && continue
    [[ -z "${remote_ref:-}" ]] && continue

    # Never create/update main or master on GitHub.
    if [[ "$remote_ref" == "refs/heads/main" || "$remote_ref" == "refs/heads/master" ]]; then
      if [[ "$local_sha" != "$zero" ]]; then
        echo "pre-push: REFUSED — would create or update '${remote_ref#refs/heads/}' on GitHub." >&2
        echo "  GitHub is public mirror for release/1.0.0 only. Internal history lives on GitLab origin/main." >&2
        echo "  Delete mistaken branch: git push github --delete main" >&2
        echo "  Set default branch on GitHub to release/1.0.0 (Settings → General)." >&2
        return 1
      fi
    fi

    # Never push the local main branch to GitHub (any refspec target).
    if [[ "$local_ref" == "refs/heads/main" || "$local_ref" == "refs/heads/master" ]]; then
      if [[ "$local_sha" != "$zero" ]]; then
        echo "pre-push: REFUSED — local branch '${local_ref#refs/heads/}' must not be pushed to GitHub." >&2
        echo "  Push main to GitLab only: git push origin main" >&2
        return 1
      fi
    fi

    # release/1.0.0 on GitHub must not share a tip with origin/main (unsquashed internal graph).
    if [[ "$remote_ref" == "refs/heads/release/1.0.0" && "$local_sha" != "$zero" ]]; then
      if [[ -n "$origin_main" && "$local_sha" == "$origin_main" ]]; then
        if [[ -z "${ECHO_RELEASE_MIRROR_ALLOW_MAIN_TIP:-}" ]]; then
          echo "pre-push: REFUSED — release/1.0.0 tip equals origin/main on GitHub push." >&2
          echo "  That exposes GitLab per-commit history. Use: npm run publish:public-release -- --yes" >&2
          return 1
        fi
      fi
    fi
  done <<<"$ref_updates"

  return 0
}

is_github_push_remote() {
  local remote_name="${1:-}"
  local push_url="${2:-}"
  local github_remote="${GITHUB_REMOTE:-github}"
  local url_lc="${push_url,,}"

  if [[ "$remote_name" == "$github_remote" ]]; then
    return 0
  fi
  if [[ "$url_lc" == *github.com* ]]; then
    return 0
  fi
  return 1
}

check_branch_upstream_policy() {
  local root="${1:-.}"

  local main_remote
  main_remote="$(git -C "$root" config --get branch.main.remote 2>/dev/null || true)"
  if [[ "$main_remote" == "github" || "$main_remote" == "${GITHUB_REMOTE:-github}" ]]; then
    echo "pre-push: REFUSED — branch main tracks GitHub. Fix upstream:" >&2
    echo "  git branch --set-upstream-to=origin/main main" >&2
    return 1
  fi

  local release_remote
  release_remote="$(git -C "$root" config --get branch.release/1.0.0.remote 2>/dev/null || true)"
  if [[ "$release_remote" == "github" || "$release_remote" == "${GITHUB_REMOTE:-github}" ]]; then
    echo "pre-push: REFUSED — branch release/1.0.0 tracks GitHub (plain git push skips GitLab + publish script)." >&2
    echo "  git branch --set-upstream-to=origin/release/1.0.0 release/1.0.0" >&2
    echo "  Mirror to GitHub: npm run mirror:github-release" >&2
    return 1
  fi

  return 0
}
