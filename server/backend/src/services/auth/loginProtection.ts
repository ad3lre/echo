import Redis from 'ioredis';
import { echoIoredisClientOptions } from '../../constants/ioredisEchoClient';
import { config } from '../../config';

const REDIS_PREFIX = 'echo:login:';

let redisClient: Redis | null = null;

/** In-memory fallback: failure count and lockout-until per account key. */
const failureCountByKey = new Map<string, number>();
const lockedUntilByKey = new Map<string, number>();

function getRedis(): Redis | null {
  if (process.env.ECHO_CONFIG_TEST_ISOLATION === '1') return null;
  if (!config.redisUrl?.trim()) return null;
  if (!redisClient) {
    redisClient = new Redis(config.redisUrl.trim(), echoIoredisClientOptions);
    redisClient.on('error', () => {});
  }
  return redisClient;
}

export type LoginProtectionGate =
  | { ok: true }
  | { ok: false; reason: 'ACCOUNT_LOCKED'; retryAfterMs: number };

function backoffMs(failures: number, maxFailures: number): number {
  const startAfter = config.echoLoginBackoffAfterFailures;
  if (failures < startAfter) return 0;
  if (failures >= maxFailures) {
    return config.echoLoginLockoutDurationMs;
  }
  const exponent = failures - startAfter;
  const delay = config.echoLoginBackoffBaseMs * 2 ** exponent;
  return Math.min(delay, config.echoLoginLockoutDurationMs);
}

async function redisGetNumber(key: string): Promise<number | null> {
  const redis = getRedis();
  if (!redis) return null;
  try {
    const raw = await redis.get(key);
    if (!raw) return 0;
    const n = Number.parseInt(raw, 10);
    return Number.isFinite(n) ? n : 0;
  } catch {
    return null;
  }
}

async function redisLockedUntil(
  key: string,
  now: number,
): Promise<number | null> {
  const redis = getRedis();
  if (!redis) return null;
  try {
    const raw = await redis.get(`${REDIS_PREFIX}lock:${key}`);
    if (!raw) return 0;
    const until = Number(raw);
    return Number.isFinite(until) && until > now ? until : 0;
  } catch {
    return null;
  }
}

async function readState(
  key: string,
  now: number,
): Promise<{ failures: number; lockedUntil: number }> {
  const redisFailures = await redisGetNumber(`${REDIS_PREFIX}fail:${key}`);
  const redisLock = await redisLockedUntil(key, now);
  if (redisFailures !== null && redisLock !== null) {
    return { failures: redisFailures, lockedUntil: redisLock };
  }
  return {
    failures: failureCountByKey.get(key) ?? 0,
    lockedUntil: lockedUntilByKey.get(key) ?? 0,
  };
}

function gateFromState(lockedUntil: number, now: number): LoginProtectionGate {
  if (lockedUntil > now) {
    return {
      ok: false,
      reason: 'ACCOUNT_LOCKED',
      retryAfterMs: lockedUntil - now,
    };
  }
  return { ok: true };
}

export function loginProtectionKeyForUser(userId: string): string {
  return `uid:${userId}`;
}

export function loginProtectionKeyForUsername(username: string): string {
  return `user:${username.trim().toLowerCase()}`;
}

export async function evaluatePasswordLogin(
  accountKey: string,
  now = Date.now(),
): Promise<LoginProtectionGate> {
  const { lockedUntil } = await readState(`pw:${accountKey}`, now);
  return gateFromState(lockedUntil, now);
}

export async function recordPasswordLoginFailure(
  accountKey: string,
  now = Date.now(),
): Promise<void> {
  const redis = getRedis();
  const redisKey = `pw:${accountKey}`;
  if (redis) {
    try {
      const failKey = `${REDIS_PREFIX}fail:${redisKey}`;
      const n = await redis.incr(failKey);
      if (n === 1) await redis.expire(failKey, 86_400);
      const delay = backoffMs(n, config.echoLoginMaxPasswordFailures);
      if (n >= config.echoLoginMaxPasswordFailures || delay > 0) {
        const until =
          n >= config.echoLoginMaxPasswordFailures
            ? now + config.echoLoginLockoutDurationMs
            : now + delay;
        await redis.set(
          `${REDIS_PREFIX}lock:${redisKey}`,
          String(until),
          'PX',
          Math.max(until - now, 1000),
        );
      }
      return;
    } catch {
      /* mem fallback */
    }
  }

  const n = (failureCountByKey.get(redisKey) ?? 0) + 1;
  failureCountByKey.set(redisKey, n);
  const delay = backoffMs(n, config.echoLoginMaxPasswordFailures);
  if (n >= config.echoLoginMaxPasswordFailures || delay > 0) {
    lockedUntilByKey.set(
      redisKey,
      n >= config.echoLoginMaxPasswordFailures
        ? now + config.echoLoginLockoutDurationMs
        : now + delay,
    );
  }
}

export async function recordPasswordLoginSuccess(
  accountKey: string,
): Promise<void> {
  const redisKey = `pw:${accountKey}`;
  const redis = getRedis();
  if (redis) {
    try {
      await redis.del(`${REDIS_PREFIX}fail:${redisKey}`);
      await redis.del(`${REDIS_PREFIX}lock:${redisKey}`);
      return;
    } catch {
      /* mem fallback */
    }
  }
  failureCountByKey.delete(redisKey);
  lockedUntilByKey.delete(redisKey);
}

export async function evaluateMfaLogin(
  userId: string,
  now = Date.now(),
): Promise<LoginProtectionGate> {
  const key = loginProtectionKeyForUser(userId);
  const { lockedUntil } = await readState(`mfa:${key}`, now);
  return gateFromState(lockedUntil, now);
}

export async function recordMfaLoginFailure(
  userId: string,
  now = Date.now(),
): Promise<void> {
  const redisKey = `mfa:${loginProtectionKeyForUser(userId)}`;
  const redis = getRedis();
  if (redis) {
    try {
      const failKey = `${REDIS_PREFIX}fail:${redisKey}`;
      const n = await redis.incr(failKey);
      if (n === 1) await redis.expire(failKey, 86_400);
      const delay = backoffMs(n, config.echoLoginMaxMfaFailures);
      if (n >= config.echoLoginMaxMfaFailures || delay > 0) {
        const until =
          n >= config.echoLoginMaxMfaFailures
            ? now + config.echoLoginLockoutDurationMs
            : now + delay;
        await redis.set(
          `${REDIS_PREFIX}lock:${redisKey}`,
          String(until),
          'PX',
          Math.max(until - now, 1000),
        );
      }
      return;
    } catch {
      /* mem fallback */
    }
  }

  const n = (failureCountByKey.get(redisKey) ?? 0) + 1;
  failureCountByKey.set(redisKey, n);
  const delay = backoffMs(n, config.echoLoginMaxMfaFailures);
  if (n >= config.echoLoginMaxMfaFailures || delay > 0) {
    lockedUntilByKey.set(
      redisKey,
      n >= config.echoLoginMaxMfaFailures
        ? now + config.echoLoginLockoutDurationMs
        : now + delay,
    );
  }
}

export async function recordMfaLoginSuccess(userId: string): Promise<void> {
  const redisKey = `mfa:${loginProtectionKeyForUser(userId)}`;
  const redis = getRedis();
  if (redis) {
    try {
      await redis.del(`${REDIS_PREFIX}fail:${redisKey}`);
      await redis.del(`${REDIS_PREFIX}lock:${redisKey}`);
      return;
    } catch {
      /* mem fallback */
    }
  }
  failureCountByKey.delete(redisKey);
  lockedUntilByKey.delete(redisKey);
}

/** Test helper: reset in-memory state. */
export function __resetLoginProtectionForTests(): void {
  failureCountByKey.clear();
  lockedUntilByKey.clear();
}
