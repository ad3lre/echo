# Database readiness (snapshot)

**Last aligned with code:** 2026-03-27

## Current state

- **Production path:** **PostgreSQL** via `DATABASE_URL`. The backend refuses to start in production without it.
- **Echo domain:** Tables are defined in `server/backend/src/db/echoTables.ts` (and related modules) and ensured at runtime when a pool exists (`ensureEchoTables` / schema bootstrap). This includes chat, RBAC, moderation, friends, presence, custom emoji packs, **user blocks**, **user reports**, and **DM thread** metadata as implemented in the domain layer.
- **Auth:** User/session tables live alongside Echo in the same DB strategy used by `server/backend/src/auth/` and `server/backend/src/db/` (see auth store and migrations/scripts under `server/backend/src/db/`).
- **Development:** Optional **in-memory mock DB** when `ECHO_BACKEND_STORAGE=memory` — **not** for production; mock REST routes are dev-only.

## Planning note

There is no separate “future database” in this doc — schema evolution follows product features (see [`ECHO_CONTRACT_V1.md`](../../contracts/ECHO_CONTRACT_V1.md) and [`STATUS_AND_PRODUCTION_READINESS.md`](../../reviews/STATUS_AND_PRODUCTION_READINESS.md)). For snowflake migration and cutover, use [`../../operations/runbooks/snowflake-cutover.md`](../../operations/runbooks/snowflake-cutover.md). SQL style and guardrails: [`database-rules.md`](../../infra/database/database-rules.md).
