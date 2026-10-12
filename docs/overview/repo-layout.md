# Repository layout

Echo is **one monorepo**. Day-to-day work is on **`main`** (GitLab `origin` for
maintainers). Public GitHub carries **`release/1.0.0` only** — see
[github-release-mirror.md](../operations/github-release-mirror.md).

## Top-level map

| Path                 | Role                                               |
| -------------------- | -------------------------------------------------- |
| `clients/web/`       | Vue 3 SPA (primary client UI; includes Paper)      |
| `clients/apple/`     | Native SwiftUI clients                             |
| `server/backend/`    | Fastify API + Socket.IO + domain (+ `crypto/` kit) |
| `server/media/`      | Media CDN + chat video HLS worker                  |
| `server/voice/`      | Voice helper / LiveKit-adjacent sidecar            |
| `server/activities/` | VC gamespace sidecar + shared game cores           |
| `server/ops/`        | Glue: scripts, infra, monitoring, perf             |
| `contracts/`         | Shared TS types/constants (TS-only; no emitted JS) |
| `marketing/`         | Public Astro site (+ `marketing/terms/`)           |
| `bot/`               | Discord bridge / import tooling                    |
| `docs/`              | **Public** narrative docs (this tree)              |
| `docs-dev/`          | **Local-only** plans/reviews/audits (gitignored)   |

## Client vs server rule

- **UI lives in clients** (`clients/web/`, `clients/apple/`).
- **`server/*` top-level entries are product/kit boundaries** (`backend`, `media`,
  `voice`, `activities`, `ops`).
- **Internal backend splits** stay under `server/backend/`.
- **`server/ops/` is glue only** — not a junk drawer for product code.
- **`docs/` is public narrative** — not a second source tree for implementation.
- **`docs-dev/` is local** — never commit it.
- **`marketing/` and `bot/` stay top-level** as standalone products.

Aliases such as `@/services/e2ee` → `server/backend/crypto/src/e2ee` and
`@shared/*` → `contracts/` keep host imports stable.

## Historical renames

| Old                             | New                               |
| ------------------------------- | --------------------------------- |
| `frontend/`                     | `clients/web/`                    |
| `shared/`                       | `contracts/`                      |
| `media-cdn/`                    | `server/media/`                   |
| `voice-sidecar/`                | `server/voice/`                   |
| `game-server/`                  | `server/activities/`              |
| top-level `scripts/` / `infra/` | `server/ops/…`                    |
| `terms/`                        | `marketing/terms/`                |
| `paper/`                        | `clients/web/src/features/paper/` |
| `crypto/`                       | `server/backend/crypto/`          |
