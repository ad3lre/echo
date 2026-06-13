/**
 * Per-event memoization of `getUserById` for the message-send path.
 *
 * A single authenticated send reads the author from `auth_users` more than once —
 * the socket handler reads it for guest/abuse checks, then the broadcast snapshot
 * reads it again for the author display fields. Both hit the same wide uncached
 * query on the hottest write path. This binds a tiny cache to the current event's
 * async continuation (same `AsyncLocalStorage` approach as `pgQueryContext`) so
 * repeated reads of the same user within one send collapse to one query.
 *
 * Lifetime is exactly one event: the user cannot mutate mid-send, so this is
 * race- and staleness-free (unlike a TTL cache, which would show a stale display
 * name for a window after a profile edit). Outside a scope the loader runs
 * uncached, so call sites are safe to route through this unconditionally.
 */

import { AsyncLocalStorage } from 'node:async_hooks';
import type { AuthUser } from '../auth/types';

type EventUserCache = Map<string, Promise<AuthUser | null>>;

type UserByIdStore = { getUserById(id: string): Promise<AuthUser | null> };

const storage = new AsyncLocalStorage<EventUserCache>();

/** Run `fn` with a fresh per-event user cache bound to its async continuation. */
export function runWithEchoEventUserCache<T>(fn: () => T): T {
  return storage.run(new Map(), fn);
}

/**
 * Bind a fresh per-event user cache to the current async continuation (e.g. one
 * socket packet). Mirrors `enterPgQueryContext`: lets a single connection's event
 * own a cache without wrapping each handler body.
 */
export function enterEchoEventUserCache(): void {
  storage.enterWith(new Map());
}

/** Cache-aware `getUserById` for the current event; falls through uncached otherwise. */
export function loadEchoUserCached(
  store: UserByIdStore,
  userId: string,
): Promise<AuthUser | null> {
  return getEchoEventCachedUser(userId, () => store.getUserById(userId));
}

/**
 * Return the cached user for this event, or run `loader` and memoize it. A loader
 * that rejects is evicted so a later read in the same event can retry rather than
 * inheriting the failure; a resolved `null` (unknown user) is cached normally.
 */
export function getEchoEventCachedUser(
  userId: string,
  loader: () => Promise<AuthUser | null>,
): Promise<AuthUser | null> {
  const cache = storage.getStore();
  if (!cache) return loader();
  const hit = cache.get(userId);
  if (hit) return hit;
  const pending = loader().catch((err) => {
    cache.delete(userId);
    throw err;
  });
  cache.set(userId, pending);
  return pending;
}
