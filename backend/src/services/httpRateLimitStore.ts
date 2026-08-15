/**
 * Shared Redis store for `@fastify/rate-limit` so multi-replica HTTP limits
 * are cluster-wide when `REDIS_URL` is set. Falls back to in-memory when Redis
 * is unset (local/memory mode).
 */
import Redis from 'ioredis';
import { config } from '../config';
import { echoIoredisClientOptions } from '../constants/ioredisEchoClient';

let client: Redis | null | undefined;

/** Returns a dedicated ioredis client for HTTP rate limits, or null when Redis is unset. */
export function getHttpRateLimitRedis(): Redis | null {
  if (client !== undefined) return client;
  const url = config.redisUrl?.trim();
  if (!url) {
    client = null;
    return null;
  }
  client = new Redis(url, {
    ...echoIoredisClientOptions,
    // Fail fast on blips; skipOnError keeps requests flowing.
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
  });
  return client;
}

/** Spread into `@fastify/rate-limit` options (`nameSpace` must be unique per limiter). */
export function httpRateLimitStoreOpts(nameSpace: string): {
  redis?: Redis;
  nameSpace?: string;
  skipOnError?: boolean;
} {
  const redis = getHttpRateLimitRedis();
  if (!redis) return {};
  return {
    redis,
    nameSpace,
    skipOnError: true,
  };
}
