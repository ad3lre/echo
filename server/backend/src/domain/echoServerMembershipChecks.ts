import type pg from 'pg';

/**
 * Direct Postgres membership/ownership/ban checks for the direct-DB permission fold
 * fallback (`ECHO_PERM_AGGREGATE_CACHE=false`). The aggregate fold uses cached
 * member-access state instead. Shared here to avoid an import cycle between the two
 * fold builders.
 */

export async function isEchoServerOwnerLocal(
  pool: pg.Pool,
  serverId: string,
  userId: string,
): Promise<boolean> {
  const r = await pool.query(
    `SELECT owner_id FROM echo_servers WHERE id = $1`,
    [serverId],
  );
  const row = r.rows[0];
  return !!row && String(row.owner_id) === userId;
}

export async function isEchoServerMember(
  pool: pg.Pool,
  serverId: string,
  userId: string,
): Promise<boolean> {
  const r = await pool.query(
    `SELECT 1 FROM echo_server_members WHERE server_id = $1 AND user_id = $2`,
    [serverId, userId],
  );
  return r.rows.length > 0;
}

export async function isEchoServerMemberBanned(
  pool: pg.Pool,
  serverId: string,
  userId: string,
): Promise<boolean> {
  const r = await pool.query(
    `
    SELECT 1 FROM echo_server_bans
    WHERE server_id = $1 AND user_id = $2
      AND (expires_at IS NULL OR expires_at > NOW())
    `,
    [serverId, userId],
  );
  return r.rows.length > 0;
}
