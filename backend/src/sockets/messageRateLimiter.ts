import { config } from '../config';
import { createGcraLimiter } from '../shared/gcraRateLimiter';

const MAX_RATE_LIMIT_KEYS = 20_000;

/**
 * Per (userId, channelId): burst window + per-minute cap for message / edit / delete /
 * reaction / pin / poll-vote sends. Backed by the shared GCRA limiter (two tiers: a short
 * burst window and a per-minute cap), so it keeps O(1) state per key instead of growing
 * timestamp arrays and limits smoothly (no edge-of-window unblock spike). Same caps as
 * before; a hit is allowed only when both tiers admit.
 */
export function createSocketMessageRateLimiter(opts?: {
  burstMax?: number;
  burstWindowMs?: number;
  perMinute?: number;
}): (userId: string, channelId: string) => boolean {
  const burstMax = opts?.burstMax ?? config.echoSocketBurstMax;
  const burstWindowMs = opts?.burstWindowMs ?? config.echoSocketBurstWindowMs;
  const perMinute = opts?.perMinute ?? config.echoSocketMsgPerMinute;

  const limiter = createGcraLimiter(
    [
      { limit: burstMax, windowMs: burstWindowMs },
      { limit: perMinute, windowMs: 60_000 },
    ],
    { maxKeys: MAX_RATE_LIMIT_KEYS },
  );

  return function check(userId: string, channelId: string): boolean {
    return limiter.check(`${userId}:${channelId}`).allowed;
  };
}

const sharedSocketMessageRateLimiter = createSocketMessageRateLimiter();

export function getSharedSocketMessageRateLimiter(): (
  userId: string,
  channelId: string,
) => boolean {
  return sharedSocketMessageRateLimiter;
}
