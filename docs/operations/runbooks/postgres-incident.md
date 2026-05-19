# Runbook: Postgres incidents (Echo API)

**Audience:** On-call / platform engineers when the Echo backend reports database errors, health failures, or sudden REST/socket degradation tied to Postgres.

## Symptoms

- `GET /api/v1/health` reports database **down** or errors while the process is still up.
- Spikes in **5xx** on REST, socket disconnect storms, or logs mentioning `ECONNREFUSED`, `timeout`, `too many connections`, `read-only transaction`, migration errors.
- Application logs: `pool` acquisition timeouts, `pg` query errors, or `cannot execute … in a read-only transaction`.

## Distinguish “API up” vs “real DB”

1. Hit **`GET /api/v1/health`** from inside the same network as the API (not only through a CDN). Confirm whether the JSON body marks DB as healthy.
2. If health is green but users see errors, check for **wrong `DATABASE_URL`** (pointing at a snapshot, replica URL, or stale secret) vs the primary you expect.
3. From a bastion or ops pod, run a trivial query with the same DSN the API uses (e.g. `SELECT 1`) to confirm connectivity and role.

## Connection pool exhaustion

**Symptoms:** Latency climbs; errors like “timeout acquiring client” or sustained high active connections on the DB.

**Checks:**

- Postgres: `pg_stat_activity` — count by `state`, `wait_event_type`, and application name if set.
- API: confirm replica count × expected pool size does not exceed `max_connections` on the server (include other services sharing the instance).

**Mitigations:**

- Scale **out** API carefully (more replicas multiply pools) or reduce per-process pool size in configuration if tunable.
- Kill obvious **idle in transaction** sessions after identifying owning services.
- Short term: restart a runaway API instance only if you understand blast radius (dropped in-flight requests).

## Read-only / failover

**Symptoms:** Errors mentioning **read-only** or connections flipping after provider failover.

**Actions:**

- Confirm whether your provider has promoted a **new primary**; update **`DATABASE_URL`** (or proxy endpoint) to the writable target.
- Ensure **no** long-lived connections stick to an old read-only endpoint after cutover (restart API pods after DSN change if connections are cached at boot).

## Migrations and locks

**Symptoms:** Deploy hangs; API logs show migration failures; DDL blocked.

**Checks:**

- Is another session holding a **lock** on migrated tables? Inspect `pg_locks` / `pg_stat_activity`.
- Was a migration interrupted? Coordinate with your migration tool’s docs; avoid running two writers.

**Mitigations:**

- Run migrations from a **single** controlled job, not from every replica simultaneously, unless your stack explicitly supports it.
- If safe, cancel the blocking session or schedule a maintenance window.

## Restore / RPO-RTO pointer

- **Backups:** Follow your host’s backup/restore playbooks (RDS snapshots, managed Postgres PITR, etc.). Echo repo does not store provider credentials.
- After restore: run application **migrations** as required for the restored schema version, then validate **`GET /api/v1/health`** and a smoke **login + channel list + send message**.

## Related documentation

- Production checklist: [`STATUS_AND_PRODUCTION_READINESS.md`](../STATUS_AND_PRODUCTION_READINESS.md) §8.
- Snowflake-specific ops (IDs, indexes): [`snowflake-cutover.md`](./snowflake-cutover.md).
