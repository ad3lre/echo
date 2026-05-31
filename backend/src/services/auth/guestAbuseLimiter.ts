import Redis from 'ioredis';
import { echoIoredisClientOptions } from '../../constants/ioredisEchoClient';
import { config } from '../../config';

const MS_HOUR = 60 * 60 * 1000;
const MS_DAY = 24 * MS_HOUR;

const REDIS_PREFIX = 'echo:guest:';

let redisClient: Redis | null = null;

/** Timestamps of successful guest mints per IP (rolling windows) — in-memory fallback. */
const mintTimestampsByIp = new Map<string, number[]>();
const mintTimestamps24hByIp = new Map<string, number[]>();
const guestMintBlockUntilByIp = new Map<string, number>();
const failedCaptchaCountByIp = new Map<string, number>();
const guestWriteComboBlockUntil = new Map<string, number>();

function getRedis(): Redis | null {
  if (process.env.ECHO_CONFIG_TEST_ISOLATION === '1') return null;
  if (!config.redisUrl?.trim()) return null;
  if (!redisClient) {
    redisClient = new Redis(config.redisUrl.trim(), echoIoredisClientOptions);
    redisClient.on('error', () => {});
  }
  return redisClient;
}

function pruneTimestamps(
  arr: number[],
  now: number,
  windowMs: number,
): number[] {
  const cutoff = now - windowMs;
  return arr.filter((t) => t > cutoff);
}

function comboKey(ip: string, guestId: string): string {
  return `${ip}|${guestId}`;
}

function hourBucket(now: number): string {
  return String(Math.floor(now / MS_HOUR));
}

function dayBucket(now: number): string {
  return String(Math.floor(now / MS_DAY));
}

export type GuestMintGate =
  | { ok: true; requireCaptcha: boolean }
  | { ok: false; reason: 'GUEST_MINT_LIMIT' | 'GUEST_MINT_BLOCKED' };

async function redisMintBlocked(ip: string, now: number): Promise<boolean> {
  const redis = getRedis();
  if (!redis) return false;
  try {
    const raw = await redis.get(`${REDIS_PREFIX}mint:block:${ip}`);
    if (!raw) return false;
    const until = Number(raw);
    return Number.isFinite(until) && until > now;
  } catch {
    return false;
  }
}

async function redisCounter(key: string): Promise<number> {
  const redis = getRedis();
  if (!redis) return -1;
  try {
    const raw = await redis.get(key);
    if (!raw) return 0;
    const n = Number.parseInt(raw, 10);
    return Number.isFinite(n) ? n : 0;
  } catch {
    return -1;
  }
}

/**
 * Call before creating a new guest (not cookie resume).
 */
export async function evaluateGuestMint(
  ip: string,
  now = Date.now(),
): Promise<GuestMintGate> {
  if (await redisMintBlocked(ip, now)) {
    return { ok: false, reason: 'GUEST_MINT_BLOCKED' };
  }

  const blockUntil = guestMintBlockUntilByIp.get(ip) ?? 0;
  if (blockUntil > now) {
    return { ok: false, reason: 'GUEST_MINT_BLOCKED' };
  }

  const redisHour = await redisCounter(
    `${REDIS_PREFIX}mint:h:${ip}:${hourBucket(now)}`,
  );
  if (redisHour >= 0) {
    if (redisHour >= config.guestMintMaxPerIpPerHour) {
      return { ok: false, reason: 'GUEST_MINT_LIMIT' };
    }
    const redisDay = await redisCounter(
      `${REDIS_PREFIX}mint:d:${ip}:${dayBucket(now)}`,
    );
    const requireCaptcha =
      config.turnstileSecretKey.trim().length > 0 &&
      config.guestMintCaptchaAfterN > 0 &&
      redisDay >= config.guestMintCaptchaAfterN;
    return { ok: true, requireCaptcha };
  }

  const hourList = pruneTimestamps(
    mintTimestampsByIp.get(ip) ?? [],
    now,
    MS_HOUR,
  );
  if (hourList.length >= config.guestMintMaxPerIpPerHour) {
    return { ok: false, reason: 'GUEST_MINT_LIMIT' };
  }

  const dayList = pruneTimestamps(
    mintTimestamps24hByIp.get(ip) ?? [],
    now,
    MS_DAY,
  );
  const requireCaptcha =
    config.turnstileSecretKey.trim().length > 0 &&
    config.guestMintCaptchaAfterN > 0 &&
    dayList.length >= config.guestMintCaptchaAfterN;

  return { ok: true, requireCaptcha };
}

export async function recordGuestMintSuccess(
  ip: string,
  now = Date.now(),
): Promise<void> {
  const redis = getRedis();
  if (redis) {
    try {
      const hKey = `${REDIS_PREFIX}mint:h:${ip}:${hourBucket(now)}`;
      const dKey = `${REDIS_PREFIX}mint:d:${ip}:${dayBucket(now)}`;
      const h = await redis.incr(hKey);
      if (h === 1) await redis.expire(hKey, 7200);
      const d = await redis.incr(dKey);
      if (d === 1) await redis.expire(dKey, 172_800);
      return;
    } catch {
      /* mem fallback below */
    }
  }

  const h = pruneTimestamps(mintTimestampsByIp.get(ip) ?? [], now, MS_HOUR);
  h.push(now);
  mintTimestampsByIp.set(ip, h);

  const d = pruneTimestamps(mintTimestamps24hByIp.get(ip) ?? [], now, MS_DAY);
  d.push(now);
  mintTimestamps24hByIp.set(ip, d);
}

export async function recordFailedGuestCaptcha(
  ip: string,
  now = Date.now(),
): Promise<void> {
  const redis = getRedis();
  if (redis) {
    try {
      const failKey = `${REDIS_PREFIX}captcha:fail:${ip}`;
      const n = await redis.incr(failKey);
      if (n === 1) await redis.expire(failKey, 86_400);
      if (n >= config.guestCaptchaFailBlockThreshold) {
        const until = now + config.guestCaptchaFailBlockDurationMs;
        await redis.set(
          `${REDIS_PREFIX}mint:block:${ip}`,
          String(until),
          'PX',
          config.guestCaptchaFailBlockDurationMs,
        );
      }
      return;
    } catch {
      /* mem fallback */
    }
  }

  const n = (failedCaptchaCountByIp.get(ip) ?? 0) + 1;
  failedCaptchaCountByIp.set(ip, n);
  if (n >= config.guestCaptchaFailBlockThreshold) {
    guestMintBlockUntilByIp.set(
      ip,
      now + config.guestCaptchaFailBlockDurationMs,
    );
  }
}

export async function blockGuestWritesForIpGuest(
  ip: string,
  guestUserId: string,
  now = Date.now(),
): Promise<void> {
  const until = now + config.guestAbuseComboBlockMs;
  const redis = getRedis();
  if (redis) {
    try {
      await redis.set(
        `${REDIS_PREFIX}write:block:${comboKey(ip, guestUserId)}`,
        '1',
        'PX',
        config.guestAbuseComboBlockMs,
      );
      return;
    } catch {
      /* mem fallback */
    }
  }
  guestWriteComboBlockUntil.set(comboKey(ip, guestUserId), until);
}

export async function isGuestWriteComboBlocked(
  ip: string,
  guestUserId: string,
  now = Date.now(),
): Promise<boolean> {
  const redis = getRedis();
  if (redis) {
    try {
      const v = await redis.get(
        `${REDIS_PREFIX}write:block:${comboKey(ip, guestUserId)}`,
      );
      if (v) return true;
    } catch {
      /* mem fallback */
    }
  }
  return (guestWriteComboBlockUntil.get(comboKey(ip, guestUserId)) ?? 0) > now;
}

/** Test helper: reset in-memory state. */
export function __resetGuestAbuseLimiterForTests(): void {
  mintTimestampsByIp.clear();
  mintTimestamps24hByIp.clear();
  guestMintBlockUntilByIp.clear();
  failedCaptchaCountByIp.clear();
  guestWriteComboBlockUntil.clear();
}
