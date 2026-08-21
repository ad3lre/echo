/**
 * In-process cache of a member's assigned role ids in a server.
 *
 * Permission evaluation needs the member's role-id set to select which of the server's roles
 * apply. With the server-permission aggregate ({@link echoServerPermissionAggregateCache})
 * holding all roles in RAM, this per-member set is the only user-specific read left in the
 * fold. Cached per `(serverId, userId)`.
 *
 * **Invalidation:** rides the permission cache's user- and server-scoped invalidators (role
 * grants are user-scoped; role create/delete are server-scoped — both can change which roles
 * a member effectively has), so every mutation site clears it for free, locally and across
 * nodes. Generation-bracketed fills make in-flight reads race-safe.
 */

const TTL_MS = 20_000;
const MAX_ENTRIES = 50_000;

type CacheEntry = { roleIds: ReadonlySet<string>; expiresAt: number };

const cache = new Map<string, CacheEntry>();

let generation = 0;

export function getEchoMemberRoleIdsGeneration(): number {
  return generation;
}

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

export function getCachedMemberRoleIds(
  serverId: string,
  userId: string,
): ReadonlySet<string> | null {
  const hit = cache.get(key(serverId, userId));
  if (hit && hit.expiresAt > Date.now()) return hit.roleIds;
  if (hit) cache.delete(key(serverId, userId));
  return null;
}

export function setCachedMemberRoleIds(
  serverId: string,
  userId: string,
  roleIds: ReadonlySet<string>,
): void {
  prune();
  cache.set(key(serverId, userId), {
    roleIds,
    expiresAt: Date.now() + TTL_MS,
  });
}

export function invalidateMemberRoleIdsForUser(
  serverId: string,
  userId: string,
): void {
  generation += 1;
  cache.delete(key(serverId, userId));
}

export function invalidateMemberRoleIdsForServer(serverId: string): void {
  generation += 1;
  const prefix = `${serverId}\0`;
  for (const k of [...cache.keys()]) {
    if (k.startsWith(prefix)) cache.delete(k);
  }
}

export function resetEchoMemberRoleIdsCacheForTests(): void {
  cache.clear();
}
