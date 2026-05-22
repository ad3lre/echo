import type pg from 'pg';
import { nextEchoSnowflakeId } from '../echoSnowflake';
import {
  canManageEchoRolesCatalog,
  getMergedRolePermissions,
} from './permissions';
import {
  ensureGlobalRoleCategoryForServer,
  getGlobalRoleCategoryId,
  isSystemRoleCategory,
} from './roleCategoryGlobals';
import { actorMayMutateTargetRoleById } from './roleScope';

export type EchoRoleCategoryDto = {
  id: string;
  name: string;
  position: number;
  isSystem: boolean;
};

const MAX_ROLE_CATEGORIES_PER_SERVER = 32;
const MAX_ROLE_CATEGORY_NAME_LEN = 64;

function normalizeCategoryName(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const t = raw.trim();
  if (!t || t.length > MAX_ROLE_CATEGORY_NAME_LEN) return null;
  return t;
}

export async function listEchoRoleCategories(
  pool: pg.Pool,
  serverId: string,
): Promise<EchoRoleCategoryDto[]> {
  await ensureGlobalRoleCategoryForServer(pool, serverId);
  const r = await pool.query(
    `SELECT id, name, position, is_system FROM echo_role_categories WHERE server_id = $1 ORDER BY position ASC, id ASC`,
    [serverId],
  );
  return (
    r.rows as {
      id: unknown;
      name: unknown;
      position: unknown;
      is_system: unknown;
    }[]
  ).map((row) => ({
    id: String(row.id),
    name: String(row.name),
    position: Number(row.position ?? 0),
    isSystem: Boolean(row.is_system),
  }));
}

export type EchoRoleCategoryMutationResult =
  | { ok: true; id: string }
  | 'forbidden'
  | 'invalid_body';

export async function createEchoRoleCategory(
  pool: pg.Pool,
  serverId: string,
  actorId: string,
  nameRaw: unknown,
): Promise<EchoRoleCategoryMutationResult> {
  const actorPerms = await getMergedRolePermissions(pool, serverId, actorId);
  if (!canManageEchoRolesCatalog(actorPerms)) return 'forbidden';
  const name = normalizeCategoryName(nameRaw);
  if (!name) return 'invalid_body';

  await ensureGlobalRoleCategoryForServer(pool, serverId);

  const cnt = await pool.query(
    `SELECT COUNT(*)::int AS c FROM echo_role_categories WHERE server_id = $1`,
    [serverId],
  );
  const n = Number((cnt.rows[0] as { c: number } | undefined)?.c ?? 0);
  if (n >= MAX_ROLE_CATEGORIES_PER_SERVER) return 'invalid_body';

  const posR = await pool.query(
    `SELECT COALESCE(MAX(position), 0) + 1 AS p FROM echo_role_categories WHERE server_id = $1 AND is_system = false`,
    [serverId],
  );
  const position = Math.max(1, Number(posR.rows[0]?.p ?? 1));
  const id = nextEchoSnowflakeId();
  await pool.query(
    `INSERT INTO echo_role_categories (id, server_id, name, position, is_system) VALUES ($1, $2, $3, $4, false)`,
    [id, serverId, name, position],
  );
  return { ok: true, id };
}

export type UpdateEchoRoleCategoryResult =
  | 'ok'
  | 'forbidden'
  | 'not_found'
  | 'invalid_body';

export async function updateEchoRoleCategory(
  pool: pg.Pool,
  serverId: string,
  actorId: string,
  categoryId: string,
  patch: { name?: unknown },
): Promise<UpdateEchoRoleCategoryResult> {
  if (patch.name === undefined) return 'invalid_body';
  const actorPerms = await getMergedRolePermissions(pool, serverId, actorId);
  if (!canManageEchoRolesCatalog(actorPerms)) return 'forbidden';
  const name = normalizeCategoryName(patch.name);
  if (!name) return 'invalid_body';
  const r = await pool.query(
    `UPDATE echo_role_categories SET name = $3 WHERE server_id = $1 AND id = $2`,
    [serverId, categoryId, name],
  );
  if ((r.rowCount ?? 0) < 1) return 'not_found';
  return 'ok';
}

export type DeleteEchoRoleCategoryResult =
  | 'ok'
  | 'forbidden'
  | 'not_found'
  | 'cannot_delete_system';

export async function deleteEchoRoleCategory(
  pool: pg.Pool,
  serverId: string,
  actorId: string,
  categoryId: string,
): Promise<DeleteEchoRoleCategoryResult> {
  const actorPerms = await getMergedRolePermissions(pool, serverId, actorId);
  if (!canManageEchoRolesCatalog(actorPerms)) return 'forbidden';
  if (await isSystemRoleCategory(pool, serverId, categoryId)) {
    return 'cannot_delete_system';
  }
  const globalId = await getGlobalRoleCategoryId(pool, serverId);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    if (globalId) {
      await client.query(
        `
        UPDATE echo_roles
        SET role_category_id = $3
        WHERE server_id = $1 AND role_category_id = $2
        `,
        [serverId, categoryId, globalId],
      );
    } else {
      await client.query(
        `
        UPDATE echo_roles
        SET role_category_id = NULL
        WHERE server_id = $1 AND role_category_id = $2
        `,
        [serverId, categoryId],
      );
    }
    const r = await client.query(
      `DELETE FROM echo_role_categories WHERE server_id = $1 AND id = $2`,
      [serverId, categoryId],
    );
    if ((r.rowCount ?? 0) < 1) {
      await client.query('ROLLBACK');
      return 'not_found';
    }
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
  return 'ok';
}

export type ReplaceEchoRoleCategoryOrderResult =
  | 'ok'
  | 'forbidden'
  | 'invalid_body';

export async function replaceEchoRoleCategoryOrder(
  pool: pg.Pool,
  serverId: string,
  actorId: string,
  categoryIdsTopToBottom: string[],
): Promise<ReplaceEchoRoleCategoryOrderResult> {
  const actorPerms = await getMergedRolePermissions(pool, serverId, actorId);
  if (!canManageEchoRolesCatalog(actorPerms)) return 'forbidden';
  await ensureGlobalRoleCategoryForServer(pool, serverId);
  const globalId = await getGlobalRoleCategoryId(pool, serverId);
  const dbRows = await pool.query(
    `SELECT id, is_system FROM echo_role_categories WHERE server_id = $1`,
    [serverId],
  );
  const byId = new Map<string, { isSystem: boolean }>();
  for (const row of dbRows.rows as { id: string; is_system: unknown }[]) {
    byId.set(String(row.id), { isSystem: Boolean(row.is_system) });
  }
  if (categoryIdsTopToBottom.length !== byId.size || byId.size === 0) {
    return 'invalid_body';
  }
  if (globalId && categoryIdsTopToBottom[0] !== globalId) {
    return 'invalid_body';
  }
  const seen = new Set<string>();
  for (const id of categoryIdsTopToBottom) {
    if (seen.has(id) || !byId.has(id)) return 'invalid_body';
    seen.add(id);
  }
  const n = categoryIdsTopToBottom.length;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (let i = 0; i < n; i++) {
      await client.query(
        `UPDATE echo_role_categories SET position = $3 WHERE server_id = $1 AND id = $2`,
        [serverId, categoryIdsTopToBottom[i]!, i],
      );
    }
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
  return 'ok';
}

export async function echoRoleCategoryExistsForServer(
  pool: pg.Pool,
  serverId: string,
  categoryId: string,
): Promise<boolean> {
  const r = await pool.query(
    `SELECT 1 FROM echo_role_categories WHERE server_id = $1 AND id = $2 LIMIT 1`,
    [serverId, categoryId],
  );
  return r.rows.length > 0;
}

/** Resolve null/omitted category to the system Global Roles category id. */
export async function resolveRoleCategoryIdForAssignment(
  pool: pg.Pool | pg.PoolClient,
  serverId: string,
  roleCategoryId: string | null | undefined,
): Promise<string | null> {
  if (roleCategoryId != null && typeof roleCategoryId === 'string') {
    const cid = roleCategoryId.trim();
    if (cid) return cid;
  }
  return getGlobalRoleCategoryId(pool, serverId);
}
