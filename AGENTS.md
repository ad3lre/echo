# Agent / contributor charter

Canonical rules: **[docs/overview/agents.md](./docs/overview/agents.md)**.  
**Repo layout (client vs kit):** **[docs/overview/repo-layout.md](./docs/overview/repo-layout.md)**.  
**Frontend file placement:** **[docs/overview/code-placement.md](./docs/overview/code-placement.md)** (P1 SSOT; program: [p1-code-placement-program.md](./docs/overview/p1-code-placement-program.md)).

## GitHub vs GitLab (hard rule)

- **GitLab `origin/main`** — internal day-to-day history. Push with `git push origin main`.
- **GitHub `github/release/1.0.0` only** — public mirror via `npm run publish:public-release` + `npm run mirror:github-release`. **Never `main` on GitHub.**
- Run **`./server/ops/scripts/setup-githooks.sh`** after clone. Never `git push --no-verify` to `github`.
- Details: **[docs/operations/github-release-mirror.md](./docs/operations/github-release-mirror.md)**.
