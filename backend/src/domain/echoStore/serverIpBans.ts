import type pg from 'pg';
import { parseClientIpForBan } from '../../net/clientIp';

export async function isClientIpBannedFromEchoServer(
  pool: pg.Pool,
  serverId: string,
  rawClientIp: string | null | undefined,
): Promise<boolean> {
  const ip = parseClientIpForBan(rawClientIp);
  if (!ip) return false;
  const r = await pool.query(
    `
    SELECT 1 FROM echo_server_ip_bans
    WHERE server_id = $1 AND ip = $2::inet
      AND (expires_at IS NULL OR expires_at > NOW())
    LIMIT 1
    `,
    [serverId, ip],
  );
  return r.rows.length > 0;
}

export async function deleteEchoServerIpBansForBannedUser(
  pool: pg.Pool,
  serverId: string,
  bannedUserId: string,
): Promise<void> {
  await pool.query(
    `DELETE FROM echo_server_ip_bans WHERE server_id = $1 AND banned_user_id = $2`,
    [serverId, bannedUserId],
  );
}

export async function upsertEchoServerIpBanAfterUserBan(
  pool: pg.Pool,
  params: {
    serverId: string;
    targetUserId: string;
    actorId: string;
    minutes: number | null;
    reasonStr: string | null;
  },
): Promise<void> {
  const { serverId, targetUserId, actorId, minutes, reasonStr } = params;
  const u = await pool.query<{ last_seen_ip: string | null }>(
    `SELECT last_seen_ip FROM auth_users WHERE id = $1`,
    [targetUserId],
  );
  const raw = u.rows[0]?.last_seen_ip;
  const ip = parseClientIpForBan(raw ?? undefined);
  if (!ip) return;

  await pool.query(
    `
    INSERT INTO echo_server_ip_bans (
      server_id, ip, banned_user_id, expires_at, reason, banned_by, created_at
    )
    VALUES (
      $1, $2::inet, $3,
      CASE WHEN $4::int IS NULL THEN NULL ELSE NOW() + ($4::int * interval '1 minute') END,
      NULLIF($5::text, ''),
      $6,
      NOW()
    )
    ON CONFLICT (server_id, ip) DO UPDATE SET
      expires_at = EXCLUDED.expires_at,
      banned_user_id = EXCLUDED.banned_user_id,
      reason = EXCLUDED.reason,
      banned_by = EXCLUDED.banned_by,
      created_at = NOW()
    `,
    [serverId, ip, targetUserId, minutes, reasonStr || null, actorId],
  );
}
