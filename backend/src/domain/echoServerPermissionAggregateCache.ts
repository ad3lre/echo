/**
 * In-process cache of a server's permission aggregate — the user-independent data the
 * permission fold needs: every role, every channel's category/overrides, and every channel
 * and category permission-overwrite row. This is the single-node analogue of Fluxer's guild
 * process holding the guild in RAM (see docs/reviews/IN_MEMORY_SERVER_STATE_PLAN.md §5/§2.2).
 *
 * The folded *result* is already cached per `(server,user,channel)`; this aggregate removes
 * the per-fold re-reads of roles/overwrites that those folds do on a cache miss — and every
 * server-scoped invalidation cold-clears all users, so after one role edit a busy server
 * would otherwise re-read identical role/overwrite rows once per member. With the aggregate,
 * that re-warm is a single load.
 *
 * **Invalidation:** rides the permission cache's server-scoped invalidator (every role/
 * overwrite/channel-settings mutation already calls it), local + cross-node. Fills are
 * generation-bracketed so a racing invalidation can't repopulate stale data.
 *
 * **Memory:** roles + overwrite rows per server are KB-scale; the cache is bounded and
 * TTL-backstopped. Intended for the single-node target; per-process copies under multi-node.
 */

const TTL_MS = 30_000;
const MAX_ENTRIES = 5_000;

export type AggRole = {
  id: string;
  position: number;
  permissions: unknown;
  roleType: string;
};

export type AggOverwriteRow = {
  id: string;
  target_type: string;
  target_id: string | null;
  partial: unknown;
};

export type ServerPermissionAggregate = {
  /** `echo_servers.owner_id`, or null when the server row is missing. Owner transfer
   * invalidates ForServer (access.ts), which drops this aggregate. */
  ownerId: string | null;
  /** All server roles, ordered by position ASC, id ASC. */
  roles: AggRole[];
  /** Lowest role position present — the `@everyone`/baseline tier (matches SQL `MIN(position)`). */
  minPosition: number;
  /** channelId → { categoryId, permissionOverrides (legacy JSONB fallback) }. */
  channelInfo: Map<
    string,
    { categoryId: string; permissionOverrides: unknown }
  >;
  /** channelId → overwrite rows. */
  channelOverwriteRows: Map<string, AggOverwriteRow[]>;
  /** categoryId → overwrite rows. */
  categoryOverwriteRows: Map<string, AggOverwriteRow[]>;
  /** categoryId → legacy JSONB override (used only when a category has no overwrite rows). */
  categoryLegacyOverride: Map<string, Record<string, unknown>>;
};

type CacheEntry = { aggregate: ServerPermissionAggregate; expiresAt: number };

const cache = new Map<string, CacheEntry>();

let generation = 0;

export function getEchoServerAggregateGeneration(): number {
  return generation;
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

export function getCachedServerAggregate(
  serverId: string,
): ServerPermissionAggregate | null {
  const hit = cache.get(serverId);
  if (hit && hit.expiresAt > Date.now()) return hit.aggregate;
  if (hit) cache.delete(serverId);
  return null;
}

export function setCachedServerAggregate(
  serverId: string,
  aggregate: ServerPermissionAggregate,
): void {
  prune();
  cache.set(serverId, { aggregate, expiresAt: Date.now() + TTL_MS });
}

export function invalidateServerAggregate(serverId: string): void {
  generation += 1;
  cache.delete(serverId);
}

export function resetEchoServerAggregateCacheForTests(): void {
  cache.clear();
}
