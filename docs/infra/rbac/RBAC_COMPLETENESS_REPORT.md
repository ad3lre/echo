# Echo RBAC: completeness report

This document compares the **implemented codebase** against the RBAC mental model (merged permissions, overwrites, traces, and policy helpers exercised in CI).

It is a snapshot of the repository.

**Platform context (2026-03):** Production backend **requires Postgres** (`DATABASE_URL`); RBAC evaluation always runs against the real Echo schema in that mode. CI includes **`check:echo-single-reality`** alongside existing RBAC guards. This report is unchanged in **engine** status; only deployment/runtime assumptions around mock are tighter.

**Document refresh (2026-04-03):** Reconciled with `main`; **no RBAC engine or enforcement surface changes** in this refresh. Friends, presence, and socket scaling are **out of scope** here — see [`STATUS_AND_PRODUCTION_READINESS.md`](../../reviews/STATUS_AND_PRODUCTION_READINESS.md).

**Document refresh (2026-04-03, follow-up):** Cross-check only — **RBAC sections unchanged.** Repo-wide “completeness” scorecard (`docs/reviews/STATUS_AND_PRODUCTION_READINESS.md`) was updated to reflect **frontend theme-system closure** (Stylelint + ESLint; grep script removed); that work does not alter RBAC claims in this file.

**Document refresh (2026-04-03, search):** Cross-check only — **RBAC engine and enforcement claims in this file are unchanged.** **Message search** shipped on `main` as a separate vertical: Postgres-backed `GET …/messages/search` (server- and channel-scoped), membership via `canUserAccessChannel`, rate limits, Prometheus histograms, contract text in [`ECHO_CONTRACT_V1.md`](../../contracts/ECHO_CONTRACT_V1.md), pipeline integration coverage for **403** on non-member, and frontend server mode + jump-to-message prefetch. That is **not** RBAC surface area beyond normal channel access checks; see the production readiness scorecard for Horizon A/B impact.

**Document refresh (2026-04-03, uploads / presign):** **`POST /uploads/presign`** gates reuse existing **permission and policy helpers** (no change to merge engine, traces, or overwrite evaluation). **Channel-scoped** chat uploads call **`canUserPostMessage`** (guild + DM-safe). **Server icon/banner** presign uses **`hasServerPermission(…, 'MANAGE_GUILD')`** from [`echoPolicy.ts`](../../../server/backend/src/domain/echoPolicy.ts). **Custom emoji** image presign uses **`canManageServerEmojis`** (merged permissions + owner bypass in [`emojiLibrary.ts`](../../../server/backend/src/domain/echoStore/emoji/emojiLibrary.ts)). The **legacy** body shape with **`serverId`** only still uses **`isMemberOfServer`** for chat-shaped uploads. **User avatar/banner** presign is **authenticated user only** (no role fold). See [`ECHO_CONTRACT_V1.md`](../../contracts/ECHO_CONTRACT_V1.md) and [`STATUS_AND_PRODUCTION_READINESS.md`](../../reviews/STATUS_AND_PRODUCTION_READINESS.md) for product-level upload status.

**Document refresh (2026-03-27):** Cross-check with repo — **engine and enforcement claims below unchanged.** [`STATUS_AND_PRODUCTION_READINESS.md`](../../reviews/STATUS_AND_PRODUCTION_READINESS.md) was updated for **Option A login JSON** (no tokens in body), **Admin/Moderator seeding** on server create, **OTEL optional** via `OTEL_EXPORTER_OTLP_ENDPOINT`, and **upload presign job** in default backend CI.

---

## Executive summary

| Area                                                                                             | Status                                                                                                                                                                                                           |
| ------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Core merge semantics (Option A, boolean writes, sort order)                                      | **Implemented** and documented in-repo                                                                                                                                                                           |
| No-bypass enforcement for RBAC primitives                                                        | **Implemented** (`server/ops/scripts/check-echo-rbac-primitives.mjs`)                                                                                                                                            |
| Explicit evaluation contract boundary (build / execute)                                          | **Implemented** (`buildEvaluationPlan` / `executeEvaluationPlan` in `echoPermissionEvaluate.ts`)                                                                                                                 |
| Persist full permission matrix & create roles                                                    | **Implemented** (POST/PATCH `…/roles`, PUT `…/roles/order`, `createEchoRole`, `updateEchoRole`, `replaceEchoServerRoleOrder`; role `**hoist`\*\*)                                                                |
| Standardized dropdowns (EchoDropdown)                                                            | **Implemented** (EchoDropdown enhanced + server settings replaced native selects)                                                                                                                                |
| Permission preview for other users (searchable)                                                  | **Implemented** (preview user dropdown + `targetUserId` param)                                                                                                                                                   |
| Three-layer pipeline (server, category, channel)                                                 | **Implemented** (storage + evaluation)                                                                                                                                                                           |
| Per-target channel/category overwrite rows (everyone / role / member)                            | **Implemented** (`echo_*_permission_overwrite_rows`, plan-time merge, `GET`/`PUT` …`/permission-overwrites`; legacy JSONB fallback)                                                                              |
| Traces + compose-only explanation                                                                | **Implemented** (full vs compressed; `composePermissionExplanation`)                                                                                                                                             |
| In-process permission cache + invalidation hooks                                                 | **Implemented** (documented contract + generation counter + mutation hooks)                                                                                                                                      |
| Enforcement / compat appendix                                                                    | **Implemented** ([`permission-compat.md`](./permission-compat.md), `npm run check:echo-rbac`)                                                                                                                    |
| API + basic UX for explanation                                                                   | **Implemented** (`permission-explain`, Roles tab preview)                                                                                                                                                        |
| Perf at scale (sort skip, ADMIN sentinel, writes-only layer, trace batching)                     | **Implemented** (see Performance section)                                                                                                                                                                        |
| Presign / upload authorization (channel post, `MANAGE_GUILD`, emoji manage, legacy member)       | **Implemented** — reuses `canUserPostMessage`, `hasServerPermission`, `canManageServerEmojis`, `isMemberOfServer` ([`echoUploads.ts`](../../../server/backend/src/api/routes/echo/uploads.ts)); engine unchanged |
| Rich UX (diff, timeline, audit surfaces for RBAC)                                                | **Minimal / not implemented**                                                                                                                                                                                    |
| Plan-pure reducer (separate merge traces per layer, `applyLayer` only on merged maps everywhere) | **Partially** (see deviations)                                                                                                                                                                                   |

Overall: **the RBAC engine is functionally 100% aligned with the plans for correctness, explainability, and hot-path performance at Echo's current scale.** Remaining work is mostly **richer product UX** and optional **representation changes** for extreme-scale scenarios — not "missing basic RBAC."

---

## What the plans asked for vs what exists

### 1. Mental model: `state_{i+1} = applyLayer(state_i, mergedLayerInput_i)`

**Implemented (behaviorally).**

- **state_0:** `foldRolePermissions` over member roles (+ `@everyone` fallback when unassigned), `[echoPermissionEvaluate.ts](../../../server/backend/src/domain/permissions/echoPermissionEvaluate.ts)` + `[echoPermissionPrimitives.ts](../../../server/backend/src/domain/permissions/echoPermissionPrimitives.ts)`.
- **Category / channel:** Each layer uses a merged partial passed to `applyLayerFromPartialObject`. **When** `[echo_category_permission_overwrite_rows` / `echo_channel_permission_overwrite_rows](../../../server/backend/src/db/echoTables.ts)` contain rows for that category/channel, `[buildEvaluationPlan](../../../server/backend/src/domain/permissions/echoPermissionEvaluate.ts)` loads them, filters/sorts for the current user via `[permissionOverwriteMerge.ts](../../../server/backend/src/domain/permissions/permissionOverwriteMerge.ts)`, `**mergeOverrideRows`** (`presorted: true`), and passes the result to `**executeEvaluationPlan**`. **When no rows exist**, the evaluator falls back to legacy **single\*\* JSON blobs (`echo_category_permission_overrides` / `echo_channels.permission_overrides`) — same partial for every member on that path.

**Note:** The diagram’s “merge rows then applyLayer” path is now **live** for channels/categories that use overwrite row tables. Legacy-only storage is still “pre-merged blob, no per-member split.”

### 1b. Presign and object storage (enforcement only)

Upload authorization is **not** a fourth permission layer; it calls the same **exported helpers** used elsewhere:

| Presign scope                 | Authorization helper                     | Notes                                                                               |
| ----------------------------- | ---------------------------------------- | ----------------------------------------------------------------------------------- |
| Chat media (`channelId`)      | `canUserPostMessage`                     | Aligns with socket message insert; DM channels included.                            |
| Server icon / banner          | `hasServerPermission(…, 'MANAGE_GUILD')` | Owner still passes via merged perms + role seed; same as server preferences writes. |
| Custom emoji image            | `canManageServerEmojis`                  | Expresses `MANAGE_GUILD` / `MANAGE_GUILD_EXPRESSIONS` (+ owner).                    |
| Legacy chat (`serverId` only) | `isMemberOfServer`                       | Deprecated path; no DM correctness guarantee if clients misuse it.                  |
| User avatar / banner          | Authenticated user                       | No `evaluatePermissionSet` call.                                                    |

**Gap vs strict RBAC “one front door”:** Presign does not invoke `evaluatePermissionSet` directly; it uses the **same** store/policy functions the REST and socket layers already depend on. Tightening further (e.g. single wrapper API for “all upload checks”) would be a refactor, not a semantic fix.

### 2. Option A (ordered fold, last write per bit, no deny-priority pass)

**Implemented.**

- Sort: `sortRolesForFold` — single canonical implementation; guarded by `[scripts/check-echo-rbac-primitives.mjs](../../../server/ops/scripts/check-echo-rbac-primitives.mjs)`.
- Writes: boolean-only; partial JSON semantics in [`permission-compat.md`](./permission-compat.md) and primitives.

### 3. `ADMINISTRATOR` as allow-all merge input before fold

**Implemented** in `foldRolePermissions` via lazy sentinel — defers full-set materialization until a non-admin role follows or fold ends.

### 4. Owner / system bypass before pipeline

**Implemented** at the start of `evaluatePermissionSet` (owner then full allow + trace stub; no server fold).

### 5. In-band traces + `PermissionExplanation = compose(traces)` only

**Implemented with caveats.**

- **Types and emission:** `[echoPermissionTrace.ts](../../../server/backend/src/domain/permissions/echoPermissionTrace.ts)`; server fold emits in-band; category/channel layer applies emit in **full** mode via `applyLayerFromPartialObject` options.
- **Compressed (default for prod paths):** final provenance per bit via `recordCompressedSource` / `finalizeCompressed` — not a full overwrite chain. ADMIN + owner use batched helpers (`recordCompressedBulkAdmin`, `recordCompressedBulkOwner`).
- **Full (debug):** ADMIN roles emit a single `bit: '*'` event (not |bits| events); layer steps append to the same full array, then `composePermissionExplanation` aggregates — **no second evaluator**.

**Gap vs literal plan diagram:** The plan shows **separate** `trace_0`, `traceCat`, `traceCh`. The implementation composes **one** primary `ServerAggregationTrace` chunk for the fold path (plus owner trace when applicable), not three independent trace objects for merge sub-phases. Functionally sufficient for explanation; **not** a separate "merge trace" artifact per layer.

### 6. Unified entry: `evaluatePermissionSet`; `getMergedRolePermissions` / channel effective

**Implemented.**

- [`echoStore` barrel](../../../server/backend/src/domain/echoStore/index.ts) (`getMergedRolePermissions` / `getEffectiveChannelPermissions` in [`permissions.ts`](../../../server/backend/src/domain/echoStore/roles/permissions.ts)) delegates both to `evaluatePermissionSet` inside [`echoPermissionCache`](../../../server/backend/src/domain/permissions/echoPermissionCache.ts).

### 7. Category layer storage and API

**Implemented.**

- Table: `echo_category_permission_overrides` in `[echoTables.ts](../../../server/backend/src/db/echoTables.ts)`.
- Mutations: `updateEchoCategoryPermissionOverrides` in [`echoStore/roles/permissionOverwrites.ts`](../../../server/backend/src/domain/echoStore/roles/permissionOverwrites.ts); REST `PATCH .../category-permission-overrides` in `[echo.ts](../../../server/backend/src/api/routes/echo.ts)`.

### 8. Cache contract

**Implemented (documented).**

- `[echoPermissionCache.ts](../../../server/backend/src/domain/permissions/echoPermissionCache.ts)` documents key shape, invalidation triggers, and `**getEchoPermissionCacheGeneration`\*\* (increment on invalidate for observability; eviction remains prefix-based).

**Not implemented:** Sparse invalidation (e.g. only affected user/channel keys) — still full server prefix delete.

### 9. Tests (goldens, partial JSON, import fixture)

**Mostly met (unit/golden coverage present; integration gap remains).**

- `[echo.rbac.perms.test.ts](../../../server/backend/src/tests/permissions/echo.rbac.perms.test.ts)`, `[echo.rbac.goldens.test.ts](../../../server/backend/src/tests/permissions/echo.rbac.goldens.test.ts)` + `[fixtures/permission-old-partial.json](../../../server/backend/src/tests/fixtures/permission-old-partial.json)`.
- `[echo.permissionOverwriteMerge.test.ts](../../../server/backend/src/tests/permissions/echo.permissionOverwriteMerge.test.ts)` — everyone / role / member row ordering and merge smoke.
- Added small unit assertions for permission normalization and extended keys.
- `[echo.rbac.bench.ts](../../../server/backend/src/tests/permissions/echo.rbac.bench.ts)` — synthetic benchmark for fold + layer at 500–1000 roles.
- **Remaining gap:** No automated integration test that runs **full `evaluatePermissionSet` against PostgreSQL** for cross-layer category + channel in one end-to-end suite.

### 10. UX surfaces (plan / gap doc)

**Partially met.**

- **Done:** Server Settings, Roles, **Permission preview** (`[ServerSettingsPermissionPreviewSection.vue](../../../clients/web/src/features/server-settings/components/ServerSettingsPermissionPreviewSection.vue)`) with searchable "Preview as" dropdown and standardized `EchoDropdown` usage across server settings, `GET /servers/:id/permission-explain`, `[fetchEchoPermissionExplain](../../../clients/web/src/api/echoClient.ts)`.
- **Not done:** Dedicated **diff**, **timeline**, **intent buckets**, or **audit-log UI** wired specifically to RBAC explanation payloads (audit log exists for general server actions, not a full "permission timeline" product).

### 11. Phase / file table from `echo_rbac_completion` ("Files" section)

| Plan file                  | Status                                                                                                                                                                     |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Compatibility + Option A   | [`permission-compat.md`](./permission-compat.md)                                                                                                                           |
| `aggregateServerRoles`     | `[aggregateServerRoles.ts](../../../server/backend/src/domain/permissions/aggregateServerRoles.ts)` re-exports primitives (logic remains in `echoPermissionPrimitives.ts`) |
| `mergeOverrideRows.ts`     | Present                                                                                                                                                                    |
| `permissionLayers.ts`      | Present (`applyLayer` on merged boolean map)                                                                                                                               |
| `permissionExplanation.ts` | Present (`compose` only)                                                                                                                                                   |
| Golden tests               | Present (see above)                                                                                                                                                        |

---

## Gap-analysis plan (`rbac_plan_gap_analysis`): item-by-item

Items that were **pending** in that document are addressed in code **unless** noted here:

| Original gap                                           | Resolution                                                                                   |
| ------------------------------------------------------ | -------------------------------------------------------------------------------------------- |
| Compat doc + enforcement                               | [`permission-compat.md`](./permission-compat.md), `npm run check:echo-rbac`                  |
| `mergeCategoryOverrideRows` / channel                  | Implemented in `mergeOverrideRows.ts`; eval uses stored merged JSON                          |
| `foldRolePermissions` + traces                         | Implemented                                                                                  |
| Category layer                                         | Table + eval + PATCH                                                                         |
| `evaluatePermissionSet` + owner first                  | Implemented                                                                                  |
| `permissionExplanation` + compose                      | Implemented                                                                                  |
| Cache docs + generation                                | Implemented                                                                                  |
| Goldens + old partial fixture                          | Implemented                                                                                  |
| UX (preview etc.)                                      | Preview + API; searchable preview & standardized EchoDropdown usage; diff/timeline not built |
| Perf (sparse fold, dirty masks, pre-sort, writes-only) | **Largely addressed** (see next section)                                                     |

---

## Performance and scale

The following optimizations are implemented:

1. **Sort skip (`presorted`):** `foldRolePermissions` and `mergeOverrideRows` accept a `presorted` flag. `evaluatePermissionSet` passes `presorted: true` because its SQL query already orders by `(position ASC, id ASC)`, eliminating a redundant O(R log R) sort on every evaluation.
2. **ADMIN sentinel:** When a role carries `ADMINISTRATOR`, the fold records it as a sentinel instead of immediately materializing a full permission set per-bit. If the fold ends on the sentinel (no later non-admin role), the frozen `FULL_PERMISSION_SET` is returned directly. If a non-admin role follows, materialization happens once. Consecutive admin roles only update the sentinel role-id for trace provenance.
3. `**applyLayerFromPartialObject` iterates writes only:\*\* The function loops over `Object.keys(obj)` intersected with the allowed set instead of scanning the full `allKeys` array — O(writes), not O(|enum|).
4. **Compressed trace batching:** `recordCompressedBulkAdmin` and `recordCompressedBulkOwner` fill provenance for admin roles and owner bypass in one pass with direct `Map.set` calls, replacing per-bit `recordCompressedSource` overhead.
5. **Full-mode trace for ADMIN:** Emits a single `bit: '*'` event per admin role instead of |bits| individual events. Consumers of full traces should handle the wildcard `'*'` bit field.
6. **Auth hot paths are compressed-only:** `getMergedRolePermissions` and `getEffectiveChannelPermissions` always pass `traceMode: 'compressed'`. Full traces are reserved for the explicit `permission-explain` debug endpoint.
7. **In-process cache:** Mitigates repeated evaluation per `(serverId, userId, channelId?)`.

### Remaining dense areas

- **Non-admin fold per-bit iteration:** Each non-admin role still scans the full enum (absent string = false). True O(actual_writes) would require a representation change (boolean map or sparse grant list in DB).
- **Cross-layer dirty bit mask:** Not implemented — layers apply only to keys present in the override object, which is already O(writes), so the practical benefit is marginal at current enum size.
- **Pre-sorted override rows:** Applicable overwrite rows are ordered in application code (`orderOverwriteRowsForMember`) before `mergeOverrideRows(..., { presorted: true })` — no extra sort inside merge for that path.

---

## Risks called out in plans — status

| Risk                                        | Status                                                                                                              |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Option A mixed with deny-priority           | Not implemented (still Option A only)                                                                               |
| Trace reconstructed without computation     | Avoided: traces emitted in-band; compose does not re-evaluate                                                       |
| Non-boolean "writes"                        | Normalized at boundaries where implemented; role arrays are string lists (fold interprets presence/absence per bit) |
| Fold order inverted elsewhere               | Mitigated by single sort + check script                                                                             |
| Unknown bits defaulting allow/deny at merge | Layered JSON applies only known keys in `allKeys`; inheritance for missing keys                                     |

---

## Suggested next steps (if prioritizing)

1. **Representation:** Sparse boolean map for role permissions (enables writes-only fold for non-admin roles).
2. **Purity:** Optional separate trace streams for category vs channel merge if product needs audit-grade separation.
3. **UX:** Diff vs previous explain snapshot, timeline view, stronger audit filtering for permission events.
4. **Tests:** Integration test: `evaluatePermissionSet` with real DB for server + category + channel chain.

---

## File index (implementation touchpoints)

| Concern                     | Primary files                                                                                                                                                                                                                                                                     |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Fold + layers               | `server/backend/src/domain/permissions/echoPermissionPrimitives.ts`, `permissionLayers.ts`, `mergeOverrideRows.ts`, `permissionOverwriteMerge.ts`                                                                                                                                 |
| Evaluation                  | `server/backend/src/domain/permissions/echoPermissionEvaluate.ts`, `server/backend/src/domain/echoStore/roles/permissions.ts` (barrel: `echoStore/index.ts`)                                                                                                                      |
| Overwrite row storage + API | `server/backend/src/db/echoTables.ts` (`echo_*_permission_overwrite_rows`), `server/backend/src/domain/echoStore/roles/permissionOverwrites.ts` (`replaceEcho*PermissionOverwrites`, list helpers), `server/backend/src/api/routes/echo.ts` (`permission-overwrites`)             |
| Traces                      | `server/backend/src/domain/permissions/echoPermissionTrace.ts`                                                                                                                                                                                                                    |
| Explanation                 | `server/backend/src/domain/permissions/permissionExplanation.ts`                                                                                                                                                                                                                  |
| Cache                       | `server/backend/src/domain/permissions/echoPermissionCache.ts`                                                                                                                                                                                                                    |
| Schema                      | `server/backend/src/db/echoTables.ts`                                                                                                                                                                                                                                             |
| API                         | `server/backend/src/api/routes/echo.ts`                                                                                                                                                                                                                                           |
| Presign (RBAC/policy hooks) | `server/backend/src/api/routes/echo/uploads.ts` (`canUserPostMessage`, `hasServerPermission`, `canManageServerEmojis`, `isMemberOfServer`)                                                                                                                                        |
| Client + UI                 | `clients/web/src/api/echoClient.ts`, `ServerSettingsPermissionPreviewSection.vue`, `clients/web/src/components/EchoDropdown.vue`, `clients/web/src/features/server-settings/components/ServerSettingsModal.vue`, `clients/web/src/features/server-settings/roleManagerFactory.ts` |
| Docs + guardrails           | [`permission-compat.md`](./permission-compat.md), `server/ops/scripts/check-echo-rbac-primitives.mjs`, root `package.json` `check:echo-rbac`                                                                                                                                      |
| Benchmarks                  | `server/backend/src/tests/permissions/echo.rbac.bench.ts`                                                                                                                                                                                                                         |
