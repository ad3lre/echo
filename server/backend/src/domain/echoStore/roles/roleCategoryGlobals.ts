import type pg from 'pg';
import { nextEchoSnowflakeId } from '../../echoSnowflake';

/** @deprecated Legacy system category name; no longer created for new servers. */
export const GLOBAL_ROLE_CATEGORY_NAME = 'Global Roles';

/** @deprecated Used only by historical one-time schema migrations. */
export async function ensureGlobalRoleCategoryForServer(
  pool: pg.Pool | pg.PoolClient,
  serverId: string,
): Promise<string> {
  const existing = await pool.query<{ id: string }>(
    `
    SELECT id FROM echo_role_categories
    WHERE server_id = $1 AND is_system = true
    LIMIT 1
    `,
    [serverId],
  );
  if (existing.rows[0]) {
    return String(existing.rows[0].id);
  }

  const id = nextEchoSnowflakeId();
  await pool.query(
    `
    INSERT INTO echo_role_categories (id, server_id, name, position, is_system)
    VALUES ($1, $2, $3, 0, true)
    `,
    [id, serverId, GLOBAL_ROLE_CATEGORY_NAME],
  );
  return id;
}

export async function getGlobalRoleCategoryId(
  pool: pg.Pool | pg.PoolClient,
  serverId: string,
): Promise<string | null> {
  const r = await pool.query<{ id: string }>(
    `
    SELECT id FROM echo_role_categories
    WHERE server_id = $1 AND is_system = true
    LIMIT 1
    `,
    [serverId],
  );
  return r.rows[0] ? String(r.rows[0].id) : null;
}

export async function isSystemRoleCategory(
  pool: pg.Pool | pg.PoolClient,
  serverId: string,
  categoryId: string,
): Promise<boolean> {
  const r = await pool.query(
    `
    SELECT 1 FROM echo_role_categories
    WHERE server_id = $1 AND id = $2 AND is_system = true
    LIMIT 1
    `,
    [serverId, categoryId],
  );
  return r.rows.length > 0;
}
