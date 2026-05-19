import type pg from 'pg';
import { nextEchoSnowflakeId } from '../echoSnowflake';

export async function isEchoPairBlocked(
  pool: pg.Pool,
  a: string,
  b: string,
): Promise<boolean> {
  if (a === b) return false;
  const r = await pool.query(
    `
    SELECT 1 FROM echo_user_blocks
    WHERE (blocker_id = $1 AND blocked_id = $2) OR (blocker_id = $2 AND blocked_id = $1)
    LIMIT 1
    `,
    [a, b],
  );
  return r.rows.length > 0;
}

export async function listEchoBlockedUserIds(
  pool: pg.Pool,
  blockerId: string,
): Promise<string[]> {
  const r = await pool.query(
    `SELECT blocked_id FROM echo_user_blocks WHERE blocker_id = $1 ORDER BY created_at DESC`,
    [blockerId],
  );
  return r.rows.map((row: { blocked_id: unknown }) => String(row.blocked_id));
}

export type BlockEchoUserResult =
  | 'blocked_new'
  | 'already_blocked'
  | 'user_not_found';

/**
 * Ensures a block row exists. Clears friendship in both directions when the peer exists.
 * Self-block is treated as already blocked (HTTP layer rejects before calling).
 */
export async function blockEchoUser(
  pool: pg.Pool,
  blockerId: string,
  blockedId: string,
): Promise<BlockEchoUserResult> {
  if (blockerId === blockedId) return 'already_blocked';
  const u = await pool.query(`SELECT 1 FROM auth_users WHERE id = $1`, [
    blockedId,
  ]);
  if (u.rows.length === 0) return 'user_not_found';
  const ins = await pool.query(
    `INSERT INTO echo_user_blocks (blocker_id, blocked_id) VALUES ($1, $2) ON CONFLICT (blocker_id, blocked_id) DO NOTHING RETURNING blocker_id`,
    [blockerId, blockedId],
  );
  const inserted = (ins.rowCount ?? 0) > 0;
  await pool.query(
    `
    DELETE FROM echo_friendships
    WHERE (user_id = $1 AND peer_id = $2) OR (user_id = $2 AND peer_id = $1)
    `,
    [blockerId, blockedId],
  );
  return inserted ? 'blocked_new' : 'already_blocked';
}

export type UnblockEchoUserResult =
  | 'unblocked'
  | 'target_not_found'
  | 'not_blocked';

export async function unblockEchoUser(
  pool: pg.Pool,
  blockerId: string,
  blockedId: string,
): Promise<UnblockEchoUserResult> {
  const u = await pool.query(`SELECT 1 FROM auth_users WHERE id = $1`, [
    blockedId,
  ]);
  if (u.rows.length === 0) return 'target_not_found';
  const r = await pool.query(
    `DELETE FROM echo_user_blocks WHERE blocker_id = $1 AND blocked_id = $2 RETURNING blocker_id`,
    [blockerId, blockedId],
  );
  if (r.rowCount == null || r.rowCount < 1) return 'not_blocked';
  return 'unblocked';
}

export async function insertEchoUserReport(
  pool: pg.Pool,
  reporterId: string,
  targetId: string,
  reason: string,
): Promise<void> {
  if (reporterId === targetId) return;
  const id = nextEchoSnowflakeId();
  const trimmed = reason.trim().slice(0, 2000);
  await pool.query(
    `INSERT INTO echo_user_reports (id, reporter_id, target_id, reason) VALUES ($1, $2, $3, $4)`,
    [id, reporterId, targetId, trimmed || '(no details)'],
  );
}
