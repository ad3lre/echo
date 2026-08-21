# Top-level monorepo structure

**Branch:** `plan/top-level-monorepo-structure`  
**Status:** Stages 0–3 executed on this branch  
**Goal:** Make each meaningful ownership boundary obvious at the repo root, without multi-repo or git submodules.

## Target top-level

```text
server/activities/     # shared cores + activities-sidecar (UI stays in clients)
clients/apple/
server/backend/
bot/
contracts/      # was shared/
server/backend/crypto/         # E2EE / MLS kit (extract from web)
docs/           # stays its own top-level
marketing/      # includes today’s marketing/terms/
server/media/          # CDN + HLS worker + media kit
ops/            # compose/deploy/monitoring/perf glue only
paper/          # second integrated product (extract from web)
server/voice/          # voice sidecar / kit
clients/web/            # was clients/web/
```

Root meta stays at root: `package.json`, lockfile, `.github/`, README/LICENSE/AGENTS, `.env.example`, and (optionally) thin ops entrypoints such as `docker-compose.yml`.

### Gone as top-level names

| Today                                                                                                 | Becomes                                                                             |
| ----------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `clients/web/`                                                                                        | `clients/web/`                                                                      |
| `contracts/`                                                                                          | `contracts/` (+ suite-owned slices move out)                                        |
| `server/activities/`                                                                                  | `server/activities/` (sidecar)                                                      |
| `server/media/`                                                                                       | `server/media/`                                                                     |
| `server/voice/`                                                                                       | `server/voice/`                                                                     |
| `server/ops/scripts/`, `server/ops/infra/`, `server/ops/monitoring/`, `server/ops/perf/`, `releases/` | `ops/` (carefully — see rules)                                                      |
| `marketing/terms/`                                                                                    | `marketing/terms/`                                                                  |
| `public/`                                                                                             | Absorbed (e.g. activity assets → `server/activities/`, SPA static → `clients/web/`) |
| `src-tauri/`                                                                                          | Not a part (already being removed)                                                  |

**Not** adding a top-level `tests/` — unit/component tests stay co-located with each part.

## Governing rules

1. **Top-level = shared kits, products, runtimes, clients, docs, ops.**
2. **Client-specific UI stays in the client** (`clients/web/`, `clients/apple/`). Other clients recreate their own UI (e.g. activities UI lives in `clients/web/`; `server/activities/` holds shared protocol, cores, sidecar).
3. **Suites** (`media`, `voice`, `activities`, `crypto`, `paper`) own shared code and sidecars/workers that implement that job.
4. **ops** is only cross-part glue (compose, deploy, monitoring, recovery, perf lab). Not a junk drawer: suite-internal scripts stay in the suite; product feature code never moves to ops.
5. **One git monorepo on `main` for day-to-day shipping** after this lands. This plan branch is for the restructuring job only. No git submodules; no long-lived per-part branches; no multi-repo unless lifecycles later diverge.
6. **docs/** remains a first-class top-level tree (narrative + ADRs). Contract _schemas/types_ live under `contracts/`; long-form contract docs may stay under `docs/contracts/` with clear links.

## Approx LOC after reorg (ballpark)

| Part       |  ~LOC | Notes                                                          |
| ---------- | ----: | -------------------------------------------------------------- |
| web        | ~380k | Still includes activities UI, LiveKit client, viewers, explore |
| backend    | ~145k | Minus HLS worker → media                                       |
| paper      |  ~22k | From web                                                       |
| ops        |  ~22k | scripts + infra + perf (+ related)                             |
| docs       |  ~15k |                                                                |
| apple      |  ~14k |                                                                |
| marketing  |  ~10k | + terms                                                        |
| contracts  |   ~9k | shared minus games cores                                       |
| activities | ~5–6k | sidecar + shared games + catalog                               |
| crypto     | ~3.5k | from web                                                       |
| bot        | ~3.5k |                                                                |
| media      |   ~2k | CDN + HLS                                                      |
| voice      | ~0.5k | sidecar; client stays in clients/web/apple                     |

## Dependency sketch

```text
contracts
    ↑
backend  ←→  media · voice · activities · crypto · paper (kits)
    ↑
web · apple · bot · marketing
    ↑
ops (wires the stack)     docs (explains the stack)
```

---

## Stages

Execute in order. Each stage should leave `main`-mergeable CI green (or this plan branch kept green until merge). Prefer `git mv` to preserve history.

### Stage 0 — Prep and inventory (no moves)

**Done when:** inventory checklist committed; rename map agreed; CI baseline noted.

1. Freeze the target list (this document).
2. Inventory inbound imports:
   - `frontend` → `@shared/*` and `contracts/`
   - `backend` → `../../../contracts/...`
   - `game-server`, `media-cdn` → `contracts/`
   - HLS / video worker files under `server/backend/`
   - `clients/web/src/features/paper`, `services/e2ee`, MLS helpers
3. List root `package.json` workspace names and scripts that hard-code folder names.
4. List CI path filters (`.github/workflows/*`) that mention `frontend`, `shared`, `game-server`, etc.
5. Decide temporary compatibility: keep package `name` fields stable where needed (`"frontend"` → rename workspace carefully).
6. Record baseline: `npm run ci:precheck` (or agreed subset) on the branch tip before moves.

**Exit criteria:** Checklist in this plan or a short `docs/plans/top-level-monorepo-structure-inventory.md` with file counts and script hit list.

---

### Stage 1 — Mechanical renames (low risk)

**Done when:** folders renamed; workspaces/CI/scripts updated; app still builds.

Order (one PR-sized chunk at a time if needed):

| Step | From                 | To                                            |
| ---- | -------------------- | --------------------------------------------- |
| 1.1  | `clients/web/`       | `clients/web/`                                |
| 1.2  | `contracts/`         | `contracts/`                                  |
| 1.3  | `server/media/`      | `server/media/` (CDN tree; HLS not yet)       |
| 1.4  | `server/voice/`      | `server/voice/`                               |
| 1.5  | `server/activities/` | `server/activities/` (initial; cores not yet) |
| 1.6  | `marketing/terms/`   | `marketing/terms/`                            |

For each step:

1. `git mv`
2. Update root `package.json` `workspaces` and scripts (`-w web` → `-w web`, etc.)
3. Update Vite/TS path aliases (`@shared` → keep alias target under `contracts/`)
4. Update CI path filters and job names if they expose old paths
5. Update docs links that break in-repo navigation
6. Run targeted build/test for that workspace

**Do not yet:** extract paper/crypto; move HLS; move `contracts/games`; create `ops/` or `docs` splits.

**Exit criteria:** `npm ci` + workspace builds for touched parts; smoke `dev:core` if practical.

---

### Stage 2 — Create `ops/` (careful scoop)

**Done when:** ops exists; root is thinner; suites still own their own logic.

Move into `ops/` (prefer subfolders mirroring today):

- `server/ops/scripts/` → `server/ops/scripts/` (or keep `ops/` flat with `server/ops/scripts/` inside)
- `server/ops/infra/` → `server/ops/infra/`
- `server/ops/monitoring/` → `server/ops/monitoring/`
- `server/ops/perf/` → `server/ops/perf/`
- `releases/` → `ops/releases/` only if still needed; otherwise delete obsolete Tauri release docs

**Keep out of ops:**

- Backend/web charter and god-file guards that lint product trees — either stay callable from `server/ops/scripts` but live next to the checked tree, **or** move scripts into `ops/` but keep allowlists/baselines paths correct
- Suite-internal build logic
- Product feature code

Update:

- Root npm scripts that `node server/ops/scripts/...` → `node server/ops/scripts/...`
- Docs that reference `server/ops/scripts/`
- Pre-push / githooks paths

**Optional:** leave `docker-compose.yml` and `ecosystem.config.cjs` at repo root as entrypoints, owned by ops by convention; or move under `ops/` and symlink/document.

**Exit criteria:** `npm run db:up` / documented compose path works; hook scripts resolve; no orphan `server/ops/scripts/` at root.

---

### Stage 3 — Absorb `public/`

**Done when:** no top-level `public/`.

1. Map each asset (e.g. `clients/web/public/vc-activities/`) to **activities** or **web** static roots.
2. `git mv` and update any URL / copy scripts / Vite `publicDir` references.
3. Delete empty `public/`.

**Exit criteria:** grep clean for `public/vc-activities` and old paths; web build still copies needed static files.

---

### Stage 4 — `server/activities/` owns shared game cores

**Done when:** game protocol/cores live under `server/activities/`, not `contracts/`.

1. Move `contracts/games/` (ex-`contracts/games/`) → `server/activities/` (e.g. `server/activities/contracts/` or `server/activities/cores/`).
2. Move `vcActivityCatalog` (and only activity-specific helpers) from contracts → activities if they are not general contracts.
3. Update imports in `clients/web/`, `server/backend/`, `server/activities/` sidecar.
4. Keep wire types that are truly cross-domain in `contracts/` if still required; prefer activities exporting what clients/web/backend need.

**Exit criteria:** no `contracts/games`; activities sidecar + web build/tests for games paths green.

**Note:** Activities **UI** remains under `clients/web/` (and later `clients/apple/`). Do not move Vue activity components into `server/activities/`.

---

### Stage 5 — `server/media/` owns HLS worker

**Done when:** video HLS worker/job code lives under `server/media/`, not `server/backend/`.

1. Inventory HLS worker entrypoints, env vars (`ECHO_*HLS*`, npm `worker:video-hls`), PM2 ecosystem entries.
2. Move worker sources into `server/media/` (e.g. `server/media/hls-worker/` or `server/media/worker-hls/`).
3. Backend keeps only HTTP/domain hooks that enqueue or authorize work; it should not host the worker implementation.
4. Update `ops` PM2/compose and root scripts.
5. Move media signing helpers that are media-only from contracts → `server/media/` only if that does not create circular deps; otherwise keep signing primitives in `contracts/` and implementation in `server/media/`.

**Exit criteria:** worker starts from media package; CI job paths updated; backend package no longer contains HLS worker tree.

**Viewers:** PDF/DOCX **UI** stays in `clients/web/`. Shared decode helpers may later live under `server/media/` if reused; not required in this stage.

---

### Stage 6 — Extract `paper/`

**Done when:** `paper/` is a first-class top-level package/product kit; web hosts it.

1. Move `clients/web/src/features/paper` (+ public share view shell pieces as appropriate) toward `paper/` as a workspace package (e.g. `@echo/paper` or `paper`).
2. Define a narrow **host adapter** API: auth session, uploads, socket bridge, capabilities, navigation chrome.
3. Leave in `clients/web/`: channel type routing, AppLayout paper section wiring, guild RBAC chrome.
4. Backend paper routes stay on **backend** (Echo channel domain) unless/until a later stage; do not pretend paper is a separate auth domain yet.
5. Update docs ADR pointers.

**Exit criteria:** web builds with paper as dependency; paper channel + public share smoke; no deep imports from web features into old paper path.

---

### Stage 7 — Extract `server/backend/crypto/`

**Done when:** E2EE/MLS core lives under `server/backend/crypto/`; clients depend on it.

1. Move `clients/web/src/services/e2ee` and MLS helpers that are crypto-core (not LiveKit UI) into `server/backend/crypto/`.
2. Web (and later apple) import the kit; crypto **settings UX** stays in the client.
3. Ensure no Vue/DOM imports inside `server/backend/crypto/`.
4. Wire voice E2EE join paths to the package.

**Exit criteria:** crypto package typechecks alone; web voice E2EE paths green; `server/backend/crypto/` has no client UI.

---

### Stage 8 — Alias and docs cleanup

**Done when:** newcomers can navigate from README alone.

1. Rewrite root `README.md` with the top-level map and the client-vs-kit rule.
2. Update `AGENTS.md` / `CLAUDE.md` / `docs/overview/*` paths (`frontend` → `web`, etc.).
3. Fix remaining broken links (`rg` for old folder names).
4. Align god-file / charter / placement baselines to new paths.
5. Add a short `docs/overview/repo-layout.md` (or section) stating:
   - UI in clients
   - suites own shared + sidecars
   - ops is glue only
   - docs is narrative

**Exit criteria:** link check / rg for `clients/web/`, `contracts/`, `game-server`, `media-cdn`, `voice-sidecar`, top-level `server/ops/scripts/` is clean (except changelog/history).

---

### Stage 9 — Workspace and CI harden

**Done when:** workspaces and path filters match the new world.

1. Root `workspaces` array = new packages only.
2. CI: path filters per part (`clients/web/**`, `server/backend/**`, `server/media/**`, …).
3. `ci:precheck` script names updated.
4. Optional: `CODEOWNERS` by top-level directory.
5. Confirm GitLab/GitHub mirror docs still accurate (still one monorepo).

**Exit criteria:** full `npm run ci:precheck` green on the branch.

---

### Stage 10 — Merge strategy

**Done when:** structure is on the day-to-day trunk.

1. Rebase/merge onto current `main` in small stage PRs **or** one sequenced merge if the branch was kept linear.
2. Prefer merging **Stage 1–3** first (renames + ops + public), then **4–5** (activities cores + media HLS), then **6–7** (paper + crypto), then **8–9** (docs/CI).
3. After land: delete this plan branch; keep this document as the record under `docs/plans/`.

Per repo policy, day-to-day work returns to **`main`**; do not keep long-lived per-part branches.

---

## Explicit non-goals (this program)

- Multi-repo split
- Git submodules
- Long-lived `web` / `backend` / `media` branches
- Top-level `tests/` directory
- Moving activities **UI** out of `web`
- Moving LiveKit **client** into `server/voice/` (client stays client)
- Rewriting Vue to reduce LOC (separate program)
- Full paper backend extraction to a separate auth domain

## Suggested PR slicing

| PR  | Stages                                                |
| --- | ----------------------------------------------------- |
| A   | 0 + 1.1–1.2 (`web`, `contracts`)                      |
| B   | 1.3–1.6 (server/media/voice/activities rename, terms) |
| C   | 2–3 (`ops`, absorb `public`)                          |
| D   | 4 (`activities` cores)                                |
| E   | 5 (HLS → `media`)                                     |
| F   | 6 (`paper`)                                           |
| G   | 7 (`crypto`)                                          |
| H   | 8–9 (docs + CI harden)                                |

## Progress checklist

- [x] Stage 0 — Prep and inventory
- [x] Stage 1 — Mechanical renames
- [x] Stage 2 — Create `ops/`
- [x] Stage 3 — Absorb `public/`
- [x] Stage 4 — Activities owns game cores
- [x] Stage 5 — Media owns HLS
- [x] Stage 6 — Extract `paper/`
- [x] Stage 7 — Extract `server/backend/crypto/`
- [x] Stage 8 — Alias and docs cleanup
- [x] Stage 9 — Workspace and CI harden
- [x] Stage 10 — Merge to trunk

## Related context

Decisions captured in planning discussion:

- Suites are obvious jobs: media, voice, activities, crypto, paper.
- Explore, safety, Discord import **UI**, settings, etc. stay client-side.
- Viewers UI stay in web; media is the delivery/transcode kit.
- Paper is a second product with its own top-level directory.  
  )
