import type pg from 'pg';
import { nextEchoSnowflakeId } from '../../echoSnowflake';
import {
  canManageEchoRolesCatalog,
  getMergedRolePermissions,
} from './permissions';
import { isSystemRoleCategory } from './roleCategoryGlobals';
import { actorMayMutateTargetRoleById } from './roleScope';
import { normalizePermissionListForStorage } from '../../permissions/echoPermissionPrimitives';
import { ALLOWED_PERMS_SET } from '../constants';
import {
  normalizeEchoRoleScope,
  type EchoRoleScope,
} from '../../../../../../contracts/echoRoleScope';
import {
  normalizeEchoRoleType,
  type EchoRoleType,
} from '../../../../../../contracts/echoRoleTypes';
import { invalidateEchoPermissionCacheForServer } from '../../permissions/echoPermissionCache';
import { isEchoServerOwner } from '../members/access';
import {
  actorMayGrantPermissionSet,
  elevatedPermissionsBlockDefaultOnJoin,
} from './roles';
import {
  loadEchoRoleCategoryDefaults,
  propagateCategoryDefaultsToSyncedRoles,
  type EchoRoleCategoryDefaults,
} from './roleCategoryDefaults';

export type EchoRoleCategoryDto = {
  id: string;
  name: string;
  position: number;
  isSystem: boolean;
  defaultPermissions: string[];
  defaultHoist: boolean;
  defaultOnJoin: boolean;
  defaultRoleScope: EchoRoleScope;
  defaultRoleType: EchoRoleType;
  /** When true, self-selectable roles in this category appear in the self-assign channel. */
  selfAssignableDefaults?: boolean;
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
  const r = await pool.query(
    `SELECT id, name, position, is_system, default_permissions, default_hoist,
            default_on_join, default_role_scope, default_role_type,
            self_assignable_defaults
     FROM echo_role_categories WHERE server_id = $1 ORDER BY position ASC, id ASC`,
    [serverId],
  );
  return (
    r.rows as {
      id: unknown;
      name: unknown;
      position: unknown;
      is_system: unknown;
      default_permissions: unknown;
      default_hoist: unknown;
      default_on_join: unknown;
      default_role_scope: unknown;
      default_role_type: unknown;
      self_assignable_defaults: unknown;
    }[]
  )
    .map((row) => ({
      id: String(row.id),
      name: String(row.name),
      position: Number(row.position ?? 0),
      isSystem: Boolean(row.is_system),
      defaultPermissions: normalizePermissionListForStorage(
        row.default_permissions,
        ALLOWED_PERMS_SET,
      ),
      defaultHoist: Boolean(row.default_hoist),
      defaultOnJoin: Boolean(row.default_on_join),
      defaultRoleScope: normalizeEchoRoleScope(row.default_role_scope),
      defaultRoleType: normalizeEchoRoleType(row.default_role_type),
      selfAssignableDefaults: Boolean(row.self_assignable_defaults),
    }))
    .filter((row) => !row.isSystem);
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

  const cnt = await pool.query(
    `SELECT COUNT(*)::int AS c FROM echo_role_categories WHERE server_id = $1`,
    [serverId],
  );
  const n = Number((cnt.rows[0] as { c: number } | undefined)?.c ?? 0);
  if (n >= MAX_ROLE_CATEGORIES_PER_SERVER) return 'invalid_body';

  const posR = await pool.query(
    `SELECT COALESCE(MAX(position), -1) + 1 AS p FROM echo_role_categories WHERE server_id = $1`,
    [serverId],
  );
  const position = Number(posR.rows[0]?.p ?? 0);
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
  patch: {
    name?: unknown;
    defaultPermissions?: unknown;
    defaultHoist?: unknown;
    defaultOnJoin?: unknown;
    defaultRoleScope?: unknown;
    defaultRoleType?: unknown;
    selfAssignableDefaults?: unknown;
  },
): Promise<UpdateEchoRoleCategoryResult> {
  const actorPerms = await getMergedRolePermissions(pool, serverId, actorId);
  if (!canManageEchoRolesCatalog(actorPerms)) return 'forbidden';
  const actorIsOwner = await isEchoServerOwner(pool, serverId, actorId);

  const sets: string[] = [];
  const vals: unknown[] = [];
  let nextDefaults: EchoRoleCategoryDefaults | null = null;

  if (patch.name !== undefined) {
    const name = normalizeCategoryName(patch.name);
    if (!name) return 'invalid_body';
    sets.push(`name = $${vals.length + 1}`);
    vals.push(name);
  }
  if (patch.defaultPermissions !== undefined) {
    const perms = normalizePermissionListForStorage(
      patch.defaultPermissions,
      ALLOWED_PERMS_SET,
    );
    if (!actorMayGrantPermissionSet(actorPerms, new Set(perms), actorIsOwner)) {
      return 'forbidden';
    }
    sets.push(`default_permissions = $${vals.length + 1}::jsonb`);
    vals.push(JSON.stringify(perms));
  }
  if (patch.defaultHoist !== undefined) {
    if (typeof patch.defaultHoist !== 'boolean') return 'invalid_body';
    sets.push(`default_hoist = $${vals.length + 1}`);
    vals.push(patch.defaultHoist);
  }
  if (patch.defaultOnJoin !== undefined) {
    if (typeof patch.defaultOnJoin !== 'boolean') return 'invalid_body';
    sets.push(`default_on_join = $${vals.length + 1}`);
    vals.push(patch.defaultOnJoin);
  }
  if (patch.defaultRoleScope !== undefined) {
    sets.push(`default_role_scope = $${vals.length + 1}`);
    vals.push(normalizeEchoRoleScope(patch.defaultRoleScope));
  }
  if (patch.defaultRoleType !== undefined) {
    sets.push(`default_role_type = $${vals.length + 1}`);
    vals.push(normalizeEchoRoleType(patch.defaultRoleType));
  }
  if (patch.selfAssignableDefaults !== undefined) {
    if (typeof patch.selfAssignableDefaults !== 'boolean') {
      return 'invalid_body';
    }
    sets.push(`self_assignable_defaults = $${vals.length + 1}`);
    vals.push(patch.selfAssignableDefaults);
  }

  if (patch.defaultOnJoin === true) {
    const existingDefaults = await loadEchoRoleCategoryDefaults(
      pool,
      serverId,
      categoryId,
    );
    const permsForJoinCheck =
      patch.defaultPermissions !== undefined
        ? normalizePermissionListForStorage(
            patch.defaultPermissions,
            ALLOWED_PERMS_SET,
          )
        : (existingDefaults?.permissions ?? []);
    if (
      elevatedPermissionsBlockDefaultOnJoin(permsForJoinCheck) &&
      !actorIsOwner
    ) {
      return 'forbidden';
    }
  }

  if (sets.length === 0) return 'invalid_body';

  vals.push(serverId, categoryId);
  const sidPh = vals.length - 1;
  const cidPh = vals.length;
  const r = await pool.query(
    `UPDATE echo_role_categories SET ${sets.join(', ')} WHERE server_id = $${sidPh} AND id = $${cidPh}`,
    vals,
  );
  if ((r.rowCount ?? 0) < 1) return 'not_found';

  const defaultsPatchProvided =
    patch.defaultPermissions !== undefined ||
    patch.defaultHoist !== undefined ||
    patch.defaultOnJoin !== undefined ||
    patch.defaultRoleScope !== undefined ||
    patch.defaultRoleType !== undefined;
  if (defaultsPatchProvided) {
    nextDefaults = await loadEchoRoleCategoryDefaults(
      pool,
      serverId,
      categoryId,
    );
    if (nextDefaults) {
      if (
        !actorMayGrantPermissionSet(
          actorPerms,
          new Set(nextDefaults.permissions),
          actorIsOwner,
        )
      ) {
        return 'forbidden';
      }
      if (
        nextDefaults.defaultOnJoin &&
        elevatedPermissionsBlockDefaultOnJoin(nextDefaults.permissions) &&
        !actorIsOwner
      ) {
        return 'forbidden';
      }
      await propagateCategoryDefaultsToSyncedRoles(
        pool,
        serverId,
        categoryId,
        nextDefaults,
      );
      invalidateEchoPermissionCacheForServer(serverId);
    }
  }
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
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `
      UPDATE echo_roles
      SET role_category_id = NULL
      WHERE server_id = $1 AND role_category_id = $2
      `,
      [serverId, categoryId],
    );
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

/** Resolve null/omitted category to uncategorized (null). */
export async function resolveRoleCategoryIdForAssignment(
  _pool: pg.Pool | pg.PoolClient,
  _serverId: string,
  roleCategoryId: string | null | undefined,
): Promise<string | null> {
  if (roleCategoryId != null && typeof roleCategoryId === 'string') {
    const cid = roleCategoryId.trim();
    if (cid) return cid;
  }
  return null;
}
