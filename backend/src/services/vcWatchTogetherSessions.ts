import type pg from 'pg';
import { ECHO_WATCH_TOGETHER_MAX_SESSION_BYTES } from '../../../shared/echoPlanLimits';

export function isVcWatchTogetherStorageKey(storageKey: string): boolean {
  return storageKey.trim().startsWith('echo/vc-watch/');
}

export async function ensureVcWatchTogetherSessionRow(
  pool: pg.Pool,
  row: {
    sessionId: string;
    hostUserId: string;
    channelId: string;
  },
): Promise<void> {
  const sessionId = row.sessionId.trim();
  const hostUserId = row.hostUserId.trim();
  const channelId = row.channelId.trim();
  if (!sessionId || !hostUserId || !channelId) return;
  await pool.query(
    `INSERT INTO echo_vc_watch_together_sessions
       (session_id, host_user_id, channel_id, bytes_used, updated_at)
     VALUES ($1, $2, $3, 0, NOW())
     ON CONFLICT (session_id) DO NOTHING`,
    [sessionId, hostUserId, channelId],
  );
}

export async function getVcWatchTogetherSessionRow(
  pool: pg.Pool,
  sessionId: string,
): Promise<{ bytesUsed: number; hostUserId: string } | null> {
  const id = sessionId.trim();
  if (!id) return null;
  const r = await pool.query<{ bytes_used: string; host_user_id: string }>(
    `SELECT bytes_used, host_user_id FROM echo_vc_watch_together_sessions WHERE session_id = $1 LIMIT 1`,
    [id],
  );
  const row = r.rows[0];
  if (!row) return null;
  return {
    bytesUsed: Number(row.bytes_used ?? 0),
    hostUserId: row.host_user_id.trim(),
  };
}

export async function getVcWatchTogetherSessionBytesUsed(
  pool: pg.Pool,
  sessionId: string,
): Promise<number> {
  const row = await getVcWatchTogetherSessionRow(pool, sessionId);
  return row?.bytesUsed ?? 0;
}

export async function assertVcWatchTogetherSessionQuota(
  pool: pg.Pool,
  opts: {
    sessionId: string;
    hostUserId: string;
    channelId: string;
    additionalBytes: number;
  },
): Promise<{ ok: true } | { ok: false; bytesUsed: number }> {
  const sessionId = opts.sessionId.trim();
  const hostUserId = opts.hostUserId.trim();
  const channelId = opts.channelId.trim();
  const additionalBytes = Math.floor(opts.additionalBytes);
  if (!sessionId || !hostUserId || !channelId || additionalBytes < 1) {
    return { ok: false, bytesUsed: 0 };
  }
  await ensureVcWatchTogetherSessionRow(pool, {
    sessionId,
    hostUserId,
    channelId,
  });
  const row = await getVcWatchTogetherSessionRow(pool, sessionId);
  if (row && row.hostUserId !== hostUserId) {
    return { ok: false, bytesUsed: row.bytesUsed };
  }
  const used = row?.bytesUsed ?? 0;
  if (used + additionalBytes > ECHO_WATCH_TOGETHER_MAX_SESSION_BYTES) {
    return { ok: false, bytesUsed: used };
  }
  return { ok: true };
}

export async function addVcWatchTogetherSessionBytes(
  pool: pg.Pool,
  opts: {
    sessionId: string;
    hostUserId: string;
    channelId: string;
    byteLength: number;
  },
): Promise<void> {
  const sessionId = opts.sessionId.trim();
  const byteLength = Math.floor(opts.byteLength);
  if (!sessionId || byteLength < 1) return;
  await ensureVcWatchTogetherSessionRow(pool, {
    sessionId,
    hostUserId: opts.hostUserId,
    channelId: opts.channelId,
  });
  const row = await getVcWatchTogetherSessionRow(pool, sessionId);
  if (row && row.hostUserId !== opts.hostUserId.trim()) return;
  await pool.query(
    `UPDATE echo_vc_watch_together_sessions
     SET bytes_used = bytes_used + $2, updated_at = NOW()
     WHERE session_id = $1`,
    [sessionId, byteLength],
  );
}

export async function subtractVcWatchTogetherSessionBytes(
  pool: pg.Pool,
  sessionId: string,
  byteLength: number,
): Promise<void> {
  const id = sessionId.trim();
  const n = Math.floor(byteLength);
  if (!id || n < 1) return;
  await pool.query(
    `UPDATE echo_vc_watch_together_sessions
     SET bytes_used = GREATEST(0, bytes_used - $2), updated_at = NOW()
     WHERE session_id = $1`,
    [id, n],
  );
}

export async function releaseVcWatchTogetherSessionBytes(
  pool: pg.Pool,
  opts: {
    sessionId: string;
    hostUserId: string;
    byteLength: number;
  },
): Promise<{ ok: true } | { ok: false; code: 'NOT_HOST' | 'INVALID' }> {
  const sessionId = opts.sessionId.trim();
  const hostUserId = opts.hostUserId.trim();
  const byteLength = Math.floor(opts.byteLength);
  if (!sessionId || !hostUserId || byteLength < 1) {
    return { ok: false, code: 'INVALID' };
  }
  const row = await getVcWatchTogetherSessionRow(pool, sessionId);
  if (!row || row.hostUserId !== hostUserId) {
    return { ok: false, code: 'NOT_HOST' };
  }
  await subtractVcWatchTogetherSessionBytes(pool, sessionId, byteLength);
  return { ok: true };
}
