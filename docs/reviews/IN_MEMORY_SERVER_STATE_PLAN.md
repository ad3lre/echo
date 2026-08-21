# Plan — In-memory server-state tier (Echo's single-node analogue of Fluxer's guild process)

**Date:** 2026-06-12
**Status:** Phases 1–5 implemented and live. Phase 1 (channel-metadata cache) is always on.
Phases 2–4 (server permission aggregate incl. owner id + member role-ids + cached membership
gate, single **and** batch folds — warm folds hit the DB zero times) are **on by default**
via the aggregate fold (`ECHO_PERM_AGGREGATE_CACHE=false` opts out to the direct-DB fold).
`isMemberOfServer` is deduped onto the cached member-access state. Phase 5: the cold-load tier (aggregate,
member role-ids, channel metadata) is now single-flight via `keyedCoalescer`, so a thundering
herd of concurrent cold misses for the same key issues one DB load. The optional
`EchoServerState` facade was **deliberately not built** — a no-behavior-change reorganization
with churn risk; the per-cache modules + shared invalidators are the working "guild process."
**Context:** Follows [FLUXER_VS_ECHO_REVIEW.md](./FLUXER_VS_ECHO_REVIEW.md) §2 ("where does hot state live?"). The review's biggest structural finding was that Fluxer serves hot reads (permissions, members, channel metadata) from the guild process's RAM and only touches the database for durability, while Echo reads Postgres on hot paths. This plan adapts that idea to Echo's single-node-first architecture **without** adopting Erlang, an actor model, or a second runtime.

---

## 1. Reframing — Echo already has most of the machinery

The "move state to memory" idea is not greenfield. Echo already runs a Fluxer-like in-memory tier:

- **Cross-node invalidation bus** — `server/backend/src/domain/cacheInvalidationBus.ts` (Redis pub/sub; remote nodes apply _local-only_ invalidation, never re-publish).
- **Per-server generation counters** — `echoPermissionCache.ts` (`getEchoPermissionCacheGeneration`) used to make in-flight async fills race-safe.
- **Caches already in RAM:**

| Cached today                                 | Module                                               | Key                                     |
| -------------------------------------------- | ---------------------------------------------------- | --------------------------------------- |
| Folded permission **result**                 | `echoPermissionCache.ts` (`tryGetCachedPermissions`) | `(serverId, userId, channelId)`         |
| Member access state (member / ban / timeout) | `echoMemberStateCache.ts`                            | `(serverId, userId)`                    |
| Channel → server id                          | `echoChannelServerCache.ts`                          | `channelId`                             |
| Server member-id list                        | `echoServerMemberIdsCache.ts`                        | `serverId`                              |
| Searchable channels                          | `echoSearchChannelCache.ts`                          | `serverId`                              |
| Per-event user (send path)                   | `echoEventUserCache.ts`                              | `userId` (AsyncLocalStorage, one event) |

- **~24 mutation sites already invalidate** via `invalidateEchoPermissionCacheForServer/ForUser/ForChannel` (in `roles.ts`, `permissionOverwrites.ts`, `categoriesWorkspace.ts`, `channelTreeMove.ts`, `roleOrdering.ts`, `roleCategories.ts`, `roleLinks.ts`, `selfAssignableRoles.ts`, `moderation.ts`, `servers.ts`, `forums.ts`, `tickets.ts`, the Discord-import/merge paths, …).

So the foundation — bus, generations, choke points — is done. The big-ticket item is the one piece Fluxer has that Echo doesn't: **the loaded server aggregate.**

## 2. The gap — what still hits Postgres on every hot path

`getEffectiveChannelPermissions` (`server/backend/src/domain/echoStore/roles/permissions.ts`) caches the **folded result** per `(server, user, channel)`. But:

1. Every **server-scoped invalidation clears all users** for that server (`localInvalidateForServer` deletes by `${serverId}\0` prefix in `echoPermissionCache.ts`). One role/overwrite edit cold-clears the whole server.
2. On a fold **miss**, evaluation re-reads from Postgres data that is **identical for every user in the server**:
   - `echo_roles` (the `@global` role + all roles) — `permissions.ts:77`
   - `echo_channels` category/metadata — `permissions.ts:94`
   - category overwrites — `permissions.ts:107`
   - channel overwrites — `permissions.ts:127`
   - member→roles (`echo_member_roles`) per fold

   → On a busy 500-member server, one role edit causes up to ~500 re-reads of the _same_ role/overwrite rows as the per-user cache re-warms.

3. **Channel metadata is not cached at all** and is read on every send: `selectEchoChannelMessageFormat` (`messageFormatChannel.ts`), slowmode (`permissionOverwrites.ts`), `echoChannelExistsInDb` (`access.ts`), forum context.
4. `evaluateEchoPostMessageAccess` (`echoPermissions.ts:31-36`) does a **raw** `SELECT 1 FROM echo_server_members` + ban check that largely duplicates the already-cached `getEchoMemberAccessState`.

## 3. What to move to memory — selection

**Move (high hit-rate, low churn, bounded size, server-scoped):**

| #   | Data                                                                                   | Read on    | Churn                  |
| --- | -------------------------------------------------------------------------------------- | ---------- | ---------------------- |
| 1   | Server **roles** `{id, position, permissions, role_type}`                              | every fold | low                    |
| 2   | Channel/category **tree + overwrites**                                                 | every fold | low                    |
| 3   | Channel **metadata** `{type, slowmode, message_format, flags, category_id, server_id}` | every send | low                    |
| 4   | **Member→roles** `Map<userId, roleId[]>`                                               | every fold | moderate (role grants) |

**Do NOT cache in this tier (out of scope / wrong shape):**

- Message content / history — unbounded; already keyset-paginated (`echoMessagesDal.ts`).
- DM threads — per-viewer (`getEchoDmRealtimeThreadForUser`).
- Attention snapshots — already debounced (`echoAttentionSnapshotScheduler.ts`).
- Anything durable / per-message.

**Don't duplicate** what's already cached (folded result, member access state, channel→server, member-ids).

## 4. The key adaptation — ride the invalidation choke points that already exist

Fluxer's guild process loads the aggregate once and invalidates on events it dispatches itself. Echo's single-node equivalent: a `Map<serverId, aggregate>` that hooks the **same** invalidators the ~24 mutation sites already call.

Concretely, extend the three local invalidators in `echoPermissionCache.ts`:

```
localInvalidateForServer(serverId)  → also drop serverAggregate[serverId]   + memberRoles[serverId]
localInvalidateForUser(serverId,u)  → also drop memberRoles[serverId][u]
localInvalidateForChannel(s,channel)→ also drop channelMeta[channel] (+ aggregate overwrites for channel)
```

Because every mutation site already routes through these, **the new caches get correct invalidation across all 24 sites and across nodes (via the Redis bus) with zero new call-site wiring** — exactly how `echoMemberStateCache` and `echoServerMemberIdsCache` already piggyback today. This is what makes the big item low-risk.

## 5. Phasing (risk ladder — each phase independently shippable)

### Phase 0 — Instrument (no behavior change)

Add OTel counters at `permissions.ts:77/94/107/127` (label via the existing `pgQueryContext`) to baseline per-fold DB reads. Becomes the regression assertion for later phases and quantifies the win. ~half a day.

### Phase 1 — Channel-metadata cache

New `echoChannelMetaCache.ts`: cache `echo_channels` rows (`type, slowmode, message_format, flags, category_id, server_id`) keyed by `channelId`; invalidate on channel mutations via the channel-level hook. Mirrors `echoChannelServerCache`. Removes the per-send channel reads (§2.3). Smallest, most self-contained — ship first.

### Phase 2 — Server roles + overwrites aggregate (the core)

New `echoServerAggregateCache.ts`:

```ts
type EchoServerAggregate = {
  roles: EchoRoleRow[]; // id, position, permissions, role_type
  channels: EchoChannelLite[]; // id, category_id, type
  categories: EchoCategoryLite[];
  overwrites: EchoOverwriteRow[]; // target_type, target_id, partial, scope (cat|channel)
  expiresAt: number;
};
const cache = new Map<string, EchoServerAggregate>(); // serverId → aggregate

export async function getEchoServerAggregate(
  pool,
  serverId,
): Promise<EchoServerAggregate>;
export function invalidateEchoServerAggregate(serverId): void; // called from localInvalidateForServer
```

`getEffectiveChannelPermissions` reads roles/channels/overwrites from the aggregate instead of `pool.query`; DB is touched only on a cold aggregate. Generation-bracketed fill (read `getEchoPermissionCacheGeneration` before load, store only if unchanged after). This is where the bulk of the per-fold reads disappear.

### Phase 3 — Member→roles cache

`Map<serverId, Map<userId, roleId[]>>`, invalidated by the existing **user-level** invalidator (role-grant mutations already call `invalidateEchoPermissionCacheForUser`). Removes the per-fold `echo_member_roles` read.

### Phase 4 — De-duplicate membership reads

Fold the raw `SELECT 1 FROM echo_server_members` + ban in `evaluateEchoPostMessageAccess` (`echoPermissions.ts:31-36`) onto the already-cached `getEchoMemberAccessState`. Pure cleanup; removes a redundant per-send query.

### Phase 5 (optional) — Unify + coalesce

An `EchoServerState` facade owning roles + channels + overwrites + member-roles behind one interface (the explicit "guild process in a Map"), plus a shared `coalesceByKey()` loader so two concurrent cold misses for the same server load **once** (review §2.3.3 / §6 — also reusable for the unfurl and attention paths).

## 6. Correctness & safety (all are existing house patterns)

- **Generation-bracketing** — read `getEchoPermissionCacheGeneration(serverId)` before the DB load; store only if it's unchanged after. Prevents a stale read from repopulating the cache after an invalidation deletes the entry. (Already used by `echoMemberStateCache` and `echoServerMemberIdsCache`.)
- **TTL backstop** — ~20s expiry like the sibling caches, so a missed invalidation self-heals.
- **Bounded size + prune** — existing LRU-ish eviction pattern; document the cap.
- **Multi-node** — per-process copies invalidated via the Redis bus (`publishCacheInvalidation` + local-only remote handlers). Consistent with the deferred-distribution stance; no shared store needed.
- **Memory budget** — roles/channels/overwrites per server are KB-scale; bound the number of resident servers. Trivial for the single-node target; documented cap.

## 7. Testing

- **Parity** — cached fold == uncached fold. Extend the existing `server/backend/src/tests/permissions/echo.permissionBatchParity.test.ts`.
- **Invalidation + bus** — mutate a role → aggregate dropped locally **and** published remotely. Pattern from `server/backend/src/tests/servers/echo.serverMemberIdsCache.test.ts`.
- **Generation race** — invalidation during an in-flight fill must not store stale.
- **Integration** — assert the send pipeline issues **zero** roles/overwrites/channel queries in steady state, via the Phase-0 metrics or `pgQueryContext` labels.
- All wired into `test:ci:backend` like the other cache tests.

## 8. Expected impact

Steady-state message send: permission evaluation served entirely from RAM (folded result + aggregate + member-roles + member-access), leaving only the durable message INSERT touching Postgres — the Fluxer §2.1 property. After a role edit on a 500-member server, re-warm cost drops from ~500 identical role/overwrite reads to **one** aggregate load. This is the single largest structural performance change available to Echo without distribution.

## 9. Scope guards (what this is explicitly NOT)

- **No second runtime / actor model** — a `Map` + the existing Redis bus is the correct single-node shape.
- **No caching of history / DM / per-viewer data** in this tier.
- **Lazy-load per server on first fold** — do not preload all servers at boot (mirrors Fluxer spawning guild processes on first connect; avoids cold-start thundering herds and unbounded memory).
- **Stays single-node-first** — per-process caches + bus invalidation; the shared-store version is a later, distribution-era concern (review §1, STACK.md ~50k CCU).

## 10. Suggested sequencing

Ship **Phase 0 → 1** first (instrument + channel cache) to prove the pattern and the measured win on the lowest-risk surface, then **Phase 2** (the aggregate) as its own reviewed change, then **3 → 4**. Phase 5 only if the `coalesceByKey` utility is wanted elsewhere (unfurl/attention) too.
