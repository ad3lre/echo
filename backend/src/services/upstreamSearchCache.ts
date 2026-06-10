/** Simple in-process TTL cache for upstream search proxies (GIF, YouTube). */

const DEFAULT_TTL_MS = 5 * 60_000;
const MAX_ENTRIES = 500;

type Entry<T> = { expiresAt: number; data: T };

export function createUpstreamSearchCache<T>(ttlMs = DEFAULT_TTL_MS) {
  const cache = new Map<string, Entry<T>>();

  function prune(now = Date.now()): void {
    for (const [k, v] of cache) {
      if (v.expiresAt <= now) cache.delete(k);
    }
    while (cache.size > MAX_ENTRIES) {
      const oldest = cache.keys().next().value as string | undefined;
      if (!oldest) break;
      cache.delete(oldest);
    }
  }

  return {
    get(key: string): T | null {
      const hit = cache.get(key);
      if (!hit) return null;
      if (hit.expiresAt <= Date.now()) {
        cache.delete(key);
        return null;
      }
      return hit.data;
    },
    set(key: string, data: T): void {
      prune();
      cache.set(key, { data, expiresAt: Date.now() + ttlMs });
    },
  };
}
