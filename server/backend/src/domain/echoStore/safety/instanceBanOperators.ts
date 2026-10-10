import type pg from 'pg';
import { nextEchoSnowflakeId } from '../../echoSnowflake';

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
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `SELECT pg_advisory_xact_lock(hashtext('echo_instance_operator_mutation'))`,
    );
    if (!isOperator && userId.trim() === actorId) {
      const count = await client.query(
        `SELECT COUNT(*)::int AS c FROM auth_users WHERE is_instance_operator = true`,
      );
      if (Number(count.rows[0]?.c ?? 0) <= 1) {
        throw new Error('LAST_INSTANCE_OPERATOR');
      }
    }
    const r = await client.query(
      `
    UPDATE auth_users
    SET is_instance_operator = $2, updated_at = NOW()
    WHERE id = $1
    RETURNING id
    `,
      [userId.trim(), isOperator],
    );
    if ((r.rowCount ?? 0) === 0) {
      await client.query('COMMIT');
      return false;
    }
    await client.query(
      `
      INSERT INTO echo_instance_ban_audit
        (id, operator_id, action, ban_id, target_user_id, detail)
      VALUES ($1, $2, $3, NULL, $4, NULL)
      `,
      [
        nextEchoSnowflakeId(),
        actorId,
        isOperator ? 'operator_promote' : 'operator_demote',
        userId.trim(),
      ],
    );
    await client.query('COMMIT');
    return true;
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch {
      /* ignore rollback errors */
    }
    throw error;
  } finally {
    client.release();
  }
}
