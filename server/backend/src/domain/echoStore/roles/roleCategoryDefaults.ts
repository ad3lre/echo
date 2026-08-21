import type pg from 'pg';
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

export type EchoRoleCategoryDefaults = {
  permissions: string[];
  hoist: boolean;
  defaultOnJoin: boolean;
  roleScope: EchoRoleScope;
  roleType: EchoRoleType;
};

type CategoryDefaultsRow = {
  default_permissions: unknown;
  default_hoist: unknown;
  default_on_join: unknown;
  default_role_scope: unknown;
  default_role_type: unknown;
};

function parseCategoryDefaultsRow(
  row: CategoryDefaultsRow | undefined,
): EchoRoleCategoryDefaults {
  const raw = row?.default_permissions;
  const permissions = normalizePermissionListForStorage(raw, ALLOWED_PERMS_SET);
  return {
    permissions,
    hoist: Boolean(row?.default_hoist),
    defaultOnJoin: Boolean(row?.default_on_join),
    roleScope: normalizeEchoRoleScope(row?.default_role_scope),
    roleType: normalizeEchoRoleType(row?.default_role_type),
  };
}

export function categoryDefaultsAreConfigured(
  defaults: EchoRoleCategoryDefaults,
): boolean {
  return (
    defaults.permissions.length > 0 ||
    defaults.hoist ||
    defaults.defaultOnJoin ||
    defaults.roleScope !== 'category' ||
    defaults.roleType !== 'mixed'
  );
}

export async function loadEchoRoleCategoryDefaults(
  pool: pg.Pool | pg.PoolClient,
  serverId: string,
  categoryId: string,
): Promise<EchoRoleCategoryDefaults | null> {
  const r = await pool.query<CategoryDefaultsRow>(
    `
    SELECT default_permissions, default_hoist, default_on_join,
           default_role_scope, default_role_type
    FROM echo_role_categories
    WHERE server_id = $1 AND id = $2
    LIMIT 1
    `,
    [serverId, categoryId],
  );
  if (r.rows.length === 0) return null;
  return parseCategoryDefaultsRow(r.rows[0]);
}

export type AppliedCategoryDefaults = {
  permissions: string[];
  hoist: boolean;
  defaultOnJoin: boolean;
  roleScope: EchoRoleScope;
  roleType: EchoRoleType;
};

/** Apply category defaults onto role fields (full replace of default-controlled fields). */
export function mergeRoleFieldsWithCategoryDefaults(
  defaults: EchoRoleCategoryDefaults,
  current: {
    permissions: string[];
    hoist: boolean;
    defaultOnJoin: boolean;
    roleScope: EchoRoleScope;
    roleType: EchoRoleType;
  },
): AppliedCategoryDefaults {
  return {
    permissions: [...defaults.permissions],
    hoist: defaults.hoist,
    defaultOnJoin: defaults.defaultOnJoin,
    roleScope: defaults.roleScope,
    roleType: defaults.roleType,
  };
}

export async function propagateCategoryDefaultsToSyncedRoles(
  pool: pg.Pool,
  serverId: string,
  categoryId: string,
  defaults: EchoRoleCategoryDefaults,
): Promise<void> {
  const merged = mergeRoleFieldsWithCategoryDefaults(defaults, {
    permissions: [],
    hoist: false,
    defaultOnJoin: false,
    roleScope: 'category',
    roleType: 'mixed',
  });
  await pool.query(
    `
    UPDATE echo_roles
    SET
      permissions = $3::jsonb,
      hoist = $4,
      default_on_join = $5,
      role_scope = $6,
      role_type = $7
    WHERE server_id = $1
      AND role_category_id = $2
      AND name <> '@everyone'
      AND sync_with_category_defaults = true
    `,
    [
      serverId,
      categoryId,
      JSON.stringify(merged.permissions),
      merged.hoist,
      merged.defaultOnJoin,
      merged.roleScope,
      merged.roleType,
    ],
  );
}
