import { randomBytes } from 'crypto';
import Redis from 'ioredis';
import { echoIoredisClientOptions } from '../constants/ioredisEchoClient';
import { config } from '../config';
import type { AuthUser } from './types';

/** HttpOnly session binding (Redis lookup). */
export const LEGACY_SESSION_COOKIE = 'echo_sid';
export const SESSION_COOKIE = config.isProduction
  ? '__Host-echo_sid'
  : LEGACY_SESSION_COOKIE;
/** Readable by JS for double-submit CSRF. */
export const LEGACY_CSRF_COOKIE = 'echo_csrf';
export const CSRF_COOKIE = config.isProduction
  ? '__Host-echo_csrf'
  : LEGACY_CSRF_COOKIE;

export type ServerSessionPayload = {
  userId: string;
  refreshTokenId: string;
  csrfSecret: string;
  /** Last timestamp when `refreshTokenId` was verified active. */
  refreshValidatedAt?: number;
  /** Cached at session creation / refresh so requireAuth avoids a DB round-trip. */
  cachedUser?: AuthUser;
};

const REDIS_KEY = (sid: string) => `echo:sess:${sid}`;
const REDIS_USER_INDEX = (userId: string) => `echo:usess:${userId}`;

type ServerSessionRuntime = {
  redisClient: Redis | null;
  memSessions: Map<
    string,
    { payload: ServerSessionPayload; expiresAt: number }
  >;
  memUserIndex: Map<string, Set<string>>;
};

const SERVER_SESSION_RUNTIME_KEY = Symbol.for('echo.serverSession.runtime');

/** Shared across duplicate module evaluations (tsx / test dynamic imports). */
function sessionRuntime(): ServerSessionRuntime {
  const g = globalThis as typeof globalThis & {
    [SERVER_SESSION_RUNTIME_KEY]?: ServerSessionRuntime;
  };
  if (!g[SERVER_SESSION_RUNTIME_KEY]) {
    g[SERVER_SESSION_RUNTIME_KEY] = {
      redisClient: null,
      memSessions: new Map(),
      memUserIndex: new Map(),
    };
  }
  return g[SERVER_SESSION_RUNTIME_KEY];
}

function sessionTtlSeconds(): number {
  return Math.max(60, config.refreshTokenTtlDays * 24 * 60 * 60);
}

function getRedis(): Redis | null {
  if (!config.redisUrl?.trim()) return null;
  const rt = sessionRuntime();
  if (!rt.redisClient) {
    rt.redisClient = new Redis(
      config.redisUrl.trim(),
      echoIoredisClientOptions,
    );
    rt.redisClient.on('error', () => {});
  }
  return rt.redisClient;
}

async function updateRedisSessionWithCas(
  r: Redis,
  sessionId: string,
  mutate: (current: ServerSessionPayload) => ServerSessionPayload | null,
): Promise<void> {
  const key = REDIS_KEY(sessionId);
  for (let attempt = 0; attempt < 5; attempt += 1) {
    await r.watch(key);
    const raw = await r.get(key);
    if (!raw) {
      await r.unwatch();
      return;
    }
    let cur: ServerSessionPayload;
    try {
      cur = JSON.parse(raw) as ServerSessionPayload;
    } catch {
      await r.unwatch();
      return;
    }
    const next = mutate(cur);
    if (!next) {
      await r.unwatch();
      return;
    }
    const ttl = await r.ttl(key);
    const ttlSec = ttl > 0 ? ttl : sessionTtlSeconds();
    const tx = r.multi();
    tx.set(key, JSON.stringify(next), 'EX', ttlSec);
    tx.expire(REDIS_USER_INDEX(next.userId), ttlSec);
    const out = await tx.exec();
    if (out !== null) return;
  }
}

export function createSessionId(): string {
  return randomBytes(24).toString('base64url');
}

export function createCsrfSecret(): string {
  return randomBytes(32).toString('base64url');
}

export async function saveServerSession(
  sessionId: string,
  payload: ServerSessionPayload,
): Promise<void> {
  const ttl = sessionTtlSeconds();
  const r = getRedis();
  const normalized: ServerSessionPayload = {
    ...payload,
    refreshValidatedAt:
      typeof payload.refreshValidatedAt === 'number'
        ? payload.refreshValidatedAt
        : Date.now(),
  };
  const json = JSON.stringify(normalized);
  if (r) {
    const pipe = r.multi();
    pipe.set(REDIS_KEY(sessionId), json, 'EX', ttl);
    pipe.sadd(REDIS_USER_INDEX(payload.userId), sessionId);
    pipe.expire(REDIS_USER_INDEX(payload.userId), ttl);
    await pipe.exec();
    return;
  }
  const rt = sessionRuntime();
  const exp = Date.now() + ttl * 1000;
  rt.memSessions.set(sessionId, { payload: normalized, expiresAt: exp });
  let set = rt.memUserIndex.get(payload.userId);
  if (!set) {
    set = new Set();
    rt.memUserIndex.set(payload.userId, set);
  }
  set.add(sessionId);
}

export async function getServerSession(
  sessionId: string,
): Promise<ServerSessionPayload | null> {
  const r = getRedis();
  if (r) {
    const raw = await r.get(REDIS_KEY(sessionId));
    if (!raw) return null;
    try {
      const o = JSON.parse(raw) as ServerSessionPayload;
      if (!o.userId || !o.refreshTokenId || !o.csrfSecret) return null;
      return o;
    } catch {
      return null;
    }
  }
  const rt = sessionRuntime();
  const row = rt.memSessions.get(sessionId);
  if (!row) return null;
  if (row.expiresAt <= Date.now()) {
    rt.memSessions.delete(sessionId);
    return null;
  }
  return row.payload;
}

export async function touchServerSession(sessionId: string): Promise<void> {
  const ttl = sessionTtlSeconds();
  const r = getRedis();
  if (r) {
    await r.expire(REDIS_KEY(sessionId), ttl);
    const data = await getServerSession(sessionId);
    if (data) await r.expire(REDIS_USER_INDEX(data.userId), ttl);
    return;
  }
  const row = sessionRuntime().memSessions.get(sessionId);
  if (row) row.expiresAt = Date.now() + ttl * 1000;
}

export async function deleteServerSession(
  sessionId: string,
  userId: string,
): Promise<void> {
  const r = getRedis();
  if (r) {
    const pipe = r.multi();
    pipe.del(REDIS_KEY(sessionId));
    pipe.srem(REDIS_USER_INDEX(userId), sessionId);
    await pipe.exec();
    return;
  }
  const rt = sessionRuntime();
  rt.memSessions.delete(sessionId);
  const set = rt.memUserIndex.get(userId);
  if (set) {
    set.delete(sessionId);
    if (set.size === 0) rt.memUserIndex.delete(userId);
  }
}

export async function deleteAllServerSessionsForUser(
  userId: string,
): Promise<void> {
  const r = getRedis();
  if (r) {
    const ids = await r.smembers(REDIS_USER_INDEX(userId));
    if (ids.length) {
      const pipe = r.multi();
      for (const sid of ids) pipe.del(REDIS_KEY(sid));
      pipe.del(REDIS_USER_INDEX(userId));
      await pipe.exec();
    }
    return;
  }
  const rt = sessionRuntime();
  const set = rt.memUserIndex.get(userId);
  if (set) {
    for (const sid of set) rt.memSessions.delete(sid);
    rt.memUserIndex.delete(userId);
  }
}

export async function updateSessionRefreshBinding(
  sessionId: string,
  userId: string,
  newRefreshTokenId: string,
  updatedUser?: AuthUser,
): Promise<void> {
  const r = getRedis();
  if (r) {
    await updateRedisSessionWithCas(r, sessionId, (cur) => {
      if (!cur || cur.userId !== userId) return null;
      return {
        ...cur,
        refreshTokenId: newRefreshTokenId,
        refreshValidatedAt: Date.now(),
        ...(updatedUser ? { cachedUser: updatedUser } : {}),
      };
    });
    return;
  }
  const cur = await getServerSession(sessionId);
  if (!cur || cur.userId !== userId) return;
  await saveServerSession(sessionId, {
    ...cur,
    refreshTokenId: newRefreshTokenId,
    refreshValidatedAt: Date.now(),
    ...(updatedUser ? { cachedUser: updatedUser } : {}),
  });
}

export async function markServerSessionRefreshValidated(
  sessionId: string,
  validatedAtMs: number,
): Promise<void> {
  const r = getRedis();
  if (r) {
    await updateRedisSessionWithCas(r, sessionId, (cur) => ({
      ...cur,
      refreshValidatedAt: validatedAtMs,
    }));
    return;
  }
  const cur = await getServerSession(sessionId);
  if (!cur) return;
  await saveServerSession(sessionId, {
    ...cur,
    refreshValidatedAt: validatedAtMs,
  });
}

/**
 * Find and delete the server session whose `refreshTokenId` matches,
 * so remote session revocation takes effect immediately.
 */
export async function deleteServerSessionByRefreshTokenId(
  userId: string,
  refreshTokenId: string,
): Promise<string | null> {
  const r = getRedis();
  if (r) {
    const sids = await r.smembers(REDIS_USER_INDEX(userId));
    for (const sid of sids) {
      const raw = await r.get(REDIS_KEY(sid));
      if (!raw) continue;
      try {
        const o = JSON.parse(raw) as ServerSessionPayload;
        if (o.refreshTokenId === refreshTokenId) {
          await deleteServerSession(sid, userId);
          return sid;
        }
      } catch {
        /* malformed entry; skip */
      }
    }
    return null;
  }
  const rt = sessionRuntime();
  const set = rt.memUserIndex.get(userId);
  if (!set) return null;
  for (const sid of set) {
    const row = rt.memSessions.get(sid);
    if (row?.payload.refreshTokenId === refreshTokenId) {
      rt.memSessions.delete(sid);
      set.delete(sid);
      if (set.size === 0) rt.memUserIndex.delete(userId);
      return sid;
    }
  }
  return null;
}

export async function updateCachedUserInAllSessions(
  userId: string,
  updatedUser: AuthUser,
): Promise<void> {
  const r = getRedis();
  if (r) {
    const sids = await r.smembers(REDIS_USER_INDEX(userId));
    for (const sid of sids) {
      await updateRedisSessionWithCas(r, sid, (cur) => ({
        ...cur,
        cachedUser: updatedUser,
      }));
    }
    return;
  }
  const rt = sessionRuntime();
  const set = rt.memUserIndex.get(userId);
  if (!set) return;
  for (const sid of set) {
    const row = rt.memSessions.get(sid);
    if (row?.payload) {
      row.payload.cachedUser = updatedUser;
    }
  }
}

/** @internal Close Redis on shutdown (tests). */
export async function disconnectServerSessionRedis(): Promise<void> {
  const rt = sessionRuntime();
  if (rt.redisClient) {
    await rt.redisClient.quit();
    rt.redisClient = null;
  }
}

/** @internal Test isolation for standalone scripts with dynamic imports. */
export function __resetServerSessionStoreForTests(): void {
  const rt = sessionRuntime();
  rt.memSessions.clear();
  rt.memUserIndex.clear();
  void disconnectServerSessionRedis();
}
