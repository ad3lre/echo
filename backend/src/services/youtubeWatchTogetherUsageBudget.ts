import Redis from 'ioredis';
import { echoIoredisClientOptions } from '../constants/ioredisEchoClient';
import { config } from '../config';

const KEY_PREFIX = 'echo:vc:ytwt:v1';
const KEY_TTL_SEC = 172800;

let redisClient: Redis | null = null;

function getRedis(): Redis | null {
  if (!config.redisUrl?.trim()) return null;
  if (!redisClient) {
    redisClient = new Redis(config.redisUrl.trim(), echoIoredisClientOptions);
    redisClient.on('error', () => {});
  }
  return redisClient;
}

/** UTC `YYYY-MM-DD` bucket for daily budgets. */
export function youtubeWatchTogetherUtcDayKey(d = new Date()): string {
  return d.toISOString().slice(0, 10);
}

function redisKeysForUser(
  userId: string,
  day: string,
): { userKey: string; globalKey: string } {
  const safeUser = userId.trim() || 'unknown';
  return {
    userKey: `${KEY_PREFIX}:u:${safeUser}:${day}`,
    globalKey: `${KEY_PREFIX}:g:${day}`,
  };
}

/**
 * Atomically add billed seconds to per-user and global UTC-day counters.
 * When Redis is unavailable, returns ok (fail-open for single-node dev).
 */
const TRY_CONSUME_LUA = `
local uk = KEYS[1]
local gk = KEYS[2]
local delta = math.floor(tonumber(ARGV[1]) or 0)
local ulim = tonumber(ARGV[2])
local glim = tonumber(ARGV[3])
local ttl = math.floor(tonumber(ARGV[4]) or 172800)
if not ulim or not glim then
  local u = tonumber(redis.call('GET', uk) or '0')
  local g = tonumber(redis.call('GET', gk) or '0')
  return {2, u, g}
end
if delta < 1 then
  local u = tonumber(redis.call('GET', uk) or '0')
  local g = tonumber(redis.call('GET', gk) or '0')
  return {2, u, g}
end
local u = tonumber(redis.call('GET', uk) or '0')
local g = tonumber(redis.call('GET', gk) or '0')
if u + delta > ulim then
  return {0, u, g}
end
if g + delta > glim then
  return {1, u, g}
end
local newU = redis.call('INCRBY', uk, delta)
local newG = redis.call('INCRBY', gk, delta)
redis.call('EXPIRE', uk, ttl)
redis.call('EXPIRE', gk, ttl)
return {2, newU, newG}
`;

export type YoutubeWatchTogetherConsumeResult =
  | { ok: true; userUsedSec: number; globalUsedSec: number }
  | {
      ok: false;
      reason: 'user' | 'global';
      userUsedSec: number;
      globalUsedSec: number;
    };

const UNLIMITED = 9_007_199_254_740_991;

export async function tryConsumeYoutubeWatchTogetherSeconds(
  userId: string,
  deltaSec: number,
): Promise<YoutubeWatchTogetherConsumeResult> {
  const delta = Math.floor(deltaSec);
  if (!Number.isFinite(delta) || delta < 1) {
    return { ok: true, userUsedSec: 0, globalUsedSec: 0 };
  }
  const redis = getRedis();
  if (!redis) {
    return { ok: true, userUsedSec: 0, globalUsedSec: 0 };
  }
  const day = youtubeWatchTogetherUtcDayKey();
  const { userKey, globalKey } = redisKeysForUser(userId, day);
  const ulim =
    config.youtubeWatchTogetherUserBudgetSec <= 0
      ? UNLIMITED
      : config.youtubeWatchTogetherUserBudgetSec;
  const glim =
    config.youtubeWatchTogetherGlobalBudgetSec <= 0
      ? UNLIMITED
      : config.youtubeWatchTogetherGlobalBudgetSec;
  try {
    const raw = (await redis.eval(
      TRY_CONSUME_LUA,
      2,
      userKey,
      globalKey,
      String(delta),
      String(ulim),
      String(glim),
      String(KEY_TTL_SEC),
    )) as unknown;
    if (!Array.isArray(raw) || raw.length < 3) {
      return { ok: true, userUsedSec: 0, globalUsedSec: 0 };
    }
    const status = Number(raw[0]);
    const userUsedSec = Number(raw[1]);
    const globalUsedSec = Number(raw[2]);
    if (status === 0) {
      return { ok: false, reason: 'user', userUsedSec, globalUsedSec };
    }
    if (status === 1) {
      return { ok: false, reason: 'global', userUsedSec, globalUsedSec };
    }
    return { ok: true, userUsedSec, globalUsedSec };
  } catch {
    return { ok: true, userUsedSec: 0, globalUsedSec: 0 };
  }
}

export type YoutubeWatchTogetherUsageSnapshot = {
  utcDay: string;
  userUsedSec: number;
  globalUsedSec: number;
  userBudgetSec: number;
  globalBudgetSec: number;
};

export async function readYoutubeWatchTogetherUsage(
  userId: string,
): Promise<YoutubeWatchTogetherUsageSnapshot | null> {
  const redis = getRedis();
  if (!redis) return null;
  const day = youtubeWatchTogetherUtcDayKey();
  const { userKey, globalKey } = redisKeysForUser(userId, day);
  try {
    const vals = await redis.mget(userKey, globalKey);
    const u = Number(vals[0] ?? '0');
    const g = Number(vals[1] ?? '0');
    return {
      utcDay: day,
      userUsedSec: Number.isFinite(u) ? u : 0,
      globalUsedSec: Number.isFinite(g) ? g : 0,
      userBudgetSec:
        config.youtubeWatchTogetherUserBudgetSec <= 0
          ? UNLIMITED
          : config.youtubeWatchTogetherUserBudgetSec,
      globalBudgetSec:
        config.youtubeWatchTogetherGlobalBudgetSec <= 0
          ? UNLIMITED
          : config.youtubeWatchTogetherGlobalBudgetSec,
    };
  } catch {
    return null;
  }
}
