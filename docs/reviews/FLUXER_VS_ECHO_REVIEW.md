# Fluxer vs Echo — Deep Comparative Review (v2.2)

**Date:** 2026-06-12 (v2.2 implementation update: 2026-06-13)
**Subject:** [fluxerapp/fluxer](https://github.com/fluxerapp/fluxer) (~8.9k★, AGPLv3, in production with 125k+ users) studied at HEAD, compared against Echo `main`.
**Method:** code-level read of both systems on both sides — gateway/session internals, message write pipeline end-to-end, storage engines, rate limiting, caching, client rendering/state, build, security middleware (Part I), plus per-subsystem deep dives into permissions, voice, E2EE, Trust & Safety, uploads, search, federation, errors, config, and CI (Part II). File:line citations throughout. Fluxer paths are relative to its repo root (cloned at `/tmp/fluxer`); Echo paths are relative to this repo.

This is v2.1. v1's high-level findings were superseded by v2's code-level read (two recommendations **corrected** in §3.6); v2.1 adds Part II (§12–§21), which **reverses three Part-I impressions** in Echo's favor — voice E2EE, security CI, and permission explainability (see §22's closing note).

> **v2.2 implementation update (2026-06-13).** Several of this review's "do now" recommendations have since **shipped on `main`**. Sections updated below with a `> ✅ Shipped` callout: the message broadcast tail (§4.3), the realtime resume/op-cap/compression items (§3.5), the **in-memory server-state tier** that closes the §2 gap (§2.2–§2.3, §6), the unfurl coalescer (§6/§9.3), and the GCRA socket op envelope (§7.2). The §22 action list is annotated with status. The biggest one — Echo's single-node analogue of Fluxer's guild process — is built and tested behind `ECHO_PERM_AGGREGATE_CACHE` (default OFF, pending the Postgres parity suite). Full plan + status: [IN_MEMORY_SERVER_STATE_PLAN.md](./IN_MEMORY_SERVER_STATE_PLAN.md).

---

## Contents

**Part I — Architecture & hot paths**

1. [Framing](#1-framing)
2. [The core architectural bet: where does hot state live?](#2-the-core-architectural-bet-where-does-hot-state-live)
3. [Realtime gateway internals](#3-realtime-gateway-internals)
4. [Message write path, end to end, both systems](#4-message-write-path-end-to-end-both-systems)
5. [Storage engine mechanics](#5-storage-engine-mechanics)
6. [Caching, coalescing, batching](#6-caching-coalescing-batching)
7. [Rate limiting & abuse control](#7-rate-limiting--abuse-control)
8. [Client architecture & rendering](#8-client-architecture--rendering)
9. [Security mechanisms](#9-security-mechanisms)
10. [Observability](#10-observability)
11. [Maintainability, tooling, tests](#11-maintainability-tooling-tests)

**Part II — Subsystem deep dives**

12. [Permissions & RBAC model](#12-permissions--rbac-model)
13. [Voice & video (LiveKit) architecture](#13-voice--video-livekit-architecture)
14. [End-to-end encryption: messages and voice](#14-end-to-end-encryption-messages-and-voice)
15. [Trust & Safety: CSAM, NSFW, moderation](#15-trust--safety-csam-nsfw-moderation)
16. [Attachment, upload & media-processing pipeline](#16-attachment-upload--media-processing-pipeline)
17. [Search & indexing](#17-search--indexing)
18. [Federation — Fluxer's relay, and what it implies for Echo](#18-federation--fluxers-relay-and-what-it-implies-for-echo)
19. [Error taxonomy, validation & resilience](#19-error-taxonomy-validation--resilience)
20. [Config, secrets, feature flags & i18n](#20-config-secrets-feature-flags--i18n)
21. [CI, release engineering & deployment](#21-ci-release-engineering--deployment)

**Part III — Conclusion**

22. [Scorecard and prioritized actions](#22-scorecard-and-prioritized-actions)

---

## 1. Framing

|              | **Fluxer**                                                                  | **Echo**                                                              |
| ------------ | --------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| Status       | Production, 125k+ users, 2 FTE, mid-refactor                                | Pre-release                                                           |
| Stack        | TS API (Hono) + **Erlang/OTP gateway** + Cassandra/ScyllaDB + NATS + Valkey | Node monolith (Fastify + Socket.IO) + Postgres, optional NATS adapter |
| Size         | ~694k LOC TS + 53k LOC Erlang; 525 test files                               | ~486k LOC TS/Vue; 643 test files                                      |
| Scale stance | Distributed day one                                                         | Single-node-first, deferred to ~50k CCU (`docs/overview/STACK.md`)    |
| Clients      | Web, Electron; no mobile yet                                                | Web + Tauri × 5 platforms                                             |

Fluxer is the system Echo's roadmap _defers to_; its choices are consequences of production load. The interesting material is not "Fluxer is distributed" but the **specific mechanisms** — most of which are portable to a single-node Socket.IO architecture without adopting Erlang or Cassandra.

---

## 2. The core architectural bet: where does hot state live?

This is the deepest difference between the two systems, and it inverts the usual assumption about which tier is the cache.

### 2.1 Fluxer: the gateway's RAM is the source of truth for hot reads

When a guild process spawns on the Erlang gateway, it pulls the full guild aggregate **once** from the API over NATS RPC (`guild_collection` in `packages/api/src/rpc/RpcService.tsx:401`, fetched by `fluxer_gateway/src/guild/guild_manager_shard.erl:209` `spawn_fetch`) and keeps members, roles, channels, and overwrites in process state + ETS. From then on:

- **The API queries the gateway, not the database, for hot reads.** `packages/api/src/infrastructure/GatewayService.tsx` exposes `guild.get_data`, `guild.get_member`, and `guild.check_permission` RPCs _to the gateway_, and — critically — **micro-batches and dedupes them**: concurrent identical requests are collected into `pendingGuildDataRequests` / `pendingGuildMemberRequests` / `pendingPermissionRequests` maps and resolved as a batch (`GatewayService.tsx:426` logs "Processing batch: N unique guild.get_data requests (M total)…"). A burst of 50 message sends into one guild produces one permission lookup, not 50.
- **Permission evaluation has a cache inside the guild process** (`fluxer_gateway/src/guild/guild_permission_cache.erl`), invalidated by role/channel events that the guild process itself dispatches — so invalidation is exact, not TTL-based.
- The database (Cassandra) is only authoritative for durability and cold starts. RPC reliability is handled by 3 retries with histogram-per-method telemetry (`packages/api/src/infrastructure/GatewayRpcClient.tsx:30,46-78`).

The consequence: message-send permission checks, member lookups, and fan-out target resolution **never touch the DB in steady state**. This is the single biggest structural performance difference between the two codebases.

### 2.2 Echo: Postgres was the source of truth for everything — now there's an in-memory tier

As originally written: Echo's hot reads went to Postgres every time — `evaluateEchoPostMessageAccess` (`backend/src/domain/echoPermissions.ts`), `listEchoServerMembers` per message broadcast, `getEchoDmRealtimeThreadForUser` per DM recipient, and (the big one) the permission fold re-reading roles + channel + overwrites on every cache-miss, where each server-scoped invalidation cold-cleared all users.

> **✅ Shipped (v2.2).** Echo now has a **single-node analogue of Fluxer's guild process**: a per-server permission aggregate (all roles + channel info + every channel/category overwrite row + legacy override + `owner_id`) held in RAM (`echoServerPermissionAggregateCache.ts`), plus cached member role-ids (`echoMemberRoleIdsCache.ts`), member-access state (`echoMemberStateCache.ts`), channel metadata (`echoChannelMetaCache.ts`), and the server member-id list (`echoServerMemberIdsCache.ts`). With the aggregate fold enabled (`ECHO_PERM_AGGREGATE_CACHE`, default OFF pending the Postgres parity suite), a **warm permission fold — single and batch — touches the DB zero times** (regression-tested in `echo.permissionAggregateParity.test.ts`), leaving only the durable message INSERT on the send path. This is precisely Fluxer's §2.1 property, achieved with a `Map` + the existing Redis invalidation bus instead of Erlang. The remaining honest difference: Fluxer's invalidation is **exact** (guild-process events), Echo's is **prefix-sweep by server generation + TTL backstop** — coarser (a role edit drops the whole server's folds, not just affected ones) but correct and far simpler. See [IN_MEMORY_SERVER_STATE_PLAN.md](./IN_MEMORY_SERVER_STATE_PLAN.md).

### 2.3 What Echo should take from this — status

Not the Erlang tier. The three portable ideas, all now **implemented**:

1. ~~Request-scoped memoization.~~ **✅ Shipped.** `echoEventUserCache.ts` binds a per-event user cache to each socket packet via `AsyncLocalStorage` (mirroring `pgQueryContext`), collapsing the handler's guest/abuse `getUserById` reads and the broadcast author snapshot to one query per send.
2. ~~In-process guild/membership cache with event-driven invalidation.~~ **✅ Shipped, and bigger than proposed.** Beyond the `Map<serverId, members>` suggested here, Echo built the full server aggregate (§2.2). The prediction held exactly: every mutation routes through `invalidateEchoPermissionCacheForServer/ForUser/ForChannel` (~24 sites), so all the new caches hook those three functions and get correct local + cross-node invalidation **with zero new call-site wiring** — the same way `echoMemberStateCache` already did. The per-message `listEchoServerMembers` query is gone (`listEchoServerMemberUserIdsCached`).
3. ~~Batch + dedupe as a first-class utility.~~ **✅ Shipped.** `backend/src/shared/keyedCoalescer.ts` is the canonical single-flight (`coalesceByKey`) helper, applied to the three cold-load paths (aggregate, member role-ids, channel meta) so a thundering herd of concurrent cold misses for one server issues one DB load. (The bespoke `echoAttentionSnapshotScheduler` and `unfurlCache` coalescers remain; they could adopt this utility later.)

---

## 3. Realtime gateway internals

### 3.1 Fluxer's session model — a process that outlives the socket

Each connection gets a `session` gen_server whose state (`fluxer_gateway/src/session/session.erl:34-70`) holds: the event `buffer` + `seq` + `ack_seq` trio, a `token_hash` (the gateway never holds the raw token — `token_verify` hashes the presented token and compares, `session.erl:165-169`), guild refs **with monitor references**, private channel map, relationship map (used to filter presence fan-out in-process), voice op queue, and reaction-debounce state.

The event-delivery contract is the part worth studying closely:

- **Every dispatch increments `seq`, appends to `buffer`, then writes to the socket** (`session_dispatch.erl:62-80`). The buffer is _not_ trimmed on send.
- **The client's heartbeat doubles as a cumulative ACK.** `{heartbeat_ack, Seq}` drops all buffered events `≤ Seq` (`session.erl:170-179`). Heartbeat interval is 41,250 ms with a 45 s server timeout (`utils/constants.erl:113-116`); the client fires at `0.8 × interval + jitter ≤ 1.5s` (`fluxer_app/src/lib/GatewaySocket.tsx:687-688`).
- **Resume:** when the socket dies, the session process lives on for **10 seconds** (`session_monitor.erl:61` arms `resume_timeout` at 10,000 ms). A reconnecting client sends op 6 RESUME with its last seq; the server replays `[Event || seq(Event) > ClientSeq]` and re-monitors the new socket pid (`session.erl:180-216`). A seq from the future returns `invalid_seq` → client falls back to full IDENTIFY (`GatewaySocket.tsx:655`).
- **Backpressure is fail-fast, not fail-silent.** The ack buffer is capped at **4096 events** (`session_dispatch.erl:30`). On overflow the session emits an OTel counter + an `unacked_events` gauge, sends the socket a `session_backpressure_error`, and **force-terminates itself** (`session_dispatch.erl:348-377`) — a slow consumer is disconnected rather than allowed to balloon gateway memory. (Implementation wart for balance: the buffer is a plain list with `Buffer ++ [Entry]` and `length/1` — O(n) append and O(n) size check per event. Erlang makes this survivable; it's still the kind of thing Echo's charter would flag.)
- **Reaction debouncing with cancellation:** when enabled per session, `message_reaction_add` events are buffered for **650 ms** (max 512) — and a `message_reaction_remove` arriving inside the window **deletes the matching buffered add instead of sending both** (`session_dispatch.erl:31-32,95-136`). Reaction spam on a popular message costs ~1.5 wire events/sec instead of dozens.
- **Per-session event suppression:** clients can declare `ignored_events` at IDENTIFY (`session.erl:131`); the dispatch path drops them before serialization. Bots that don't care about typing/presence pay nothing for them.
- **READY assembly is incremental with a deadline.** On init the session fires `guild_connect` per guild and collects `collected_guild_states`; `premature_readiness` fires at 3 s (`session.erl:150`) and ships READY with whatever guilds have answered, marking the rest unavailable (`session_ready.erl:35-77`) — one slow guild process can't block login. Presence updates are suppressed for the first 200 ms (`enable_presence_updates`, `session.erl:151`) and queued in `pending_presences` so connect storms don't interleave with READY.

### 3.2 Inbound protocol policing

`gateway_handler.erl:27-36` hard-codes per-connection inbound limits enforced _before_ any business logic: **120 ops / 60 s** overall (Discord's exact number), **10 voice-state updates / 1 s** with a 64-deep queue drained at 100 ms ticks, **3 `request_guild_members` / 10 s**. Violations close the socket with a `rate_limited` close code rather than dropping single ops — misbehaving clients are ejected, not throttled invisibly.

### 3.3 Lazy member lists — the bandwidth decision

Fluxer never ships full rosters. `fluxer_gateway/src/guild/guild_member_list.erl`:

- Clients subscribe to **row ranges** of the rendered member sidebar (`subscribe_ranges/4:119`); ranges are validated, sorted, and merged when overlapping/adjacent (`merge_overlapping_ranges:78-86`).
- Initial state per range is a `SYNC` op carrying only `items` in `[Start, End]` plus `member_count`/`online_count`/`groups` (`build_sync_response:171-196`).
- Member changes are **diffed into minimal ops** (`diff_items_to_ops`) — except role changes, which trigger a full list resync because they can re-sort arbitrarily many rows (`handle_member_update:151-169`). An honest complexity/correctness trade documented in code.
- Updates are pushed only to sessions subscribed to that list **and able to view that channel** (`send_member_list_update_to_sessions:236-260` checks `session_can_view_channel`) — permission filtering happens at the fan-out edge, in RAM.
- Guilds above a threshold switch to `very_large_guild.erl` / `very_large_guild_member_list.erl` variants, and **passive sessions** (open guild, not focused) get a 30-second batched digest instead of live events (`guild_passive_sync.erl:32`).

Sharding everywhere uses **rendezvous (HRW) hashing** via `erlang:phash2({Key, Index})` (`rendezvous_router.erl`) for session/presence/guild manager shards — minimal key movement when shard counts change, no coordination.

### 3.4 Wire format: scaffolding vs reality

An honest finding: the codec currently supports **JSON only** — `parse_encoding` maps `"etf"` to `json` (`gateway_codec.erl:31-33`) and `parse_compression` maps `"zstd-stream"` to `none` (`gateway_compress.erl:36-41`). The zstd path is real but staged: the Erlang compress context, the client's WASM `decompress_zstd_frame` (`fluxer_app/crates/libfluxcore/src/gateway.rs`), and a dedicated decompression worker (`fluxer_app/src/lib/GatewayCompression.tsx`) are all shipped, awaiting server enablement. The envelope is Discord's `{op, s, t, d}`.

### 3.5 Echo's realtime layer, examined with the same lens

`backend/src/bootstrap/socket.ts:30-59`:

- **Connection State Recovery is already enabled** (`maxDisconnectionDuration: 2 * 60_000`). v1 of this review recommended adopting resume semantics — partially wrong: Echo already has Socket.IO's variant, with a _longer_ window (2 min vs Fluxer's 10 s). The real differences: (a) CSR restores rooms and replays packets from the adapter buffer but is best-effort and adapter-dependent (in-memory adapter today; the NATS adapter must support it for multi-node); (b) there is no application-visible seq/ack, so the client can't _know_ what it missed and selectively refetch on recovery failure — Fluxer's `invalid_seq → IDENTIFY` is an explicit, testable contract while CSR failure is silent (the client just sees `recovered === false`); (c) nothing outlives the CSR window. Worth adding: an explicit `recovered` check on the client that triggers scoped rehydration (active channel + attention snapshot) instead of full reload.
- **`perMessageDeflate: false` is deliberate**, documented inline: CDN/proxies mishandling compressed frames surfaced as "Invalid frame header" on chat-echo.com (`socket.ts:34-37`). v1's "turn compression on" is therefore wrong as stated. The correct lesson from Fluxer is the _architecture_ of their answer: compress **inside the payload** (zstd over binary frames, decompressed client-side in a worker) so intermediaries see opaque binary and can't corrupt negotiation. For Echo the cheap variant is msgpack/binary payloads on Socket.IO (parser swap) and, later, payload-level compression for large events (READY-equivalents, history batches) — both immune to the proxy issue that forced deflate off.
- Heartbeats: ping 25 s / timeout 20 s — roughly 2× Fluxer's keepalive traffic per idle connection; fine now, a knob later.
- **Presence:** per-process ref-counting (`backend/src/sockets/presenceSocketRegistry.ts`) so multi-tab users don't flap offline, with scoped emission per viewer (`presenceHandler.ts:40-55`). Equivalent in spirit to Fluxer's `presence_session`; the gap is only multi-node, which is explicitly deferred.
- **No inbound op-rate policing at the socket layer** apart from the message limiter (§7.2): there is no per-connection cap on arbitrary event spam (typing, presence flips, join/leave ops) comparable to Fluxer's 120/60 s envelope. Cheap to add in `eventMiddleware.ts` and worth doing before public exposure.

> **✅ Shipped (v2.2).**
>
> - **Op-rate policing** — `socketOpEnvelope.ts`, a GCRA envelope wired into `eventMiddleware.ts` (`ECHO_SOCKET_OPS_PER_MINUTE`, default 1800/min, full-window burst), caps **all** inbound ops per connection and ejects on breach with an `echo_socket_op_envelope_disconnects_total` metric — Echo's answer to Fluxer's 120/60 s envelope.
> - **CSR recovery handling** — the client now reads the `recovered` flag and only runs the REST resync (presence + attention + active-channel tail) when recovery **failed** (`createEchoRealtimeSocketConnectedExtra`), so a brief blip that CSR replays no longer triggers a herd of redundant fetches across reconnecting clients.
> - Compression and the explicit seq/ack contract remain deliberately deferred (payload-level binary/compression is the right shape; CSR covers the common case).

### 3.6 Corrections to v1 of this review

1. ~~"Adopt session resume (evaluate Socket.IO CSR)"~~ → CSR is already on; the remaining gap is explicit recovery semantics on the client and CSR-compatibility of the NATS adapter when that path activates.
2. ~~"Enable permessage-deflate"~~ → deliberately off for documented operational reasons; pursue payload-level binary/compression instead.

---

## 4. Message write path, end to end, both systems

The most instructive comparison in either codebase. Same product feature, two pipelines.

### 4.1 Fluxer: `MessageSendService.performSendMessage` (`packages/api/src/channel/services/message/MessageSendService.tsx:673-911`)

Step by step:

1. `getChannelAuthenticated` resolves channel + guild + member and returns **closures** `checkPermission`/`hasPermission` bound to a per-request permission context — downstream code can't accidentally re-fetch or check against a different member.
2. **Anti-abuse gate before anything else:** users who have never opened a gateway session cannot send (`UserFlags.HAS_SESSION_STARTED`, `:690-692`) — REST-only spam scripts are cut off at the first conditional.
3. **Slowmode via the shared GCRA limiter** with key `slowmode:{channel}:{user}`, `maxAttempts: 1`, `windowMs: rateLimitPerUser * 1000` (`:712-728`) — channel slowmode, API rate limits, and login throttles all ride one primitive (and one Valkey), honoring a `BYPASS_SLOWMODE` permission.
4. **Nonce idempotency:** `findExistingMessage({userId, nonce, expectedChannelId})` (`:741-748`) returns the previously created message for retried sends. (Read-before-write; see §4.3 — Echo's design here is better.)
5. Reference/forward resolution with explicit security reasoning: replying without `READ_MESSAGE_HISTORY` is allowed only within a recency cutoff; forwarding requires it outright (`:759-770`).
6. **Mention pipeline as two phases:** `extractMentions` (pure parse + `allowed_mentions` narrowing) then `validateMentions` (existence/visibility filtering vs channel + role mentionability) (`:797-830`) — parse is testable without IO, validation is auditable.
7. Persist via `persistenceService.createMessage` — one call owning denormalized writes (message row, author index, attachments, mention flags).
8. **Post-persist steps run in parallel:** `Promise.all([updateDMRecipients, processMessageAfterCreation (embeds/unfurl), updateReadStates])` (`:881-892`).
9. Gateway dispatch (`dispatchMessageCreate`) carries the nonce so the sender's client can reconcile its optimistic row.
10. Search indexing is **fire-and-forget** (`void this.deps.searchService.indexMessage(...)`, `:905-907`) and only when the channel is flagged indexed.

Telemetry brackets the whole thing (`withBusinessSpan`, `recordMessageSent`, `recordMessageSendDuration` with channel-type dimensions).

### 4.2 Echo: `chatMessageHandler` → `echoPersistedMessageCreateAndBroadcast`

Echo's socket path (`backend/src/sockets/chatMessageHandler.ts:80+`) does payload validation, the sliding-window limiter (§7.2), guest-abuse and IP-guest write blocks, permission evaluation with **denial-reason diagnostics and per-reason Prometheus counters** (`echoPermissionDenialReasonTotal`), spam filter, banned-words evaluation, slowmode, and format checks — then hands to the service (`backend/src/services/echoPersistedMessageCreate.ts:266+`):

attachment-ownership validation → upload-retention registration → mention scoping → reply-preview resolution (`resolveSafeReplyTo` re-validates the target's channel) → **insert with `clientMessageId` as the row id** → duplicate handling (§4.3) → author snapshot → room broadcast → DM thread bumps (per-recipient queries) → debounced attention fan-out (§6.2) → fire-and-forget link embeds, push notifications, Discord mirroring, emoji usage counts.

### 4.3 Where each design is better

**Echo's idempotency beats Fluxer's.** Echo uses the client message id _as the primary key_ and lets the unique constraint detect duplicates (`insertEchoMessage` returns `'inserted' | 'duplicate'`, `echoPersistedMessageCreate.ts:369-441`), with an explicit expiry window (`IDEMPOTENCY_EXPIRED` if the original row is older than `echoMessageIdempotencyMinutes`) and `duplicate_ack` returning the canonical row. Zero extra round trips on the happy path, race-free under concurrent retries. Fluxer's pre-insert nonce lookup (`findExistingMessage`) costs a read on _every_ send and has a theoretical race window between lookup and insert. This is a place Fluxer could learn from Echo.

**Fluxer's pipeline shape beats Echo's.** Three structural deltas, all actionable:

1. **Parallelism.** Fluxer runs post-persist side-effects in `Promise.all`; Echo's broadcast section is a long sequential `await` chain (`echoPersistedMessageCreate.ts:477-616`) — author snapshot, then per-DM-recipient thread queries _in a `for` loop_ (`:501-513`), then server-id lookup, then member list. The DM loop alone is `N+1` awaited queries before the next side-effect starts. Batching the thread query (one `WHERE user_id = ANY($1)`) and parallelizing independent side-effects is low-risk and shrinks p99 send latency directly.
2. **Hot-read amplification.** `listEchoServerMembers(pool, serverId)` runs on **every** server-channel message (`:529`) to feed the attention scheduler — full member scan per message, mitigated only by the 150 ms debounce downstream. The §2.3 membership cache eliminates it.
3. **Decomposition.** Fluxer's send path is ~10 single-purpose collaborators with interface-typed constructor deps (`MessageSendServiceDeps`, `:80-97`) — `MessageValidationService`, `MessageMentionService`, `MessagePersistenceService`, `MessageDispatchService` etc. — each mockable in isolation. Echo's equivalent logic spans a 704-line socket handler plus a 759-line service of free functions sharing a `pool`. Echo's new-code charter already mandates this style for new files; the message path is the highest-value candidate for applying it retroactively (it is also the hottest path in the product).

One more Fluxer detail worth copying: the **personal-notes channel** short-circuit (`isPersonalNotesChannel`, `:694-696`) keeps a product special case out of the main pipeline's permission logic instead of threading `if (isNotes)` through it.

---

## 5. Storage engine mechanics

### 5.1 Fluxer: Cassandra with a typed spec layer and a self-healing bucket index

- **Messages are partitioned `(channel_id, bucket)`** (`packages/api/src/Tables.tsx:539`) where `bucket = floor((snowflakeTime − FLUXER_EPOCH) / 10 days)` (`packages/snowflake/src/SnowflakeBuckets.tsx`, behavior pinned by `BucketUtils.test.tsx` — bucket 0 at epoch, increments every `TEN_DAYS_MS`). Reactions are partitioned the same way; secondary access paths get their own denormalized tables (`messages_by_author_id_v2`, `Tables.tsx:526`) instead of secondary indexes.
- **The sparse-channel problem is solved explicitly.** Naively walking 10-day buckets backwards in a quiet channel means dozens of empty reads. `BucketScanEngine.tsx` (`packages/api/src/channel/repositories/message/`) scans via an **index of non-empty buckets** (`listBucketsFromIndex`), marks buckets discovered empty (`onEmptyUnboundedBucket`) and touches buckets that have rows (`onBucketHasRows`) — the index is _self-healing_ as data is deleted or TTLs out. Every decision emits a typed trace event (`BucketScanTraceKind.{Start,ListBucketsFromIndex,FetchBucket,MarkBucketEmpty,…}`), so pagination behavior is unit-testable and debuggable in production. Dedup via `seenRowIds`, `stopAfterBucket` bounds, direction-aware.
- **The query layer enforces discipline mechanically:** every query goes through `prepared()` (`database/Cassandra.tsx:321`), `SELECT *` **throws** (`:876`, `:1013` — "Cannot prepare a statement that looks like `SELECT *`"), IN-params are normalized, and each table registers a typed spec (name/columns/partitionKey/primaryKey) consumed by the engine, telemetry, _and_ the alternate backend.
- **The same specs run on SQLite** (`database/SqliteKV.tsx`) selected by config — production Cassandra and a zero-dep self-host/dev backend share one repository layer. This is why their `compose.yaml` self-host stack is just `fluxer_server + valkey` (+ optional Meilisearch).

### 5.2 Echo: Postgres done properly

`backend/src/domain/echoMessagesDal.ts` uses keyset pagination (`before` cursor + `ORDER BY … DESC LIMIT`, `:1014-1086`) against composite indexes (`echo_messages(channel_id, created_at DESC)`, `(channel_id, id)` — `backend/src/db/echoTables.ts:269-272`); reaction summaries aggregate server-side (`array_agg(user_id ORDER BY user_id)` with deterministic ordering, `:546-552`); raw SQL is fenced into DALs by CI guard. For Echo's scale posture this is _correct_ — none of §5.1 should be adopted today.

What transfers anyway:

1. **A partitioning design note now, not at 100M rows.** The Postgres analogue of Fluxer's buckets is declarative range partitioning on `echo_messages` by `created_at` (or id-derived time). Retrofitting partitioning onto a huge table is a migration project; deciding the boundaries early is a one-page doc. Echo's purge index (`echo_messages_deleted_at_purge_idx`, `echoTables.ts:771`) shows retention work has started — partitioning makes both purge and retention nearly free (drop partition).
2. **The "no `SELECT *` in prepared paths" guard** is a two-line addition to Echo's existing SQL guard suite and prevents the classic column-add → row-width regression.
3. **BucketScanEngine's trace-event pattern** — typed trace events emitted from pagination/scan logic, asserted in tests — would fit Echo's DAL tests well (Echo already has the DB plumbing for it via `pgQueryContext.ts` labels).

### 5.3 Background work

Fluxer runs jobs on **NATS JetStream** (`JetStreamWorkerQueue` + `CronScheduler`, wired in `fluxer_server/src/index.tsx:9-14`) with a worker registry — durable, replayable, multi-consumer. Echo runs in-process `jobs/` + `workers/` on timers. Single-node-fine; the JetStream option is already latent in Echo's optional NATS dependency and is the natural first _distributed_ component when one is justified (it doesn't require distributing the API tier).

---

## 6. Caching, coalescing, batching

A taxonomy of every dedup/batch mechanism found, because this is where Fluxer's production scars show most clearly:

| Mechanism                         | Where                                       | What it dedupes                                                                                                             |
| --------------------------------- | ------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Request-scoped user-partial cache | `RequestCacheMiddleware.tsx`                | repeated user hydration within one request                                                                                  |
| RPC micro-batching                | `GatewayService.tsx:426+`                   | concurrent identical guild/member/permission RPCs                                                                           |
| Promise coalescer                 | `media_proxy/src/lib/InMemoryCoalescer.tsx` | concurrent fetches of the same remote asset — `Map<key, Promise>`, joiners await the in-flight promise, metrics on hit/miss |
| Reaction debounce + cancel        | `session_dispatch.erl:95-136`               | reaction event fan-out (650 ms, add+remove annihilate)                                                                      |
| Passive guild digest              | `guild_passive_sync.erl`                    | all events to unfocused guild sessions (30 s batches)                                                                       |
| Pending-presence queue            | `session.erl:64-66`                         | presence churn during READY                                                                                                 |
| KV pipeline                       | `packages/kv_client/src/KVPipeline.tsx`     | Valkey round trips                                                                                                          |

When written, Echo had exactly one such mechanism: `echoAttentionSnapshotScheduler.ts` — per-channel debounce (150 ms, env-tunable), accumulating user ids into a `Set`, then **one batched delta query** instead of per-user snapshot queries. The review flagged candidates for the rest.

> **✅ Shipped (v2.2).** Echo now has the full taxonomy:
>
> | Echo mechanism                                                  | Where                                       | What it dedupes                                                             |
> | --------------------------------------------------------------- | ------------------------------------------- | --------------------------------------------------------------------------- |
> | Attention debounce + batched delta                              | `echoAttentionSnapshotScheduler.ts`         | per-user snapshot queries after activity                                    |
> | Event-scoped user cache                                         | `echoEventUserCache.ts` (AsyncLocalStorage) | repeated `getUserById` within one send                                      |
> | Single-flight cold loads                                        | `shared/keyedCoalescer.ts`                  | concurrent cold misses for the same aggregate / member-roles / channel-meta |
> | Server permission aggregate                                     | `echoServerPermissionAggregateCache.ts`     | per-fold roles/channel/overwrite re-reads                                   |
> | Member-access / member-roles / member-ids / channel-meta caches | `echo*Cache.ts`                             | per-event point reads                                                       |
> | Unfurl in-flight coalesce + short-TTL result cache              | `linkUnfurl/unfurlCache.ts`                 | concurrent + repeated fetches of the same URL                               |
> | Broadcast-tail parallelism + batched DM-thread reads            | `echoPersistedMessageCreate.ts` (§4.3)      | sequential per-recipient queries                                            |
>
> The original "candidates" are addressed: the DM-recipient loop is parallelized + activity-bumped once (§4.3), `authorSnapshotForBroadcast` rides the event-scoped user cache, the per-message `serverId` lookup is reused, and link-embed resolution is coalesced. Remaining nit (low value): per-message emoji-usage increments still loop — fine, they're fire-and-forget and rare.

---

## 7. Rate limiting & abuse control

### 7.1 Fluxer: one algorithm, declared budgets, shared state

`packages/rate_limit/src/internal/GcraRateLimiter.tsx` is textbook GCRA: per-key theoretical-arrival-time, `emissionInterval = window/limit`, burst capacity = full window, remaining derived from TAT debt (`:52-65`), `retryAfter` in both integer and millisecond-precision decimal forms. Properties Echo's fixed windows lack: no edge-of-window double-burst, O(1) state (one timestamp per key), naturally smooth. State lives behind `ICacheService` — Valkey in prod (cross-process budgets), in-memory for tests, and **`KVRequiredError` refuses to boot prod with the in-memory fallback** (fail-closed against silent misconfiguration). Per-route budgets are _declared_ in `rate_limit_configs/` next to the routes; slowmode rides the same primitive (§4.1).

### 7.2 Echo: three local mechanisms

- REST: `@fastify/rate-limit` 150/min keyed `uid:` or `ip:` with Echo GET reads allow-listed into a scoped bucket (`backend/src/bootstrap/httpPlugins.ts:128-140`). Fixed-window, per-process.
- Socket messages: a hand-rolled sliding-window limiter — timestamps pruned per check, burst + per-minute tiers per `(userId, channelId)`, bounded at 20k keys with TTL + insertion-order eviction (`backend/src/sockets/messageRateLimiter.ts`). More accurate than fixed-window; memory-bounded; per-process.
- Plus genuinely good abuse plumbing Fluxer doesn't have in this form: guest-write combo blocking (`guestAbuseLimiter`), banned-word evaluation at send + post-persist application, spam filter, per-denial-reason metrics.

Gaps relative to Fluxer, in priority order: (1) budgets are scattered across three implementations with three semantics — adopting one GCRA utility behind an interface (swap-friendly to Valkey later) unifies them without infra changes; (2) no socket-layer _global_ op cap (§3.5); (3) per-process budgets mean the eventual second API node silently doubles every limit — the `KVRequiredError` fail-closed trick is the cheap insurance: make multi-node startup refuse in-memory limiters.

> **✅ Shipped (v2.2):** gap (2) is closed — a **GCRA** op envelope (`socketOpEnvelope.ts`, O(1) TAT state, full-window burst) now caps total inbound ops per connection and ejects on breach (§3.5). Echo now has its first GCRA primitive; gap (1) (unifying the three limiters behind it) and gap (3) (fail-closed multi-node) remain open.

---

## 8. Client architecture & rendering

### 8.1 Fluxer's message buffer — three zones with copy-on-write

`fluxer_app/src/lib/ChannelMessages.tsx` models a channel as **visible `messageList` + `beforeBuffer` + `afterBuffer`** (`MessageBufferSegment`, `:95-238`): segments keep an array + id-index, a `reachedBoundary` flag ("this segment touches the true start/end of history"), and side-aware `cache()/take()` with `MAX_MESSAGE_CACHE_SIZE` eviction that _clears the boundary flag_ when evicting (so "do we need to fetch?" never lies). Scrolling far, then jumping to present (`jumpToPresent:658`) or to a search hit (`jumpToMessage:686`) shuffles records between zones instead of refetching; mutations clone (`clone()`, draft-style updates) so MobX observers see object-identity changes. `ScrollManager.tsx` (1.3k lines) handles anchoring/restoration on top.

Echo composes the same outcome differently: `@tanstack/vue-virtual` in `MessageList.vue` (with documented handling of the initial-render race, `:908-922`, and virtualizer scroll-padding accounting) + `useEchoHistory` for paging + pending-message registration, + viewport persistence (`messageListViewportStorage.ts`). **Echo's choice is better on maintenance** (a maintained virtualizer vs 2.6k lines of bespoke scroll/buffer engine); the one Fluxer idea worth stealing is the **explicit boundary flag** — Echo's history composable infers "has more" from fetch results, and an honest `reachedBoundary` per direction is the difference between "no more messages" and "fetch failed/evicted" in edge cases (the `useEchoHistory` tests around optimistic seeds at `useEchoHistory.test.ts:266-303` are circling exactly this distinction).

### 8.2 Send queue and reconciliation

Fluxer: a typed serial `Queue` per channel (`MessageQueue.tsx:147+`) — nonce-keyed `AbortController`s so pending sends are cancellable individually or en masse on channel switch (`cancelRequest:175`, `:191-198`), attachment preparation bound to the nonce, `retry_after` honored from 429 bodies, and the nonce round-trips through the gateway dispatch so MESSAGE_CREATE replaces the optimistic row. Echo has the same skeleton (pending list keyed `clientMessageId`, `message_failed` with structured codes + diagnostics, idempotent server dedupe); the deltas worth adopting are **abortable in-flight sends** and **client-side `retry_after` respect** on the socket failure path.

### 8.3 State layer

Fluxer: 144 MobX stores + 18 immutable `*Record` classes (`fluxer_app/src/records/`) as the canonical entities stores share — updates create new records, making memoized React subtrees cheap and store cross-talk safe. `mobx-persist-store` for persistence; `MultiAccountGatewaySocket.tsx` (1.2k lines) multiplexes N live accounts. Echo's Pinia stores + `domain/` types are conceptually similar; the record-class discipline (one canonical immutable shape per entity, stores never hold ad-hoc partial objects) is the transferable idea — Echo's author-snapshot-merged-into-message pattern (`echoPersistedMessageCreate.ts:478`) is the server-side symptom of not having one.

### 8.4 WASM where it pays, build tuning

`crates/libfluxcore` (Rust → wasm-pack, built into the typecheck/build pipeline via `wasm:codegen`) does GIF/APNG/static crop+rotate and zstd frame decompression, run inside a worker (`LibFluxcore.Worker.tsx`) so decode never blocks the main thread. Build: hand-tuned `splitChunks.cacheGroups` per heavy dependency — icons/highlight.js/livekit/katex/framer-motion/mobx/sentry each get a named chunk with explicit priority (`rspack.config.mjs:465-540`) so editing app code never invalidates vendor chunks; plus generated emoji sprite sheets, avatar masks, a generated color system, thumbhash placeholders, and typed CSS modules (`tcm`). Echo equivalents to check rather than assume: Vite's default vendor chunking is coarser — a `manualChunks` pass for LiveKit/highlight/emoji assets is cheap; thumbhash/blurhash placeholders are an easy perceived-perf win; and Tauri means Echo already has a Rust toolchain when client-side media processing (or future E2EE) needs it.

---

## 9. Security mechanisms

### 9.1 Supply chain (unchanged from v1 — still the highest-ROI item)

`pnpm-workspace.yaml`: `minimumReleaseAge: 1440` (nothing published <24 h installable), `allowBuilds` allowlist (install scripts default-deny; only argon2/sharp/esbuild/etc. may run them), `blockExoticSubdeps`, `strictDepBuilds`, `trustPolicy: no-downgrade`, single version catalog. Echo/npm has none of these. Token-stealing transitive deps are squarely in a chat platform's threat model; this is the strongest argument for Echo's pnpm migration, ahead of speed.

### 9.2 Token & session handling

Both systems store only hashes: Fluxer looks sessions up by `getTokenIdHash(token)` (`AuthSessionService.tsx:51-91`) and even the Erlang gateway holds only `token_hash`, re-hashing presented tokens to verify (`session.erl:165-169`) — a compromised gateway core dump yields no replayable credentials. Echo hashes refresh tokens (sha256, `backend/src/auth/token.ts:48`); the open verification item is whether _every_ bearer-capable artifact (native bearer in `nativeBearer.ts`, desktop handoff per `e858605d`) has the same property, including in any realtime-tier memory.

Step-up auth: parity of concept (Fluxer `SudoModeMiddleware` with JWT-or-cookie proof and bot exemption; Echo `stepUpAuth.ts`). Fluxer's wrinkle worth copying: sudo proof accepted via header **or** scoped cookie keyed by user id, so multiple tabs share one elevation.

### 9.3 Defense at the edges

- Fluxer's media proxy stacks: tested SSRF guards (private-IP/metadata-endpoint cases in `FetchUtils.test.tsx:33`), a Cloudflare edge-IP allowlist that **self-refreshes** from published ranges (`CloudflareEdgeIPService.tsx:46-124`), request coalescing, ONNX NSFW classifier at 0.85 threshold (`NSFWDetectionService.tsx:41`), CSAM pipeline, `virus_scan` package — all in a process whose compromise doesn't touch the API. Echo serves uploads/unfurls from the main process; isolating fetch-and-transform behind its own origin remains the right pre-launch move (v1 rec stands, now with the note that Echo's link-embed resolver `echoLinkEmbeds.ts` is the first thing to move).
- Fail-closed posture: `RequireXForwardedForMiddleware` (refuse to serve if proxy headers absent in prod — IP-based limits can't silently key on the LB address) and `KVRequiredError` (§7.1). Both are tiny and worth cloning; Echo's `trustProxy`-aware `clientIpFromSocketHandshake` is careful but fails _open_ if a deploy forgets the proxy config.
- Echo-ahead items, unchanged: CSRF on a cookie-bearing API (`enforceApiCsrf` preHandler — Fluxer's pure-bearer model sidesteps rather than solves this), TOTP replay cache, disposable-email blocking, guest abuse limiter, machine-enforced RBAC/SQL guards.

---

## 10. Observability

Fluxer instruments **decisions**, not just durations: backpressure overflows carry `unacked_events` gauges (`session_dispatch.erl:348-370`), READY completion is a counter (`session_ready.erl:126`), every RPC method gets success/failure histograms (`GatewayRpcClient.tsx:55-78`), bucket scans emit replayable trace events (§5.1), business spans wrap domain operations (`withBusinessSpan`). Ops side: per-service deploys, canary→main promotion, scheduled **Cassandra backup-restore tests** in CI (`test-cassandra-backup.yaml`), Sentry both sides.

Echo's foundation is genuinely good and underrated by v1: correlation ids travel from socket handshake through persistence to broadcast logs (`handshakeCorrelationId`, `echo.message_broadcast_*`), Prometheus counters carry _reason_ dimensions (`echoPermissionDenialReasonTotal`, `echoMessageFailedTotal{code}`), handler durations are timed, and `pgQueryContext` labels queries by purpose. The real gaps: **no client-side error pipeline** (the #1 post-launch debugging tool), no canary tier, no backup-restore verification. All three are readiness-doc items, not code items.

---

## 11. Maintainability, tooling, tests

### 11.1 Where Fluxer is ahead

- **Toolchain speed:** pnpm + Turborepo remote cache + Biome + `tsgo` (the native TS compiler preview) + knip. Echo's `ci:precheck` re-runs everything on every push with npm+tsc+Prettier+ESLint+stylelint.
- **Generate, don't maintain:** OpenAPI from zod route schemas, self-hosting config docs from the config JSON-schema, i18n types from catalogs, CSS module types, color system, emoji sprites — all Turbo tasks with declared inputs/outputs (`turbo.json`). Echo hand-maintains `docs/contracts/` against typed Fastify routes; that drift class is fully automatable.
- **Package granularity:** ~50 `packages/*` with `workspace:*` edges (rate_limit, snowflake, markdown_parser, kv_client, csp…) — independently testable, knip-analyzable, and the reason their guards can be import-graph-level. Echo's three coarse workspaces force its guards to be regex-level.
- **Test infrastructure:** a dedicated `TestHarnessController` (3k lines of test-only API endpoints for fixture setup) + testcontainers integration workspace + eunit/dialyzer on the Erlang tier.

### 11.2 Where Echo is ahead — confirmed at depth

The deep dive _strengthened_ v1's conclusion here. Fluxer has no size ratchet and it shows in exactly the files a ratchet would catch (`Cassandra.tsx` at 1.9k lines includes an ANSI terminal pretty-printer inside the DB driver; `VoiceParticipantTile.tsx` 1.6k; the O(n) list-append in the session hot loop §3.1 is charter-C-grade code). Fluxer's layering is enforced by nothing but culture; Echo's is enforced by CI (`check:echo-routes`, `check:echo-rbac`, message-write funneling, MVC purity tests in the frontend like `mvcPurityGuards.test.ts`). Echo also has more test files (643 vs 525) despite being smaller.

The synthesis: **Fluxer optimizes the cost of building; Echo optimizes the cost of changing.** Echo should buy Fluxer's build-cost wins (pnpm/turbo/knip/codegen) without trading away its change-cost discipline — none of those tools conflict with the ratchet/charter/guards.

---

# Part II — Subsystem deep dives

These sections were added in the v2.1 expansion. They cover subsystems Part I touched only in passing — permissions, voice, E2EE, Trust & Safety, uploads, search, federation, errors, config, and CI — each read at the code level on both sides. Several **reverse earlier impressions**: Echo is meaningfully _ahead_ of Fluxer on voice E2EE and on security CI, and its CSAM posture is a deliberate design choice rather than a gap.

## 12. Permissions & RBAC model

Both implement the Discord permission model (roles + per-channel overwrites + a global `ADMINISTRATOR` bypass), but the **representation** diverges sharply, and that choice cascades into storage, performance, and tooling.

### 12.1 Fluxer — compact BigInt bitfield

`packages/constants/src/ChannelConstants.tsx:190` defines `Permissions` as a `BigInt` bitfield: `CREATE_INSTANT_INVITE: 1n << 0n` … `UPDATE_RTC_REGION: 1n << 53n`. A user's effective permissions are a single `bigint`; checks are `(perms & Permissions.SEND_MESSAGES) !== 0n`. Evaluation lives in the gateway (`fluxer_gateway/src/guild/guild_permissions.erl`) with a per-guild cache (`guild_permission_cache.erl`) invalidated by role/channel events (§2.1). Each permission carries a `PermissionsDescriptions` string for the UI.

**Pros:** tiny storage (one integer per role/overwrite), O(1) bitwise evaluation, exact Discord wire-compatibility (matters for their bot ecosystem and migration tooling). **Cons:** opaque — a stored `4503599627370496n` tells you nothing without the lookup table; no room for non-bit metadata; "why does this user have X" requires re-deriving the whole fold by hand.

### 12.2 Echo — string-keyed sets with an explainability layer

Echo represents permissions as **string keys** (`backend/src/domain/echoPermissionPrimitives.ts`: `ECHO_PERMISSIONS` is a `readonly string[]`, `EchoPermission` a union of those strings), stored in JSONB, with Discord-compatible names plus `ECHO_EXTENDED_PERMISSION_STRINGS` for Echo-only permissions and `LEGACY_ECHO_PERMISSION_ALIASES` to expand pre-canonical tokens from older rows. The overwrite fold is a precisely documented 8-layer precedence (`backend/src/domain/permissionOverwriteMerge.ts`): `@everyone deny → @everyone allow → @members deny → @members allow → role deny (union) → role allow (union) → member deny → member allow`, with the subtle Discord rule called out in a comment — **allow wins over deny across roles regardless of hierarchy** ("a muted role's `deny CONNECT` does NOT override a verified role's `allow CONNECT` even when muted is the higher role").

The differentiator is the **trace/explain layer Fluxer has no equivalent of**: `echoPermissionTrace.ts` (`emitTraceEvent`, `FoldTraceContext`, `recordCompressedBulkAdmin`) instruments the fold, and `permissionExplanation.ts` turns it into human-readable "this user can/can't do X because role Y at layer Z" output. There's also `echoPermissionPrimitivesSparse.ts` (a sparse representation for large permission sets) and `aggregateServerRoles.ts` (deterministic sort by position ASC, id ASC before union). This is supported by CI guards (`check:echo-rbac`) that force all permission checks through the sanctioned primitives.

### 12.3 Assessment

The string-keyed model is heavier per evaluation (set operations + JSONB vs one `bigint AND`) and Echo pays for it on every permission check — a real cost the gateway-cached BigInt model avoids. But it buys **self-describing storage, extensibility without bit-exhaustion** (Fluxer is already at bit 53 of 64 and has gaps), **machine-enforced correctness**, and **admin explainability** — the last is a genuine product feature (moderators asking "why can't this person post" get an answer) that the bitfield can't cheaply provide. Net: Fluxer's is faster and wire-compatible; Echo's is more maintainable and more debuggable. For Echo's stage the trade is right, and the trace layer is the kind of thing Fluxer will eventually have to bolt on. One thing Echo should take from Fluxer regardless: **cache the evaluated result** the way `guild_permission_cache.erl` does — Echo's `echoPermissionCache.ts` already exists and the membership-cache work (§2.3, now landed) rides its invalidation bus, so extending it to memoize folded permissions is low-friction.

## 13. Voice & video (LiveKit) architecture

Both use **LiveKit** as the SFU; the difference is entirely in the control plane around it, and it mirrors the §2 hot-state divergence.

### 13.1 Fluxer — voice state is gateway-resident and multi-region

Voice is one of the largest gateway subsystems: `fluxer_gateway/src/guild/voice/` has ~18 modules — `guild_voice_state.erl`, `guild_voice_connection.erl`, `guild_voice_move.erl` (drag a user between channels), `guild_voice_permission_sync.erl`, `guild_voice_region.erl`, plus `call.erl` (967 lines) and `call_manager.erl` for DM calls, and `session_voice.erl` (459 lines) holding a per-session voice op queue with its own rate limit (`VOICE_UPDATE_RATE_LIMIT, 10` per second, `MAX_VOICE_QUEUE_LENGTH, 64`; §3.2). The API side (`packages/api/src/voice/`) issues LiveKit tokens (`VoiceService.tsx` + `LiveKitService`), and crucially carries **multi-region topology**: `VoiceRegionSelection.tsx`, `VoiceTopology.tsx`, and a `VoiceReconciliationWorker.tsx` that continuously reconciles LiveKit room state against the authoritative voice state (handles crashed clients, stuck participants). Region endpoints are derived per-server (`VoiceDataInitializer.tsx`).

### 13.2 Echo — voice state in Postgres, single-region, signed sidecar

Echo's voice control plane is service-layer: `echoVoice.ts`, `echoVoiceAccessEnforcement.ts` (permission gate on join), `echoVoiceLiveKitReconcile.ts` (the reconciliation analogue — converges DB voice-participant rows with LiveKit), `echoVoiceOfflineCleanup.ts` (sweeps stale participants), plus a **`voice-sidecar`** microservice with `verifyEchoForwardSignature.ts` — webhook/forward events from LiveKit are HMAC-signature-verified before the backend trusts them (a clean trust boundary Fluxer handles inside the monolith). The client `useLiveKitVoiceRoom.ts` is a 3,529-line composable — the single largest file in the frontend and a prime decomposition candidate.

### 13.3 Assessment

Fluxer's voice is built for **scale and operability the moment it ships**: multi-region selection, live "move member," a reconciliation worker, and an actor-per-call model that survives partial failure. Echo's is single-region with reconciliation + offline-cleanup jobs doing the same convergence work less continuously — appropriate for its stance, and the **signed-sidecar trust boundary is arguably cleaner** than Fluxer's in-monolith handling. The concrete debts Echo should track: (1) the 3.5k-line client composable is past every charter threshold and is where voice bugs will hide; (2) multi-region is a real future project (LiveKit supports it; the DB voice-state schema should not assume one region — worth a column now); (3) "move member between voice channels" and priority-speaker are product features Fluxer has and Echo will be asked for.

## 14. End-to-end encryption: messages and voice

This is the clearest case where **Echo is ahead of Fluxer**, and the v1/v2 reviews undersold it.

### 14.1 Messages

Fluxer ships client-side `E2EEncryption.tsx` (X25519 + AES-GCM, ephemeral-key envelopes; §9 of Part I) — a solid DM-message E2EE primitive. Echo has E2EE columns provisioned in the messages DAL and an `e2eeEnvelope`/`e2eeCiphertext`/`e2eeSenderDeviceId`/`e2eeEncryptionVersion` field set threaded through the send path (`echoPersistedMessageCreate.ts`), with an `E2EE_STORAGE_UNAVAILABLE` graceful-degradation branch when the columns aren't migrated. Rough parity in ambition; both early.

### 14.2 Voice — Echo has an MLS-style epoch system Fluxer lacks

Echo implements **epoch-based voice E2EE** (`backend/src/domain/echoStore/voiceE2ee.ts`): `echo_voice_e2ee_epochs` table, `getActiveVoiceE2eeEpoch`, `supersedeVoiceE2eeEpochsForChannel`, `EchoVoiceE2eeEpochRow`, `EchoVoiceE2eeEnvelopeInput`, with `echoDmVoiceE2eeRequired` enforcing E2EE on DM calls and `getEchoChannelVoiceE2eeEnabled` per-channel gating. **Epoch supersession on membership change is the MLS forward-secrecy property** — when someone joins or leaves a call, the old key epoch is retired so a new member can't read past frames and a departed member can't read future ones. There are dedicated tests (`test:echo:voiceE2ee`, `test:echo:mlsDelivery`). The corresponding scan of Fluxer's voice package and client surfaced **no voice-frame E2EE / SFrame / MLS epoch machinery** — its E2EE is message-oriented.

### 14.3 Assessment

Encrypting media frames through an SFU is hard (the SFU forwards opaque frames; key distribution must be out-of-band and re-keyed on membership change), and Echo has built the epoch-supersession spine for exactly that. This is a real architectural lead. Two cautions worth recording in the doc rather than acting on: (1) E2EE's value is end-to-end, so the **client** key-management and the LiveKit insertable-streams wiring are where correctness actually lives — the server epoch table is necessary but not sufficient; (2) key-epoch supersession races with join/leave churn (the §3 voice op-queue exists partly for this) and deserves property tests around concurrent membership changes.

## 15. Trust & Safety: CSAM, NSFW, moderation

Running a real service at 125k users forces T&S plumbing that pre-launch projects usually defer. Fluxer's is **industrial**; Echo's is a deliberately-scoped framework with the legal obligations written down rather than coded.

### 15.1 Fluxer — a full regulated pipeline

`packages/api/src/csam/` is ~17 modules implementing the complete legally-mandated flow: `PhotoDnaHashClient.tsx` + `PhotoDnaMatchService.tsx` (Microsoft PhotoDNA perceptual-hash matching), `SynchronousCsamScanner.tsx` (block-on-upload scan), `NcmecReporter.tsx` + `NcmecSubmissionService.tsx` (mandatory reporting to the US NCMEC CyberTipline), `CsamEvidenceService.tsx` + `CsamEvidenceRetentionService.tsx` + `CsamLegalHoldService.tsx` (evidence preservation and legal hold), `CsamReportSnapshotService.tsx`, and a scan queue (`CsamScanQueueService.tsx`). Alongside it: a `virus_scan` package with provider abstraction + result cache + failure handling, an ONNX **NSFW classifier** in the media proxy (`NSFWDetectionService.tsx`, 0.85 threshold), word-list filtering (`packages/api/src/words/` with `scales.txt`/`tails.txt`), and a full `report/` + `moderation/` domain. This is what a service that is itself legally the operator must build.

### 15.2 Echo — scan hooks plus an explicit operator legal checklist

Echo has a CSAM pipeline too — `backend/src/services/csamScan/` (`scanner.ts` runs configured hash/external scanners for images, `index.ts`'s `runEchoUploadIntegrityRegisterStep` brackets the upload-register flow, `purgeUploadObject.ts`) — but its defining choice is `legalPrerequisites.ts`: a `CSAM_OPERATOR_LEGAL_PREREQUISITES` constant that **enumerates the operator's obligations as documentation** ("Obtain access to an official hash program e.g. Microsoft PhotoDNA on-premises under the vendor's terms — do not use unofficial hash lists"; "follow applicable mandatory reporting e.g. NCMEC CyberTipline … and counsel's retention guidance"). Plus banned-words (`echoStore/bannedWords/`: `matcher.ts`, `messageEval.ts`, `wordlists.ts`, `configDal.ts`), a server spam filter, reports, and the guest-abuse limiter.

### 15.3 Assessment

This is not "Fluxer has T&S, Echo doesn't" — it's two correct postures for two stages. Echo provides the **scan hook + a written legal framework** so a self-hoster or the eventual operator knows exactly what they must wire up (PhotoDNA license, NCMEC reporting, retention) without Echo shipping — and being liable for — a half-built version. Fluxer ships the whole regulated pipeline because it _is_ the operator. The honest finding for Echo: before any **public, Echo-operated** instance, the items in `legalPrerequisites.ts` stop being documentation and become a build list — NCMEC submission, PhotoDNA matching, evidence retention/legal-hold are non-optional, and Fluxer's `csam/` package is the reference implementation to study. Until then, Echo's framing is the responsible one.

## 16. Attachment, upload & media-processing pipeline

### 16.1 Fluxer — an isolated media service that transforms and validates

`packages/media_proxy/src/lib/` is a full media tier: `MediaValidation.tsx` + `CodecValidation.tsx` + `MimeTypeUtils.tsx` (magic-byte and codec validation, not trusting `Content-Type`), `ImageProcessing.tsx` + `FFmpegUtils.tsx` + `MediaTransformService.tsx` (server-side transcode/resize), `NSFWDetectionService.tsx`, `CloudflareEdgeIPService.tsx` (self-refreshing CF edge-IP allowlist), `InMemoryCoalescer.tsx` (the dedup primitive Echo just adopted for unfurls, §6 / the unfurl-cache landed this session), and `S3Utils.tsx`. Decode and transcode — the CPU-heavy, CVE-prone work (sharp/ffmpeg) — happen in a **separate process** whose compromise doesn't reach the API or DB.

### 16.2 Echo — upload integrity in-process, retention-aware

Echo's upload path (`backend/src/api/routes/echo/echoUploads.ts`, `services/echoUploadContentTypePolicy.ts`, `services/storedMediaUrl.ts`) does presigned S3 uploads with a content-type policy, an upload **read-token** scheme (`uploadReadToken.test.ts`), retention registration (`jobs/chatUploadRetention.ts` — attachments are GC'd unless a message references them), the CSAM register-step (§15), and a **video HLS worker** (`workers/videoHls.ts`) for adaptive-bitrate transcode. Validation and the CSAM scan run in the API/worker processes, not an isolated origin.

### 16.3 Assessment

Echo's retention model (upload → register-on-message → GC-if-unreferenced) and signed read-tokens are genuinely good and arguably cleaner than Fluxer's. The two real gaps, both already on the §9.3 list and reinforced here: (1) **process isolation** — image/video decode and unfurl fetch should live behind their own origin/process before public launch, because a `sharp`/`ffmpeg` decoder CVE in the API process is a direct path to the DB; Fluxer's `media_proxy` is the blueprint and Echo already has the `voice-sidecar` pattern to copy. (2) **Magic-byte validation** — Fluxer validates codecs and magic bytes rather than trusting declared content-type; Echo's content-type policy should be backed by `magic-bytes`-style sniffing on the server, not just the policy table.

## 17. Search & indexing

Fluxer runs a pluggable engine behind a `SearchFactory` (Part I §2): `packages/elasticsearch_search/` and `packages/meilisearch_search/` each provide a client, filter utils, and **index definitions**, with Meilisearch for self-host and Elasticsearch for production. Message indexing is fire-and-forget off the send path (`void searchService.indexMessage(...)`, only when the channel is flagged indexed; §4.1).

Echo takes the single-node-consistent path: **Postgres-native** message search. `echoMessagesDal.ts` maintains a `searchIndexText` column populated on insert (§4.2), `echoMessageSearchFlags.ts` governs which messages are indexable, and `db/echoMessageSearchIndexHealth.ts` monitors index health. No separate search engine to run, deploy, or keep consistent.

**Assessment:** correct for the stance — Postgres full-text (GIN on `to_tsvector`) carries Echo well past its CCU target, and avoids the dual-write consistency problem Fluxer's fire-and-forget indexing accepts (a dropped index job silently loses a message from search). The transferable idea is small: Fluxer's **index definitions as data** (one schema consumed by the engine and by tests) is worth mirroring if/when Echo's search filters grow, so the indexable-field set has one source of truth. No need for Meilisearch until Postgres FTS demonstrably can't keep up.

## 18. Federation — Fluxer's relay, and what it implies for Echo

Fluxer is building **federation**, and it's a non-trivial slice of the codebase: `fluxer_relay/` (an Erlang relay service), `fluxer_relay_directory/` (a TypeScript directory service with its own OpenAPI), and `packages/api/src/federation/` with an `EncryptionMiddleware.tsx` and a `KeyManager` (federation is encrypted server-to-server, with key management and tests). There's also AT-Protocol/Bluesky integration (`packages/api/src/bluesky/`, `@atproto/api` in the catalog). Echo has **none** of this — it's a single-instance model.

**Assessment:** this is a forward-looking dimension, not a current gap — federation is explicitly _not_ in Echo's scope and shouldn't be. The value of noting it: federation is the kind of thing that is **very expensive to retrofit** if the core data model assumes single-instance identity (user IDs, channel IDs, and signatures all change meaning across a federation boundary). Echo doesn't need to build it, but two cheap hedges are worth a design note now: (1) keep user/identity references nominally instance-qualifiable (today they're bare snowflakes — fine, but the _contracts_ shouldn't assume globally-unique-means-local), and (2) Fluxer's encrypted-relay + directory split is a sane reference architecture to keep in the back pocket. Bluesky/AT-proto bridging is purely a product call.

## 19. Error taxonomy, validation & resilience

A quiet but large maintainability divergence.

**Fluxer** models errors as a **typed hierarchy of 266 classes across 20 domains** (`packages/errors/src/domains/{auth,channel,csam,federation,guild,payment,voice,…}/`, plus a `FluxerError extends HTTPException` base, `ValidationError`, `ErrorHandler`, `CaptchaErrors`). Every failure mode is a named class with a stable code and HTTP status, serialized uniformly, and — because the `errors` package depends on `i18n` — **localized server-side**. Validation is `valibot`/`zod` schemas feeding the same error surface; the OpenAPI generator reads those schemas (§11). The result: the failure contract is as typed and discoverable as the success contract.

**Echo** is lighter and more procedural: `backend/src/api/errors.ts` exposes `sendError(reply, statusCode, code, message, detail?)` plus domain helpers (`sendEchoChannelAccessDenied` maps a denial reason to 404/403), `shared/echoJumpEmbedErrors.ts` for one feature, and the structured socket `message_failed` codes (§4.2) with per-reason Prometheus counters (`echoMessageFailedTotal{code}`, `echoPermissionDenialReasonTotal`). It's effective and well-instrumented, but error codes are string literals scattered across call sites rather than a typed registry, and there's no server-side error i18n.

**Assessment:** Echo's per-reason **metrics** are actually a dimension Fluxer doesn't emphasize (Echo can answer "what's the top message-rejection reason this hour" off the shelf), and for its size the procedural approach is fine. But as surface grows, the lack of a typed error registry is the same drift risk as the hand-maintained contracts (§11): a code can be emitted that no client knows, or renamed without anyone noticing. A lightweight `as const` error-code registry shared with the frontend (mirroring the `MessageFailedCode` union that already exists for sockets, extended to REST) would capture most of Fluxer's benefit without the 266-class apparatus. Server-side error i18n is a genuine future need only when Echo localizes — not now.

## 20. Config, secrets, feature flags & i18n

**Configuration.** Fluxer's config is a **JSON-schema-typed package** (`packages/config`) that generates both the typed accessor and the self-hosting documentation (`turbo.json`'s `schema:generate` → `configuration.mdx`; §11). Echo's config is `backend/src/config.ts` — a **1,418-line god file** of hand-rolled `process.env.X` parsers with inline validation (and a god-file baseline the ratchet guards; this session's socket-envelope tunable was deliberately kept _out_ of it for that reason). The contrast is stark and concrete: every new Echo setting grows a single 1.4k-line file that must be read top-to-bottom to audit; Fluxer adds a schema entry and gets typing + docs for free. **This is the strongest standalone case in the review for adopting schema-driven config** — it directly attacks an Echo god file that only grows.

**Secrets.** Echo has `backend/src/config/secrets.ts` and `productionConfigGates.ts` (refuses to boot in prod with missing/placeholder secrets — a fail-closed posture that matches Fluxer's `RequireXForwardedFor`/`KVRequiredError` philosophy from §9). Good on both sides.

**Feature flags / kill switches.** Echo has `shared/integrationKillSwitches.ts` (e.g. `YOUTUBE_INTEGRATION_ENABLED`) — compile-time-ish flags threaded through code. Fluxer's tier/limit system (`packages/limits`, admin-configurable) is a richer runtime-configurable entitlements layer. For Echo's stage, kill-switches are enough; the limits/entitlements model becomes relevant only with monetization.

**i18n.** Fluxer uses **Lingui** with an extract → auto-translate → compile pipeline and **generated message types** (`packages/i18n/src/` has `interpolation`, `normalization`, `runtime`; types are codegen'd per §11), and localizes server-side error and email content. Echo's i18n is frontend-centric (`frontend/src/i18n/` — `index.ts`, `labels.ts`, `apiErrors.ts`, 14 locale JSONs) with no server-side localization. Parity of intent on the client; Fluxer is ahead on the generation pipeline and server-side coverage. The transferable piece is again **codegen** (typed message keys) rather than the framework choice.

## 21. CI, release engineering & deployment

This **reverses the Part-I impression** that Fluxer is simply "ahead on ops." The two are ahead in _different halves_.

**Echo is ahead on security CI.** `.github/workflows/` has 14 workflows including a genuinely strong security posture Fluxer's 23 (mostly per-service _deploy_) workflows don't foreground: **`codeql.yml`** (static analysis), **`dependency-review.yml`** (`fail-on-severity: high`, `fail-on-scopes: runtime` — blocks PRs introducing high-sev runtime-dep vulns), **`secret-scan.yml`**, and **`security-audit.yml`** (`npm audit --audit-level=high --omit=dev`). Plus per-platform pipelines (android/ios/desktop/backend/frontend/e2e/format/workspaces). This materially **narrows the §9.1 supply-chain gap**: Echo already blocks _known-vulnerable_ deps at PR time. What it still lacks vs Fluxer is the **cooldown** (`minimumReleaseAge`) that blocks _freshly-published, not-yet-known-bad_ versions — the window that fast-moving npm malware exploits before a CVE exists. So the §9.1 recommendation narrows to: add a publish-age cooldown (Renovate `minimumReleaseAge`, or pnpm's) on top of the dependency-review Echo already runs.

**Fluxer is ahead on deployment automation.** Per-service deploy workflows, **canary → main promotion** (`promote-canary-to-main.yaml`), gateway hot-reload restarts, a Cassandra migration workflow, and **scheduled backup-restore tests** (`test-cassandra-backup.yaml`) — the CD machinery of a live service. Echo's release flow is the documented GitLab-internal / GitHub-`release/1.0.0`-mirror model; canary and backup-restore-testing remain readiness-doc items (§10).

**Assessment:** the two postures fit their stages — Echo, pre-launch, has invested in _catching bad code/deps before merge_; Fluxer, in production, has invested in _shipping and recovering safely_. Each should borrow the other's strength: Echo adds the dependency cooldown + (pre-launch) a backup-restore CI job and a canary stage; Fluxer would benefit from Echo's CodeQL/secret-scan gates. Echo's security-CI investment is underrated by Part I and deserves explicit credit.

## 22. Scorecard and prioritized actions

### Scorecard by dimension

| Dimension                | Verdict                                                                                                                                                                                                                                         |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Realtime protocol design | **Fluxer, clearly** — ack'd event buffer, explicit resume contract, reaction debounce+cancel, lazy member lists, passive digests, inbound op policing                                                                                           |
| Hot-state architecture   | **Was Fluxer; now near-parity at single-node** — Echo shipped the in-RAM server aggregate + member/role/channel caches; warm folds hit the DB zero times (flag-gated). Fluxer keeps exact (vs sweep) invalidation + the distributed tier (§2.2) |
| Message pipeline shape   | **Fluxer** (parallelism, decomposition) — except idempotency, where **Echo's design is strictly better** (§4.3)                                                                                                                                 |
| Storage                  | Both correct for their scale; Fluxer's bucket-index self-healing and `SELECT *` ban are portable; Echo needs a partitioning note                                                                                                                |
| Rate limiting            | **Fluxer** (one GCRA, declared budgets, shared state, fail-closed); Echo added a GCRA op envelope (§7.2) but still has three limiter semantics + per-process budgets                                                                            |
| Client rendering         | Tie — Echo's library choice is sounder; Fluxer's boundary flags, abortable sends, record discipline are worth taking                                                                                                                            |
| Security                 | Split: Fluxer wins supply chain + edge isolation + fail-closed config; Echo wins CSRF/auth depth + machine-enforced guards                                                                                                                      |
| Observability            | Echo's foundation better than v1 credited; missing client errors, canary, backup tests                                                                                                                                                          |
| Maintainability          | **Echo** on enforcement, **Fluxer** on toolchain + codegen                                                                                                                                                                                      |
| Permissions / RBAC       | Split: Fluxer faster + wire-compatible (BigInt bitfield); **Echo more maintainable + has a trace/explain layer** Fluxer lacks (§12)                                                                                                             |
| Voice / video            | **Fluxer** on scale (multi-region, move-member, reconciliation worker); Echo's signed-sidecar boundary is cleaner; 3.5k-line client is a debt (§13)                                                                                             |
| End-to-end encryption    | **Echo, clearly** — MLS-style epoch-superseding voice E2EE Fluxer has no equivalent of (§14)                                                                                                                                                    |
| Trust & Safety / CSAM    | **Fluxer** ships the full regulated pipeline (PhotoDNA/NCMEC/legal-hold); Echo ships scan hooks + a written operator legal checklist — right per stage (§15)                                                                                    |
| Uploads / media          | Echo's retention + read-token model is clean; **Fluxer wins on process isolation + magic-byte validation** (§16)                                                                                                                                |
| Search                   | Both right for stage — Fluxer dual-engine + index-defs-as-data; Echo Postgres-native FTS avoids dual-write inconsistency (§17)                                                                                                                  |
| Federation               | **Fluxer** building it (encrypted relay + directory + AT-proto); out of Echo's scope — cheap contract hedges only (§18)                                                                                                                         |
| Error taxonomy           | **Fluxer** (266 typed classes, i18n'd) vs Echo's procedural `sendError`; Echo wins on per-reason **metrics** (§19)                                                                                                                              |
| Config & i18n            | **Fluxer** (schema-driven config + generated docs, Lingui codegen) vs Echo's 1.4k-line `config.ts` god file — strongest standalone codegen case (§20)                                                                                           |
| CI / deployment          | Split — **Echo ahead on security CI** (CodeQL/dep-review/secret-scan); **Fluxer ahead on CD** (canary, backup-restore tests) (§21)                                                                                                              |

### Actions, re-ranked after the deep dive

> **Status (v2.2, 2026-06-13).** The entire **"do now"** tier (1–4) is **shipped**, plus parts of the "before public exposure" tier (unfurl coalescing; the in-memory permission tier from §2.3 #2 expanded well past the original ask). `✅` = done, `◐` = partially done, `☐` = open. Details in [IN_MEMORY_SERVER_STATE_PLAN.md](./IN_MEMORY_SERVER_STATE_PLAN.md).

**Do now (small, hot-path or high-risk):**

1. ✅ Parallelize + batch the message broadcast tail (§4.3) — `Promise.all` side-effects, batched DM-thread reads, reused `serverId`.
2. ✅ **(expanded)** Event-scoped cache utility **+ the full in-RAM server-permission aggregate tier** (§2.2–§2.3) — removes the per-message `listEchoServerMembers` and the per-fold roles/overwrites reads; warm folds hit the DB zero times (aggregate fold flag-gated, default OFF pending the Postgres parity suite).
3. ✅ Socket-layer global GCRA op envelope per connection, eject-on-breach (§3.5, §7.2). _(Fail-closed multi-node refinement still open.)_
4. ◐ Client: `recovered === false` after CSR now triggers scoped rehydration (§3.5). ☐ `retry_after` honoring + abortable pending sends (§8.2) still open.
5. ☐ Supply-chain **cooldown** — Echo already runs `dependency-review` (fail-on high/runtime), `npm audit`, CodeQL, and secret-scan (§21), so the remaining gap is _fresh-malware_ before a CVE exists: add a publish-age cooldown (Renovate `minimumReleaseAge`, or pnpm's on migration) + an install-script allowlist (§9.1, §21).

**Do before public exposure:** 6. ◐ Isolate unfurl/media fetch into its own process/origin with tested SSRF guards — **in-flight coalescing + short-TTL result cache shipped** (`unfurlCache.ts`); process/origin isolation still open (§9.3, §6, §16). 7. ☐ Unify the three rate-limit implementations behind one GCRA interface with declared per-route budgets — Echo now has a GCRA primitive (§7.2) to build on (§7). 8. ☐ Client error reporting pipeline; backup-restore as scheduled CI; canary noted in readiness doc (§10, §21). 9. ☐ `SELECT *` guard in the SQL guard suite; partitioning design note for `echo_messages` (§5.2). 10. ☐ **CSAM build-list** — before any Echo-operated public instance, the items in `legalPrerequisites.ts` (PhotoDNA matching, NCMEC submission, evidence retention/legal hold) become non-optional; Fluxer's `csam/` is the reference (§15). 11. ☐ **Magic-byte upload validation** — back the content-type policy with server-side `magic-bytes` sniffing, not just the policy table (§16).

**Adopt opportunistically:** 12. ☐ **Schema-driven config** to dismantle the 1.4k-line `config.ts` god file (typed accessor + generated docs from a JSON schema) — the highest-leverage codegen win (§20). 13. ☐ OpenAPI generation from route schemas; knip; Turbo-style caching (§11.1). 14. ☐ A typed **error-code registry** shared with the frontend (extend the existing `MessageFailedCode` union to REST) instead of scattered string literals (§19). 15. ✅ Memoize folded permissions — the folded result is cached in `echoPermissionCache` and now backed by the in-RAM aggregate on cold-fold (§2.2, §12). 16. ☐ Boundary flags in `useEchoHistory`; immutable record discipline for shared entities; thumbhash placeholders; Vite `manualChunks` for heavy vendors (§8). 17. ☐ Decompose `useLiveKitVoiceRoom.ts` (3.5k lines) and add a region column to voice-state schema before multi-region is needed (§13). 18. ☐ Member-list range subscriptions — contract-level prep only (§3.3).

**Explicitly do not adopt:** Erlang/second runtime, Cassandra, NATS RPC tier, bespoke scroll engine, Electron, JSON-only-but-scaffolded codec complexity, federation, a dedicated search engine. Echo's single-node stance survived this review intact a third time — Fluxer's own SQLite + `fluxer_server` "small mode" remains the quiet proof that Echo's current shape is the one even Fluxer needs to maintain.

### What the deep dive changed about the verdict

Part I read as "Fluxer is the more sophisticated system Echo should learn from." Part II complicates that in Echo's favor on three axes worth stating plainly: Echo is **ahead on voice E2EE** (epoch supersession is real forward secrecy Fluxer hasn't built), **ahead on security CI** (CodeQL + dependency-review + secret-scan gate every PR), and **more debuggable on permissions** (the trace/explain layer). Fluxer's leads are concentrated where 125k production users force them — Trust & Safety depth, error-taxonomy completeness, deployment automation, multi-region voice, and the schema-/codegen-driven toolchain. The synthesis from Part I holds and sharpens: **Fluxer optimizes the cost of operating at scale; Echo optimizes the cost of changing and of being audited.** The single highest-leverage thing Echo can borrow without touching its architecture is Fluxer's **"generate, don't maintain"** discipline — applied first to `config.ts` (§20), then to API contracts and error codes — because that is what is quietly turning a few Echo files into god files while Fluxer's equivalents stay small.

**v2.2 update.** The single biggest gap this review identified — the §2 hot-state architecture, "the single biggest structural performance difference between the two codebases" — has since been closed at the single-node level: Echo built its own in-RAM server aggregate so warm permission folds touch the DB zero times, the Fluxer §2.1 property, using a `Map` + Redis invalidation bus rather than an Erlang actor tier. The residual differences are now (a) Fluxer's exact event-driven invalidation vs Echo's coarser server-generation sweep + TTL, and (b) the distributed tier itself — both of which Echo's stance explicitly defers. The standing recommendation is unchanged and now even clearer: the remaining high-leverage wins for Echo are not architectural, they're the **codegen/toolchain** items (schema-driven config, OpenAPI, error registry) that keep the codebase cheap to change as it grows.
