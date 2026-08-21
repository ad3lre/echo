import Redis from 'ioredis';
import { echoIoredisClientOptions } from '../../constants/ioredisEchoClient';
import { config } from '../../config';
import {
  ECHO_PLAN_IMAGE_SEARCHES_PER_DAY,
  normalizeEchoPlanId,
  type EchoPlanId,
} from '../../../../../contracts/echoPlanLimits';

const KEY_PREFIX = 'echo:serper:img:searches';
const KEY_TTL_SEC = 172_800;

let redisClient: Redis | null = null;

/** userId -> day -> Set<queryHash> */
const memByUserDay = new Map<string, Map<string, Set<string>>>();

function getRedis(): Redis | null {
  if (process.env.ECHO_CONFIG_TEST_ISOLATION === '1') return null;
  if (!config.redisUrl?.trim()) return null;
  if (!redisClient) {
    redisClient = new Redis(config.redisUrl.trim(), echoIoredisClientOptions);
    redisClient.on('error', () => {});
  }
  return redisClient;
}

export function serperUserSearchUtcDayKey(d = new Date()): string {
  return d.toISOString().slice(0, 10);
}

function redisKey(userId: string, day: string): string {
  return `${KEY_PREFIX}:${userId.trim() || 'unknown'}:${day}`;
}

function memGetSet(userId: string, day: string): Set<string> {
  let byDay = memByUserDay.get(userId);
  if (!byDay) {
    byDay = new Map();
    memByUserDay.set(userId, byDay);
  }
  let set = byDay.get(day);
  if (!set) {
    set = new Set();
    byDay.set(day, set);
  }
  return set;
}

const TRY_CONSUME_LUA = `
local key = KEYS[1]
local member = ARGV[1]
local limit = tonumber(ARGV[2])
local ttl = tonumber(ARGV[3])
if redis.call('SISMEMBER', key, member) == 1 then
  return {1, redis.call('SCARD', key)}
end
local n = redis.call('SCARD', key)
if n >= limit then
  return {0, n}
end
redis.call('SADD', key, member)
redis.call('EXPIRE', key, ttl)
return {1, redis.call('SCARD', key)}
`;

export type SerperUserSearchConsumeResult =
  | { ok: true; used: number; limit: number; alreadyCounted: boolean }
  | { ok: false; used: number; limit: number };

export function imageSearchDailyLimitForPlan(plan: EchoPlanId): number {
  return ECHO_PLAN_IMAGE_SEARCHES_PER_DAY[normalizeEchoPlanId(plan)];
}

export async function reserveUserImageSearchCredit(
  userId: string,
  queryHash: string,
  limit: number,
): Promise<SerperUserSearchConsumeResult> {
  const lim = Math.max(1, Math.floor(limit));
  const day = serperUserSearchUtcDayKey();
  const redis = getRedis();

  if (!redis) {
    const set = memGetSet(userId, day);
    const alreadyCounted = set.has(queryHash);
    if (alreadyCounted) {
      return {
        ok: true,
        used: set.size,
        limit: lim,
        alreadyCounted: true,
      };
    }
    if (set.size >= lim) {
      return { ok: false, used: set.size, limit: lim };
    }
    set.add(queryHash);
    return {
      ok: true,
      used: set.size,
      limit: lim,
      alreadyCounted: false,
    };
  }

  try {
    const key = redisKey(userId, day);
    const wasMember = (await redis.sismember(key, queryHash)) === 1;
    if (wasMember) {
      const used = await redis.scard(key);
      return {
        ok: true,
        used: Number(used),
        limit: lim,
        alreadyCounted: true,
      };
    }
    const raw = (await redis.eval(
      TRY_CONSUME_LUA,
      1,
      key,
      queryHash,
      String(lim),
      String(KEY_TTL_SEC),
    )) as unknown;
    if (!Array.isArray(raw) || raw.length < 2) {
      return { ok: true, used: 0, limit: lim, alreadyCounted: false };
    }
    const ok = Number(raw[0]) === 1;
    const used = Number(raw[1]);
    if (!ok) {
      return { ok: false, used, limit: lim };
    }
    return { ok: true, used, limit: lim, alreadyCounted: false };
  } catch {
    return { ok: true, used: 0, limit: lim, alreadyCounted: false };
  }
}

export async function refundUserImageSearchCredit(
  userId: string,
  queryHash: string,
): Promise<void> {
  const day = serperUserSearchUtcDayKey();
  const redis = getRedis();
  if (!redis) {
    memGetSet(userId, day).delete(queryHash);
    return;
  }
  try {
    await redis.srem(redisKey(userId, day), queryHash);
  } catch {
    /* best-effort */
  }
}

export async function readUserImageSearchUsage(
  userId: string,
  limit: number,
): Promise<{ used: number; limit: number; remaining: number }> {
  const lim = Math.max(0, Math.floor(limit));
  const day = serperUserSearchUtcDayKey();
  const redis = getRedis();
  if (!redis) {
    const used = memGetSet(userId, day).size;
    return {
      used,
      limit: lim,
      remaining: Math.max(0, lim - used),
    };
  }
  try {
    const used = Number(await redis.scard(redisKey(userId, day)));
    return {
      used: Number.isFinite(used) ? used : 0,
      limit: lim,
      remaining: Math.max(0, lim - (Number.isFinite(used) ? used : 0)),
    };
  } catch {
    return { used: 0, limit: lim, remaining: lim };
  }
}

export function __resetSerperUserSearchQuotaForTests(): void {
  memByUserDay.clear();
  if (redisClient) {
    redisClient.disconnect();
    redisClient = null;
  }
}

export function planLimitExceededMessage(plan: EchoPlanId): string {
  const p = normalizeEchoPlanId(plan);
  if (p === 'free') {
    return "You've used your 10 image searches today. Upgrade to Echo+ (250/day) or Echo Black (500/day).";
  }
  if (p === 'plus') {
    return "You've used your 250 image searches today. Upgrade to Echo Black for 500/day.";
  }
  return "You've used your 500 image searches today. Try again tomorrow (UTC).";
}
