import { createHash } from 'crypto';
import { config } from '../../config';
import { getPgPool } from '../../db/pg';
import { isPostgresUndefinedRelationError } from '../../db/pgErrors';
import { nextEchoSnowflakeId } from '../../domain/echoSnowflake';

/** In-memory cap state when `ECHO_BACKEND_STORAGE=memory` (dev / tests). */
const memoryHwidIpToUserIds = new Map<string, Set<string>>();

export function authHwidAccountCapActive(): boolean {
  return (
    config.authHwidAccountCapEnabled && config.authHwidPepper.trim().length > 0
  );
}

export function normalizeClientHwid(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const s = raw.trim();
  if (s.length < 16 || s.length > 2048) return null;
  return s;
}

export function hashClientHwidForProfile(normalizedHwid: string): string {
  const pepper = config.authHwidPepper.trim();
  return createHash('sha256')
    .update(`${pepper}|${normalizedHwid}`, 'utf8')
    .digest('hex');
}

function normalizeClientIp(ip: string): string {
  const s = String(ip ?? '').trim();
  return s.length > 0 ? s.slice(0, 128) : 'unknown';
}

export async function countDistinctAccountsForHwidProfileAndIp(
  hwidHash: string,
  clientIp: string,
): Promise<number> {
  const ip = normalizeClientIp(clientIp);
  if (config.backendStorageMode !== 'postgres') {
    const set = memoryHwidIpToUserIds.get(`${hwidHash}|${ip}`);
    return set ? set.size : 0;
  }
  const pool = getPgPool();
  if (!pool) return 0;
  try {
    const r = await pool.query(
      `
      SELECT COUNT(DISTINCT user_id)::int AS c
      FROM auth_hwid_account_registrations
      WHERE hwid_hash = $1 AND ip = $2
      `,
      [hwidHash, ip],
    );
    return Number(r.rows[0]?.c ?? 0);
  } catch (e) {
    if (isPostgresUndefinedRelationError(e)) return 0;
    throw e;
  }
}

export async function recordHwidProfileAccountBinding(
  userId: string,
  normalizedHwid: string,
  clientIp: string,
): Promise<void> {
  const hwidHash = hashClientHwidForProfile(normalizedHwid);
  const ip = normalizeClientIp(clientIp);
  if (config.backendStorageMode !== 'postgres') {
    const k = `${hwidHash}|${ip}`;
    let set = memoryHwidIpToUserIds.get(k);
    if (!set) {
      set = new Set();
      memoryHwidIpToUserIds.set(k, set);
    }
    set.add(userId);
    return;
  }
  const pool = getPgPool();
  if (!pool) return;
  const id = nextEchoSnowflakeId();
  try {
    await pool.query(
      `
      INSERT INTO auth_hwid_account_registrations (id, user_id, hwid_hash, ip)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (user_id, hwid_hash, ip) DO NOTHING
      `,
      [id, userId, hwidHash, ip],
    );
  } catch (e) {
    if (isPostgresUndefinedRelationError(e)) return;
    throw e;
  }
}
