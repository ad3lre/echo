import Redis from 'ioredis';
import { echoIoredisClientOptions } from '../constants/ioredisEchoClient';
import { config } from '../config';

const KEY_PREFIX = 'echo:serper:img:g';
const DAY_TTL_SEC = 172_800;
const MONTH_TTL_SEC = 2_592_000;

let redisClient: Redis | null = null;

const memDay = new Map<string, number>();
const memMonth = new Map<string, number>();

function getRedis(): Redis | null {
  if (process.env.ECHO_CONFIG_TEST_ISOLATION === '1') return null;
  if (!config.redisUrl?.trim()) return null;
  if (!redisClient) {
    redisClient = new Redis(config.redisUrl.trim(), echoIoredisClientOptions);
    redisClient.on('error', () => {});
  }
  return redisClient;
}

export function serperGlobalUtcDayKey(d = new Date()): string {
  return d.toISOString().slice(0, 10);
}

export function serperGlobalUtcMonthKey(d = new Date()): string {
  return d.toISOString().slice(0, 7);
}

function redisDayKey(day: string): string {
  return `${KEY_PREFIX}:${day}`;
}

function redisMonthKey(month: string): string {
  return `${KEY_PREFIX}:m:${month}`;
}

function capsConfigured(): boolean {
  return config.serperGlobalMaxPerDay > 0 || config.serperGlobalMaxPerMonth > 0;
}

function failClosedWithoutRedis(): boolean {
  return (
    capsConfigured() &&
    process.env.NODE_ENV === 'production' &&
    !config.redisUrl?.trim()
  );
}

const TRY_RESERVE_LUA = `
local dk = KEYS[1]
local mk = KEYS[2]
local dlim = tonumber(ARGV[1])
local mlim = tonumber(ARGV[2])
local dttl = tonumber(ARGV[3])
local mttl = tonumber(ARGV[4])
local unlimited = 9007199254740991
if dlim <= 0 then dlim = unlimited end
if mlim <= 0 then mlim = unlimited end
local d = tonumber(redis.call('GET', dk) or '0')
local m = tonumber(redis.call('GET', mk) or '0')
if d + 1 > dlim then return {0, 'day', d, m} end
if m + 1 > mlim then return {0, 'month', d, m} end
local nd = redis.call('INCR', dk)
local nm = redis.call('INCR', mk)
redis.call('EXPIRE', dk, dttl)
redis.call('EXPIRE', mk, mttl)
return {1, 'ok', nd, nm}
`;

const REFUND_LUA = `
local dk = KEYS[1]
local mk = KEYS[2]
local d = tonumber(redis.call('GET', dk) or '0')
local m = tonumber(redis.call('GET', mk) or '0')
if d > 0 then redis.call('DECR', dk) end
if m > 0 then redis.call('DECR', mk) end
return 1
`;

export type SerperGlobalReserveResult =
  | { ok: true; dayUsed: number; monthUsed: number }
  | {
      ok: false;
      reason: 'day' | 'month' | 'redis_unavailable';
      dayUsed: number;
      monthUsed: number;
    };

export async function tryReserveGlobalSerperUnit(): Promise<SerperGlobalReserveResult> {
  if (!capsConfigured()) {
    return { ok: true, dayUsed: 0, monthUsed: 0 };
  }
  if (failClosedWithoutRedis()) {
    return {
      ok: false,
      reason: 'redis_unavailable',
      dayUsed: 0,
      monthUsed: 0,
    };
  }
  const redis = getRedis();
  const day = serperGlobalUtcDayKey();
  const month = serperGlobalUtcMonthKey();
  const dlim = config.serperGlobalMaxPerDay;
  const mlim = config.serperGlobalMaxPerMonth;

  if (!redis) {
    const dUsed = memDay.get(day) ?? 0;
    const mUsed = memMonth.get(month) ?? 0;
    if (dlim > 0 && dUsed + 1 > dlim) {
      return { ok: false, reason: 'day', dayUsed: dUsed, monthUsed: mUsed };
    }
    if (mlim > 0 && mUsed + 1 > mlim) {
      return { ok: false, reason: 'month', dayUsed: dUsed, monthUsed: mUsed };
    }
    memDay.set(day, dUsed + 1);
    memMonth.set(month, mUsed + 1);
    return {
      ok: true,
      dayUsed: dUsed + 1,
      monthUsed: mUsed + 1,
    };
  }

  try {
    const raw = (await redis.eval(
      TRY_RESERVE_LUA,
      2,
      redisDayKey(day),
      redisMonthKey(month),
      String(dlim),
      String(mlim),
      String(DAY_TTL_SEC),
      String(MONTH_TTL_SEC),
    )) as unknown;
    if (!Array.isArray(raw) || raw.length < 4) {
      return { ok: true, dayUsed: 0, monthUsed: 0 };
    }
    const ok = Number(raw[0]) === 1;
    const dayUsed = Number(raw[2]);
    const monthUsed = Number(raw[3]);
    if (!ok) {
      const reason = raw[1] === 'month' ? 'month' : 'day';
      return { ok: false, reason, dayUsed, monthUsed };
    }
    return { ok: true, dayUsed, monthUsed };
  } catch {
    if (failClosedWithoutRedis()) {
      return {
        ok: false,
        reason: 'redis_unavailable',
        dayUsed: 0,
        monthUsed: 0,
      };
    }
    return { ok: true, dayUsed: 0, monthUsed: 0 };
  }
}

export function __resetSerperGlobalUsageBudgetForTests(): void {
  memDay.clear();
  memMonth.clear();
  if (redisClient) {
    redisClient.disconnect();
    redisClient = null;
  }
}

export async function refundGlobalSerperUnit(): Promise<void> {
  if (!capsConfigured()) return;
  const redis = getRedis();
  const day = serperGlobalUtcDayKey();
  const month = serperGlobalUtcMonthKey();
  if (!redis) {
    memDay.set(day, Math.max(0, (memDay.get(day) ?? 0) - 1));
    memMonth.set(month, Math.max(0, (memMonth.get(month) ?? 0) - 1));
    return;
  }
  try {
    await redis.eval(REFUND_LUA, 2, redisDayKey(day), redisMonthKey(month));
  } catch {
    /* best-effort */
  }
}
