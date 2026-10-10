import Redis from 'ioredis';
import { echoIoredisClientOptions } from '../../constants/ioredisEchoClient';
import { config } from '../../config';

/**
 * Progressive spam halt: each spam / abuse strike escalates the write cooldown.
 * Strikes decay after {@link STRIKE_WINDOW_MS}. Used by guild spam filter trips
 * and guest rate-limit hits so future abuse gets longer pauses automatically.
 */

const REDIS_PREFIX = 'echo:spamhalt:';
const STRIKE_WINDOW_MS = 24 * 60 * 60 * 1000;

/** Escalating halt durations after strike N (1-indexed). Strike 5+ stays at 24h. */
const HALT_DURATIONS_MS = [
  60_000, // 1 min
  5 * 60_000, // 5 min
  30 * 60_000, // 30 min
  6 * 60 * 60_000, // 6 h
  24 * 60 * 60_000, // 24 h
] as const;

let redisClient: Redis | null = null;

const memStrikes = new Map<string, { count: number; expiresAt: number }>();
const memHaltUntil = new Map<string, number>();

function getRedis(): Redis | null {
  if (process.env.ECHO_CONFIG_TEST_ISOLATION === '1') return null;
  if (!config.redisUrl?.trim()) return null;
  if (!redisClient) {
    redisClient = new Redis(config.redisUrl.trim(), echoIoredisClientOptions);
    redisClient.on('error', () => {});
  }
  return redisClient;
}

function userKey(userId: string): string {
  return `u:${userId}`;
}

function ipKey(ip: string): string {
  return `ip:${ip}`;
}

function haltDurationForStrike(strikeCount: number): number {
  const idx = Math.min(Math.max(strikeCount, 1), HALT_DURATIONS_MS.length) - 1;
  return HALT_DURATIONS_MS[idx]!;
}

export function formatSpamHaltDuration(ms: number): string {
  if (ms < 60_000) return `${Math.max(1, Math.ceil(ms / 1000))}s`;
  if (ms < 60 * 60_000) return `${Math.ceil(ms / 60_000)}m`;
  return `${Math.ceil(ms / (60 * 60_000))}h`;
}

export type SpamHaltSnapshot = {
  active: boolean;
  strikeCount: number;
  untilMs: number | null;
  remainingMs: number;
  detail: string;
};

function snapshotFromUntil(
  untilMs: number | null,
  strikeCount: number,
  now: number,
): SpamHaltSnapshot {
  if (untilMs == null || untilMs <= now) {
    return {
      active: false,
      strikeCount,
      untilMs: null,
      remainingMs: 0,
      detail: '',
    };
  }
  const remainingMs = untilMs - now;
  return {
    active: true,
    strikeCount,
    untilMs,
    remainingMs,
    detail: `Spam halt active for ${formatSpamHaltDuration(remainingMs)} (strike ${strikeCount}). Slow down before sending again.`,
  };
}

async function redisGetStrike(key: string): Promise<number> {
  const redis = getRedis();
  if (!redis) return -1;
  try {
    const raw = await redis.get(`${REDIS_PREFIX}strikes:${key}`);
    if (!raw) return 0;
    const n = Number.parseInt(raw, 10);
    return Number.isFinite(n) ? n : 0;
  } catch {
    return -1;
  }
}

async function redisGetHaltUntil(key: string): Promise<number | null> {
  const redis = getRedis();
  if (!redis) return null;
  try {
    const raw = await redis.get(`${REDIS_PREFIX}halt:${key}`);
    if (!raw) return null;
    const until = Number(raw);
    return Number.isFinite(until) ? until : null;
  } catch {
    return null;
  }
}

async function redisSetHalt(
  key: string,
  untilMs: number,
  ttlMs: number,
): Promise<boolean> {
  const redis = getRedis();
  if (!redis) return false;
  try {
    await redis.set(
      `${REDIS_PREFIX}halt:${key}`,
      String(untilMs),
      'PX',
      Math.max(1000, ttlMs),
    );
    return true;
  } catch {
    return false;
  }
}

async function redisIncrStrike(key: string, now: number): Promise<number> {
  const redis = getRedis();
  if (!redis) return -1;
  try {
    const strikeKey = `${REDIS_PREFIX}strikes:${key}`;
    const n = await redis.incr(strikeKey);
    if (n === 1) {
      await redis.pexpire(strikeKey, STRIKE_WINDOW_MS);
    }
    return n;
  } catch {
    return -1;
  }
}

function memGetStrike(key: string, now: number): number {
  const row = memStrikes.get(key);
  if (!row || row.expiresAt <= now) {
    memStrikes.delete(key);
    return 0;
  }
  return row.count;
}

function memIncrStrike(key: string, now: number): number {
  const prev = memGetStrike(key, now);
  const count = prev + 1;
  memStrikes.set(key, { count, expiresAt: now + STRIKE_WINDOW_MS });
  return count;
}

function memGetHaltUntil(key: string, now: number): number | null {
  const until = memHaltUntil.get(key);
  if (until == null || until <= now) {
    memHaltUntil.delete(key);
    return null;
  }
  return until;
}

function memSetHalt(key: string, untilMs: number): void {
  memHaltUntil.set(key, untilMs);
}

async function resolveStrikeCount(key: string, now: number): Promise<number> {
  const fromRedis = await redisGetStrike(key);
  if (fromRedis >= 0) return fromRedis;
  return memGetStrike(key, now);
}

async function resolveHaltUntil(
  key: string,
  now: number,
): Promise<number | null> {
  const fromRedis = await redisGetHaltUntil(key);
  if (fromRedis != null) {
    return fromRedis > now ? fromRedis : null;
  }
  return memGetHaltUntil(key, now);
}

/**
 * Active halt for this user (and optional IP — guests often remint).
 */
export async function getActiveSpamHalt(
  userId: string,
  clientIp?: string | null,
  now = Date.now(),
): Promise<SpamHaltSnapshot> {
  const uid = userId.trim();
  if (!uid) {
    return snapshotFromUntil(null, 0, now);
  }

  const uKey = userKey(uid);
  const userUntil = await resolveHaltUntil(uKey, now);
  const userStrikes = await resolveStrikeCount(uKey, now);

  let bestUntil = userUntil;
  let bestStrikes = userStrikes;

  const ip = clientIp?.trim();
  if (ip) {
    const iKey = ipKey(ip);
    const ipUntil = await resolveHaltUntil(iKey, now);
    if (ipUntil != null && (bestUntil == null || ipUntil > bestUntil)) {
      bestUntil = ipUntil;
      bestStrikes = Math.max(bestStrikes, await resolveStrikeCount(iKey, now));
    }
  }

  return snapshotFromUntil(bestUntil, bestStrikes, now);
}

export type RecordSpamStrikeResult = SpamHaltSnapshot & {
  haltDurationMs: number;
};

/**
 * Record a spam/abuse strike and apply the next halt duration on the ladder.
 */
export async function recordSpamStrikeAndHalt(
  userId: string,
  clientIp?: string | null,
  now = Date.now(),
): Promise<RecordSpamStrikeResult> {
  const uid = userId.trim();
  const uKey = userKey(uid || 'unknown');

  let strikeCount = await redisIncrStrike(uKey, now);
  if (strikeCount < 0) {
    strikeCount = memIncrStrike(uKey, now);
  }

  const haltDurationMs = haltDurationForStrike(strikeCount);
  const untilMs = now + haltDurationMs;

  if (!(await redisSetHalt(uKey, untilMs, haltDurationMs))) {
    memSetHalt(uKey, untilMs);
  }

  const ip = clientIp?.trim();
  if (ip) {
    const iKey = ipKey(ip);
    let ipStrikes = await redisIncrStrike(iKey, now);
    if (ipStrikes < 0) {
      ipStrikes = memIncrStrike(iKey, now);
    }
    const ipHaltMs = haltDurationForStrike(ipStrikes);
    const ipUntil = now + ipHaltMs;
    if (!(await redisSetHalt(iKey, ipUntil, ipHaltMs))) {
      memSetHalt(iKey, ipUntil);
    }
  }

  const snap = snapshotFromUntil(untilMs, strikeCount, now);
  return { ...snap, haltDurationMs };
}

/** True when sends should be refused (active progressive halt). */
export async function isSpamHaltActive(
  userId: string,
  clientIp?: string | null,
  now = Date.now(),
): Promise<boolean> {
  return (await getActiveSpamHalt(userId, clientIp, now)).active;
}

/** Test helper. */
export function __resetProgressiveSpamHaltForTests(): void {
  memStrikes.clear();
  memHaltUntil.clear();
}

/** Test helper: ladder durations. */
export function __spamHaltDurationsForTests(): readonly number[] {
  return HALT_DURATIONS_MS;
}
