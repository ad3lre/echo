# Top-level monorepo structure — Stage 0 inventory

**Branch:** `plan/top-level-monorepo-structure`  
**Date:** 2026-08-15  
**Baseline CI:** Full `ci:precheck` deferred until after Stage 1 renames (mechanical path churn would invalidate mid-run). Targeted workspace builds used as Stage 1 exit gate.

## Rename map (Stage 1)

| From                 | To                   | Workspace `name` after |
| -------------------- | -------------------- | ---------------------- |
| `clients/web/`       | `clients/web/`       | `web`                  |
| `contracts/`         | `contracts/`         | `contracts`            |
| `server/media/`      | `server/media/`      | `media`                |
| `server/voice/`      | `server/voice/`      | `voice`                |
| `server/activities/` | `server/activities/` | `activities`           |
| `marketing/terms/`   | `marketing/terms/`   | (not a workspace)      |

**Alias decision:** Keep import alias `@shared` → points at `contracts/` (avoids rewriting ~412 web files in Stage 1). Path on disk is `contracts/`.

## Import / coupling snapshot (pre-move)

| Surface                 | Files | Hits |
| ----------------------- | ----: | ---: |
| web `@shared/*`         |   412 |  621 |
| backend `…/contracts/…` |   207 |  315 |
| game-server → shared    |    19 |   38 |
| media-cdn → shared      |     5 |    7 |

## Package `name` fields (pre-move)

`frontend`, `backend`, `shared`, `media-cdn`, `voice-sidecar`, `game-server`, `marketing`, `echo-discord-export-bot`, `scripts`

## Root scripts hard-coding old names (sample)

- **frontend** (~12): `dev`, `dev:core`, `prod:serve`, `build:workspaces`, `test:ci`, `ci:precheck`, e2e, …
- **game-server** (~3): `dev`, `build:workspaces`, `test:ci`
- **media-cdn** (~3): `dev:media-cdn`, `build:workspaces`, `test:ci:backend`
- **scripts/** (~90): path `node server/ops/scripts/…` — **Stage 2** (`ops/`), not Stage 1

## CI path filters

| Workflow                 | Mentions                                      |
| ------------------------ | --------------------------------------------- |
| `echo-web-ci.yml`        | frontend, shared                              |
| `echo-backend-ci.yml`    | frontend, shared, backend                     |
| `echo-e2e-ci.yml`        | frontend, shared, backend                     |
| `echo-workspaces-ci.yml` | shared, voice-sidecar, game-server, marketing |

## Later-stage inventory (not moved in Stage 1)

### HLS (→ `server/media/` in Stage 5)

- `server/backend/src/workers/videoHls.ts`
- `server/backend/src/services/echoVideoHlsProcessor.ts`
- `server/backend/src/services/echoUploadHlsObjectStore.ts`
- `server/backend/src/tests/videoHlsNotify.test.ts`
- `server/backend/src/tests/echoVideoHls.golden.test.ts`
- `server/backend/src/tests/uploads/videoHlsWorker.config.test.ts`

### Paper (→ `paper/` in Stage 6)

- `clients/web/src/features/paper` — 139 ts/vue files

### Crypto (→ `server/backend/crypto/` in Stage 7)

- `clients/web/src/services/e2ee` — 11 files
- `clients/web/src/services/voice` — 13 files (MLS mixed with voice; Stage 7 must separate carefully)

### Guard / baseline path files (must update in Stage 1)

- `server/ops/scripts/god-file-baselines.json` (`clients/web/…` keys)
- `server/ops/scripts/code-placement-config.json`
- Other allowlists under `server/ops/scripts/` that embed `clients/web/` or `contracts/`

## Compatibility notes

- npm `-w <name>` uses package.json `name`, so rename `name` with the folder.
- Vitest in web includes `../contracts/**/*.test.ts` — retarget to `../contracts/`.
- Backend/media/activities use relative `../../shared` or `../../../shared` — retarget to `contracts`.
