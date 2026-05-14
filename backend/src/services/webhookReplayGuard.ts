import { createHash } from 'crypto';
import Redis from 'ioredis';
import { echoIoredisClientOptions } from '../constants/ioredisEchoClient';
import { config } from '../config';

const REDIS_KEY_PREFIX = 'echo:webhook:delivery:';
const DEFAULT_TTL_SECONDS = 15 * 60;

let redisClient: Redis | null = null;
const memDeliveryExpMs = new Map<string, number>();

function getRedis(): Redis | null {
  if (!config.redisUrl?.trim()) return null;
  if (!redisClient) {
    redisClient = new Redis(config.redisUrl.trim(), echoIoredisClientOptions);
    redisClient.on('error', () => {});
  }
  return redisClient;
}

function digestDeliveryId(namespace: string, deliveryId: string): string {
  return createHash('sha256')
    .update(`${namespace}:${deliveryId}`, 'utf8')
    .digest('hex');
}

function pruneMem(nowMs: number): void {
  for (const [key, exp] of memDeliveryExpMs.entries()) {
    if (exp <= nowMs) memDeliveryExpMs.delete(key);
  }
}

export async function consumeWebhookDeliveryOnce(
  namespace: string,
  deliveryIdRaw: string,
  ttlSeconds = DEFAULT_TTL_SECONDS,
): Promise<boolean> {
  const deliveryId = deliveryIdRaw.trim();
  if (!namespace.trim() || !deliveryId) return false;
  const ttl = Math.max(1, Math.floor(ttlSeconds));
  const key = digestDeliveryId(namespace, deliveryId);
  const redis = getRedis();
  if (redis) {
    try {
      const ok = await redis.set(
        `${REDIS_KEY_PREFIX}${key}`,
        '1',
        'EX',
        ttl,
        'NX',
      );
      return ok === 'OK';
    } catch {
      // Fall through to process-local dedupe if Redis is unavailable.
    }
  }
  const now = Date.now();
  pruneMem(now);
  if (memDeliveryExpMs.has(key)) return false;
  memDeliveryExpMs.set(key, now + ttl * 1000);
  return true;
}
