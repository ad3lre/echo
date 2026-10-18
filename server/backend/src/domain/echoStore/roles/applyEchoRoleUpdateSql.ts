import type pg from 'pg';
import { invalidateEchoPermissionCacheForServer } from '../../permissions/echoPermissionCache';
import { normalizePermissionListForStorage } from '../../permissions/echoPermissionPrimitives';
import { ALLOWED_PERMS_SET } from '../constants';
import { normalizeEchoRoleScope } from '../../../../../../contracts/echoRoleScope';
import type { UpdateEchoRoleResult } from './echoRoleDto';
import type {
  EchoRoleUpdatePatch,
  PreparedUpdate,
} from './echoRoleUpdateTypes';
import {
  echoRoleCategoryExistsForServer,
  resolveRoleCategoryIdForAssignment,
} from './roleCategories';
import {
  normalizeRoleColor,
  normalizeRoleIconEmojiId,
  normalizeRoleIconUrl,
  normalizeRoleName,
  normalizeVisualRolePermissionsForStorage,
} from './roleFieldNormalization';
import { actorMayGrantPermissionSet } from './roleGrantGuards';

type SqlParts = { sets: string[]; vals: unknown[] };

function appendBasicFieldSets(
  patch: EchoRoleUpdatePatch,
  nextType: PreparedUpdate['nextType'],
  parts: SqlParts,
): void {
  const { sets, vals } = parts;
  if (patch.name !== undefined) {
    sets.push(`name = $${vals.length + 1}`);
    vals.push(normalizeRoleName(patch.name));
  }
  if (patch.color !== undefined) {
    sets.push(`color = $${vals.length + 1}`);
    vals.push(normalizeRoleColor(patch.color));
  }
  if (patch.darkColor !== undefined && nextType === 'mixed') {
    sets.push(`dark_color = $${vals.length + 1}`);
    vals.push(normalizeRoleColor(patch.darkColor));
  }
  if (patch.lightColor !== undefined && nextType === 'mixed') {
    sets.push(`light_color = $${vals.length + 1}`);
    vals.push(normalizeRoleColor(patch.lightColor));
  }
  if (patch.separateThemeColors !== undefined && nextType === 'mixed') {
    sets.push(`separate_theme_colors = $${vals.length + 1}`);
    vals.push(patch.separateThemeColors);
  }
  if (
    patch.hoist !== undefined &&
    (nextType === 'mixed' || nextType === 'visual')
  ) {
    sets.push(`hoist = $${vals.length + 1}`);
    vals.push(patch.hoist);
  }
  if (
    patch.defaultOnJoin !== undefined &&
    (nextType === 'mixed' || nextType === 'visual')
  ) {
    sets.push(`default_on_join = $${vals.length + 1}`);
    vals.push(patch.defaultOnJoin);
  }
}

function appendPermissionSets(
  patch: EchoRoleUpdatePatch,
  prepared: PreparedUpdate,
  parts: SqlParts,
): UpdateEchoRoleResult | null {
  const { nextType, currentType, actorPerms, actorIsOwner } = prepared;
  const { sets, vals } = parts;
  if (patch.permissions !== undefined && nextType === 'mixed') {
    const normalized = normalizePermissionListForStorage(
      patch.permissions,
      ALLOWED_PERMS_SET,
    );
    if (
      !actorMayGrantPermissionSet(actorPerms, new Set(normalized), actorIsOwner)
    ) {
      return 'forbidden';
    }
    sets.push(`permissions = $${vals.length + 1}::jsonb`);
    vals.push(JSON.stringify(normalized));
  }
  if (patch.permissions !== undefined && nextType === 'visual') {
    const normalized = normalizeVisualRolePermissionsForStorage(
      patch.permissions,
    );
    if (
      !actorMayGrantPermissionSet(actorPerms, new Set(normalized), actorIsOwner)
    ) {
      return 'forbidden';
    }
    sets.push(`permissions = $${vals.length + 1}::jsonb`);
    vals.push(JSON.stringify(normalized));
  }
  if (
    patch.roleType !== undefined &&
    nextType === 'visual' &&
    currentType !== 'visual' &&
    patch.permissions === undefined
  ) {
    sets.push(`permissions = $${vals.length + 1}::jsonb`);
    vals.push(JSON.stringify([]));
  }
  return null;
}

async function appendMetaFieldSets(
  queryable: pg.Pool | pg.PoolClient,
  serverId: string,
  patch: EchoRoleUpdatePatch,
  prepared: PreparedUpdate,
  parts: SqlParts,
): Promise<UpdateEchoRoleResult | null> {
  const { nextType, currentName, row0 } = prepared;
  const { sets, vals } = parts;
  if (patch.roleCategoryId !== undefined) {
    if (
      patch.roleCategoryId !== null &&
      (typeof patch.roleCategoryId !== 'string' ||
        (patch.roleCategoryId.trim() !== '' &&
          !(await echoRoleCategoryExistsForServer(
            queryable as pg.Pool,
            serverId,
            patch.roleCategoryId.trim(),
          ))))
    ) {
      return 'invalid_body';
    }
    const resolved = await resolveRoleCategoryIdForAssignment(
      queryable as pg.Pool,
      serverId,
      patch.roleCategoryId,
    );
    sets.push(`role_category_id = $${vals.length + 1}`);
    vals.push(resolved);
  }
  if (patch.roleScope !== undefined && currentName !== '@members') {
    sets.push(`role_scope = $${vals.length + 1}`);
    vals.push(normalizeEchoRoleScope(patch.roleScope));
  }
  if (patch.roleIconUrl !== undefined) {
    sets.push(`role_icon_url = $${vals.length + 1}`);
    vals.push(normalizeRoleIconUrl(patch.roleIconUrl));
  }
  if (patch.roleIconEmojiId !== undefined) {
    sets.push(`role_icon_emoji_id = $${vals.length + 1}`);
    vals.push(normalizeRoleIconEmojiId(patch.roleIconEmojiId));
  }
  if (patch.roleType !== undefined && currentName !== '@members') {
    sets.push(`role_type = $${vals.length + 1}`);
    vals.push(nextType);
  }
  if (patch.syncWithCategoryDefaults !== undefined) {
    sets.push(`sync_with_category_defaults = $${vals.length + 1}`);
    vals.push(patch.syncWithCategoryDefaults);
  }

  const mergedColor =
    patch.color !== undefined
      ? normalizeRoleColor(patch.color)!
      : String(row0.color ?? '');

  if (nextType === 'visual') {
    sets.push(`separate_theme_colors = $${vals.length + 1}`);
    vals.push(false);
    sets.push(`dark_color = $${vals.length + 1}`);
    vals.push(mergedColor);
    sets.push(`light_color = $${vals.length + 1}`);
    vals.push(mergedColor);
  } else if (nextType === 'authority') {
    sets.push(`hoist = $${vals.length + 1}`);
    vals.push(false);
    sets.push(`separate_theme_colors = $${vals.length + 1}`);
    vals.push(false);
    sets.push(`dark_color = $${vals.length + 1}`);
    vals.push(mergedColor);
    sets.push(`light_color = $${vals.length + 1}`);
    vals.push(mergedColor);
  }
  return null;
}

export async function applyEchoRoleUpdateSql(
  queryable: pg.Pool | pg.PoolClient,
  serverId: string,
  roleId: string,
  patch: EchoRoleUpdatePatch,
  prepared: PreparedUpdate,
  mutationClient?: pg.PoolClient,
): Promise<UpdateEchoRoleResult> {
  const parts: SqlParts = { sets: [], vals: [] };
  appendBasicFieldSets(patch, prepared.nextType, parts);
  const permErr = appendPermissionSets(patch, prepared, parts);
  if (permErr) return permErr;
  const metaErr = await appendMetaFieldSets(
    queryable,
    serverId,
    patch,
    prepared,
    parts,
  );
  if (metaErr) return metaErr;

  const { sets, vals } = parts;
  if (sets.length === 0) return 'ok';

  const sidPlaceholder = vals.length + 1;
  const ridPlaceholder = vals.length + 2;
  vals.push(serverId, roleId);
  await queryable.query(
    `UPDATE echo_roles SET ${sets.join(', ')} WHERE server_id = $${sidPlaceholder} AND id = $${ridPlaceholder}`,
    vals,
  );
  if (patch.roleType !== undefined || patch.permissions !== undefined) {
    if (!mutationClient) invalidateEchoPermissionCacheForServer(serverId);
  }
  return 'ok';
}
