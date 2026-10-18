import type pg from 'pg';
import type { EchoRoleType } from '../../../../../../contracts/echoRoleTypes';
import type { EchoRoleScope } from '../../../../../../contracts/echoRoleScope';
import {
  categoryDefaultsAreConfigured,
  loadEchoRoleCategoryDefaults,
  mergeRoleFieldsWithCategoryDefaults,
  type AppliedCategoryDefaults,
} from './roleCategoryDefaults';

const EMPTY_ROLE_FIELDS = {
  permissions: [] as string[],
  hoist: false,
  defaultOnJoin: false,
  roleScope: 'category' as EchoRoleScope,
  roleType: 'mixed' as EchoRoleType,
};

/** Load configured category defaults and merge them onto empty role fields. */
export async function loadMergedCategoryDefaults(
  pool: pg.Pool | pg.PoolClient,
  serverId: string,
  categoryId: string | null,
): Promise<AppliedCategoryDefaults | null> {
  if (!categoryId) return null;
  const catDefaults = await loadEchoRoleCategoryDefaults(
    pool,
    serverId,
    categoryId,
  );
  if (!catDefaults || !categoryDefaultsAreConfigured(catDefaults)) return null;
  return mergeRoleFieldsWithCategoryDefaults(catDefaults, EMPTY_ROLE_FIELDS);
}

export type CreateBodyCategoryDefaultsPatch = {
  permissions?: unknown;
  hoist?: boolean;
  defaultOnJoin?: boolean;
  roleScope?: unknown;
  roleType?: unknown;
  syncWithCategoryDefaults?: boolean;
};

/**
 * Apply category defaults onto a create body when fields are unspecified.
 * Mutates `body` for permissions/scope/type when those were omitted.
 */
export function applyCategoryDefaultsToCreateBody(
  body: CreateBodyCategoryDefaultsPatch,
  merged: AppliedCategoryDefaults,
  state: {
    hoist: boolean;
    defaultOnJoin: boolean;
    syncWithCategoryDefaults: boolean;
  },
): void {
  const permissionsUnspecified =
    body.permissions === undefined ||
    (Array.isArray(body.permissions) && body.permissions.length === 0);
  if (permissionsUnspecified) {
    body.permissions = merged.permissions;
  }
  if (body.hoist === undefined) state.hoist = merged.hoist;
  if (body.defaultOnJoin === undefined)
    state.defaultOnJoin = merged.defaultOnJoin;
  if (body.roleScope === undefined) body.roleScope = merged.roleScope;
  if (body.roleType === undefined) body.roleType = merged.roleType;
  if (body.syncWithCategoryDefaults === undefined) {
    state.syncWithCategoryDefaults = true;
  }
}

export type UpdatePatchCategoryDefaults = {
  permissions?: unknown;
  hoist?: boolean;
  defaultOnJoin?: boolean;
  roleScope?: unknown;
  roleType?: unknown;
};

/** Copy merged category defaults onto an update patch (sync-with-defaults path). */
export function applyCategoryDefaultsToUpdatePatch(
  patch: UpdatePatchCategoryDefaults,
  merged: AppliedCategoryDefaults,
): EchoRoleType {
  patch.permissions = merged.permissions;
  patch.hoist = merged.hoist;
  patch.defaultOnJoin = merged.defaultOnJoin;
  patch.roleScope = merged.roleScope;
  patch.roleType = merged.roleType;
  return merged.roleType;
}
