import { config } from '../config';

/** @deprecated use createSocketMessageRateLimiter */
export const MAX_MESSAGES_PER_MINUTE = 60;

/** @deprecated use createSocketMessageRateLimiter */
export function createMessageRateLimiter(
  limit = MAX_MESSAGES_PER_MINUTE,
): () => boolean {
  const messageCounts: number[] = [];
  return function checkMessageRate(): boolean {
    const now = Date.now();
    const cutoff = now - 60_000;
    while (messageCounts.length && messageCounts[0]! < cutoff) {
      messageCounts.shift();
    }
    if (messageCounts.length >= limit) {
      return false;
    }
    messageCounts.push(now);
    return true;
  };
}

type WindowBucket = number[];

const MAX_RATE_LIMIT_KEYS = 20_000;
const RATE_LIMIT_KEY_TTL_MS = 10 * 60_000;
const RATE_LIMIT_CLEANUP_EVERY_MS = 60_000;

/**
 * Per (userId, channelId): burst window + per-minute cap for message / edit / delete.
 */
export function createSocketMessageRateLimiter(opts?: {
  burstMax?: number;
  burstWindowMs?: number;
  perMinute?: number;
}): (userId: string, channelId: string) => boolean {
  const burstMax = opts?.burstMax ?? config.echoSocketBurstMax;
  const burstWindowMs = opts?.burstWindowMs ?? config.echoSocketBurstWindowMs;
  const perMinute = opts?.perMinute ?? config.echoSocketMsgPerMinute;

  const keys = new Map<
    string,
    { burst: WindowBucket; minute: WindowBucket; expiresAt: number }
  >();
  let lastCleanup = 0;

  function prune(now: number): void {
    if (
      now - lastCleanup < RATE_LIMIT_CLEANUP_EVERY_MS &&
      keys.size <= MAX_RATE_LIMIT_KEYS
    ) {
      return;
    }
    lastCleanup = now;
    for (const [key, state] of keys) {
      if (state.expiresAt > now) continue;
      keys.delete(key);
    }
    while (keys.size > MAX_RATE_LIMIT_KEYS) {
      const oldest = keys.keys().next().value as string | undefined;
      if (!oldest) break;
      keys.delete(oldest);
    }
  }

  return function check(userId: string, channelId: string): boolean {
    const key = `${userId}:${channelId}`;
    const now = Date.now();
    prune(now);
    let state = keys.get(key);
    if (!state) {
      state = { burst: [], minute: [], expiresAt: now + RATE_LIMIT_KEY_TTL_MS };
      keys.set(key, state);
    } else {
      state.expiresAt = now + RATE_LIMIT_KEY_TTL_MS;
    }

    const burstCut = now - burstWindowMs;
    while (state.burst.length && state.burst[0]! < burstCut) {
      state.burst.shift();
    }
    if (state.burst.length >= burstMax) {
      return false;
    }

    const minuteCut = now - 60_000;
    while (state.minute.length && state.minute[0]! < minuteCut) {
      state.minute.shift();
    }
    if (state.minute.length >= perMinute) {
      return false;
    }

    state.burst.push(now);
    state.minute.push(now);
    return true;
  };
}

const sharedSocketMessageRateLimiter = createSocketMessageRateLimiter();

export function getSharedSocketMessageRateLimiter(): (
  userId: string,
  channelId: string,
) => boolean {
  return sharedSocketMessageRateLimiter;
}
