import type pg from 'pg';
import { nextEchoSnowflakeId } from '../echoSnowflake';

async function insertOperatorAudit(
  pool: pg.Pool,
  params: {
    operatorId: string;
    action: string;
    targetUserId?: string | null;
  },
): Promise<void> {
  await pool.query(
    `
    INSERT INTO echo_instance_ban_audit (id, operator_id, action, ban_id, target_user_id, detail)
    VALUES ($1, $2, $3, NULL, $4, NULL)
    `,
    [
      nextEchoSnowflakeId(),
      params.operatorId,
      params.action,
      params.targetUserId ?? null,
    ],
  );
}

export async function countInstanceOperators(pool: pg.Pool): Promise<number> {
  const r = await pool.query(
    `SELECT COUNT(*)::int AS c FROM auth_users WHERE is_instance_operator = true`,
  );
  return Number(r.rows[0]?.c ?? 0);
}

export async function setUserInstanceOperator(
  pool: pg.Pool,
  userId: string,
  isOperator: boolean,
  actorId: string,
): Promise<boolean> {
  const r = await pool.query(
    `
    UPDATE auth_users
    SET is_instance_operator = $2, updated_at = NOW()
    WHERE id = $1
    RETURNING id
    `,
    [userId.trim(), isOperator],
  );
  if ((r.rowCount ?? 0) === 0) return false;
  await insertOperatorAudit(pool, {
    operatorId: actorId,
    action: isOperator ? 'operator_promote' : 'operator_demote',
    targetUserId: userId.trim(),
  });
  return true;
}
