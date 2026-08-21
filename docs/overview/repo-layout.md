# Repository layout

Echo is **one monorepo**. Day-to-day work is on **`main`** (GitLab `origin`). Do not use long-lived per-part branches or git submodules.

## Top-level map

| Path                 | Role                                                          |
| -------------------- | ------------------------------------------------------------- |
| `clients/web/`       | Vue 3 SPA (primary client UI; includes Paper feature)         |
| `clients/apple/`     | Native SwiftUI clients                                        |
| `server/backend/`    | Fastify API + Socket.IO + domain (+ `crypto/` kit)            |
| `server/media/`      | Media CDN + chat video HLS worker                             |
| `server/voice/`      | Voice helper / LiveKit-adjacent sidecar                       |
| `server/activities/` | VC gamespace sidecar + shared game cores                      |
| `server/ops/`        | Glue only: scripts, infra, monitoring, perf                   |
| `contracts/`         | Shared TS types/constants (TS-only; no emitted JS)            |
| `marketing/`         | Public Astro site (+ `marketing/terms/`) — standalone product |
| `bot/`               | Discord bridge / import tooling — standalone product          |
| `docs/`              | Narrative docs, plans, runbooks                               |

## Client vs server rule

- **UI lives in clients** (`clients/web/`, `clients/apple/`). Feature chrome, settings, channel routing, and LiveKit client wiring stay there.
- **`server/*` top-level entries are product/kit boundaries** that could stand alone (`backend`, `media`, `voice`, `activities`, `ops`).
- **Internal backend splits** (`api`, `auth`, `domain`, `jobs`, …) stay under `server/backend/`, not as sibling `server/` TLDs.
- **`server/ops/` is glue only** — not a junk drawer for product code.
- **`docs/` is narrative** — not a second source tree for implementation.
- **`marketing/` and `bot/` stay top-level** as standalone products.

Aliases such as `@/services/e2ee` → `server/backend/crypto/src/e2ee` and `@shared/*` → `contracts/` keep host imports stable.

## Renames (historical)

| Old                                 | New                                  |
| ----------------------------------- | ------------------------------------ |
| `frontend/`                         | `web/` → `clients/web/`              |
| `shared/`                           | `contracts/`                         |
| `media-cdn/`                        | `media/` → `server/media/`           |
| `voice-sidecar/`                    | `voice/` → `server/voice/`           |
| `game-server/`                      | `activities/` → `server/activities/` |
| top-level `scripts/` / `infra/` / … | `ops/…` → `server/ops/…`             |
| `terms/`                            | `marketing/terms/`                   |
| `paper/`                            | `clients/web/src/features/paper/`    |
| `crypto/`                           | `server/backend/crypto/`             |

Program record: [top-level-monorepo-structure.md](../plans/top-level-monorepo-structure.md).
