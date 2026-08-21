import type pg from 'pg';
import { parseClientIpForBan } from '../net/clientIp';

/** Best-effort: refresh `auth_users.last_seen_ip` from socket / HTTP for server IP bans. */
export async function touchAuthUserLastSeenIp(
  pool: pg.Pool,
  userId: string,
  rawIp: string,
): Promise<void> {
  if (userId.startsWith('user_')) return;
  const ip = parseClientIpForBan(rawIp);
  if (!ip) return;
  await pool.query(
    `UPDATE auth_users SET last_seen_ip = $1, updated_at = NOW() WHERE id = $2`,
    [ip, userId],
  );
}
