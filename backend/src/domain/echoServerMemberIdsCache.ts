/**
 * In-process cache of a server's member user ids. The full member-id list is read on
 * every guild message broadcast and message edit/delete (attention fan-out targets),
 * yet it only changes on join/leave/kick/ban — so refetching it per message is a full
 * member scan on the hottest write path.
 *
 * **What's cached:** the `user_id` list per `serverId` (ids only — display name/pfp
 * callers keep using {@link listEchoServerMembers}, which stays uncached).
 *
 * **Invalidation:** piggybacks on the permission cache exactly like
 * `echoMemberStateCache`: every membership mutation already calls
 * `invalidateEchoPermissionCacheForServer`/`ForUser`, and both invalidators drop the
 * server's member-id entry (locally and, via the cache-invalidation bus, on every
 * other node). Fills are generation-bracketed by the caller so a stale read cannot
 * repopulate the cache after invalidation deletes the entry.
 */

const TTL_MS = 20_000;
const MAX_ENTRIES = 5_000;

type CacheEntry = { memberUserIds: readonly string[]; expiresAt: number };

const cache = new Map<string, CacheEntry>();

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

export function getCachedServerMemberUserIds(
  serverId: string,
): readonly string[] | null {
  const hit = cache.get(serverId);
  if (hit && hit.expiresAt > Date.now()) return hit.memberUserIds;
  if (hit) cache.delete(serverId);
  return null;
}

export function setCachedServerMemberUserIds(
  serverId: string,
  memberUserIds: readonly string[],
): void {
  prune();
  cache.set(serverId, { memberUserIds, expiresAt: Date.now() + TTL_MS });
}

/**
 * Drop the cached member-id list for a server. Called by the permission cache's
 * server- and user-scoped invalidators (join/leave are user-scoped mutations but
 * still change the server's list).
 */
export function invalidateServerMemberUserIds(serverId: string): void {
  cache.delete(serverId);
}

export function resetEchoServerMemberIdsCacheForTests(): void {
  cache.clear();
}
