# GitHub mirror for `release/1.0.0` only

**Policy:** Day-to-day pushes go to GitLab (`origin`). Only the branch **`release/1.0.0`** is also pushed to GitHub [`ad3lre/echo`](https://github.com/ad3lre/echo). Other branches must not be pushed to GitHub from this workflow.

## One-time setup per clone

1. **GitHub remote** (HTTPS; use SSH instead if you prefer):

   ```bash
   git remote add github https://github.com/ad3lre/echo.git
   ```

   Skip this step if `git remote get-url github` already works.

2. **Use the repo’s `pre-push` hook** (mirrors only when the push target is not GitHub):

   ```bash
   ./scripts/setup-githooks.sh
   ```

   This sets `core.hooksPath` to `scripts/githooks` for this repository only.

## Behavior

- `git push origin release/1.0.0`: the `pre-push` hook runs **before** GitLab accepts the push. It mirrors with `--force-with-lease` when `github/release/1.0.0` already exists (after a quick `git fetch github release/1.0.0`). If GitLab **rejects** the push (protected branch, hook, etc.), GitHub may already have been updated; realign with  
  `git fetch origin && git push github +origin/release/1.0.0:refs/heads/release/1.0.0 --force`  
  (or the inverse, from whichever remote is canonical for that incident).
- Pushes whose URL contains `github.com` do **not** trigger a mirror (avoids double work and accidental `origin` pushes from a GitHub-targeted push).
- Pushes of other branches: no GitHub activity from the hook.
- If the `github` remote is missing, the hook **fails** so `release/1.0.0` is not pushed only to GitLab by mistake while GitHub lags.

## History rewrites (squash, filter-repo)

GitLab **protected branches** often block `--force` pushes. To land a rewritten `main` / `release/1.0.0` on both remotes, temporarily allow maintainer force-push (or unprotect), push to `origin`, then restore protection if you want.

## Commit messages (Cursor)

`scripts/githooks/prepare-commit-msg` strips the **Cursor-packaged** trailer lines the IDE appends to commit messages (the extra “co-authored” line and the “Made-with” line), so they are never stored and GitHub does not attribute a second bot identity. Run `./scripts/setup-githooks.sh` so this hook runs. In Cursor, also set **Git author** to your own `user.name` / `user.email` under Settings → Git.

## CI / automation

Server-side GitLab jobs do not run this local hook. If pipelines must update GitHub for `release/1.0.0`, add an explicit job that pushes to `github` for that ref only, using credentials stored in CI variables.
