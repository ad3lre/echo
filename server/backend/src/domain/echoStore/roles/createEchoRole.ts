import type pg from 'pg';
import { nextEchoSnowflakeId } from '../../echoSnowflake';
import { normalizePermissionListForStorage } from '../../permissions/echoPermissionPrimitives';
import { ECHO_SERVER_ROLE_LIMIT } from '../../../auth/accountPolicy';
import { ALLOWED_PERMS_SET } from '../constants';
import { isEchoServerOwner } from '../members/access';
import { normalizeEchoRoleScope } from '../../../../../../contracts/echoRoleScope';
import { normalizeEchoRoleType } from '../../../../../../contracts/echoRoleTypes';
import {
  canManageEchoRolesCatalog,
  getMergedRolePermissions,
} from './permissions';
import {
  applyCategoryDefaultsToCreateBody,
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
  normalizeVisualRolePermissionsForStorage,
  RESERVED_ECHO_ROLE_NAMES,
  roleIconEmojiBelongsToServer,
} from './roleFieldNormalization';
import { actorMayGrantPermissionSet } from './roleGrantGuards';
import { reconcileMembersRoleHierarchyPosition } from './roleHierarchy';
import {
  applyRolePositionsFromCategoryBlocks,
  buildCategoryRoleOrderMap,
} from './roleOrdering';

export type CreateEchoRoleBody = {
  name: string;
  color?: string | null;
  darkColor?: string | null;
  lightColor?: string | null;
  separateThemeColors?: boolean;
  permissions?: unknown;
  hoist?: boolean;
  defaultOnJoin?: boolean;
  roleCategoryId?: string | null;
  roleScope?: unknown;
  insertAfterRoleId?: string | null;
  roleIconUrl?: string | null;
  roleIconEmojiId?: string | null;
  roleType?: unknown;
  syncWithCategoryDefaults?: boolean;
};

export async function createEchoRole(
  pool: pg.Pool,
  serverId: string,
  actorId: string,
  body: CreateEchoRoleBody,
): Promise<
  { roleId: string } | 'forbidden' | 'invalid_body' | 'limit_reached'
> {
  const actorPerms = await getMergedRolePermissions(pool, serverId, actorId);
  if (!canManageEchoRolesCatalog(actorPerms)) return 'forbidden';
  const actorIsOwner = await isEchoServerOwner(pool, serverId, actorId);
  const name = normalizeRoleName(body.name);
  if (!name) return 'invalid_body';
  if (RESERVED_ECHO_ROLE_NAMES.has(name)) return 'invalid_body';
  const color = normalizeRoleColor(body.color);
  if (color == null) return 'invalid_body';
  const darkColor = normalizeRoleColor(body.darkColor);
  if (darkColor == null) return 'invalid_body';
  const lightColor = normalizeRoleColor(body.lightColor);
  if (lightColor == null) return 'invalid_body';
  let separateThemeColors = body.separateThemeColors === true;
  let hoist = body.hoist === true;
  let defaultOnJoin = body.defaultOnJoin === true;
  if (defaultOnJoin && (name === '@members' || name === '@global'))
    return 'invalid_body';

  const roleType = normalizeEchoRoleType(body.roleType);
  let effDark = darkColor ?? color;
  let effLight = lightColor ?? color;
  if (roleType === 'authority') {
    hoist = false;
    separateThemeColors = false;
    effDark = color;
    effLight = color;
  }
  if (roleType === 'visual') {
    separateThemeColors = false;
    effDark = color;
    effLight = color;
  }

  const roleCategoryId = await resolveRoleCategoryIdForAssignment(
    pool,
    serverId,
    body.roleCategoryId,
  );
  if (
    body.roleCategoryId !== undefined &&
    body.roleCategoryId !== null &&
    typeof body.roleCategoryId === 'string' &&
    body.roleCategoryId.trim()
  ) {
    const ok = await echoRoleCategoryExistsForServer(
      pool,
      serverId,
      body.roleCategoryId.trim(),
    );
    if (!ok) return 'invalid_body';
  }
  const roleScope =
    name === '@members' || name === '@global'
      ? 'category'
      : normalizeEchoRoleScope(body.roleScope);
  let syncWithCategoryDefaults =
    body.syncWithCategoryDefaults !== false &&
    name !== '@members' &&
    name !== '@global';

  if (name !== '@members' && name !== '@global') {
    const merged = await loadMergedCategoryDefaults(
      pool,
      serverId,
      roleCategoryId,
    );
    if (merged) {
      const state = { hoist, defaultOnJoin, syncWithCategoryDefaults };
      applyCategoryDefaultsToCreateBody(body, merged, state);
      hoist = state.hoist;
      defaultOnJoin = state.defaultOnJoin;
      syncWithCategoryDefaults = state.syncWithCategoryDefaults;
    }
  }

  const effectiveRoleScope =
    name === '@members'
      ? 'category'
      : normalizeEchoRoleScope(body.roleScope ?? roleScope);
  const effectiveRoleType = normalizeEchoRoleType(body.roleType ?? roleType);
  if (effectiveRoleType === 'authority') {
    hoist = false;
    separateThemeColors = false;
    effDark = color;
    effLight = color;
  }
  if (effectiveRoleType === 'visual') {
    separateThemeColors = false;
    effDark = color;
    effLight = color;
  }
  const roleIconUrl = normalizeRoleIconUrl(body.roleIconUrl);
  if (body.roleIconUrl != null && roleIconUrl == null) return 'invalid_body';
  const roleIconEmojiId = normalizeRoleIconEmojiId(body.roleIconEmojiId);
  if (body.roleIconEmojiId != null && roleIconEmojiId == null)
    return 'invalid_body';
  if (roleIconEmojiId != null) {
    const ok = await roleIconEmojiBelongsToServer(
      pool,
      serverId,
      roleIconEmojiId,
    );
    if (!ok) return 'invalid_body';
  }

  const placement = await resolveCreateRolePlacement(
    pool,
    serverId,
    roleCategoryId,
    body.insertAfterRoleId,
  );
  if (placement === 'invalid_body') return 'invalid_body';
  const { rankInCategory, pos } = placement;

  const id = nextEchoSnowflakeId();
  const normalized =
    effectiveRoleType === 'visual'
      ? normalizeVisualRolePermissionsForStorage(body.permissions)
      : normalizePermissionListForStorage(body.permissions, ALLOWED_PERMS_SET);
  if (
    !actorMayGrantPermissionSet(actorPerms, new Set(normalized), actorIsOwner)
  ) {
    return 'forbidden';
  }
  const inserted = await insertEchoRoleRow(pool, {
    id,
    serverId,
    name,
    color,
    effDark,
    effLight,
    separateThemeColors,
    pos,
    normalized,
    hoist,
    defaultOnJoin,
    roleCategoryId,
    rankInCategory,
    effectiveRoleScope,
    roleIconUrl,
    roleIconEmojiId,
    effectiveRoleType,
    syncWithCategoryDefaults,
  });
  if (inserted === 'limit_reached') return 'limit_reached';

  const map = await buildCategoryRoleOrderMap(pool, serverId);
  if (roleCategoryId) {
    const list = map.get(roleCategoryId) ?? [];
    map.set(roleCategoryId, [id, ...list.filter((rid) => rid !== id)]);
  }
  await applyRolePositionsFromCategoryBlocks(pool, serverId, map);
  await reconcileMembersRoleHierarchyPosition(pool, serverId);
  return { roleId: id };
}

async function resolveCreateRolePlacement(
  pool: pg.Pool,
  serverId: string,
  roleCategoryId: string | null,
  insertAfterRoleId: string | null | undefined,
): Promise<{ rankInCategory: number; pos: number } | 'invalid_body'> {
  const catRoles = await pool.query<{
    id: string;
    position: unknown;
    rank_in_category: unknown;
  }>(
    `
    SELECT id, position, rank_in_category FROM echo_roles
    WHERE server_id = $1 AND role_category_id IS NOT DISTINCT FROM $2 AND name <> '@members'
    ORDER BY rank_in_category DESC, position DESC
    `,
    [serverId, roleCategoryId],
  );
  let rankInCategory = 0;
  let pos = 1;
  const insertAfter =
    typeof insertAfterRoleId === 'string' ? insertAfterRoleId.trim() : '';
  if (insertAfter) {
    const idx = catRoles.rows.findIndex(
      (row) => String(row.id) === insertAfter,
    );
    if (idx < 0) return 'invalid_body';
    const after = catRoles.rows[idx]!;
    rankInCategory = Number(after.rank_in_category ?? 0) + 1;
    pos = Number(after.position ?? 0) + 1;
  } else if (catRoles.rows.length > 0) {
    const top = catRoles.rows[0]!;
    rankInCategory = Number(top.rank_in_category ?? 0) + 1;
    pos = Number(top.position ?? 0) + 1;
  } else {
    const minR = await pool.query<{ p: number | null }>(
      `
      SELECT MIN(position) AS p FROM echo_roles
      WHERE server_id = $1 AND name <> '@members'
      `,
      [serverId],
    );
    pos = Number(minR.rows[0]?.p ?? 1) - 1;
  }
  return { rankInCategory, pos };
}

async function insertEchoRoleRow(
  pool: pg.Pool,
  args: {
    id: string;
    serverId: string;
    name: string;
    color: string;
    effDark: string;
    effLight: string;
    separateThemeColors: boolean;
    pos: number;
    normalized: string[];
    hoist: boolean;
    defaultOnJoin: boolean;
    roleCategoryId: string | null;
    rankInCategory: number;
    effectiveRoleScope: string;
    roleIconUrl: string | null;
    roleIconEmojiId: string | null;
    effectiveRoleType: string;
    syncWithCategoryDefaults: boolean;
  },
): Promise<'ok' | 'limit_reached'> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `SELECT pg_advisory_xact_lock(hashtext('echo_role_create_cap'), hashtext($1))`,
      [args.serverId],
    );
    const countResult = await client.query(
      `SELECT COUNT(*)::int AS role_count FROM echo_roles WHERE server_id = $1`,
      [args.serverId],
    );
    if (
      Number(countResult.rows[0]?.role_count ?? 0) >= ECHO_SERVER_ROLE_LIMIT
    ) {
      await client.query('ROLLBACK');
      return 'limit_reached';
    }
    await client.query(
      `
    INSERT INTO echo_roles (
      id, server_id, name, color, dark_color, light_color, separate_theme_colors,
      position, permissions, hoist, default_on_join, role_category_id, rank_in_category,
      role_scope, role_icon_url, role_icon_emoji_id, role_type, sync_with_category_defaults
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10, $11, $12, $13, $14, $15, $16, $17, $18)
    `,
      [
        args.id,
        args.serverId,
        args.name,
        args.color,
        args.effDark,
        args.effLight,
        args.separateThemeColors,
        args.pos,
        JSON.stringify(args.normalized),
        args.hoist,
        args.defaultOnJoin,
        args.roleCategoryId,
        args.rankInCategory,
        args.effectiveRoleScope,
        args.roleIconUrl,
        args.roleIconEmojiId,
        args.effectiveRoleType,
        args.syncWithCategoryDefaults,
      ],
    );
    await client.query('COMMIT');
    return 'ok';
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch {
      /* preserve original error */
    }
    throw err;
  } finally {
    client.release();
  }
}
