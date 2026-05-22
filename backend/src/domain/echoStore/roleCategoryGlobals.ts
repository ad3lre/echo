import type pg from 'pg';
import { nextEchoSnowflakeId } from '../echoSnowflake';

export const GLOBAL_ROLE_CATEGORY_NAME = 'Global Roles';

export type EchoRoleCategoryRow = {
  id: string;
  name: string;
  position: number;
  isSystem: boolean;
};

/** Ensures the pinned Global Roles category exists at position 0. Returns its id. */
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
    const id = String(existing.rows[0].id);
    await pool.query(
      `
      UPDATE echo_role_categories
      SET position = 0, name = $3
      WHERE server_id = $1 AND id = $2
      `,
      [serverId, id, GLOBAL_ROLE_CATEGORY_NAME],
    );
    await pool.query(
      `
      UPDATE echo_role_categories
      SET position = position + 1
      WHERE server_id = $1 AND id <> $2 AND position < 1
      `,
      [serverId, id],
    );
    return id;
  }

  const id = nextEchoSnowflakeId();
  await pool.query(
    `
    UPDATE echo_role_categories
    SET position = position + 1
    WHERE server_id = $1
    `,
    [serverId],
  );
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

/** Backfill uncategorized non-everyone roles into the global category. */
export async function backfillUncategorizedRolesToGlobalCategory(
  pool: pg.Pool | pg.PoolClient,
  serverId: string,
  globalCategoryId: string,
): Promise<void> {
  await pool.query(
    `
    UPDATE echo_roles
    SET role_category_id = $2
    WHERE server_id = $1
      AND role_category_id IS NULL
      AND name <> '@everyone'
    `,
    [serverId, globalCategoryId],
  );
}
