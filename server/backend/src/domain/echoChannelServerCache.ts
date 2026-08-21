/**
 * In-process cache for the immutable channel→server mapping.
 *
 * `echo_channels.server_id` is never UPDATEd (verified across the codebase) — a channel
 * belongs to one server for its whole lifetime. `getEchoChannelServerId` is the first
 * round-trip of nearly every access check (message send/fetch, reaction, socket join), so
 * caching it removes one DB query from the hottest path in the app.
 *
 * Only positive (found) results are cached: a miss might mean "created moments ago", and
 * caching null could hide a brand-new channel. The single mutation that matters is channel
 * **deletion** — `invalidateChannelServerId` drops the entry and broadcasts to other nodes
 * via {@link cacheInvalidationBus}. A short TTL backstops bulk/cascade deletes that don't
 * enumerate ids; a stale entry for a deleted channel is benign anyway (downstream
 * membership/FK checks fail closed — there's nothing to read or write in a gone channel).
 */
import {
  publishCacheInvalidation,
  registerCacheInvalidationHandler,
} from './cacheInvalidationBus';

const TTL_MS = 5 * 60_000;
const MAX_ENTRIES = 50_000;

const cache = new Map<string, { serverId: string; expiresAt: number }>();

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

export function getCachedChannelServerId(channelId: string): string | null {
  const hit = cache.get(channelId);
  if (hit && hit.expiresAt > Date.now()) return hit.serverId;
  if (hit) cache.delete(channelId);
  return null;
}

export function setCachedChannelServerId(
  channelId: string,
  serverId: string,
): void {
  prune();
  cache.set(channelId, { serverId, expiresAt: Date.now() + TTL_MS });
}

function localInvalidate(channelId: string): void {
  cache.delete(channelId);
}

/** Drop a channel from the cache locally and on every other instance. Call on delete. */
export function invalidateChannelServerId(channelId: string): void {
  localInvalidate(channelId);
  publishCacheInvalidation({ kind: 'channel:delete', channelId });
}

registerCacheInvalidationHandler('channel:delete', (m) => {
  if (m.channelId) localInvalidate(m.channelId);
});
