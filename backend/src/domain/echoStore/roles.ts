import type pg from 'pg';
import { applyEchoRoleLinksAfterAssignment } from './roleLinks';
import { invalidateEchoPermissionCacheForServer } from '../echoPermissionCache';
import {
  expandStoredRolePermissionsToCanonSet,
  normalizePermissionListForStorage,
  resolveCanonicalPermissionKeys,
} from '../echoPermissionPrimitives';
import { nextEchoSnowflakeId } from '../echoSnowflake';
import { ALLOWED_PERMS_SET } from './constants';
import {
  canAssignEchoMemberRoles,
  canManageEchoRolesCatalog,
  getMergedRolePermissions,
} from './permissions';
import {
  echoRoleCategoryExistsForServer,
  resolveRoleCategoryIdForAssignment,
} from './roleCategories';
import {
  applyRolePositionsFromCategoryBlocks,
  buildCategoryRoleOrderMap,
} from './roleOrdering';
import {
  loadEchoRoleCategoryDefaults,
  mergeRoleFieldsWithCategoryDefaults,
  categoryDefaultsAreConfigured,
} from './roleCategoryDefaults';
import { actorMayMutateTargetRoleById } from './roleScope';
import {
  normalizeEchoRoleScope,
  type EchoRoleScope,
} from '../../../../shared/echoRoleScope';
import { ECHO_SERVER_ROLE_LIMIT } from '../../auth/accountPolicy';
import { getMemberTopRolePosition, isEchoServerOwner } from './access';
import {
  normalizeEchoRoleType,
  type EchoRoleType,
} from '../../../../shared/echoRoleTypes';

/** Visual roles store at most this permission in `echo_roles.permissions` (role mentionability). */
function normalizeVisualRolePermissionsForStorage(
  permissions: unknown,
): string[] {
  const normalized = normalizePermissionListForStorage(
    permissions,
    ALLOWED_PERMS_SET,
  );
  return normalized.filter((p) => p === 'MENTION_EVERYONE');
}

export type EchoRoleDto = {
  id: string;
  name: string;
  color: string;
  darkColor: string;
  lightColor: string;
  separateThemeColors: boolean;
  position: number;
  hoist: boolean;
  defaultOnJoin: boolean;
  isMembers: boolean;
  /** @deprecated use isMembers */
  isEveryone: boolean;
  isGlobal: boolean;
  /** Server settings organizer only; omitted when column missing (legacy clients). */
  roleCategoryId: string | null;
  /** Display order within the role category (higher = higher in settings list). */
  rankInCategory: number;
  /** Whether manage/assign permissions on this role apply across all categories. */
  roleScope: EchoRoleScope;
  roleIconUrl: string | null;
  roleIconEmojiId: string | null;
  permissions: string[];
  roleType: EchoRoleType;
  /** When true, permissions/hoist/join defaults follow the role category template. */
  syncWithCategoryDefaults: boolean;
};

type EchoRoleRow = {
  id: unknown;
  name: unknown;
  color: unknown;
  dark_color: unknown;
  light_color: unknown;
  separate_theme_colors: unknown;
  position: unknown;
  permissions: unknown;
  hoist: unknown;
  default_on_join: unknown;
  role_category_id: unknown;
  rank_in_category: unknown;
  role_scope: unknown;
  role_icon_url: unknown;
  role_icon_emoji_id: unknown;
  role_type: unknown;
  sync_with_category_defaults: unknown;
};

export type ListEchoRolesForServerOptions = {
  /**
   * When false, roles with `role_type = authority` are omitted (callers without
   * Manage Roles must not see them in member-facing role lists).
   */
  includeAuthorityRoles?: boolean;
};

const HEX_ROLE_COLOR_RE = /^#[0-9a-fA-F]{6}$/;

/** Permissions that must not be category defaults with `defaultOnJoin` unless the actor owns the server. */
const ECHO_AUTO_JOIN_FORBIDDEN_PERMISSIONS = new Set([
  'ADMINISTRATOR',
  'MANAGE_GUILD',
  'MANAGE_ROLES',
]);

export function elevatedPermissionsBlockDefaultOnJoin(
  permissions: readonly string[],
): boolean {
  return permissions.some((p) => ECHO_AUTO_JOIN_FORBIDDEN_PERMISSIONS.has(p));
}

/** Non-owners may only write permission bits they already hold (`ADMINISTRATOR` ⇒ full set in `actorPerms`). */
export function actorMayGrantPermissionSet(
  actorPerms: ReadonlySet<string>,
  granted: ReadonlySet<string>,
  actorIsOwner: boolean,
): boolean {
  if (actorIsOwner) return true;
  if (actorPerms.has('ADMINISTRATOR')) return true;
  for (const p of granted) {
    if (!actorPerms.has(p)) return false;
  }
  return true;
}

const RESERVED_ECHO_ROLE_NAMES = new Set<string>(['@members', '@global']);
/** @deprecated use RESERVED_ECHO_ROLE_NAMES */
const RESERVED_ECHO_ROLE_NAME = '@members';

function normalizeRoleName(raw: unknown): string {
  return typeof raw === 'string' ? raw.trim() : '';
}

function normalizeRoleColor(raw: unknown): string | null {
  if (raw == null) return '';
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed) return '';
  return HEX_ROLE_COLOR_RE.test(trimmed) ? trimmed : null;
}

function normalizeRoleIconUrl(raw: unknown): string | null {
  if (raw == null) return null;
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (trimmed.length > 2048) return null;
  return trimmed;
}

function normalizeRoleIconEmojiId(raw: unknown): string | null {
  if (raw == null) return null;
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (trimmed.length > 128) return null;
  return trimmed;
}

async function roleIconEmojiBelongsToServer(
  pool: pg.Pool,
  serverId: string,
  emojiId: string,
): Promise<boolean> {
  const r = await pool.query(
    `SELECT 1 FROM echo_server_custom_emojis WHERE server_id = $1 AND id = $2 LIMIT 1`,
    [serverId, emojiId],
  );
  return r.rows.length > 0;
}

/**
 * Reassigns `echo_roles.position` so the `@members` role is strictly lower than every other role
 * in the server, preserving relative order among non-members roles (by current position DESC, id ASC).
 * Idempotent; no-ops when already satisfied.
 */
export async function reconcileMembersRoleHierarchyPosition(
  pool: pg.Pool,
  serverId: string,
): Promise<void> {
  const result = await pool.query(
    `
    WITH ordered AS (
      SELECT id,
        ROW_NUMBER() OVER (
          ORDER BY
            CASE WHEN name = '@members' THEN 0 ELSE 1 END DESC,
            position DESC,
            id ASC
        ) AS rank,
        COUNT(*) OVER () AS c
      FROM echo_roles
      WHERE server_id = $1
    ),
    mapped AS (
      SELECT id, (c - rank)::int AS new_pos
      FROM ordered
    )
    UPDATE echo_roles r
    SET position = m.new_pos
    FROM mapped m
    WHERE r.server_id = $1 AND r.id = m.id AND r.position IS DISTINCT FROM m.new_pos
    `,
    [serverId],
  );
  if ((result.rowCount ?? 0) > 0) {
    invalidateEchoPermissionCacheForServer(serverId);
  }
}

/** @deprecated use reconcileMembersRoleHierarchyPosition */
export const reconcileEveryoneRoleHierarchyPosition =
  reconcileMembersRoleHierarchyPosition;

/** One-time / startup: fix all servers (e.g. after bad imports or legacy data). */
export async function migrateMembersRoleHierarchyPositions(
  pool: pg.Pool,
): Promise<void> {
  const result = await pool.query(
    `
    WITH ordered AS (
      SELECT id, server_id,
        ROW_NUMBER() OVER (
          PARTITION BY server_id
          ORDER BY
            CASE WHEN name = '@members' THEN 0 ELSE 1 END DESC,
            position DESC,
            id ASC
        ) AS rank,
        COUNT(*) OVER (PARTITION BY server_id) AS c
      FROM echo_roles
    ),
    mapped AS (
      SELECT id, server_id, (c - rank)::int AS new_pos
      FROM ordered
    )
    UPDATE echo_roles r
    SET position = m.new_pos
    FROM mapped m
    WHERE r.id = m.id AND r.server_id = m.server_id AND r.position IS DISTINCT FROM m.new_pos
    RETURNING r.server_id
    `,
  );
  const seen = new Set<string>();
  for (const row of result.rows as { server_id: string }[]) {
    const sid = String(row.server_id);
    if (seen.has(sid)) continue;
    seen.add(sid);
    invalidateEchoPermissionCacheForServer(sid);
  }
}

/** @deprecated use migrateMembersRoleHierarchyPositions */
export const migrateEveryoneRoleHierarchyPositions =
  migrateMembersRoleHierarchyPositions;

export async function listEchoRolesForServer(
  pool: pg.Pool,
  serverId: string,
  options?: ListEchoRolesForServerOptions,
): Promise<EchoRoleDto[]> {
  const includeAuthority = options?.includeAuthorityRoles !== false;
  const r = await pool.query<EchoRoleRow>(
    `
    SELECT r.id, r.name, r.color, r.dark_color, r.light_color, r.separate_theme_colors,
           r.position, r.permissions, r.hoist, r.default_on_join, r.role_category_id,
           r.rank_in_category, r.role_scope, r.role_icon_url, r.role_icon_emoji_id, r.role_type,
           r.sync_with_category_defaults
    FROM echo_roles r
    LEFT JOIN echo_role_categories c
      ON c.id = r.role_category_id AND c.server_id = r.server_id
    WHERE r.server_id = $1
    ORDER BY
      CASE WHEN r.name = '@members' THEN 1 ELSE 0 END,
      COALESCE(c.position, 0) ASC,
      r.rank_in_category DESC,
      r.position DESC,
      r.id ASC
    `,
    [serverId],
  );
  const out: EchoRoleDto[] = [];
  for (const row of r.rows) {
    const name = String(row.name);
    const roleType = normalizeEchoRoleType(row.role_type);
    if (!includeAuthority && roleType === 'authority') continue;
    const raw = row.permissions;
    const permissions: string[] = (() => {
      if (raw == null) return [];
      const source = Array.isArray(raw)
        ? raw.filter((x: unknown): x is string => typeof x === 'string')
        : typeof raw === 'object'
          ? Object.entries(raw as Record<string, unknown>)
              .filter(([, value]) => value === true)
              .map(([key]) => key)
          : [];
      if (source.length === 0) return [];
      const seen = new Set<string>();
      const outPerms: string[] = [];
      for (const token of source) {
        for (const canon of resolveCanonicalPermissionKeys(token)) {
          if (seen.has(canon)) continue;
          seen.add(canon);
          outPerms.push(canon);
        }
      }
      if (roleType === 'visual') {
        return outPerms.filter((p) => p === 'MENTION_EVERYONE');
      }
      return outPerms;
    })();
    const rc = row.role_category_id;
    const roleCategoryId =
      rc != null && typeof rc === 'string' && rc.trim() ? rc.trim() : null;
    const roleIconUrl = normalizeRoleIconUrl(row.role_icon_url);
    const roleIconEmojiId = normalizeRoleIconEmojiId(row.role_icon_emoji_id);
    const color = String(row.color ?? '');
    let darkColor = String(row.dark_color ?? row.color ?? '');
    let lightColor = String(row.light_color ?? row.color ?? '');
    let separateThemeColors = Boolean(row.separate_theme_colors);
    let hoist = Boolean(row.hoist);
    let defaultOnJoin = Boolean(row.default_on_join);
    if (roleType === 'authority') {
      hoist = false;
      separateThemeColors = false;
      darkColor = color;
      lightColor = color;
    }
    if (roleType === 'visual') {
      separateThemeColors = false;
      darkColor = color;
      lightColor = color;
    }
    out.push({
      id: String(row.id),
      name,
      color,
      darkColor,
      lightColor,
      separateThemeColors,
      position: Number(row.position ?? 0),
      hoist,
      defaultOnJoin,
      isMembers: name === '@members',
      isEveryone: name === '@members', // deprecated alias for backward compatibility
      isGlobal: name === '@global',
      roleCategoryId,
      rankInCategory: Number(row.rank_in_category ?? 0),
      roleScope: normalizeEchoRoleScope(row.role_scope),
      roleIconUrl,
      roleIconEmojiId,
      permissions,
      roleType,
      syncWithCategoryDefaults: row.sync_with_category_defaults !== false,
    });
  }
  return out;
}

export type UpdateEchoRoleResult =
  | 'ok'
  | 'forbidden'
  | 'not_found'
  | 'invalid_body';

/** Top-to-bottom UI order (highest role first). @members is forced to bottom; must be a permutation of server roles. */
export async function replaceEchoServerRoleOrder(
  pool: pg.Pool,
  serverId: string,
  actorId: string,
  roleIdsTopToBottom: string[],
): Promise<UpdateEchoRoleResult> {
  const actorPerms = await getMergedRolePermissions(pool, serverId, actorId);
  if (!canManageEchoRolesCatalog(actorPerms)) return 'forbidden';
  const actorIsOwner = await isEchoServerOwner(pool, serverId, actorId);
  const dbRows = await pool.query(
    `SELECT id, name, position, role_category_id FROM echo_roles WHERE server_id = $1`,
    [serverId],
  );
  const byId = new Map<
    string,
    { name: string; position: number; roleCategoryId: string | null }
  >();
  for (const row of dbRows.rows as {
    id: string;
    name: string;
    position: unknown;
    role_category_id: unknown;
  }[]) {
    const rc = row.role_category_id;
    byId.set(String(row.id), {
      name: String(row.name),
      position: Number(row.position ?? 0),
      roleCategoryId:
        rc != null && String(rc).trim() ? String(rc).trim() : null,
    });
  }
  if (roleIdsTopToBottom.length !== byId.size || byId.size === 0)
    return 'invalid_body';
  const seen = new Set<string>();
  for (const id of roleIdsTopToBottom) {
    if (seen.has(id) || !byId.has(id)) return 'invalid_body';
    seen.add(id);
  }
  const ordered = [...roleIdsTopToBottom];
  const membersIdx = ordered.findIndex(
    (id) => byId.get(id)?.name === '@members',
  );
  if (membersIdx >= 0) {
    const [ev] = ordered.splice(membersIdx, 1);
    ordered.push(ev!);
  }
  if (!actorIsOwner) {
    for (const roleId of ordered) {
      if (byId.get(roleId)?.name === '@members') continue;
      const ok = await actorMayMutateTargetRoleById(
        pool,
        serverId,
        actorId,
        roleId,
        'manage',
      );
      if (!ok) return 'forbidden';
    }
  }
  const blockMap = new Map<string, string[]>();
  for (const roleId of ordered) {
    const row = byId.get(roleId);
    if (!row || row.name === '@members') continue;
    const catId = row.roleCategoryId ?? '__uncategorized__';
    const list = blockMap.get(catId) ?? [];
    list.push(roleId);
    blockMap.set(catId, list);
  }
  const normalized = blockMap;
  await applyRolePositionsFromCategoryBlocks(pool, serverId, normalized);
  await reconcileEveryoneRoleHierarchyPosition(pool, serverId);
  return 'ok';
}

/** Reorder roles within one category (top-to-bottom UI order). */
export async function replaceEchoRoleOrderInCategory(
  pool: pg.Pool,
  serverId: string,
  actorId: string,
  categoryId: string,
  roleIdsTopToBottom: string[],
): Promise<UpdateEchoRoleResult> {
  const actorPerms = await getMergedRolePermissions(pool, serverId, actorId);
  if (!canManageEchoRolesCatalog(actorPerms)) return 'forbidden';
  const okCat = await echoRoleCategoryExistsForServer(
    pool,
    serverId,
    categoryId,
  );
  if (!okCat) return 'invalid_body';

  const inCat = await pool.query<{ id: string; name: string }>(
    `
    SELECT id, name FROM echo_roles
    WHERE server_id = $1 AND role_category_id = $2
    `,
    [serverId, categoryId],
  );
  const expected = inCat.rows.filter((r) => r.name !== '@members');
  if (roleIdsTopToBottom.length !== expected.length) return 'invalid_body';
  const expectedIds = new Set(expected.map((r) => String(r.id)));
  const seen = new Set<string>();
  for (const id of roleIdsTopToBottom) {
    if (seen.has(id) || !expectedIds.has(id)) return 'invalid_body';
    seen.add(id);
  }

  const actorIsOwner = await isEchoServerOwner(pool, serverId, actorId);
  if (!actorIsOwner) {
    for (const roleId of roleIdsTopToBottom) {
      const ok = await actorMayMutateTargetRoleById(
        pool,
        serverId,
        actorId,
        roleId,
        'manage',
      );
      if (!ok) return 'forbidden';
    }
  }

  const map = await buildCategoryRoleOrderMap(pool, serverId);
  map.set(categoryId, roleIdsTopToBottom);
  await applyRolePositionsFromCategoryBlocks(pool, serverId, map);
  await reconcileMembersRoleHierarchyPosition(pool, serverId);
  return 'ok';
}

export async function updateEchoRole(
  pool: pg.Pool,
  serverId: string,
  actorId: string,
  roleId: string,
  patch: {
    name?: string;
    color?: string | null;
    darkColor?: string | null;
    lightColor?: string | null;
    separateThemeColors?: boolean;
    hoist?: boolean;
    defaultOnJoin?: boolean;
    permissions?: unknown;
    /** Server settings category; null clears. Not valid for @members. */
    roleCategoryId?: string | null;
    roleScope?: unknown;
    roleIconUrl?: string | null;
    roleIconEmojiId?: string | null;
    roleType?: unknown;
    syncWithCategoryDefaults?: boolean;
  },
): Promise<UpdateEchoRoleResult> {
  const touched =
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
    patch.syncWithCategoryDefaults !== undefined;
  if (!touched) return 'invalid_body';

  const actorPerms = await getMergedRolePermissions(pool, serverId, actorId);
  if (!canManageEchoRolesCatalog(actorPerms)) return 'forbidden';

  const rowQ = await pool.query(
    `SELECT name, position, role_type, color, dark_color, light_color, separate_theme_colors, hoist, default_on_join, role_category_id, permissions, role_scope, sync_with_category_defaults FROM echo_roles WHERE server_id = $1 AND id = $2 LIMIT 1`,
    [serverId, roleId],
  );
  if (rowQ.rows.length === 0) return 'not_found';
  const row0 = rowQ.rows[0] as {
    name: string;
    position: unknown;
    role_type?: unknown;
    color?: unknown;
    dark_color?: unknown;
    light_color?: unknown;
    separate_theme_colors?: unknown;
    hoist?: unknown;
    default_on_join?: unknown;
    role_category_id?: unknown;
    permissions?: unknown;
    role_scope?: unknown;
    sync_with_category_defaults?: unknown;
  };
  const currentName = String(row0.name);
  const currentPosition = Number(row0.position ?? 0);
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

  const actorIsOwner = await isEchoServerOwner(pool, serverId, actorId);
  if (!actorIsOwner) {
    const ok = await actorMayMutateTargetRoleById(
      pool,
      serverId,
      actorId,
      roleId,
      'manage',
    );
    if (!ok) return 'forbidden';
  }

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

  if (patch.color !== undefined) {
    const color = normalizeRoleColor(patch.color);
    if (color == null) return 'invalid_body';
  }
  if (patch.darkColor !== undefined && nextType === 'mixed') {
    const color = normalizeRoleColor(patch.darkColor);
    if (color == null) return 'invalid_body';
  }
  if (patch.lightColor !== undefined && nextType === 'mixed') {
    const color = normalizeRoleColor(patch.lightColor);
    if (color == null) return 'invalid_body';
  }
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

  if (patch.roleCategoryId !== undefined) {
    if (currentName === '@members' || currentName === '@global')
      return 'invalid_body';
    if (patch.roleCategoryId === null) {
      /* resolves to global category on write */
    } else if (typeof patch.roleCategoryId === 'string') {
      const cid = patch.roleCategoryId.trim();
      if (!cid) return 'invalid_body';
      const ok = await echoRoleCategoryExistsForServer(pool, serverId, cid);
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
      const ok = await roleIconEmojiBelongsToServer(pool, serverId, emoji);
      if (!ok) return 'invalid_body';
    }
  }

  if (patch.syncWithCategoryDefaults !== undefined) {
    if (typeof patch.syncWithCategoryDefaults !== 'boolean')
      return 'invalid_body';
  }

  if (patch.syncWithCategoryDefaults === true && currentName !== '@members') {
    let targetCategoryId: string | null = null;
    if (patch.roleCategoryId !== undefined) {
      targetCategoryId = await resolveRoleCategoryIdForAssignment(
        pool,
        serverId,
        patch.roleCategoryId,
      );
    } else {
      const rc = row0.role_category_id;
      targetCategoryId =
        rc != null && String(rc).trim() ? String(rc).trim() : null;
    }
    if (targetCategoryId) {
      const catDefaults = await loadEchoRoleCategoryDefaults(
        pool,
        serverId,
        targetCategoryId,
      );
      if (catDefaults && categoryDefaultsAreConfigured(catDefaults)) {
        const merged = mergeRoleFieldsWithCategoryDefaults(catDefaults, {
          permissions: [],
          hoist: false,
          defaultOnJoin: false,
          roleScope: 'category',
          roleType: 'mixed',
        });
        patch.permissions = merged.permissions;
        patch.hoist = merged.hoist;
        patch.defaultOnJoin = merged.defaultOnJoin;
        patch.roleScope = merged.roleScope;
        patch.roleType = merged.roleType;
        nextType = merged.roleType;
      }
    }
  }

  const sets: string[] = [];
  const vals: unknown[] = [];
  if (patch.name !== undefined) {
    const name = normalizeRoleName(patch.name);
    sets.push(`name = $${vals.length + 1}`);
    vals.push(name);
  }
  if (patch.color !== undefined) {
    const color = normalizeRoleColor(patch.color);
    sets.push(`color = $${vals.length + 1}`);
    vals.push(color);
  }
  if (patch.darkColor !== undefined && nextType === 'mixed') {
    const color = normalizeRoleColor(patch.darkColor);
    sets.push(`dark_color = $${vals.length + 1}`);
    vals.push(color);
  }
  if (patch.lightColor !== undefined && nextType === 'mixed') {
    const color = normalizeRoleColor(patch.lightColor);
    sets.push(`light_color = $${vals.length + 1}`);
    vals.push(color);
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
  if (patch.roleCategoryId !== undefined) {
    const resolved = await resolveRoleCategoryIdForAssignment(
      pool,
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
    const icon = normalizeRoleIconUrl(patch.roleIconUrl);
    sets.push(`role_icon_url = $${vals.length + 1}`);
    vals.push(icon);
  }
  if (patch.roleIconEmojiId !== undefined) {
    const emoji = normalizeRoleIconEmojiId(patch.roleIconEmojiId);
    sets.push(`role_icon_emoji_id = $${vals.length + 1}`);
    vals.push(emoji);
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

  const sidPlaceholder = vals.length + 1;
  const ridPlaceholder = vals.length + 2;
  vals.push(serverId, roleId);
  await pool.query(
    `UPDATE echo_roles SET ${sets.join(', ')} WHERE server_id = $${sidPlaceholder} AND id = $${ridPlaceholder}`,
    vals,
  );
  if (patch.roleType !== undefined || patch.permissions !== undefined) {
    invalidateEchoPermissionCacheForServer(serverId);
  }
  return 'ok';
}

export async function updateEchoRolePermissions(
  pool: pg.Pool,
  serverId: string,
  actorId: string,
  roleId: string,
  permissions: unknown,
): Promise<UpdateEchoRoleResult> {
  return updateEchoRole(pool, serverId, actorId, roleId, { permissions });
}

/** userId -> role ids (including @members).
 * @deprecated Note: @everyone was renamed to @members.
 */
export async function listEchoMemberRoleAssignmentsByUser(
  pool: pg.Pool,
  serverId: string,
): Promise<Record<string, string[]>> {
  const r = await pool.query(
    `SELECT user_id, role_id FROM echo_member_roles WHERE server_id = $1`,
    [serverId],
  );
  const out: Record<string, string[]> = {};
  for (const row of r.rows) {
    const uid = String(row.user_id);
    const rid = String(row.role_id);
    if (!out[uid]) out[uid] = [];
    out[uid].push(rid);
  }
  return out;
}

/**
 * Returns a single user's role ids across many servers in one query, keyed by
 * server id. Use this instead of calling listEchoMemberRoleAssignmentsByUser per
 * server when only the viewer's own roles are needed — it avoids both the N+1
 * across servers and loading every member's rows.
 */
export async function listEchoSelfRoleIdsByServer(
  pool: pg.Pool,
  userId: string,
  serverIds: string[],
): Promise<Map<string, Set<string>>> {
  const out = new Map<string, Set<string>>();
  if (serverIds.length === 0) return out;
  const r = await pool.query(
    `SELECT server_id, role_id FROM echo_member_roles WHERE server_id = ANY($1) AND user_id = $2`,
    [serverIds, userId],
  );
  for (const row of r.rows) {
    const sid = String(row.server_id);
    const rid = String(row.role_id);
    let set = out.get(sid);
    if (!set) {
      set = new Set<string>();
      out.set(sid, set);
    }
    set.add(rid);
  }
  return out;
}

export async function echoAuthorityRoleIdsForServer(
  pool: pg.Pool,
  serverId: string,
): Promise<Set<string>> {
  const r = await pool.query(
    `SELECT id FROM echo_roles WHERE server_id = $1 AND role_type = 'authority'`,
    [serverId],
  );
  return new Set(r.rows.map((row: { id: unknown }) => String(row.id)));
}

/** Strip authority role ids from member→role lists for viewers without Manage Roles. */
export function withoutEchoAuthorityAssignments(
  assignments: Record<string, string[]>,
  authorityIds: ReadonlySet<string>,
): Record<string, string[]> {
  if (authorityIds.size === 0) return assignments;
  const next: Record<string, string[]> = {};
  for (const [uid, list] of Object.entries(assignments)) {
    next[uid] = list.filter((id) => !authorityIds.has(id));
  }
  return next;
}

export type EchoMemberRoleMutationResult =
  | 'ok'
  | 'unchanged'
  | 'forbidden'
  | 'not_member'
  | 'invalid_role'
  | 'cannot_remove_members';

/** @deprecated use cannot_remove_members */
export type EchoMemberRoleMutationResultLegacy =
  | EchoMemberRoleMutationResult
  | 'cannot_remove_everyone';

async function getMembersRoleIdForServer(
  pool: pg.Pool,
  serverId: string,
): Promise<string | null> {
  const r = await pool.query(
    `SELECT id FROM echo_roles WHERE server_id = $1 AND name = '@members' LIMIT 1`,
    [serverId],
  );
  return r.rows[0] ? String(r.rows[0].id) : null;
}

/** @deprecated use getMembersRoleIdForServer */
const getEveryoneRoleIdForServer = getMembersRoleIdForServer;

export async function assignEchoMemberRole(
  pool: pg.Pool,
  serverId: string,
  actorId: string,
  targetUserId: string,
  roleId: string,
): Promise<EchoMemberRoleMutationResult> {
  const actorPerms = await getMergedRolePermissions(pool, serverId, actorId);
  if (!canAssignEchoMemberRoles(actorPerms)) return 'forbidden';

  const actorIsOwner = await isEchoServerOwner(pool, serverId, actorId);
  const targetIsOwner = await isEchoServerOwner(pool, serverId, targetUserId);
  if (!actorIsOwner && targetIsOwner) return 'forbidden';

  const tmem = await pool.query(
    `SELECT 1 FROM echo_server_members WHERE server_id = $1 AND user_id = $2`,
    [serverId, targetUserId],
  );
  if (tmem.rows.length === 0) return 'not_member';

  const roleRow = await pool.query<{ position: unknown; permissions: unknown }>(
    `SELECT position, permissions FROM echo_roles WHERE server_id = $1 AND id = $2 LIMIT 1`,
    [serverId, roleId],
  );
  if (roleRow.rows.length === 0) return 'invalid_role';
  const rolePosition = Number(roleRow.rows[0]!.position ?? 0);

  if (!actorIsOwner) {
    const ok = await actorMayMutateTargetRoleById(
      pool,
      serverId,
      actorId,
      roleId,
      'assign',
      targetUserId,
    );
    if (!ok) return 'forbidden';
    if (actorId === targetUserId) {
      const roleGrantSet = expandStoredRolePermissionsToCanonSet(
        roleRow.rows[0]!.permissions,
      );
      if (!actorMayGrantPermissionSet(actorPerms, roleGrantSet, false)) {
        return 'forbidden';
      }
    }
  }

  const ins = await pool.query(
    `INSERT INTO echo_member_roles (server_id, user_id, role_id) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING RETURNING server_id`,
    [serverId, targetUserId, roleId],
  );
  if ((ins.rowCount ?? 0) < 1) return 'unchanged';
  await applyEchoRoleLinksAfterAssignment(pool, serverId, targetUserId, roleId);
  invalidateEchoPermissionCacheForServer(serverId);
  return 'ok';
}

export async function removeEchoMemberRole(
  pool: pg.Pool,
  serverId: string,
  actorId: string,
  targetUserId: string,
  roleId: string,
): Promise<EchoMemberRoleMutationResult> {
  const actorPerms = await getMergedRolePermissions(pool, serverId, actorId);
  if (!canAssignEchoMemberRoles(actorPerms)) return 'forbidden';

  const actorIsOwner = await isEchoServerOwner(pool, serverId, actorId);
  const targetIsOwner = await isEchoServerOwner(pool, serverId, targetUserId);
  if (!actorIsOwner && targetIsOwner) return 'forbidden';

  const everyoneId = await getEveryoneRoleIdForServer(pool, serverId);
  if (everyoneId && roleId === everyoneId) return 'cannot_remove_members';

  const tmem = await pool.query(
    `SELECT 1 FROM echo_server_members WHERE server_id = $1 AND user_id = $2`,
    [serverId, targetUserId],
  );
  if (tmem.rows.length === 0) return 'not_member';

  const roleRow = await pool.query(
    `SELECT 1 FROM echo_roles WHERE server_id = $1 AND id = $2 LIMIT 1`,
    [serverId, roleId],
  );
  if (roleRow.rows.length === 0) return 'invalid_role';

  if (!actorIsOwner) {
    const ok = await actorMayMutateTargetRoleById(
      pool,
      serverId,
      actorId,
      roleId,
      'assign',
      targetUserId,
    );
    if (!ok) return 'forbidden';
  }

  const del = await pool.query(
    `DELETE FROM echo_member_roles WHERE server_id = $1 AND user_id = $2 AND role_id = $3 RETURNING server_id`,
    [serverId, targetUserId, roleId],
  );
  if ((del.rowCount ?? 0) < 1) return 'unchanged';
  invalidateEchoPermissionCacheForServer(serverId);
  return 'ok';
}

export async function createEchoRole(
  pool: pg.Pool,
  serverId: string,
  actorId: string,
  body: {
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
  },
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

  const categoryDefaults =
    roleCategoryId && name !== '@members' && name !== '@global'
      ? await loadEchoRoleCategoryDefaults(pool, serverId, roleCategoryId)
      : null;
  const hasCategoryDefaults =
    !!categoryDefaults && categoryDefaultsAreConfigured(categoryDefaults);

  if (
    hasCategoryDefaults &&
    categoryDefaults &&
    name !== '@members' &&
    name !== '@global'
  ) {
    const merged = mergeRoleFieldsWithCategoryDefaults(categoryDefaults, {
      permissions: [],
      hoist: false,
      defaultOnJoin: false,
      roleScope: 'category',
      roleType: 'mixed',
    });
    const permissionsUnspecified =
      body.permissions === undefined ||
      (Array.isArray(body.permissions) && body.permissions.length === 0);
    if (permissionsUnspecified) {
      body.permissions = merged.permissions;
    }
    if (body.hoist === undefined) hoist = merged.hoist;
    if (body.defaultOnJoin === undefined) defaultOnJoin = merged.defaultOnJoin;
    if (body.roleScope === undefined) body.roleScope = merged.roleScope;
    if (body.roleType === undefined) body.roleType = merged.roleType;
    if (body.syncWithCategoryDefaults === undefined) {
      syncWithCategoryDefaults = true;
    }
  }

  const effectiveRoleScope =
    name === '@members'
      ? 'category'
      : normalizeEchoRoleScope(body.roleScope ?? roleScope);
  let effectiveRoleType = normalizeEchoRoleType(body.roleType ?? roleType);
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

  const r = await pool.query(
    `SELECT COUNT(*)::int AS role_count FROM echo_roles WHERE server_id = $1`,
    [serverId],
  );
  const roleCount = Number(r.rows[0]?.role_count ?? 0);
  if (roleCount >= ECHO_SERVER_ROLE_LIMIT) return 'limit_reached';

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
    typeof body.insertAfterRoleId === 'string'
      ? body.insertAfterRoleId.trim()
      : '';
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

  const id = nextEchoSnowflakeId();
  let normalized =
    effectiveRoleType === 'visual'
      ? normalizeVisualRolePermissionsForStorage(body.permissions)
      : normalizePermissionListForStorage(body.permissions, ALLOWED_PERMS_SET);
  if (
    !actorMayGrantPermissionSet(actorPerms, new Set(normalized), actorIsOwner)
  ) {
    return 'forbidden';
  }
  await pool.query(
    `
    INSERT INTO echo_roles (
      id, server_id, name, color, dark_color, light_color, separate_theme_colors,
      position, permissions, hoist, default_on_join, role_category_id, rank_in_category,
      role_scope, role_icon_url, role_icon_emoji_id, role_type, sync_with_category_defaults
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10, $11, $12, $13, $14, $15, $16, $17, $18)
    `,
    [
      id,
      serverId,
      name,
      color,
      effDark,
      effLight,
      separateThemeColors,
      pos,
      JSON.stringify(normalized),
      hoist,
      defaultOnJoin,
      roleCategoryId,
      rankInCategory,
      effectiveRoleScope,
      roleIconUrl,
      roleIconEmojiId,
      effectiveRoleType,
      syncWithCategoryDefaults,
    ],
  );
  const map = await buildCategoryRoleOrderMap(pool, serverId);
  if (roleCategoryId) {
    const list = map.get(roleCategoryId) ?? [];
    map.set(roleCategoryId, [id, ...list.filter((rid) => rid !== id)]);
  }
  await applyRolePositionsFromCategoryBlocks(pool, serverId, map);
  await reconcileMembersRoleHierarchyPosition(pool, serverId);
  return { roleId: id };
}

export type DeleteEchoRoleResult =
  | 'ok'
  | 'forbidden'
  | 'not_found'
  | 'cannot_delete_members';

/** @deprecated use cannot_delete_members */
export type DeleteEchoRoleResultLegacy =
  | DeleteEchoRoleResult
  | 'cannot_delete_everyone';

/**
 * Removes a role and role-target permission rows (no FK from overwrites to echo_roles).
 * Cascades: member_roles, role_links, etc.
 */
export async function deleteEchoRole(
  pool: pg.Pool,
  serverId: string,
  actorId: string,
  roleId: string,
): Promise<DeleteEchoRoleResult> {
  const actorPerms = await getMergedRolePermissions(pool, serverId, actorId);
  if (!canManageEchoRolesCatalog(actorPerms)) return 'forbidden';
  const rowQ = await pool.query(
    `SELECT name, position FROM echo_roles WHERE server_id = $1 AND id = $2 LIMIT 1`,
    [serverId, roleId],
  );
  if (rowQ.rows.length === 0) return 'not_found';
  const row0 = rowQ.rows[0] as { name: string; position: unknown };
  const name = String(row0.name);
  if (name === '@members' || name === '@global') return 'cannot_delete_members';

  const actorIsOwner = await isEchoServerOwner(pool, serverId, actorId);
  if (!actorIsOwner) {
    const ok = await actorMayMutateTargetRoleById(
      pool,
      serverId,
      actorId,
      roleId,
      'manage',
    );
    if (!ok) return 'forbidden';
  }

  await pool.query(
    `DELETE FROM echo_channel_permission_overwrite_rows WHERE server_id = $1 AND target_type = 'role' AND target_id = $2`,
    [serverId, roleId],
  );
  await pool.query(
    `DELETE FROM echo_category_permission_overwrite_rows WHERE server_id = $1 AND target_type = 'role' AND target_id = $2`,
    [serverId, roleId],
  );

  const del = await pool.query(
    `DELETE FROM echo_roles WHERE server_id = $1 AND id = $2`,
    [serverId, roleId],
  );
  if ((del.rowCount ?? 0) < 1) return 'not_found';
  invalidateEchoPermissionCacheForServer(serverId);
  await reconcileMembersRoleHierarchyPosition(pool, serverId);
  return 'ok';
}
