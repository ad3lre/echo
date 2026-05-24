# Agent / contributor charter

Canonical rules: **[docs/overview/agents.md](./docs/overview/agents.md)**.

## GitHub vs GitLab (hard rule)

- **GitLab `origin/main`** — internal day-to-day history. Push with `git push origin main`.
- **GitHub `github/release/1.0.0` only** — public mirror via `npm run publish:public-release` + `npm run mirror:github-release`. **Never `main` on GitHub.**
- Run **`./scripts/setup-githooks.sh`** after clone. Never `git push --no-verify` to `github`.
- Details: **[docs/operations/github-release-mirror.md](./docs/operations/github-release-mirror.md)**.
