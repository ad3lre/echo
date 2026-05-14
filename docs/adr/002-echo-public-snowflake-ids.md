# ADR 002: Echo public entity IDs (Snowflake)

## Status

Accepted — implementation in codebase (`shared/snowflakeIds.ts`, `backend/src/domain/echoSnowflake.ts`). **Verified paths:** 2026-03-27.

## Context

Echo public graph entities (servers, channels, categories, roles, messages, …) used UUID v4 strings. We migrate to **Snowflake-style 64-bit IDs** serialized as **decimal strings** in JSON and Postgres `TEXT` PKs. **`auth_users.id` stays UUID** (out of scope).

## Decision

### Bit layout (64-bit unsigned integer)

| Field      | Bits | Range          | Notes                             |
| ---------- | ---- | -------------- | --------------------------------- |
| Timestamp  | 41   | ms since epoch | Monotonic wall time (best effort) |
| Datacenter | 5    | 0–31           | Logical DC; default `1` in dev    |
| Worker     | 5    | 0–31           | From `SNOWFLAKE_WORKER_ID`        |
| Sequence   | 12   | 0–4095         | Per worker per millisecond        |

Packed as:

`id = ((timestamp - EPOCH_MS) << 22) | (datacenter << 17) | (worker << 12) | sequence`

Serialized to API/DB as **decimal string** (e.g. `"4823456789012348928"`), never `Number` in JS.

### Epoch

**`ECHO_SNOWFLAKE_EPOCH_MS` = `1420070400000`** (2015-01-01 00:00:00 UTC). Matches common industry practice and maximizes 41-bit timestamp headroom.

### Public string contract

- Match `^[0-9]+$` only (no prefixes like `msg_`, no padding semantics).
- Reject values with leading zeros when length > 1.
- **Length bounds** (decimal digits): **15–22** inclusive (aligned with `shared/snowflakeIds.ts` constants; adjust only with ADR revision).

### Generator behavior

- **Backward clock:** spin/wait until `Date.now() >= lastTimestamp` before emitting (no id from a regressed clock bucket).
- **Sequence 4096/ms exhausted:** block until the next millisecond, then reset sequence (increment **wait-next-ms** metric).
- **Worker IDs:** `SNOWFLAKE_WORKER_ID` (0–31) and optional `SNOWFLAKE_DATACENTER_ID` (0–31, default 1). Deployment must ensure unique `(datacenter, worker)` per running writer process.

### Prometheus metrics (names)

| Metric                                        | Type      | Meaning                                                                       |
| --------------------------------------------- | --------- | ----------------------------------------------------------------------------- |
| `echo_snowflake_generator_wait_next_ms_total` | Counter   | Times the generator blocked until the next ms                                 |
| `echo_snowflake_generator_sequence_observed`  | Histogram | Sequence value (0–4095) observed at emit time (detect approaching exhaustion) |

### Message ordering

After cutover, channel history uses **`ORDER BY id DESC`** and cursors on **`id`** only — not `created_at`. See [SNOWFLAKE_ID_MIGRATION_PLAN.md](../architecture/SNOWFLAKE_ID_MIGRATION_PLAN.md).

### `created_at` vs `id` (no drift)

Snowflake **`id`** embeds mint time but is the **only** ordering and pagination key for chat feeds. **`created_at`** is a separate column: it may match wall-clock insert time but is **not** guaranteed to track display order (imports, backfills, clock skew, future tooling). **Split-brain** appears if any code path sorts or pages messages by **`created_at`** while the rest of the stack uses **`id`**.

**Code review / CI invariant:** reject new **`ORDER BY created_at`** (or `created_at`-based cursors) on **`echo_messages`** for list, history, jump, in-channel search, or socket replay paths. Use **`created_at`** only when the question is “when was this row written?” (moderation, exports, analytics, rate windows) — not “in what order do messages appear?”. Repo guard: **`npm run check:echo-snowflake`**. Ops: [snowflake-cutover.md § Timeline semantics](../runbooks/snowflake-cutover.md#timeline-semantics).

## Consequences

- Existing rows must be **migrated** (IDs rewritten + JSON patches) in a maintenance window before relying on id-ordered history with legacy UUID data.
- Clients must treat message/server/channel IDs as **opaque decimal strings** and use **`BigInt`** (or `compareEchoPublicId`) for ordering — never lexicographic string sort.
