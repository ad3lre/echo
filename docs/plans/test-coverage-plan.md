# Test coverage plan (Echo)

**Doc refresh:** 2026-05-31 — counts re-counted against the repo.

## Baseline (snapshot)

| Area         | Detail                                                                                                                                                     |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Frontend** | Vitest 3, `src/**/*.test.ts`, Node environment                                                                                                             |
| **Backend**  | Mixed `ts-node` / `tsx` scripts under `src/tests/` (RBAC, unfurl, integrations); GitHub CI runs pipeline/multinode/uploads/RBAC when Postgres is available |
| **E2E**      | Cypress smoke in [`.github/workflows/echo-e2e-ci.yml`](../../.github/workflows/echo-e2e-ci.yml) (`npm run test:e2e`)                                       |
| **Scale**    | **~430** `*.test.ts` files under `frontend/src`; backend **112** files under `backend/src/tests/`                                                          |

Running `npm run test:coverage` in `frontend/` uses `@vitest/coverage-v8`. Reports go to `frontend/coverage/` (gitignored).

Coverage is **scoped to `src/**/\*.ts`** (see `vitest.config.ts`) so `dist/`and`.vue` files do not skew the gate. Local thresholds on that set: **lines/statements 30%**, **functions 60%**, **branches 65%** (`frontend/vitest.config.ts`). CI runs `vitest run`without enforcing coverage thresholds unless`--coverage` is passed.

Backend socket join hardening runs via Vitest in CI: `backend/src/tests/channelHandlers*.test.ts` (included from `frontend/vitest.config.ts`). Security regression suite: `npm run test:security -w backend` (CSRF, upload MIME, profile sanitize, webhooks, bot tokens) — part of `test:ci:backend`.

### Covered areas (high level)

- **Layout / send:** `features/layout/*` tests, `features/chat/sendIntent.test.ts`
- **Utils:** IDs & tokens (`echoIds`, `idTokens`), timestamps & polls, jump/invite/embed parsing, emoji (`emojiUtils`, `twemoji` split), invites & safe URLs, **memberProfiles** (roles, permissions, profiles), **icon** sort/grouping, **transformMocks**, **workspaceSessionCache**, **localProfilePersistence**, **accountValidation**, **serverVanitySlug**, **avatarDisplay** (mocked assets)
- **Composables:** `useChatMessages`, `useChannels`, `usePollVotes`, `useMessageReactions`, `useEmojiData`
- **Services (domain / orchestration / send):** `permissions`, `sendIntent`, `composer`, `presence`, `send` orchestration, `voice` orchestration smoke, `echoClient` API helpers

### Still mostly untested

- `.vue` components, most composables (`useSocket`, stores, API clients), large `useMockData` surface.

## Definition of “healthy”

Coverage is a **signal**, not a goal in isolation. Target:

1. **Instrumented CI** — every PR runs `npm test` and optionally `npm run test:coverage` with artifacts (e.g. LCOV).
2. **Risk-based depth** — high value on chat, IDs, auth-adjacent utils, permission math; lower priority on presentational SFCs until stable.
3. **Ratcheting thresholds** — raise `coverage.thresholds` in `vitest.config.ts` as suites land (avoid blocking at unrealistic % overnight).

## Phases

### Phase A — Pure logic (fast ROI)

Aim for **high line coverage** on:

- `src/utils/` — `echoIds`, `formatTimestamp`, `formatPollTime`, `messageJumpContentParse`, parsers (`inviteLinkParse`, etc.).
- `src/composables/useChatMessages.ts` — author `Map`, unknown author fallback.
- Shared-critical helpers re-exported from `api/echoClient.ts` where cheap to import (e.g. `dedupeRawMessagesById`) _or_ extracted to `utils/` if import graph is heavy.

### Phase B — Realtime / history

- `useSocket`, `useEchoHistory` with mocked Socket.IO and `ref()` state: append, ack, edit, embeds, delete, `loadOlder` / splice merge.

### Phase C — Components

- Add `@vue/test-utils` + `happy-dom` (or `jsdom`); use `environmentMatchGlobs` for component tests.
- Smoke-test **MessageList** grouping, **ChatInput** submit rules, critical modals.

### Backend

- Single `npm run test:unit` (or Vitest) over `src/tests/**/*.test.ts`.
- Add **c8** (or v8 coverage) on that runner; keep slow integrations separate from the coverage gate.

## Commands

```bash
cd frontend
npm test              # vitest run
npm run test:coverage # vitest run --coverage
npm run test:watch    # vitest
```

## Tracking progress

- Bump **thresholds** in `frontend/vitest.config.ts` when global lines increase sustainably.
- Extend this doc with dated milestones (e.g. “2026-03: ~10% lines on `src/**/*.ts`”).
