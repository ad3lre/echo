# Snowflake public id cutover (maintenance runbook)

This runbook matches ADR `docs/adr/002-echo-public-snowflake-ids.md` and the execution plan for Echo graph ids (servers, categories, channels, roles, messages, friendships, audit row ids, permission overwrite row ids). **`auth_users.id` stays UUID-shaped.**

## Preconditions

- Full logical backup or snapshot of Postgres; tested restore on a clone.
- Application build that includes: `echoMessagesDal` (`ORDER BY id` history), snowflake generators, frontend `isEchoGraphId` / `isEchoPublicId`.
- **`SNOWFLAKE_WORKER_ID`** (0–31) unique per backend writer process; **`SNOWFLAKE_DATACENTER_ID`** if you use non-default DC bits.
- Migration tool worker: optional **`MIGRATION_SNOWFLAKE_WORKER_ID`** (default `0`) for `migrateEchoIdsToSnowflake.ts` (use a dedicated id; do not collide with live app generators during cutover).

## Timeline semantics

After cutover, **message feed order is `id`**, not `created_at`. `created_at` remains for moderation, analytics, and slowmode wall-clock intervals; it is **not** the chat timeline authority. CI runs **`npm run check:echo-snowflake`** (DAL allowlist, no `ORDER BY created_at` in `echoMessagesDal`, and no `echo_messages` SQL templates that sort by `created_at`).

### Watching `created_at` vs `id` drift (docs + code review)

**Drift** means any production path that **sorts or pages messages by `created_at`** (or uses `created_at` as the primary cursor) while clients and other APIs assume **`id`** order. Symptoms: replies or jump-to-message land on the “wrong” neighbor, infinite scroll duplicates or gaps, and inconsistent ordering between REST and Socket.IO.

**Review checklist:** (1) New **`echo_messages`** reads go through the allowed DAL / shared list helpers — no ad-hoc SQL with `ORDER BY created_at` on feeds. (2) Docs and comments that describe “newest message” use **`id`**, not “latest `created_at`”. (3) Imports or backfills that set `created_at` ≠ mint time are OK **only** if feeds still use **`id`** everywhere. **ADR:** [002-echo-public-snowflake-ids.md](../../adr/002-echo-public-snowflake-ids.md) (_Message ordering_ and _created_at vs id_).

## Load-test / production-shaped clone (before cutover)

- Restore a **recent backup** into a staging database (same Postgres major version as prod).
- Run **`npm run check:echo-snowflake`** against the repo revision you will deploy.
- **Dry-run** the migrator and capture row counts / timing from logs:  
  `DATABASE_URL=... npx ts-node server/backend/src/scripts/migrateEchoIdsToSnowflake.ts`
- If a single-server transaction risks **long locks or WAL spikes**, use **per-channel message commits** (same script, same maps; messages commit channel-by-channel after structure/roles):  
  `DATABASE_URL=... npx ts-node src/scripts/migrateEchoIdsToSnowflake.ts --execute --commit-per-channel-messages`  
  or `MIGRATION_COMMIT_MESSAGES_PER_CHANNEL=1`.
- Optional: watch `pg_stat_progress_*` / `pg_wlm` / disk during execute on the clone; compare wall time to your maintenance window.

## Steps

1. **Freeze traffic** (maintenance page or stop app workers) so no writes race the migration.
2. **Dry-run** on a clone (see above).
3. **Execute** on production (from `server/backend/` with deps installed):  
   `DATABASE_URL=... npx ts-node src/scripts/migrateEchoIdsToSnowflake.ts --execute`  
   Add `--commit-per-channel-messages` if the clone dry-run suggested oversized single transactions.
4. The script sets `session_replication_role = replica` while rewriting PK/FK text ids; your role must be allowed to set it.
5. **Deploy** backend + frontend together (same release as id-ordered list API + snowflake minting).
6. Optional: **`CLUSTER echo_messages`** on `(channel_id, id)` during a further window if the planner benefits on large tables (measure locks).
7. **Monitor** Prometheus: `echo_snowflake_generator_wait_next_ms_total`, `echo_snowflake_generator_sequence_observed`, message persist errors.

## Rollback

Restore the pre-migration snapshot; redeploy the previous app build. Partial reruns are not supported without a fresh map—treat migration as single-shot.

## Verification

- Spot-check: newest messages in a channel sort by numeric id; jump links and replies resolve.
- Query: no unexpected UUID-shaped ids in `echo_servers.id` / `echo_messages.id` if you expect full migration (adjust if you intentionally keep legacy rows).

## Post-stable cleanup (legacy message indexes)

After operations sign off and feeds have run on **`(channel_id, id)`** for a stable window:

1. Set **`ECHO_DROP_LEGACY_MESSAGE_TIMELINE_INDEXES=true`** on the app (then restart / run `ensureEchoTables` once) so startup **stops creating** and **drops** `echo_messages_channel_created` and `echo_messages_channel_author_created_idx`.
2. If you still need fast **per-author** scans in a channel (e.g. moderation), set **`ECHO_CREATE_MESSAGE_AUTHOR_ID_INDEX=true`** to add partial index `echo_messages_channel_author_id_idx` on `(channel_id, author_id, id) WHERE deleted_at IS NULL`.
3. Document for developers that new code must not reintroduce **`ORDER BY created_at`** on message feeds (CI guards exist; still enforce in review).
