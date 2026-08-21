# GitHub mirror for `release/1.0.0` only

**Policy:** Day-to-day pushes go to GitLab (`origin`). Only the branch **`release/1.0.0`** is also pushed to GitHub [`ad3lre/echo`](https://github.com/ad3lre/echo). Other branches must not be pushed to GitHub from this workflow.

## One-time setup per clone

1. **GitHub remote** (HTTPS; use SSH instead if you prefer):

   ```bash
   git remote add github https://github.com/ad3lre/echo.git
   ```

   Skip this step if `git remote get-url github` already works.

2. **Use the repo’s `pre-push` hook** (CI precheck + mirror policy):

   ```bash
   ./server/ops/scripts/setup-githooks.sh
   ```

   This sets `core.hooksPath` to `server/ops/scripts/githooks` for this repository only.

   On every push to a **non-GitHub** remote (e.g. GitLab `origin`), the hook runs **`npm run ci:precheck`** before the push proceeds (`format:check`, repo guards, clients/web/backend builds, web unit tests, backend contract tests, web ESLint + stylelint). Pushes to `github.com` skip the precheck (mirror-only). Emergency bypass: `ECHO_SKIP_CI_PRECHECK=1 git push …`. Manual run: `npm run ci:precheck`.

## Behavior

### Scheduled GitHub mirror (default: 23:00 daily)

Pushes to **GitLab** `origin/release/1.0.0` do **not** update GitHub immediately. All publishes during the day land on GitLab first; **one batched mirror** pushes the latest tip to GitHub at **23:00** in your configured timezone (default **Europe/Berlin**).

1. **Install the cron job** on a machine that is on at that time (your dev box, VPS, etc.):

   ```bash
   npm run mirror:github-release:install-cron -- --yes
   ```

   Override schedule with env vars when installing or in the crontab line:
   - `ECHO_RELEASE_MIRROR_HOUR=23` (24-hour clock)
   - `ECHO_RELEASE_MIRROR_MINUTE=0`
   - `ECHO_RELEASE_MIRROR_TZ=Europe/Berlin` (CET/CEST; or `UTC`, `America/New_York`, …)

2. **Manual mirror** (same checks as cron):

   ```bash
   npm run mirror:github-release
   ```

3. **Immediate mirror** (emergency; still runs safety checks):

   ```bash
   ECHO_RELEASE_MIRROR_NOW=1 git push origin release/1.0.0
   ```

The `pre-push` hook prints a reminder when GitHub is deferred. Pushes whose URL contains `github.com` only validate refs (never create/update `main` there) and do not schedule a mirror.

**Do not fast-forward `release/1.0.0` to `origin/main`.** The mirror script **refuses** when the release tip equals `origin/main` unless `ECHO_RELEASE_MIRROR_ALLOW_MAIN_TIP=1` (emergency only).

## Publishing internal `main` to the public release line (separate timeline)

**Goal:** `release/1.0.0` on GitHub should show its **own** linear history: each publish adds **one new commit** whose **parent** is the previous public tip, while the **tree** matches the `origin/main` snapshot you intend to ship. Public commit SHAs stay different from GitLab `main`; `origin/main` must never become an ancestor (no merge commit from `main`).

### Recommended: `npm run publish:public-release`

Use the repo script so each GitHub commit has a **real subject and body** (summarized from internal `main` commits since the last publish), not a repeated generic line.

```bash
npm run publish:public-release              # preview message only
npm run publish:public-release -- --yes     # commit + push origin (GitHub at 23:00 cron)
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

`server/ops/scripts/githooks/prepare-commit-msg` strips the **Cursor-packaged** trailer lines the IDE appends to commit messages (the extra “co-authored” line and the “Made-with” line), so they are never stored and GitHub does not attribute a second bot identity. Run `./server/ops/scripts/setup-githooks.sh` so this hook runs. In Cursor, set **Git author** under Settings → Git to **`ad3lre`** / **`reachbypass@gmail.com`** (or export the same `GIT_AUTHOR_*` / `GIT_COMMITTER_*` variables in the shell) so public and internal commits attribute correctly.

## CI / automation

Server-side GitLab jobs do not run the local hook. To mirror from CI at a fixed time, run `server/ops/scripts/mirror-release-to-github.sh` in a **scheduled** GitLab pipeline (with `github` deploy credentials), or rely on the same cron script on a runner.

Pipeline pushes must **not** set `release/1.0.0` to the same commit as `origin/main` (same rule as the mirror script: use `publish-public-release`, unless you accept exposing internal history via `ECHO_RELEASE_MIRROR_ALLOW_MAIN_TIP=1`).

## Do not keep `main` on GitHub

GitHub is a **public mirror** for `release/1.0.0` only. The branch **`main` must not exist** on GitHub: it duplicates GitLab’s long `main` history and is easy to push by mistake.

### How leaks happen (avoid these)

1. **`git push github main`** or **`git push github HEAD:main`** — blocked by `github-push-guard.sh` when hooks are installed.
2. **`release/1.0.0` tracking `github`** — a plain `git push` on that branch skips GitLab and `publish-public-release`. Run `./server/ops/scripts/setup-githooks.sh` to reset upstream to **`origin/release/1.0.0`**.
3. **Fast-forwarding `release/1.0.0` to `origin/main`** — mirror and pre-push refuse when tips match (unless `ECHO_RELEASE_MIRROR_ALLOW_MAIN_TIP=1`).
4. **`git push --no-verify`** — bypasses all local hooks; do not use for GitHub pushes.
5. **GitHub default branch still `main`** — invites accidental pushes and confused clones.

### Recovery and prevention

1. **Delete `main` on GitHub if it appears:** `git push github --delete main`
2. **Default branch:** GitHub → **Settings → General → Default branch** → **`release/1.0.0`** (not `main`).
3. **Block recreation (server-side):** **Settings → Rules → Rulesets** — rule on branch **`main`**: block creation and pushes for everyone.
4. **Local hooks (required):** `./server/ops/scripts/setup-githooks.sh` — `pre-push` runs `github-push-guard.sh` before any push:
   - Refuses **create/update `main` or `master`** on the `github` remote (by remote name or `github.com` URL).
   - Refuses pushing **local `main`/`master`** to GitHub at all.
   - Refuses **`release/1.0.0` → GitHub** when the tip equals **`origin/main`**.
   - Refuses if **`main` or `release/1.0.0` track `github`** as upstream.
5. **CI guard:** `node server/ops/scripts/check-github-remote-policy.mjs` (in `npm run test:ci:guards`) ensures hook wiring is not removed.

GitLab `release/1.0.0` pushes are not mirrored until the daily job (unless `ECHO_RELEASE_MIRROR_NOW=1`).
