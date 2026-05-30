/**
 * In-process cache for merged Echo permissions (per server + user + optional channel).
 *
 * **Key shape:** `${serverId}\\0${userId}\\0${channelIdOrEmpty}` — channel omitted means server-only merged set.
 *
 * **Invalidation:** `invalidateEchoPermissionCacheForServer` / `ForUser` / `ForChannel` delete matching keys and
 * **bump a per-server generation counter** so in-flight async cache fills never write stale results after a race.
 * Call after: role create/update/delete, member role assign/remove, channel/category overwrite updates, ownership
 * transfer, etc.
 *
 * **Generation:** `invalidateEchoPermissionCacheForServer` also bumps `getEchoPermissionCacheGeneration(serverId)`
 * for observability (metrics/tests). Cache correctness relies on prefix deletion, not generation.
 */

import {
  publishCacheInvalidation,
  registerCacheInvalidationHandler,
} from './cacheInvalidationBus';

type CacheEntry = {
  value: Set<string>;
  expiresAt: number;
};

const CACHE_TTL_MS = 5 * 60_000;
const MAX_CACHE_ENTRIES = 10_000;

const cache = new Map<string, CacheEntry>();
const generation = new Map<string, number>();

function pruneCache(now = Date.now()): void {
  for (const [key, entry] of cache) {
    if (entry.expiresAt > now) continue;
    cache.delete(key);
  }
  while (cache.size > MAX_CACHE_ENTRIES) {
    const oldest = cache.keys().next().value as string | undefined;
    if (!oldest) break;
    cache.delete(oldest);
  }
}

export function getEchoPermissionCacheGeneration(serverId: string): number {
  return generation.get(serverId) ?? 0;
}

function bumpEchoPermissionCacheGeneration(serverId: string): void {
  generation.set(serverId, getEchoPermissionCacheGeneration(serverId) + 1);
}

export function cacheKey(
  serverId: string,
  userId: string,
  channelId?: string,
): string {
  return channelId
    ? `${serverId}\0${userId}\0${channelId}`
    : `${serverId}\0${userId}\0`;
}

function localInvalidateForServer(serverId: string): void {
  bumpEchoPermissionCacheGeneration(serverId);
  const prefix = `${serverId}\0`;
  for (const k of [...cache.keys()]) {
    if (k.startsWith(prefix)) cache.delete(k);
  }
}

function localInvalidateForUser(serverId: string, userId: string): void {
  bumpEchoPermissionCacheGeneration(serverId);
  const keyPrefix = `${serverId}\0${userId}\0`;
  for (const k of [...cache.keys()]) {
    if (k.startsWith(keyPrefix)) cache.delete(k);
  }
}

function localInvalidateForChannel(serverId: string, channelId: string): void {
  bumpEchoPermissionCacheGeneration(serverId);
  const prefix = `${serverId}\0`;
  for (const k of [...cache.keys()]) {
    if (!k.startsWith(prefix)) continue;
    // key shape: serverId\0userId\0channelIdOrEmpty
    const parts = k.split('\0');
    if (parts[2] === channelId) cache.delete(k);
  }
}

export function invalidateEchoPermissionCacheForServer(serverId: string): void {
  localInvalidateForServer(serverId);
  publishCacheInvalidation({ kind: 'perm:server', serverId });
}

export function invalidateEchoPermissionCacheForUser(
  serverId: string,
  userId: string,
): void {
  localInvalidateForUser(serverId, userId);
  publishCacheInvalidation({ kind: 'perm:user', serverId, userId });
}

export function invalidateEchoPermissionCacheForChannel(
  serverId: string,
  channelId: string,
): void {
  localInvalidateForChannel(serverId, channelId);
  publishCacheInvalidation({ kind: 'perm:channel', serverId, channelId });
}

// Apply invalidations broadcast by other instances to this process's local cache only
// (never re-publish — that would loop between nodes).
registerCacheInvalidationHandler('perm:server', (m) => {
  if (m.serverId) localInvalidateForServer(m.serverId);
});
registerCacheInvalidationHandler('perm:user', (m) => {
  if (m.serverId && m.userId) localInvalidateForUser(m.serverId, m.userId);
});
registerCacheInvalidationHandler('perm:channel', (m) => {
  if (m.serverId && m.channelId)
    localInvalidateForChannel(m.serverId, m.channelId);
});

const PERMISSION_CACHE_COMPUTE_MAX_RETRIES = 4;

/**
 * Synchronous cache read — returns cached permissions or null on miss.
 * Used by batch evaluation to avoid redundant DB work for already-cached channels.
 */
export function tryGetCachedPermissions(
  serverId: string,
  userId: string,
  channelId: string | undefined,
): Set<string> | null {
  const key = cacheKey(serverId, userId, channelId);
  pruneCache();
  const hit = cache.get(key);
  if (hit && hit.expiresAt > Date.now()) {
    cache.delete(key);
    cache.set(key, {
      value: new Set(hit.value),
      expiresAt: Date.now() + CACHE_TTL_MS,
    });
    return new Set(hit.value);
  }
  return null;
}

/**
 * Synchronous cache write — stores a pre-computed permission set.
 * Caller is responsible for generation-safety (check generation before/after bulk compute).
 */
export function setCachedPermissions(
  serverId: string,
  userId: string,
  channelId: string | undefined,
  value: Set<string>,
): void {
  const key = cacheKey(serverId, userId, channelId);
  pruneCache();
  cache.set(key, {
    value: new Set(value),
    expiresAt: Date.now() + CACHE_TTL_MS,
  });
  pruneCache();
}

export function getCachedMergedPermissions(
  serverId: string,
  userId: string,
  channelId: string | undefined,
  compute: () => Promise<Set<string>>,
): Promise<Set<string>> {
  const key = cacheKey(serverId, userId, channelId);
  pruneCache();
  const hit = cache.get(key);
  if (hit && hit.expiresAt > Date.now()) {
    cache.delete(key);
    cache.set(key, {
      value: new Set(hit.value),
      expiresAt: Date.now() + CACHE_TTL_MS,
    });
    return Promise.resolve(new Set(hit.value));
  }

  async function computeConsistent(): Promise<Set<string>> {
    let last: Set<string> = new Set();
    for (
      let attempt = 0;
      attempt < PERMISSION_CACHE_COMPUTE_MAX_RETRIES;
      attempt++
    ) {
      const startGen = getEchoPermissionCacheGeneration(serverId);
      last = await compute();
      if (getEchoPermissionCacheGeneration(serverId) === startGen) {
        return last;
      }
    }
    return last;
  }

  return computeConsistent().then((set) => {
    pruneCache();
    cache.set(key, {
      value: new Set(set),
      expiresAt: Date.now() + CACHE_TTL_MS,
    });
    pruneCache();
    return new Set(set);
  });
}
