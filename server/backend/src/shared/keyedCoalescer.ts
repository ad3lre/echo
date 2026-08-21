/**
 * In-flight de-duplication ("single-flight") keyed by string.
 *
 * Concurrent calls for the same key share one in-flight Promise, so a thundering herd of
 * cold cache misses for the same server/channel (e.g. many simultaneous message sends right
 * after a role edit cold-cleared the aggregate) issues **one** DB load instead of N. The
 * entry is removed when the promise settles (success or failure), so this coalesces only
 * *concurrent* work — it is not a result cache (each caller's own cache layer handles
 * persistence and TTL). Mirrors Fluxer's media-proxy InMemoryCoalescer (review §6).
 */
export type KeyedCoalescer<T> = {
  /** Share the in-flight load for `key`, or start one with `fn`. */
  run(key: string, fn: () => Promise<T>): Promise<T>;
  /** Number of in-flight loads (test/observability). */
  readonly size: number;
  /** Drop all in-flight tracking (tests only). */
  clear(): void;
};

export function createKeyedCoalescer<T>(): KeyedCoalescer<T> {
  const inflight = new Map<string, Promise<T>>();
  return {
    run(key: string, fn: () => Promise<T>): Promise<T> {
      const existing = inflight.get(key);
      if (existing) return existing;
      let started: Promise<T>;
      try {
        started = fn();
      } catch (err) {
        return Promise.reject(
          err instanceof Error ? err : new Error(String(err)),
        );
      }
      const tracked = started.finally(() => {
        // Only clear if we are still the active entry (one entry per key holds; defensive).
        if (inflight.get(key) === tracked) inflight.delete(key);
      });
      inflight.set(key, tracked);
      return tracked;
    },
    get size(): number {
      return inflight.size;
    },
    clear(): void {
      inflight.clear();
    },
  };
}
