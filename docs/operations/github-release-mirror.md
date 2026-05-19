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
- **Do not fast-forward `release/1.0.0` to `origin/main`.** If the release tip SHA equals `origin/main`, GitHub’s default branch shows the **same per-commit history** as internal `main` (messages, authors, hashes). The `pre-push` hook **refuses** to mirror that case unless you set `ECHO_RELEASE_MIRROR_ALLOW_MAIN_TIP=1` (emergency only).

## Publishing internal `main` to the public release line (separate timeline)

**Goal:** `release/1.0.0` on GitHub should show its **own** linear history: each publish adds **one new commit** whose **parent** is the previous public tip, while the **tree** matches the `origin/main` snapshot you intend to ship. Public commit SHAs stay different from GitLab `main`; `origin/main` must never become an ancestor (no merge commit from `main`).

### Recommended: `npm run publish:public-release`

Use the repo script so each GitHub commit has a **real subject and body** (summarized from internal `main` commits since the last publish), not a repeated generic line.

```bash
npm run publish:public-release              # preview message only
npm run publish:public-release -- --yes     # commit + push origin (mirrors to github)
```

The script:

- Appends one **`commit-tree`** commit (parent = current public tip, tree = `origin/main`).
- Sets the **subject** from the newest internal commit in the publish range (or a short default).
- Adds a **bullet list** of internal commit subjects when there are several.
- Records `Echo-Source: <origin/main-sha>` in the footer so the next publish knows what was already shipped.

**Rewrite existing public messages** (same trees, new messages; force-pushes `release/1.0.0`):

```bash
npm run publish:public-release -- --rewrite          # preview
npm run publish:public-release -- --rewrite --yes    # apply + push
```

Optional: `-m "Custom subject"` overrides only the subject line.

Manual `commit-tree` is still fine for emergencies; prefer the script for normal publishes.

### Alternative: `git merge --squash` (only when histories are related)

If `release/1.0.0` and `origin/main` already share a merge-base, you can use:

```bash
git fetch origin main release/1.0.0
git checkout release/1.0.0
git merge --squash origin/main
git commit -m "Public release sync (squashed)."   # edit for external audience
git push origin release/1.0.0
```

If you need to undo a mistaken fast-forward, reset `release/1.0.0` to the prior tip, re-run the steps, then `--force-with-lease` if GitLab requires it (coordinate branch protection).

**Never `git merge origin/main` (merge commit) into `release/1.0.0`.** A merge commit’s second parent would make **all of `main`’s commits reachable** from the public branch. Use **`git merge --squash`** or **`commit-tree`** only.

### Emergency: collapse the whole public branch to one commit again

To replace the entire reachable public history with a **single** commit while keeping a chosen tree: create an orphan branch from that tree, commit once, then `git push origin HEAD:refs/heads/release/1.0.0 --force-with-lease=…` (coordinate branch protection). Old SHAs may remain resolvable on the host for a time. Use only when you intentionally want to wipe the public graph.

## History rewrites (squash, filter-repo)

GitLab **protected branches** often block `--force` pushes. To land a rewritten `main` / `release/1.0.0` on both remotes, temporarily allow maintainer force-push (or unprotect), push to `origin`, then restore protection if you want.

## Commit messages (Cursor)

`scripts/githooks/prepare-commit-msg` strips the **Cursor-packaged** trailer lines the IDE appends to commit messages (the extra “co-authored” line and the “Made-with” line), so they are never stored and GitHub does not attribute a second bot identity. Run `./scripts/setup-githooks.sh` so this hook runs. In Cursor, set **Git author** under Settings → Git to **`ad3lre`** / **`reachbypass@gmail.com`** (or export the same `GIT_AUTHOR_*` / `GIT_COMMITTER_*` variables in the shell) so public and internal commits attribute correctly.

## CI / automation

Server-side GitLab jobs do not run this local hook. If pipelines must update GitHub for `release/1.0.0`, add an explicit job that pushes to `github` for that ref only, using credentials stored in CI variables.

Pipeline pushes must **not** set `release/1.0.0` to the same commit as `origin/main` (same rule as the local hook: use a squash-style or `commit-tree` publish so the tip is not `origin/main`, unless you accept exposing internal per-commit history via `ECHO_RELEASE_MIRROR_ALLOW_MAIN_TIP=1`).

## Do not keep `main` on GitHub

GitHub is a **public mirror** for `release/1.0.0` only. The branch **`main` must not exist** on GitHub: it duplicates GitLab’s long `main` history and is easy to push by mistake.

1. **Delete it if it appears:** `git push github --delete main`
2. **Default branch:** In GitHub → **Settings → General → Default branch**, set **`release/1.0.0`** (not `main`).
3. **Block recreation (server-side):** In **Settings → Rules → Rulesets** (or classic branch protection), add a rule for branches matching **`main`** that **restricts creation** and **blocks pushes** for everyone (or only allow deletes via admin if GitHub supports that pattern). Rulesets are the reliable way to stop `main` from coming back without relying on local hooks.
4. **Local hook:** `scripts/githooks/pre-push` refuses any push that would **create or update** `main` on a `github.com` remote (mirroring `release/1.0.0` to GitLab still runs as before).
