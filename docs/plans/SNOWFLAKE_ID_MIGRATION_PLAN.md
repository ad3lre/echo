# Snowflake ID migration plan (public-facing Echo entities)

This document plans replacing **UUID v4** identifiers with **Snowflake-style** numeric IDs for Echo domain objects that are **shared or visible in URLs**, while **leaving auth identifiers unchanged**.

**Why switch (chat + realtime + feeds):** Snowflake-shaped ids buy **better index locality** on append-heavy tables (especially messages), **natural time ordering**, **cursor pagination** where `cursor = id` is valid, and **smaller payloads** than hyphenated UUID strings. Storing them as **decimal strings** avoids JS `Number` precision issues and keeps APIs unambiguous.

**Hidden leverage (easy to underplay):** If you **fully commit** to Snowflake semantics, you can **drop primary dependence on `created_at`** for message ordering and pagination: **order key = `id`**, **older = `WHERE id < :cursor`**, **newer = `WHERE id > :cursor`**. If you **half-commit** and keep `created_at` as the main sort everywhere, you **leave most of the win on the table** (extra columns, dual logic, weaker index story).

**Decision (recommended):** **All-in on ID ordering** for messages (and any other Snowflake-primary tables). Keep **`created_at` / `updated_at`** for **audit, moderation, legal retention, and debugging** — **secondary**, not the source of truth for chat order or cursors.

**Enforcement (non-negotiable):** “All-in” **fails** if it is only documented once. **One** `ORDER BY created_at DESC` in a message feed query six months later **reintroduces** split-brain ordering — the difference between a **clean system** and one that **silently forks** over time.

- **Document explicitly:** for the chat timeline, **`created_at` is non-authoritative**; **`id` is the order key**.
- **Ban** `ORDER BY created_at` (and `created_at` as the primary pagination predicate) for **message list / history / jump / search-within-channel** queries. Allow `created_at` only where the question is literally “when was this row inserted?” (moderation, exports, analytics), not “what order do messages appear?”
- **Make bypass accidental-proof (not just policy):** people rarely break rules on purpose — they **route around abstractions**.
  - **All reads** of `echo_messages` (list, jump, window, search-in-channel, admin views) go through **one module** (e.g. `listEchoMessages` + tightly related helpers in the same file/package).
  - **No ad-hoc `pool.query` / raw SQL** against `echo_messages` elsewhere in app code. Migrations and one-off DBA scripts are exceptions; production paths are not.
  - Reinforce with **CI** (grep / eslint boundary / architecture test): any new reference to `echo_messages` outside the allowed module **fails the build**.

Current state (codebase audit):

- Echo tables use **`TEXT` primary keys** already (`echoTables.ts`), so IDs can switch from UUID strings to decimal Snowflake strings without a Postgres UUID type migration.
- **Categories exist**: `echo_categories` (`id`, `server_id`, `name`, `position`, …) and are referenced by `echo_channels.category_id`.
- **Custom server emoji** are not persisted as first-class rows today (emoji market is static catalog data). When guild/custom emoji are added, they should be created **on the Snowflake scheme from day one** (no UUID debt).
- **Invite codes** (`echo_invites.code`) are short hex / vanity-like strings, not UUIDs — out of scope unless you later unify “share tokens” under a different design.
- The frontend gates many API paths on **`isEchoUuid()`** (`clients/web/src/features/layout/ids/echoIds.ts`). That pattern equates **“valid Echo entity”** with **UUID regex** — fragile and implementation-coupled. Replace it with **`isEchoPublicId()`** (or equivalent): **“valid = matches Snowflake string rules”**, independent of how ids were generated historically (see §6).

---

## 1. Scope

### 1.1 Move to Snowflake (recommended)

| Entity                   | Table / usage                    | Shared / URL-facing                             | Notes                                                |
| ------------------------ | -------------------------------- | ----------------------------------------------- | ---------------------------------------------------- |
| Message                  | `echo_messages.id`               | Yes (copy link, replies, pins, search)          | High churn; biggest client + socket surface          |
| Channel                  | `echo_channels.id`               | Yes (routes, mentions, permissions)             | FK from messages, voice, overwrites                  |
| Category                 | `echo_categories.id`             | Partially (API + admin UI; rarely in user URLs) | Align with channels for consistency                  |
| Server (guild)           | `echo_servers.id`                | Yes (directory, deep links, settings)           | Public-facing guild identity                         |
| Role                     | `echo_roles.id`                  | Yes (RBAC UI, mention tokens if any)            | Member-role assignments reference `role_id`          |
| Friendship / social row  | `echo_friendships.id`            | Low                                             | Optional: keep UUID or use snowflake for consistency |
| Audit log row            | `echo_audit_log.id`              | Low                                             | Optional                                             |
| Permission overwrite row | `*_permission_overwrite_rows.id` | No (internal)                                   | Can stay UUID or use snowflake for uniformity        |
| Voice participant        | composite PK                     | N/A                                             | No single public id today                            |

### 1.2 Explicitly out of scope (auth-sensitive or different model)

- **`auth_users.id`** and anything derived from session security (refresh tokens, etc.).
- **Invite `code`** (unless you redefine invites as snowflake-based, which is usually worse for UX).

### 1.3 Future: custom emoji

When you add `echo_server_emojis` (or similar):

- Use **Snowflake `id`**, `server_id` (Snowflake), `name`, `image_url`, …
- Unicode / Twemoji continue to need **no** surrogate id.

---

## 2. Snowflake design choices

### 2.1 Layout (typical)

- **41 bits** — milliseconds since custom epoch (e.g. Unix ms since 2015-01-01 or your own epoch).
- **5 bits** — datacenter id (optional; often folded into worker).
- **5 bits** — worker id.
- **12 bits** — sequence per worker per ms (4096 ids/ms max).

Tune bit widths if you need more workers or longer sequence per tick.

### 2.2 Storage and API shape

- **Store as `TEXT`** containing **decimal** string (e.g. `"1234567890123456789"`) **or** `BIGINT` where safe.

Recommendation for this codebase:

- Keep **`TEXT` PKs** in Postgres for consistency with existing Echo schema and JSON payloads.
- Serialize to JSON as **string** always (avoid JS `Number` precision loss above `2^53-1`; Snowflakes exceed that).

**Public ID string format (mandatory contract):** `isEchoPublicId` / API validation must enforce a **fixed** shape so clients and logs never see ambiguous encodings.

- **Characters:** digits only — `^[0-9]+$` (no signs, spaces, `0x`, scientific notation).
- **No leading-zero padding** as a distinct identity: normalize or reject **`"00123"`**; one canonical string per id.
- **Length bounds:** set **min** and **max** length to match your epoch and bit width over your product lifetime (example ballpark for 64-bit-style decimal strings: **min ~17–19**, **max ~20–22** — **tune numerically** when the ADR fixes epoch and layout; document the chosen bounds in OpenAPI / contract tests).
- **No semantic encoding in the string:** the public form is **only** the numeric snowflake — **no** prefixes (`msg_…`), **no** suffixes, **no** “human-readable” tweaks. Otherwise validators, logs, and APIs **drift** (`msg_123` vs `123`) and you reintroduce ambiguity you just eliminated.

This is a **public contract**: breaking it later breaks clients, caches, and strict validators.

### 2.3 ID generation

Pick **one** canonical generator used by all writers:

1. **Application node** — in-process singleton (clock + sequence); simple but duplicate risk if multiple nodes share same worker id.
2. **Per-instance worker id** — env `SNOWFLAKE_WORKER_ID` (0–31) + coordination at deploy time.
3. **Database-assisted** — e.g. Redis `INCR` for sequence bucket, or Postgres advisory lock + sequence per ms (higher latency, strong uniqueness).

For production Echo: **(2)** with explicit worker id assignment, or **Redis-backed** sequence if you scale horizontal writers heavily.

### 2.4 Uniqueness across entity types

Options:

- **Single global snowflake space** for all Echo public ids (simplest; one generator).
- **Per-entity type** bit prefix or separate worker ranges (more complex; rarely needed).

Recommendation: **one generator** for all in-scope tables; type is implied by **which table** holds the row, not by id bits (same idea as Discord: **don’t encode entity type in the id**).

### 2.5 Clock and worker safety (non-optional in production)

**Clock goes backwards** (VM drift, bad Docker time, dev laptops): Snowflake generators assume monotonic time. If ignored, you get **duplicate ids** or **broken ordering**.

Minimal protection in the generator:

- Keep **`lastTimestamp`** (last ms bucket used).
- If **`now < lastTimestamp`**: do not emit an id blindly — either **spin/wait** until `now >= lastTimestamp`, or **hold `lastTimestamp` and advance only the sequence** until the clock catches up (document which policy you choose; waiting is simpler to reason about).

**Worker ID collisions** (two instances with `SNOWFLAKE_WORKER_ID=3`): under load, **duplicate ids** are possible.

Do not rely on “we’ll set env vars carefully” alone:

- Prefer **deployment-assigned** worker ids (orchestrator index, hostname hash with collision check, Redis lease, etc.).
- **Fail hard at startup** if two nodes register the same worker id _when you have a registry_; at minimum, document and automate assignment so copy-paste is not the control plane.

### 2.6 Sequence exhaustion under burst (per worker, per millisecond)

Typical layout allows **4096 ids/ms per worker**. Edge case: a single worker issues more than that in one millisecond.

**Options:**

- **A — Block until the next ms** (wait / spin): preserves **uniqueness** and **strict time ordering** in the id; adds latency only under absurd burst. **Recommended.**
- **B — Overflow / widen sequence**: breaks common Snowflake assumptions; ordering vs wall clock becomes fuzzy. Avoid unless you redesign the format explicitly.

**Realistically:** choose **blocking**. You should not hit 4096/ms per worker unless something is already pathological (runaway loop, bug).

**Metrics (early warning):**

1. **Waited for next millisecond** — counter whenever the generator blocks until the next tick (sequence bucket exhausted or clock catch-up). A **spike** suggests a **runaway loop**, **hot shard**, or **clock / worker** trouble.
2. **Max sequence used per millisecond** (per worker) — gauge or histogram. If you **chronically approach 4096**, you will **hit blocking** regularly; scale **workers**, **shards**, or **write paths** **before** users feel latency.

### 2.7 Postgres indexes (where the locality win appears)

If indexes still lead on **`(channel_id, created_at DESC)`** while you paginate on **`id`**, you **leave performance on the table**.

For messages, the **core** access pattern is **by channel, keyed on `id`**, in **both** directions: “load older”, “load newer”, **jump to message**, **load around message**, **search within channel**.

- **Primary recommendation:** **`CREATE INDEX … ON echo_messages (channel_id, id)`** (default **ASC**). Postgres can use **backward index scan** for `ORDER BY id DESC` when needed; you avoid edge-case plans where only a `DESC`-tailored index exists and an ascending or range probe is suboptimal.
- **Optional:** a second index or `DESC` variant only if **EXPLAIN** on real workloads shows a persistent gap — don’t guess; measure.

Migrate indexes as part of the same program: **add new index → cut reads over → drop `created_at`-leading timeline index** when safe. Validate query plans for `listEchoMessages`, jump-to-id, and window queries.

### 2.7.1 Rollout: one switch for query semantics (silent killer if violated)

During migration there must **not** be a period where **some** code paths sort/paginate by **`created_at`** and **others** by **`id`**. That produces **duplicate rows**, **gaps**, and **broken infinite scroll** at the seam.

- **Before cutover:** legacy stack uses **`created_at`** consistently (UUID era).
- **After cutover:** **every** message-feed path uses **`id`** only.
- **No gradual** “half the API on id” in production. This **matches** the **big-bang** data strategy: **flip query logic in the same release window** as the id migration (or straddle only in a **non-production** canary with disposable data).

**Pre-cutover gate (teams fail here):** backend may switch to **`id`** while **one** REST handler, **one** Socket.IO event, **one** admin tool, or **one** internal script still orders by **`created_at`**. Symptom: **duplicate or missing messages**, **pagination glitches** that are painful to debug.

Before you flip traffic, explicitly answer: **“Is there ANY code path that still orders message history by `created_at`?”** If **yes** → **delay cutover** until the inventory is clean (repo-wide search + runtime config + ops runbooks).

### 2.8 Who may allocate ids (strategic fork)

The plan assumes **one internal generator** on servers you control.

**Fork:** Do you ever need **clients, bots, or plugins** to **mint** Snowflake-shaped ids **before** the server acknowledges (optimistic UI, offline, third-party writers)?

- **If no** — **server-issued ids only** (current shape): simplest; your generator + worker discipline is enough.
- **If yes** — you need **distributed-safe** allocation (harder): reserved worker ranges, delegated blocks, or **accept only server-issued** ids on write and treat client ids as temporary until replaced.

**Default recommendation for Echo:** **server-issued ids only** for persisted rows; optimistic UI can use **client temp keys** until the server returns the canonical id (or derive **display time** from nothing until ack — see §2.9).

**Long-term implication (centralized identity):** This path means **the server is the source of truth for persisted identity** — same trade as Discord. **Client temp id ≠ server id**; reconciliation is **replace-on-ack**. That is **fine** for online-first chat. If you later need **offline-first** messages that **survive reconnect without remapping**, or **plugins that mint durable ids** before the API, you hit a **different architecture** (distributed allocation or idempotency keys + server mapping). **Explicitly accept** this fork for now; revisiting it is a product decision, not a codegen detail.

### 2.9 UX: time from id (optional polish)

Once ids are Snowflakes, **`parseSnowflakeTime(id)`** (shared helper) gives a **rough creation instant** without a server roundtrip. Useful for:

- **Optimistic UI** “time ago” labels before `created_at` arrives
- **Offline-first** placeholders
- Consistent ordering previews

Still keep **`created_at`** on the row for **authoritative** timestamps when the message is committed.

### 2.10 Engineering rule: never order ids as strings

Snowflakes are **numeric**. **Lexicographic** string sort is **wrong**:

```text
"9" > "10"   // true as strings — wrong chronological order for numeric ids
```

**Rule (hard):** For **any** ordering or pagination comparison (`before`, `after`, min, max, sort):

- **Do not** use raw **string** `<` / `>` / `sort()` on decimal id strings.
- **Do** compare via **`BigInt(a) < BigInt(b)`** (or compare parsed timestamp + sequence from the id bits if you expose that API).

One forgotten string sort causes **subtle** bugs: wrong message order, broken pagination cursors, flaky “load older” edges. Add a **shared `compareEchoPublicId(a, b): number`** in `contracts/` and use it everywhere.

### 2.11 Snowflake = ordering, not “truth”

Lock this **mentally**: **`id` defines scroll order and pagination**, not a complete story about **causality** or **what happened first in the real world**.

- **Same millisecond, different workers:** order is **sequence / worker bits**, not “user tapped send first.”
- **Edits / patches** can arrive **out of order** over the network.
- **WebSocket vs DB** timing: an event may be visible before the row (or the reverse).

**Rule:** Use **`id`** for **ordering** the feed and **cursors** only. Do not treat **`id`** alone as **causal** proof for moderation, compliance, or “who edited first” without **extra fields** (version, explicit server timestamps, etc.) if the product requires that.

---

## 3. Migration strategy (phased)

This section combines **big-bang** (avoid dual-id rot), **chunked backfill** (avoid mega-transactions), and **rebuild derived data** (avoid ghost corruption) — a **stronger** archetype than many production migrations. The main failure mode is **process** (missed code paths, partial indexes), not the shape of the plan.

### Phase A — Greenfield readiness (no data flip yet)

1. Add **`contracts/`** module: `nextSnowflakeId()`, `parseSnowflakeTime()`, `isValidEchoPublicId()` implementing the **§2.2 public string contract** (digits-only, length bounds, reject padding, **reject** prefixed / decorated forms).
2. Add **config**: epoch, worker id, feature flag `ECHO_USE_SNOWFLAKE_IDS` (default off in prod until cutover).
3. New entities created **behind flag** use Snowflake; old rows remain UUID until backfill.

### Phase B — Dual ID period (only with a forcing reason)

Dual-ID paths **rot quickly**: double logic, forgotten branches, and edge-case explosion. Prefer **avoiding** them.

Use **dual-id / mapping tables / legacy columns** only when you **cannot** force everyone forward, e.g.:

- **External API consumers** you do not control.
- **Mobile or desktop clients** you cannot mandate update on a deadline.
- **Immortal links** or integrations in the wild that must keep resolving for a long transition.

If **you control all clients**, **traffic is manageable**, and there is **no public third-party API** on UUIDs: **do a big-bang migration** (maintenance window + single cutover). Rip the band-aid.

When dual-id is required, still **time-box** it: sunset date, metrics on legacy id usage, explicit removal milestone.

### Phase C — Data backfill (existing deployments)

Order matters because of **foreign keys**:

1. **Servers** (`echo_servers`) — assign new id, or regenerate in dependency order.
2. **Categories** → **channels** → **roles** → **member_roles** → **messages** (largest) → **overwrites** → **voice** → **audit** / **friendships**.

Concrete approaches:

- **Offline migration script**: stop writes; transform in **bounded chunks** (see below), not one giant transaction over the whole message table.
- **Blue/green**: replicate to new DB with transformed ids; switch traffic.

#### Phase C — Chunked backfill (avoid one mega-transaction)

For **large** `echo_messages`, a single transaction over the full subgraph risks **long locks**, **WAL bloat**, and **painful rollback**.

**Safer pattern:**

- Migrate **per server** or **per channel** (or fixed row batches with explicit ordering).
- **Commit after each chunk**; log progress (channel id, last old id, counts).
- **Verify each chunk** (row counts, FK sanity, sample JSON checks) before advancing.

This gives **recoverability**, **observability**, and **less catastrophic** failure than one all-or-nothing transaction.

#### Phase C — Derived data: recompute, don’t patch

Beyond row data and JSON blobs, anything **derived** that stores message/channel/user ids must be treated explicitly:

- **Search indexes** (full-text, mention index, etc.)
- **Denormalized tables** built from messages
- **Any persisted cache** of ids (Redis keys, materialized aggregates)

**Rule:** If it’s **derived**, **rebuild or reindex** from canonical tables after migration — do not hand-“fix” a few cells. Partial patches → **silent corruption** and ghost hits.

#### Phase C — Message table and embedded relationships (danger zone)

The **messages** table is not only the largest; it is the **most queried, most cached, and most cross-referenced** surface: `reply_to`, `mentions` (`<@id>` / structured mentions), `embeds` (e.g. `echoJump`), **message link** payloads, **pins**, **search**, **socket events in flight**, and **frontend message trees**.

**Do not “grep and hope”** as the only strategy. Pick one disciplined approach:

1. **Version message payloads** — e.g. explicit `schemaVersion` on stored JSON; v1 = UUID-shaped references, v2 = Snowflake; readers support both until backfill completes, then reject v1.
2. **Strict transformation + validation** — one migration job that rewrites every blob with a **known schema**, then **asserts** invariants (counts of rows updated, zero orphan references in a sample of JSON, checksums per channel).

If even a small fraction of embedded ids stay as old UUIDs after cutover, you get **ghost bugs** (broken jumps, dead replies, wrong mentions). Treat this as a **migration sub-project** with its own checklist and sign-off.

### Phase D — Client and URL cutover

1. Replace **`isEchoUuid`** with **`isEchoPublicId`** (snowflake decimal string) everywhere it gates “real Echo server” vs mock/`echo` sentinel.
2. Update **message link** format (`/channels/:channelId/:messageId`) — ids remain path segments; only charset changes (numeric).
3. **Search**, **pins**, **virtual list keys** — ensure they treat ids as opaque strings (should already work).

#### Phase D — Frontend and API assumptions

UUID → Snowflake changes **length**, **character set** (digits only), and invalidates **string ordering** for chronology.

Same **hard rule as §2.10** in client code: use **`BigInt`** (or shared `compareEchoPublicId`) for sort/compare — never `a.localeCompare(b)` or `sort()` on raw id strings for timeline order.

Also audit:

- **Length / slicing** (`id.slice(0, 8)`) — display-only; semantics change vs UUID.
- **Mock data** and **`startsWith('mock_')`**-style heuristics — keep mock ids disjoint from real `isEchoPublicId()` matches.
- **Numeric coercion** — never `Number(id)` for snowflakes.

### Phase E — Cleanup

1. Remove feature flag and UUID generators for in-scope entities.
2. Drop `legacy_uuid` / mapping tables when no longer referenced.
3. Update **docs**, **OpenAPI/contract tests**, **bot exporter** (`bot/`), and **discord-import** docs if they assume UUID regex.

---

## 4. Risk register

| Risk                                     | Mitigation                                                                                                                                        |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| JS number precision                      | Always use **string** snowflakes in TS/Vue; bigint only where explicit                                                                            |
| Drift: `ORDER BY created_at` sneaks back | **Ban** + **single DAL** for `echo_messages` reads; **no raw SQL** outside allowed module; **CI** blocks stray `echo_messages` references (intro) |
| Mixed id vs `created_at` during rollout  | **Hard switch** + **pre-cutover inventory** (REST, sockets, admin, scripts) — §2.7.1                                                              |
| Clock skew / backward time               | NTP on writers; generator **detects** `now < lastTimestamp` and waits or advances sequence per §2.5                                               |
| Duplicate worker ids                     | **Deployment-assigned** worker ids; startup validation / registry where feasible; not manual env copy-paste alone                                 |
| Sequence / next-ms wait spikes           | **Metrics**: next-ms **wait** + **max sequence per ms** — §2.6                                                                                    |
| Stale ids in JSON / ghost references     | **Payload versioning** or **validated transform** for `reply_to`, `mentions`, `embeds`, pins — not grep-only (§ Phase C)                          |
| Derived indexes / search / caches        | **Rebuild / reindex** — Phase C                                                                                                                   |
| Dual-ID drift                            | Prefer **big bang** when you own all clients; if dual-id, **time-box** and measure legacy usage                                                   |
| Cached client state                      | Bump store version or force refetch after cutover                                                                                                 |
| Frontend sort/compare on ids             | **§2.10** — `BigInt` / `compareEchoPublicId` only                                                                                                 |
| Causality / “truth” misuse               | **§2.11** — ordering for feed + cursors; not edits/ws/DB race truth                                                                               |
| Ambiguous id strings                     | **§2.2** contract — digits-only, bounds, no `00123`                                                                                               |
| Discord import                           | Map Discord snowflakes ↔ Echo snowflakes explicitly in import pipeline                                                                            |

---

## 5. Testing checklist

- Unit: generator uniqueness under concurrency (stress worker + sequence); **sequence exhaustion** path waits for next ms without duplicate ids; **metrics**: next-ms wait + **max sequence per ms** under load tests.
- Integration: create server → category → channel → message; permissions; voice join; edit/delete message.
- Socket: `message`, `message:updated`, `message:embeds` payloads use new ids.
- Frontend: `useEchoHistory`, `MessageList` virtual keys, `handleGoToMessage`, role management when `isEchoUuid` replaced; **sort/compare** on ids; mock id conventions.
- Security: confirm **no** snowflake is used where **auth decisions** should rely only on **session user id** (still `auth_users.id`).

---

## 6. Code hotspots to plan time for

- **ID generation**: `echoStore/` modules via `echoSnowflake.ts` (`nextEchoSnowflakeId` for server/channel/category/role/…), `chatMessageHandler.ts` (message id), `echoTables.ts` migrations using `gen_random_uuid()::text`.
- **Client gate**: `clients/web/src/features/layout/ids/echoIds.ts` and all `isEchoUuid` call sites (AppLayout, useEchoHistory, ServerSettingsModal, MessageList, useMockData, useDmSocialActions, …).
- **Shared contracts**: `contracts/types`, `contracts/echoContractV1.ts` event payloads (ids are opaque strings today — good).
- **Message link resolver**: `echoMessageLinkEmbed.ts` path parsing assumes two path segments; numeric ids are fine.
- **Message data access**: consolidate **all** `echo_messages` **reads** into **one module**; **id-only** order and cursors; **`(channel_id, id)`** index per §2.7; optional **`CLUSTER`** per §2.7; **no** stray `pool.query('… echo_messages …')` in handlers.
- **Shared ordering helper**: `compareEchoPublicId` (or equivalent) in `contracts/`; ban raw string sort for timeline order in lint/docs.
- **Contract tests:** `isEchoPublicId` accepts/rejects golden strings per §2.2.

---

## 7. Recommended decision summary

1. **Single global Snowflake generator**, **decimal string in `TEXT` columns**; **server-issued ids** for persisted rows unless you explicitly solve distributed minting (§2.8).
2. **Do not** change `auth_users.id`.
3. **Include** servers, roles, categories, channels, messages in the same program (everything that today uses UUID in Echo’s public graph).
4. **Defer** custom emoji table until implemented; **spec Snowflake ids** in that schema’s first PR.
5. **All-in on `id`** for message order and cursors; **`created_at` non-authoritative for timeline**; **enforce** with a **single read module** for `echo_messages`, **no raw SQL** bypass, **CI** on table references, plus **ban** `ORDER BY created_at` on feeds.
6. **Indexes:** **`(channel_id, id)`** (ASC btree; planner backward scan for DESC) per §2.7; optional **`CLUSTER`** for huge channels; drop **`created_at`-leading** timeline indexes when obsolete.
7. **Query rollout:** **hard switch** + **pre-cutover gate**: “any path still on `created_at`?” — §2.7.1.
8. **Generator:** on **4096/ms** exhaustion, **block** until next millisecond; **metrics**: next-ms waits + **max sequence/ms** (§2.6).
9. **Public id contract:** digits-only, length bounds, reject padding, **no** semantic prefixes in the wire format (§2.2).
10. **Derived data:** **rebuild / reindex**, not surgical patch (Phase C).
11. **Backfill:** **chunked** (per channel/server), not one full-table transaction.
12. **Ordering vs truth:** **`id`** for feed order and cursors, not causal truth for edits / races (§2.11).
13. Prefer **one maintenance-window big-bang** over long dual-id **unless** external APIs, un-updatable clients, or immortal links force a transition period — in which case **time-box** dual-id and delete it on a schedule.

---

## 8. Final decision checkpoint (identity authority)

**Chosen path (implicit):** **server-issued ids only** for persisted rows — same **centralized identity** model as Discord.

**That locks in:**

| Aspect                             | Implication                                                                                                                        |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Optimistic UI                      | **Temporary** client ids until **ack**; replace with server **`id`**                                                               |
| Source of truth                    | **Server** is **identity authority** for durable rows                                                                              |
| Offline-first later                | **Harder** — needs a **different** design (distributed ids, idempotency keys + mapping, or similar)                                |
| Bots / plugins writing through API | Fine if they **receive** ids from the server; **not** fine to mint **durable** public ids client-side without a coordinated scheme |

**This is a trade, not a defect** — correct for **online-first** Echo today. Reopen **§2.8** only when product requirements change.

---

This plan is intentionally implementation-agnostic on the exact bit layout; lock that in a short **ADR** once you choose epoch and worker assignment strategy.
