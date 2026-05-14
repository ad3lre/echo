# Executive plan: remove mock vs real as a runtime concept

**Goal:** One system, one identity model, one data path. Mock becomes **dev-only tooling** (fixtures, local scripts, optional secondary app), not a **compile-time or env-selected alternate product** running inside the same production binary.

**Why now:** Dual reality is the largest source of permission drift, socket semantics drift, and “works on my machine” failures (`[STATUS_AND_PRODUCTION_READINESS.md](../../reviews/STATUS_AND_PRODUCTION_READINESS.md)`).

### Implementation status (2026-03)

| Phase                                                                                       | Status                                                                                                               |
| ------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| **A** — Production `DATABASE_URL` required; mock routes only in non-prod + `ALLOW_MOCK_API` | **Done**                                                                                                             |
| **B** — Remove `legacy_ephemeral` / `ALLOW_LEGACY_SOCKET_CHANNELS`                          | **Done**                                                                                                             |
| **C** — Production frontend: `USE_MOCK_DATA` always false                                   | **Done**                                                                                                             |
| **D** — Single workspace provider; no mock branches in source                               | **Partial** — `npm run seed:dev` for real API seeding; `useMockData` / `AppLayout` branches remain for **local dev** |
| **E** — CI + docs                                                                           | **Done** — `npm run check:echo-single-reality`, contract/stack/status updates                                        |

---

## North-star outcomes

| Principle              | Target state                                                                                                                                                                                                            |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Single truth**       | All production traffic assumes **Postgres + Echo APIs + persisted socket path** only.                                                                                                                                   |
| **Boot policy**        | **No `DATABASE_URL` ⇒ process does not start** in `NODE_ENV=production` (and ideally in staging).                                                                                                                       |
| **No mixed mode**      | No code path where “sometimes mock API, sometimes Echo” is selected by env in one deployed artifact.                                                                                                                    |
| **Mock is not a mode** | “Mock” = **seed scripts**, **test fixtures**, **optional demo sub-package**, or **Storybook/Cypress data** — not toggling core semantics via `VITE_USE_MOCK_DATA` / `USE_MOCK_DB` / implicit `DATABASE_URL` heuristics. |
| **Sockets**            | **One** message pipeline: persisted Echo channels only; **no** `legacy_ephemeral` branch in production builds (remove flag + dead path).                                                                                |

---

## Current coupling (inventory)

These are the main levers today; all must be retired or confined to non-shipped tooling.

**Backend**

- `backend/src/config.ts` — canonical backend storage mode via `**ECHO_BACKEND_STORAGE=memory|postgres`**; `allowMockApi`; production requires `**ECHO_BACKEND_STORAGE=postgres**`+`**DATABASE_URL\*\*`.
- `backend/src/api/routes/mock.ts` + conditional registration in `routes/index.ts` — `/api/v1/mock/*` (dev only).
- `backend/src/db/mockdb.ts` — in-memory canonical mock.
- `backend/src/sockets/echoMessageFlow.ts` — `**echo_persisted` | `reject_unknown` only\*\* (legacy removed).

**Frontend**

- `frontend/src/config.ts` — `USE_MOCK_DATA` / `IS_REAL_API_MODE` from `VITE_USE_MOCK_DATA`.
- `frontend/src/echoMode.ts` — blocks Echo REST in mock mode.
- `frontend/src/api/mock.ts` — client for `/api/v1/mock/*`.
- `frontend/src/composables/useMockData.ts` — large workspace state + mock seeding; `AppLayout.vue` branches vs `hydrateEchoFromApi`.
- Wider net: `useMockData()` consumers (`AppLayout`, `ServerSettingsModal`, `ChannelPanel`, DM/settings flows, `createEchoPlatform.ts`).

**Contract / docs**

- `[ECHO_CONTRACT_V1.md](../contract/ECHO_CONTRACT_V1.md)` — documents dual-world rules; update when mock is dev-only.

---

## Phased program (executive view)

### Phase 1 — **Production hard gate (backend)** — _highest leverage, smallest UX risk_

**Do:** In `NODE_ENV=production`, require `DATABASE_URL`, force `useMockDb === false`, and **do not register** mock routes (or register a single `410 Gone` handler for `/api/v1/mock/*` during a deprecation window).

**Do:** Same for any hosted **staging** environment you treat as production-like.

**Stop:** Relying on “no DATABASE_URL” as an implicit dev default for real app processes.

**Success criteria:** A misconfigured deploy **fails immediately** at boot with a clear log line — not at first user request.

**Effort:** Small (config + route registration + tests).

---

### Phase 2 — **Production frontend: one bundle, one API**

**Do:** Production build **always** targets Echo + auth APIs. Remove `VITE_USE_MOCK_DATA` from the **production** env surface (treat as always false in shipped builds, then delete branches).

**Do:** Replace `assertEchoApiAllowed` / mock guards with **no-op in prod** after branches are gone (or delete `echoMode.ts` entirely).

**Interim (optional):** Keep a **separate** Vite config entry `demo-standalone` that builds a **different** artifact for internal UI demos only — never deployed to user-facing prod. That preserves pixel demos without dual runtime in the main app.

**Success criteria:** Grep of production bundle (or `import.meta.env.PROD` paths) shows **no** `/api/v1/mock` and **no** `USE_MOCK_DATA` branching in shell layout/chat.

**Effort:** Medium (many call sites, but mechanical once strategy is fixed).

---

### Phase 3 — **Collapse workspace state: one provider**

**Do:** Extract a narrow `**WorkspaceState`** interface (servers, channels, selection, refresh hooks) implemented by **one\*\* production implementation backed by Echo REST + stores.

**Do:** Move today’s mock seeding into:

- **E2E/Cypress:** network stubs or Postgres seed SQL; or
- `**npm run seed:dev`\*\* hitting real APIs after local DB migrate; or
- **Optional** `packages/echo-demo` that imports shared **types** only, not the full app shell.

**Retire:** `useMockData()` as the default provider in `App.vue` / `createEchoPlatform.ts` for anything that ships to users.

**Success criteria:** `AppLayout.vue` has **no** `isMockDataMode` branches for hydrate, send, or identity — only “authenticated vs logged-out empty state.”

**Effort:** Large (core of the dual world lives here).

---

### Phase 4 — **Sockets: delete legacy ephemeral reality**

**Do:** Remove `ALLOW_LEGACY_SOCKET_CHANNELS` and the `legacy_ephemeral` branch from `echoMessageFlow` (and tests that depended on it). Unknown channel ⇒ always `UNKNOWN_CHANNEL` / reject join, in **all** environments.

**Do:** Local dev uses **only** DB-backed channel ids (create server/channel via API or seed script).

**Success criteria:** Socket contract has **one** persistence story; no env toggles for “broadcast without row.”

**Effort:** Small–medium (touch handler + tests + `.env.example`).

---

### Phase 5 — **Tests and CI: Postgres, not mock DB**

**Do:** All Echo integration tests (`test:echo:pipeline`, RBAC, messaging) already assume Postgres in CI — extend that rule: **no `ECHO_BACKEND_STORAGE=memory`** for tests that assert Echo behavior.

**Do:** Unit tests that need pure functions import **fixtures** from files, not `mockdb` singleton as “the server.”

**Success criteria:** CI config never spins “mock-only” backend for Echo suites; `mockdb` usage is limited to **explicit** unit tests of mock handlers (until those handlers are deleted).

**Effort:** Small ongoing discipline.

---

### Phase 6 — **Deprecation, cleanup, documentation**

**Do:** Delete legacy env vars from `.env.example`: `USE_MOCK_DB` (and document mock under `ECHO_BACKEND_STORAGE=memory`); keep `ALLOW_MOCK_API` as dev-only.

**Do:** Update `[STACK.md](./STACK.md)`, `[ECHO_CONTRACT_V1.md](../contract/ECHO_CONTRACT_V1.md)`, `[STATUS_AND_PRODUCTION_READINESS.md](../STATUS_AND_PRODUCTION_READINESS.md)`, runbooks.

**Do:** Add `**npm run doctor`\*\* or startup log line: prints effective `database: connected`, `mock routes: disabled`.

**Success criteria:** New contributors cannot accidentally enable dual mode from a copy-paste `.env`.

**Effort:** Small.

---

## What we are _not_ trying to do in v1 of this program

- **Remove all test doubles** — mocks/stubs in **unit tests** stay; we remove **runtime** dual product behavior.
- **Delete `shared/` demo fixtures** immediately — they can remain as **data** for seeds; they must not select runtime mode.
- **Solve horizontal scale** — related but separate; this plan removes **semantic** fork, not **infrastructure** fork.

---

## Risks and mitigations

| Risk                                | Mitigation                                                                                                                                                         |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Local onboarding gets harder**    | One-command `docker compose up` + `npm run migrate` + `npm run seed:dev`; document in README.                                                                      |
| **Big-bang merge conflicts**        | Phase 1–2–4 can ship incrementally; Phase 3 is the heavy lift — feature-flag **internal** “single provider” until parity, but **do not** expose env to production. |
| **Demo/marketing need a pretty UI** | Separate **demo build** artifact or recorded video; not production bundle flags.                                                                                   |
| **Regressions in permission UI**    | After Phase 3, run RBAC + pipeline tests; add one E2E “login → see server → send message” on real DB.                                                              |

---

## Success metrics (how you know you’re done)

1. **Production** backend exits on boot without `DATABASE_URL`; **no** mock route registration.
2. **Production** frontend build contains **no** branch on `VITE_USE_MOCK_DATA` / `USE_MOCK_DATA`.
3. **No** `ALLOW_LEGACY_SOCKET_CHANNELS` in codebase (or only in git history).
4. **Contract doc** describes a **single** world; dual-world section removed or historical.
5. **Optional:** CI job `rg` fails if `USE_MOCK_DB` appears outside an allowlist (`docs/`, `scripts/seed`, `**/tests/`\*\*).

---

## Suggested sequencing (quarters / slices)

| Slice | Phases | Outcome                                                                 |
| ----- | ------ | ----------------------------------------------------------------------- |
| **A** | 1 + 4  | Backend and sockets can’t pretend to be two products; deploy safety up. |
| **B** | 2      | Frontend prod artifact is Echo-only.                                    |
| **C** | 3      | Most bug class removed — one workspace provider, one hydrate path.      |
| **D** | 5 + 6  | Tests, docs, env hygiene locked.                                        |

**Order rationale:** A stops new prod misconfig; B stops client-side mode confusion; C removes the largest source of hidden branches; D makes the change permanent.

---

_Owner: engineering lead + one “branch sheriff” for Phase 3 grep/review. This plan is execution-oriented; it does not replace task-level tickets._
