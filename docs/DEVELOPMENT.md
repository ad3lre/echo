# Development

From clone to a running stack. Public doc index: [`docs/README.md`](README.md).

## Prerequisites

- **Bun 1.4.2+** (pin: root `.bun-version`; also `package.json` `engines` / `packageManager`)
- **Docker** with Compose v2 (Postgres + optional LiveKit via `bun run db:up`)
- Public issues/PRs: **GitHub**. Day-to-day history for maintainers: **GitLab** `origin/main` (see [github-release-mirror.md](operations/github-release-mirror.md))

## Day 1 — run the web stack

```bash
bun install --frozen-lockfile
cp .env.example .env
# Edit .env if needed (comments in .env.example).
bun run db:up
bun run dev:core
```

`dev:core` starts the API and web client. Use `bun run dev` when you also need
the Discord bot and activities worker.

| Service  | Default URL           |
| -------- | --------------------- |
| API      | http://localhost:3000 |
| Vite SPA | http://localhost:8080 |

## Day 2 — where things live

| Topic                    | Start here                                                                                                           |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------- |
| Top-level layout         | [overview/repo-layout.md](overview/repo-layout.md)                                                                   |
| Stack and scale          | [overview/STACK.md](overview/STACK.md)                                                                               |
| Contributor charter      | [overview/agents.md](overview/agents.md)                                                                             |
| Frontend placement       | [overview/code-placement.md](overview/code-placement.md)                                                             |
| REST / data contracts    | [contracts/](contracts/)                                                                                             |
| LiveKit / TURN           | [infra/livekit-turn.md](infra/livekit-turn.md), [operations/livekit-production.md](operations/livekit-production.md) |
| Native Apple             | [clients/apple/README.md](../clients/apple/README.md)                                                                |
| Internal plans / reviews | Local [`docs-dev/`](../docs-dev/) (gitignored; not in fresh clones)                                                  |

## Checks before a PR

```bash
./server/ops/scripts/setup-githooks.sh   # once per clone
bun run ci:precheck
```

`ci:precheck` matches the main GitHub Actions gate (`test:ci` plus web lint/stylelint).
After hooks are installed, the same suite runs on **`git push`** to non-GitHub remotes
(skip with `ECHO_SKIP_CI_PRECHECK=1`). Requires **Bun ≥1.4.2** on `PATH`.

Manual equivalents:

```bash
bun run format:check
bun run test:ci
bun run --filter web lint && bun run --filter web lint:theme && bun run --filter web lint:style
```

Targeted tests:

```bash
bun run --filter web test -- --run path/to/file.test.ts
bun run --filter backend test:storage-mode
```

## CI

- **GitHub Actions** (`.github/workflows/`) — authoritative CI for the public repo.
- **GitLab** (`.gitlab-ci.yml`) — Prettier + `ci:precheck` ship gate for the internal remote.

## Reference deployment vs your fork

Docs and some CI build-time `VITE_*` values may mention **`chat-echo.com`** as the
maintainers’ reference deployment. Point `VITE_API_URL`, `VITE_SOCKET_IO_URL`, and
related settings at **your** API host (see `.env.example`).

## Production-like local

```bash
bun run prod          # build + API :3000 + Vite preview :4173
bun run prod:serve    # skip rebuild
bun run ship:verify   # install + build + /api/v1/health smoke
```

Self-host: [operations/linux-vps-deployment.md](operations/linux-vps-deployment.md).

## License

**AGPL-3.0-only** — see root `LICENSE` and `CONTRIBUTING.md`.
