# Development (quick start)

Opinionated path from **clone** to a running stack. Deep docs live under [`docs/README.md`](README.md).

## Prerequisites

- **Node.js 22.13+** (see root `package.json` `engines`).
- **Docker** with Compose v2 (for Postgres, optional LiveKit stack via `npm run db:up`).
- Clone from **GitHub** (public development and issues/PRs use GitHub only).

## Day 1 — run the web stack

From the repository root:

```bash
npm ci
cp .env.example .env
# Edit .env if needed (see comments inside .env.example).
npm run db:up
npm run dev
```

- API: default **http://localhost:3000**
- Vite dev server: **http://localhost:8080** (see `.env` / `CORS_ORIGIN` if you change ports).

## Day 2 — where things live

| Topic                               | Start here                                                                                                                         |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Stack and scale stance              | [`docs/overview/STACK.md`](overview/STACK.md)                                                                                      |
| Contributor / client–server charter | [`docs/overview/agents.md`](overview/agents.md)                                                                                    |
| REST / data contracts               | [`docs/contracts/`](contracts/)                                                                                                    |
| Voice / LiveKit (high level)        | [`docs/infra/livekit-turn.md`](infra/livekit-turn.md), [`docs/operations/livekit-production.md`](operations/livekit-production.md) |
| Native builds                       | [`releases/README.md`](../releases/README.md)                                                                                      |

## Checks before you open a PR

From the repo root (see also [`CONTRIBUTING.md`](../CONTRIBUTING.md)):

```bash
npm run ci:precheck
```

That runs `test:ci` plus the frontend lint/stylelint jobs from GitHub Actions. After `./scripts/setup-githooks.sh`, the same suite runs automatically on **`git push`** to non-GitHub remotes (skip with `ECHO_SKIP_CI_PRECHECK=1`). The hook activates Node from **`.nvmrc`** via nvm when your shell default is older than 22.13.

Equivalent manual steps:

```bash
npm run format:check
npm run test:ci
npm run lint -w frontend && npm run lint:theme -w frontend && npm run lint:style -w frontend
```

Targeted tests (examples):

```bash
npm run test -w frontend -- --run path/to/file.test.ts
npm run test:storage-mode -w backend
```

## CI on GitHub

**GitHub Actions** under [`.github/workflows/`](../.github/workflows/) is the **authoritative** CI for the public repository. Forks get the same workflows; jobs that need signing secrets may be skipped or limited on forks.

The root [`.gitlab-ci.yml`](../.gitlab-ci.yml) exists for **GitLab** mirrors (Prettier gate only). For a **GitHub-only** public export you may **delete** that file to avoid confusion, or keep it only on a private GitLab remote.

## Reference deployment vs your fork

Example URLs and defaults sometimes mention **`chat-echo.com`** as the **maintainers’ reference deployment** (documentation and some CI build-time `VITE_*` URLs). **Your fork** should point `VITE_API_URL`, `VITE_SOCKET_IO_URL`, and related settings at **your own** API host (see `.env.example`). You are not required to call the reference deployment.

## Maintainer: publishing a fresh GitHub repo (no history)

When cutting the **public** tree from private development:

1. Use a **clean** branch that already includes license, security policy, and OSS hygiene.
2. Produce an export directory (e.g. `git archive --format=tar HEAD | tar -x -C ../echo-public-export`, excluding `node_modules` and build outputs, or `rsync` with appropriate `--exclude`).
3. Run **gitleaks** (and `node scripts/check-oss-artifacts.mjs` after `git init` + first add) on that tree before publishing.
4. In the export: `git init`, initial commit, add remote `https://github.com/ORG/REPO.git`, push **default branch**.
5. On GitHub: enable **branch protection**, **required checks** (e.g. format + backend CI), **Dependabot**, and **private vulnerability reporting** (align with `.github/SECURITY.md`).
6. **Rotate** any credential that was ever exposed outside the new public repo (old remotes, tickets, chat).

## License

This project is **AGPL-3.0** (see root `LICENSE`). Contributions are accepted under the same license (see `CONTRIBUTING.md`).
