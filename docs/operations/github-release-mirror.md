# GitHub mirror: public `main` (from GitLab `release/1.0.0`)

**Policy:** Day-to-day pushes go to GitLab (`origin`). The public GitHub repo [`ad3lre/echo`](https://github.com/ad3lre/echo) carries **`main` only** — a squashed timeline mirrored from GitLab **`release/1.0.0`**. Other branches must not be pushed to GitHub from this workflow.

| Remote / branch               | Role                                      |
| ----------------------------- | ----------------------------------------- |
| GitLab `origin/main`          | Internal day-to-day history               |
| GitLab `origin/release/1.0.0` | Public publish line (one commit per ship) |
| GitHub `main`                 | Public mirror of `origin/release/1.0.0`   |

GitHub `main` is **not** GitLab `main`. Public SHAs stay different; internal per-commit history must never become reachable from GitHub.

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

   On every push to a **non-GitHub** remote (e.g. GitLab `origin`), the hook runs **`bun run ci:precheck`** before the push proceeds (`format:check`, repo guards, clients/web/backend builds, web unit tests, backend contract tests, web ESLint + stylelint). Pushes to `github.com` skip the precheck (mirror-only). Emergency bypass: `ECHO_SKIP_CI_PRECHECK=1 git push …`. Manual run: `bun run ci:precheck`.

## Behavior

### Scheduled GitHub mirror (default: 23:00 daily)

Pushes to **GitLab** `origin/release/1.0.0` do **not** update GitHub immediately. All publishes during the day land on GitLab first; **one batched mirror** pushes the latest tip to **GitHub `main`** at **23:00** in your configured timezone (default **Europe/Berlin**).

1. **Install the cron job** on a machine that is on at that time (your dev box, VPS, etc.):

   ```bash
   bun run mirror:github-release:install-cron -- --yes
   ```

   Override schedule with env vars when installing or in the crontab line:
   - `ECHO_RELEASE_MIRROR_HOUR=23` (24-hour clock)
   - `ECHO_RELEASE_MIRROR_MINUTE=0`
   - `ECHO_RELEASE_MIRROR_TZ=Europe/Berlin` (CET/CEST; or `UTC`, `America/New_York`, …)

2. **Manual mirror** (same checks as cron):

   ```bash
   bun run mirror:github-release
   ```

3. **Immediate mirror** (emergency; still runs safety checks):

   ```bash
   ECHO_RELEASE_MIRROR_NOW=1 git push origin release/1.0.0
   ```

The `pre-push` hook prints a reminder when GitHub is deferred. Pushes whose URL contains `github.com` only validate refs (GitHub **`main` only**; tip must not equal `origin/main`) and do not schedule a mirror.

**Do not fast-forward `release/1.0.0` to `origin/main`.** The mirror script **refuses** when the release tip equals `origin/main` unless `ECHO_RELEASE_MIRROR_ALLOW_MAIN_TIP=1` (emergency only).

## Publishing internal `main` to the public release line (separate timeline)

**Goal:** GitHub `main` (via GitLab `release/1.0.0`) should show its **own** linear history: each publish adds **one new commit** whose **parent** is the previous public tip, while the **tree** matches the `origin/main` snapshot you intend to ship. Public commit SHAs stay different from GitLab `main`; `origin/main` must never become an ancestor (no merge commit from `main`).

### Recommended: `bun run publish:public-release`

Use the repo script so each public commit has a **real subject and body** (summarized from internal `main` commits since the last publish), not a repeated generic line.

```bash
bun run publish:public-release              # preview message only
bun run publish:public-release -- --yes     # commit + push origin (GitHub at 23:00 cron)
```

The script:

- Appends one **`commit-tree`** commit (parent = current public tip, tree = `origin/main`).
- Sets the **subject** from the newest internal commit in the publish range (or a short default).
- Adds a **bullet list** of internal commit subjects when there are several.
- Records `Echo-Source: <origin/main-sha>` in the footer so the next publish knows what was already shipped.

**Rewrite existing public messages** (same trees, new messages; force-pushes GitLab `release/1.0.0`):

```bash
bun run publish:public-release -- --rewrite          # preview
bun run publish:public-release -- --rewrite --yes    # apply + push
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

## Required server-side protections (the actual enforcement)

Everything in `server/ops/scripts/githooks/` is **advisory**: `--no-verify`, a fresh clone without `setup-githooks.sh`, or any `ECHO_SKIP_*` / `ECHO_*_BYPASS` variable defeats it (the hooks now print a loud banner to stderr when a bypass is used, but they cannot stop it). The following must be configured on the servers:

**GitLab (internal)**

- Protected branches **`main`** and **`release/1.0.0`**: force push **disallowed**, direct push limited to maintainers/the release identity, merge requests required where practical, code-owner approval on (see `CODEOWNERS`).
- The `github` mirror/deploy credential lives only in the scheduled mirror job/runner, never on developer machines.
- `.gitlab-ci.yml` `security` and `security-dep-audit` jobs required to pass for merges.

**GitHub (public)**

- Repository **ruleset** on **`main`**: restrict updates to the mirror identity (deploy key / bot), block force pushes except from that identity, block deletion, require signed commits if feasible.
- Ruleset (or branch-creation restriction) that blocks creation of any branch other than `main`.
- Required status checks from the `.github/workflows` CI on `main`; code-owner review for `/.github/`, `/server/ops/`, `/package.json`, `/bun.lock`.

`mirror-release-to-github.sh <sha>` additionally refuses an explicit SHA that is not reachable from `origin/release/1.0.0`, or whose `github/main..<sha>` range contains commits reachable from `origin/main` but not from `origin/release/1.0.0`.

Release commit author: set `ECHO_RELEASE_AUTHOR_EMAIL` (and `GIT_AUTHOR_NAME` if needed) in your environment; `publish-public-release.sh` refuses to run without it.

## Commit messages (Cursor)

`server/ops/scripts/githooks/prepare-commit-msg` strips the **Cursor-packaged** trailer lines the IDE appends to commit messages (the extra “co-authored” line and the “Made-with” line), so they are never stored and GitHub does not attribute a second bot identity. Run `./server/ops/scripts/setup-githooks.sh` so this hook runs. In Cursor, set **Git author** under Settings → Git to **`ad3lre`** / **`$ECHO_RELEASE_AUTHOR_EMAIL`** (the public release author email; never commit it) (or export the same `GIT_AUTHOR_*` / `GIT_COMMITTER_*` variables in the shell) so public and internal commits attribute correctly.

## CI / automation

Server-side GitLab jobs do not run the local hook. To mirror from CI at a fixed time, run `server/ops/scripts/mirror-release-to-github.sh` in a **scheduled** GitLab pipeline (with `github` deploy credentials), or rely on the same cron script on a runner.

Pipeline pushes must **not** set `release/1.0.0` to the same commit as `origin/main` (same rule as the mirror script: use `publish-public-release`, unless you accept exposing internal history via `ECHO_RELEASE_MIRROR_ALLOW_MAIN_TIP=1`).

## GitHub is `main` only (not GitLab `main`)

GitHub’s default branch is **`main`**, but that tip must always be the squashed public line (same commits as GitLab `release/1.0.0`). Pushing GitLab `origin/main` to GitHub would leak internal history.

### How leaks happen (avoid these)

1. **`git push github main`** from local `main` — blocked by `github-push-guard.sh` when hooks are installed.
2. **`release/1.0.0` tracking `github`** — a plain `git push` on that branch skips GitLab and `publish-public-release`. Run `./server/ops/scripts/setup-githooks.sh` to reset upstream to **`origin/release/1.0.0`**.
3. **Fast-forwarding `release/1.0.0` to `origin/main`** — mirror and pre-push refuse when tips match (unless `ECHO_RELEASE_MIRROR_ALLOW_MAIN_TIP=1`).
4. **`git push --no-verify`** — bypasses all local hooks; do not use for GitHub pushes.
5. **Creating non-`main` branches on GitHub** — blocked; mirror only updates `main`.

### Recovery and prevention

1. **Default branch:** GitHub → **Settings → General → Default branch** → **`main`**.
2. **Delete leftover `release/1.0.0` on GitHub if it appears:** `git push github --delete release/1.0.0`
3. **Block recreation of other public branches (server-side):** **Settings → Rules → Rulesets** — allow pushes only to **`main`** for the mirror credentials, or block creation of other branches.
4. **Local hooks (required):** `./server/ops/scripts/setup-githooks.sh` — `pre-push` runs `github-push-guard.sh` before any push:
   - Allows **GitHub `main` only** (other refs refused; deletes allowed).
   - Refuses **local `main`/`master` → GitHub** at all.
   - Refuses **GitHub `main`** when the tip equals **`origin/main`**.
   - Refuses if **`main` or `release/1.0.0` track `github`** as upstream.
5. **CI guard:** `bun server/ops/scripts/check-github-remote-policy.mjs` (in `bun run test:ci:guards`) ensures hook wiring is not removed.

GitLab `release/1.0.0` pushes are not mirrored until the daily job (unless `ECHO_RELEASE_MIRROR_NOW=1`).
