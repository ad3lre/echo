import { createHash } from 'crypto';
import Redis from 'ioredis';
import { echoIoredisClientOptions } from '../constants/ioredisEchoClient';
import { config } from '../config';

const REDIS_KEY_PREFIX = 'echo:local-upload-token:used:';

let redisClient: Redis | null = null;
const memUsedTokenExpMs = new Map<string, number>();

function tokenDigest(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

function getRedis(): Redis | null {
  if (!config.redisUrl?.trim()) return null;
  if (!redisClient) {
    redisClient = new Redis(config.redisUrl.trim(), echoIoredisClientOptions);
    redisClient.on('error', () => {});
  }
  return redisClient;
}

function pruneMem(nowMs: number): void {
  for (const [key, exp] of memUsedTokenExpMs.entries()) {
    if (exp <= nowMs) memUsedTokenExpMs.delete(key);
  }
}

export async function consumeLocalUploadTokenOnce(
  rawToken: string,
  expMs: number,
): Promise<boolean> {
  const token = rawToken.trim();
  if (!token) return false;
  const now = Date.now();
  const remainingMs = expMs - now;
  if (!Number.isFinite(remainingMs) || remainingMs <= 0) return false;
  const ttlSeconds = Math.max(1, Math.ceil(remainingMs / 1000));
  const digest = tokenDigest(token);
  const redis = getRedis();
  if (redis) {
    try {
      const setOk = await redis.set(
        `${REDIS_KEY_PREFIX}${digest}`,
        '1',
        'EX',
        ttlSeconds,
        'NX',
      );
      return setOk === 'OK';
    } catch {
      // Fall through to process-local tracking if Redis is unavailable.
    }
  }
  pruneMem(now);
  if (memUsedTokenExpMs.has(digest)) return false;
  memUsedTokenExpMs.set(digest, now + ttlSeconds * 1000);
  return true;
}

export function __resetLocalUploadTokenReplayForTests(): void {
  memUsedTokenExpMs.clear();
}
