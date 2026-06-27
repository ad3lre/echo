import { getInstancePolicy } from '../config/instancePolicy';
import { createGcraLimiter } from '../shared/gcraRateLimiter';

const MAX_RATE_LIMIT_KEYS = 20_000;

type SocketLimiter = ReturnType<typeof createGcraLimiter>;

let cachedSignature: string | null = null;
let sharedLimiter: SocketLimiter | null = null;

function socketLimitsSignature(): string {
  const socket = getInstancePolicy().limits.socket;
  return `${socket.messagesPerMinute}:${socket.burst.max}:${socket.burst.windowMs}`;
}

function getSharedLimiter(): SocketLimiter {
  const signature = socketLimitsSignature();
  if (!sharedLimiter || signature !== cachedSignature) {
    cachedSignature = signature;
    const socket = getInstancePolicy().limits.socket;
    sharedLimiter = createGcraLimiter(
      [
        { limit: socket.burst.max, windowMs: socket.burst.windowMs },
        { limit: socket.messagesPerMinute, windowMs: 60_000 },
      ],
      { maxKeys: MAX_RATE_LIMIT_KEYS },
    );
  }
  return sharedLimiter;
}

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
  if (
    opts?.burstMax != null ||
    opts?.burstWindowMs != null ||
    opts?.perMinute != null
  ) {
    const burstMax =
      opts.burstMax ?? getInstancePolicy().limits.socket.burst.max;
    const burstWindowMs =
      opts.burstWindowMs ?? getInstancePolicy().limits.socket.burst.windowMs;
    const perMinute =
      opts.perMinute ?? getInstancePolicy().limits.socket.messagesPerMinute;
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

  return function check(userId: string, channelId: string): boolean {
    return getSharedLimiter().check(`${userId}:${channelId}`).allowed;
  };
}

export function getSharedSocketMessageRateLimiter(): (
  userId: string,
  channelId: string,
) => boolean {
  return createSocketMessageRateLimiter();
}
