# Agent / contributor charter

Canonical rules: **[docs/overview/agents.md](./docs/overview/agents.md)**.  
**Repo layout (client vs kit):** **[docs/overview/repo-layout.md](./docs/overview/repo-layout.md)**.  
**Frontend file placement:** **[docs/overview/code-placement.md](./docs/overview/code-placement.md)** (CI-enforced).  
**Public docs index:** **[docs/README.md](./docs/README.md)**. Internal plans/reviews: local **`docs-dev/`** (gitignored).

## GitHub vs GitLab (hard rule)

- **GitLab `origin/main`** — internal day-to-day history. Push with `git push origin main`.
- **GitLab `origin/release/1.0.0`** — squashed public publish line.
- **GitHub `main` only** — public mirror of `release/1.0.0` via `bun run publish:public-release` + `bun run mirror:github-release`. Never push GitLab `main` to GitHub.
- Run **`./server/ops/scripts/setup-githooks.sh`** after clone. Never `git push --no-verify` to `github`.
- Details: **[docs/operations/github-release-mirror.md](./docs/operations/github-release-mirror.md)**.
