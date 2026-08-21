/**
 * In-process cache for a member's *access state* in a server: membership, active ban, and
 * active communication timeout. These three are read on essentially every guild message
 * send and reaction ({@link evaluateEchoPostMessageAccess}) yet change rarely, so fetching
 * them fresh on each request is three uncached round-trips on the hottest write path.
 *
 * **What's cached:** `{ isMember, banned, timeoutUntilEpochMs }` per `${serverId}\0${userId}`.
 * `timeoutUntilEpochMs` is an *absolute* expiry — "is the timeout active" is recomputed at
 * read time against `Date.now()`, so a cached entry expires a timeout naturally without
 * staleness. `banned` is a point-in-time boolean; a *time-limited* ban that lapses mid-TTL
 * stays `true` until the entry expires, which only over-restricts (fails closed) briefly.
 *
 * **Invalidation:** this cache is not invalidated directly by callers. Instead it piggybacks
 * on the permission cache: every membership/ban/timeout mutation already calls
 * `invalidateEchoPermissionCacheForServer`/`ForUser`, and those invalidators clear the
 * matching member-state entries too (locally and — via {@link cacheInvalidationBus} — on
 * every other node). Fills bracket the DB read with
 * {@link getEchoPermissionCacheGeneration} (same generation counter as the permission cache)
 * so a stale read cannot repopulate the cache after invalidation deletes the entry.
 */

const TTL_MS = 20_000;
const MAX_ENTRIES = 50_000;

export type EchoMemberAccessState = {
  isMember: boolean;
  banned: boolean;
  /** Absolute epoch ms of an active timeout, or null when none. */
  timeoutUntilEpochMs: number | null;
};

type CacheEntry = EchoMemberAccessState & { expiresAt: number };

const cache = new Map<string, CacheEntry>();

function key(serverId: string, userId: string): string {
  return `${serverId}\0${userId}`;
}

function prune(now = Date.now()): void {
  for (const [k, v] of cache) {
    if (v.expiresAt > now) continue;
    cache.delete(k);
  }
  while (cache.size > MAX_ENTRIES) {
    const oldest = cache.keys().next().value as string | undefined;
    if (!oldest) break;
    cache.delete(oldest);
  }
}

export function getCachedMemberAccessState(
  serverId: string,
  userId: string,
): EchoMemberAccessState | null {
  const hit = cache.get(key(serverId, userId));
  if (hit && hit.expiresAt > Date.now()) {
    return {
      isMember: hit.isMember,
      banned: hit.banned,
      timeoutUntilEpochMs: hit.timeoutUntilEpochMs,
    };
  }
  if (hit) cache.delete(key(serverId, userId));
  return null;
}

export function setCachedMemberAccessState(
  serverId: string,
  userId: string,
  state: EchoMemberAccessState,
): void {
  prune();
  cache.set(key(serverId, userId), {
    ...state,
    expiresAt: Date.now() + TTL_MS,
  });
}

/** Drop every cached entry for a server. Called by the permission cache's server invalidator. */
export function invalidateMemberAccessStateForServer(serverId: string): void {
  const prefix = `${serverId}\0`;
  for (const k of [...cache.keys()]) {
    if (k.startsWith(prefix)) cache.delete(k);
  }
}

/** Drop the cached entry for one member. Called by the permission cache's user invalidator. */
export function invalidateMemberAccessStateForUser(
  serverId: string,
  userId: string,
): void {
  cache.delete(key(serverId, userId));
}

export function resetEchoMemberStateCacheForTests(): void {
  cache.clear();
}
