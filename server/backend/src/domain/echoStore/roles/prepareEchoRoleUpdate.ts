import type pg from 'pg';
import { isEchoServerOwner } from '../members/access';
import { normalizeEchoRoleScope } from '../../../../../../contracts/echoRoleScope';
import { normalizeEchoRoleType } from '../../../../../../contracts/echoRoleTypes';
import type { UpdateEchoRoleResult } from './echoRoleDto';
import type {
  EchoRoleUpdatePatch,
  LoadedRoleRow,
  PreparedUpdate,
} from './echoRoleUpdateTypes';
import {
  canManageEchoRolesCatalog,
  getMergedRolePermissions,
} from './permissions';
import {
  applyCategoryDefaultsToUpdatePatch,
  loadMergedCategoryDefaults,
} from './roleCategoryDefaultsApply';
import {
  echoRoleCategoryExistsForServer,
  resolveRoleCategoryIdForAssignment,
} from './roleCategories';
import {
  normalizeRoleColor,
  normalizeRoleIconEmojiId,
  normalizeRoleIconUrl,
  normalizeRoleName,
  RESERVED_ECHO_ROLE_NAMES,
  roleIconEmojiBelongsToServer,
} from './roleFieldNormalization';
import { actorMayMutateTargetRoleById } from './roleScope';

function patchHasAnyField(patch: EchoRoleUpdatePatch): boolean {
  return (
    patch.name !== undefined ||
    patch.color !== undefined ||
    patch.darkColor !== undefined ||
    patch.lightColor !== undefined ||
    patch.separateThemeColors !== undefined ||
    patch.hoist !== undefined ||
    patch.defaultOnJoin !== undefined ||
    patch.permissions !== undefined ||
    patch.roleCategoryId !== undefined ||
    patch.roleScope !== undefined ||
    patch.roleIconUrl !== undefined ||
    patch.roleIconEmojiId !== undefined ||
    patch.roleType !== undefined ||
    patch.syncWithCategoryDefaults !== undefined
  );
}

export async function authorizeAndLoadEchoRoleForUpdate(
  queryable: pg.Pool | pg.PoolClient,
  serverId: string,
  actorId: string,
  roleId: string,
  patch: EchoRoleUpdatePatch,
): Promise<PreparedUpdate | UpdateEchoRoleResult> {
  if (!patchHasAnyField(patch)) return 'invalid_body';

  const actorPerms = await getMergedRolePermissions(
    queryable as pg.Pool,
    serverId,
    actorId,
  );
  if (!canManageEchoRolesCatalog(actorPerms)) return 'forbidden';

  const rowQ = await queryable.query(
    `SELECT name, position, role_type, color, dark_color, light_color, separate_theme_colors, hoist, default_on_join, role_category_id, permissions, role_scope, sync_with_category_defaults FROM echo_roles WHERE server_id = $1 AND id = $2 LIMIT 1`,
    [serverId, roleId],
  );
  if (rowQ.rows.length === 0) return 'not_found';
  const row0 = rowQ.rows[0] as LoadedRoleRow;
  const currentName = String(row0.name);
  const currentType = normalizeEchoRoleType(row0.role_type);
  let nextType =
    patch.roleType !== undefined
      ? normalizeEchoRoleType(patch.roleType)
      : currentType;
  if (currentName === '@members' || currentName === '@global') {
    nextType = 'mixed';
  }
  if (
    patch.roleType !== undefined &&
    (currentName === '@members' || currentName === '@global') &&
    normalizeEchoRoleType(patch.roleType) !== 'mixed'
  ) {
    return 'invalid_body';
  }

  const actorIsOwner = await isEchoServerOwner(
    queryable as pg.Pool,
    serverId,
    actorId,
  );
  if (!actorIsOwner) {
    const ok = await actorMayMutateTargetRoleById(
      queryable as pg.Pool,
      serverId,
      actorId,
      roleId,
      'manage',
    );
    if (!ok) return 'forbidden';
  }

  return {
    nextType,
    currentName,
    currentType,
    actorPerms,
    actorIsOwner,
    row0,
  };
}

function validateNameAndColors(
  patch: EchoRoleUpdatePatch,
  currentName: string,
  nextType: PreparedUpdate['nextType'],
): UpdateEchoRoleResult | null {
  if (patch.name !== undefined) {
    const nm = normalizeRoleName(patch.name);
    if (!nm) return 'invalid_body';
    if (currentName === '@members' && nm !== '@members') return 'invalid_body';
    if (currentName === '@global' && nm !== '@global') return 'invalid_body';
    if (
      !RESERVED_ECHO_ROLE_NAMES.has(currentName) &&
      RESERVED_ECHO_ROLE_NAMES.has(nm)
    )
      return 'invalid_body';
  }
  if (patch.color !== undefined && normalizeRoleColor(patch.color) == null)
    return 'invalid_body';
  if (
    patch.darkColor !== undefined &&
    nextType === 'mixed' &&
    normalizeRoleColor(patch.darkColor) == null
  )
    return 'invalid_body';
  if (
    patch.lightColor !== undefined &&
    nextType === 'mixed' &&
    normalizeRoleColor(patch.lightColor) == null
  )
    return 'invalid_body';
  if (
    patch.separateThemeColors !== undefined &&
    typeof patch.separateThemeColors !== 'boolean'
  )
    return 'invalid_body';
  if (patch.hoist !== undefined && typeof patch.hoist !== 'boolean')
    return 'invalid_body';
  if (patch.defaultOnJoin !== undefined) {
    if (typeof patch.defaultOnJoin !== 'boolean') return 'invalid_body';
    if (currentName === '@members' || currentName === '@global')
      return 'invalid_body';
  }
  return null;
}

async function validateCategoryAndIcons(
  queryable: pg.Pool | pg.PoolClient,
  serverId: string,
  patch: EchoRoleUpdatePatch,
  currentName: string,
): Promise<UpdateEchoRoleResult | null> {
  if (patch.roleCategoryId !== undefined) {
    if (currentName === '@members' || currentName === '@global')
      return 'invalid_body';
    if (patch.roleCategoryId === null) {
      /* resolves to global category on write */
    } else if (typeof patch.roleCategoryId === 'string') {
      const cid = patch.roleCategoryId.trim();
      if (!cid) return 'invalid_body';
      const ok = await echoRoleCategoryExistsForServer(
        queryable as pg.Pool,
        serverId,
        cid,
      );
      if (!ok) return 'invalid_body';
    } else {
      return 'invalid_body';
    }
  }
  if (
    patch.roleScope !== undefined &&
    currentName !== '@members' &&
    currentName !== '@global'
  ) {
    normalizeEchoRoleScope(patch.roleScope);
  }
  if (patch.roleIconUrl !== undefined) {
    const icon = normalizeRoleIconUrl(patch.roleIconUrl);
    if (patch.roleIconUrl != null && icon == null) return 'invalid_body';
  }
  if (patch.roleIconEmojiId !== undefined) {
    const emoji = normalizeRoleIconEmojiId(patch.roleIconEmojiId);
    if (patch.roleIconEmojiId != null && emoji == null) return 'invalid_body';
    if (emoji != null) {
      const ok = await roleIconEmojiBelongsToServer(
        queryable as pg.Pool,
        serverId,
        emoji,
      );
      if (!ok) return 'invalid_body';
    }
  }
  if (
    patch.syncWithCategoryDefaults !== undefined &&
    typeof patch.syncWithCategoryDefaults !== 'boolean'
  )
    return 'invalid_body';
  return null;
}

export async function prepareEchoRoleUpdatePatch(
  queryable: pg.Pool | pg.PoolClient,
  serverId: string,
  patch: EchoRoleUpdatePatch,
  prepared: PreparedUpdate,
): Promise<UpdateEchoRoleResult | PreparedUpdate> {
  const { currentName } = prepared;
  let { nextType } = prepared;

  const nameErr = validateNameAndColors(patch, currentName, nextType);
  if (nameErr) return nameErr;
  const metaErr = await validateCategoryAndIcons(
    queryable,
    serverId,
    patch,
    currentName,
  );
  if (metaErr) return metaErr;

  if (patch.syncWithCategoryDefaults === true && currentName !== '@members') {
    let targetCategoryId: string | null = null;
    if (patch.roleCategoryId !== undefined) {
      targetCategoryId = await resolveRoleCategoryIdForAssignment(
        queryable as pg.Pool,
        serverId,
        patch.roleCategoryId,
      );
    } else {
      const rc = prepared.row0.role_category_id;
      targetCategoryId =
        rc != null && String(rc).trim() ? String(rc).trim() : null;
    }
    const merged = await loadMergedCategoryDefaults(
      queryable,
      serverId,
      targetCategoryId,
    );
    if (merged) {
      nextType = applyCategoryDefaultsToUpdatePatch(patch, merged);
    }
  }

  return { ...prepared, nextType };
}
