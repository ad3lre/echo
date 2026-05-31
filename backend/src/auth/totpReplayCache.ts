import Redis from 'ioredis';
import { echoIoredisClientOptions } from '../constants/ioredisEchoClient';
import { config } from '../config';

const REDIS_KEY_PREFIX = 'echo:totp:used:';
const TTL_SEC = 90;

let redisClient: Redis | null = null;
const usedCodes = new Map<string, number>();

setInterval(() => {
  const now = Date.now();
  for (const [key, expiresAt] of usedCodes.entries()) {
    if (now > expiresAt) usedCodes.delete(key);
  }
}, 60_000).unref();

function getRedis(): Redis | null {
  if (process.env.ECHO_CONFIG_TEST_ISOLATION === '1') return null;
  if (!config.redisUrl?.trim()) return null;
  if (!redisClient) {
    redisClient = new Redis(config.redisUrl.trim(), echoIoredisClientOptions);
    redisClient.on('error', () => {});
  }
  return redisClient;
}

function memKey(userId: string, code: string): string {
  return `${userId}:${code}`;
}

/**
 * Returns true if the code was already used.
 * Otherwise, marks it as used and returns false.
 * Uses Redis SET NX when available so replay checks work across instances.
 */
export async function checkAndMarkTotpUsed(
  userId: string,
  code: string,
): Promise<boolean> {
  const key = memKey(userId, code);
  const redis = getRedis();
  if (redis) {
    try {
      const ok = await redis.set(
        `${REDIS_KEY_PREFIX}${key}`,
        '1',
        'EX',
        TTL_SEC,
        'NX',
      );
      return ok === null;
    } catch {
      /* fall through to in-memory */
    }
  }
  if (usedCodes.has(key)) return true;
  usedCodes.set(key, Date.now() + TTL_SEC * 1000);
  return false;
}

/** Test helper: reset in-memory replay state. */
export function __resetTotpReplayCacheForTests(): void {
  usedCodes.clear();
}
