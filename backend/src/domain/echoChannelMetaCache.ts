/**
 * In-process cache of a channel's hot metadata row.
 *
 * The message-send path reads `echo_channels` several times for different column subsets
 * within one send — existence, `type` + `slowmode_seconds`, message-format template/hard,
 * and forum/parent context — each a separate query on the hottest write path. This caches
 * the consolidated row once per channel so those reads collapse to (at most) one DB hit.
 *
 * **What's cached:** `{ serverId, type, categoryId, parentChannelId, slowmodeSeconds,
 * messageFormatTemplate, messageFormatHard }` per `channelId`. Only positive rows are
 * stored — a miss may mean "created moments ago", and caching absence could hide a new
 * channel (mirrors {@link echoChannelServerCache}).
 *
 * **Invalidation:** rides the existing choke points, no new call-site wiring.
 *  - Every channel-settings mutation already calls `invalidateEchoPermissionCacheForServer`;
 *    the permission cache's server invalidator sweeps this cache by `serverId` (local + bus).
 *  - Channel **deletion** already broadcasts `channel:delete` on the invalidation bus; we
 *    drop the entry on that event too.
 *  - A short TTL backstops offline/edge mutation paths (migrations, bulk repair) that don't
 *    enumerate ids. A briefly-stale slowmode/format is low-harm and self-heals.
 */
import { registerCacheInvalidationHandler } from './cacheInvalidationBus';

const TTL_MS = 60_000;
const MAX_ENTRIES = 50_000;

export type EchoChannelMeta = {
  serverId: string | null;
  type: string;
  categoryId: string | null;
  parentChannelId: string | null;
  slowmodeSeconds: number;
  messageFormatTemplate: string;
  messageFormatHard: boolean;
};

type CacheEntry = { meta: EchoChannelMeta; expiresAt: number };

const cache = new Map<string, CacheEntry>();

/**
 * Monotonic counter bumped on any invalidation. A loader captures it before its DB read and
 * only stores the result if it is unchanged afterward — so an invalidation that races an
 * in-flight fill can never repopulate stale data. Keyed globally (not per-server) because
 * the cache is keyed by `channelId` and the fill learns `serverId` only after reading.
 */
let generation = 0;

export function getEchoChannelMetaGeneration(): number {
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

export function getCachedChannelMeta(
  channelId: string,
): EchoChannelMeta | null {
  const hit = cache.get(channelId);
  if (hit && hit.expiresAt > Date.now()) return hit.meta;
  if (hit) cache.delete(channelId);
  return null;
}

export function setCachedChannelMeta(
  channelId: string,
  meta: EchoChannelMeta,
): void {
  prune();
  cache.set(channelId, { meta, expiresAt: Date.now() + TTL_MS });
}

/** Drop a single channel's cached metadata (local only). */
export function invalidateChannelMeta(channelId: string): void {
  generation += 1;
  cache.delete(channelId);
}

/**
 * Drop every cached channel that belongs to a server. Called by the permission cache's
 * server-scoped invalidator, so every channel-settings mutation site clears the relevant
 * channel metadata for free. Linear sweep is fine: server invalidations are rare (admin
 * actions) and the cache is bounded.
 */
export function invalidateChannelMetaForServer(serverId: string): void {
  generation += 1;
  for (const [channelId, entry] of cache) {
    if (entry.meta.serverId === serverId) cache.delete(channelId);
  }
}

export function resetEchoChannelMetaCacheForTests(): void {
  cache.clear();
}

// Channel deletion is broadcast cross-node as `channel:delete` (see echoChannelServerCache).
registerCacheInvalidationHandler('channel:delete', (m) => {
  if (m.channelId) invalidateChannelMeta(m.channelId);
});
