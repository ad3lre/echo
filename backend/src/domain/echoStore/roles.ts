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
  getMergedRolePermissions,
} from './permissions';
import { echoRoleCategoryExistsForServer } from './roleCategories';
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
  isEveryone: boolean;
  /** Server settings organizer only; omitted when column missing (legacy clients). */
  roleCategoryId: string | null;
  roleIconUrl: string | null;
  roleIconEmojiId: string | null;
  permissions: string[];
  roleType: EchoRoleType;
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
  role_icon_url: unknown;
  role_icon_emoji_id: unknown;
  role_type: unknown;
};

export type ListEchoRolesForServerOptions = {
  /**
   * When false, roles with `role_type = authority` are omitted (callers without
   * Manage Roles must not see them in member-facing role lists).
   */
  includeAuthorityRoles?: boolean;
};

const HEX_ROLE_COLOR_RE = /^#[0-9a-fA-F]{6}$/;

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
 * Reassigns `echo_roles.position` so the `@everyone` role is strictly lower than every other role
 * in the server, preserving relative order among non-everyone roles (by current position DESC, id ASC).
 * Idempotent; no-ops when already satisfied.
 */
export async function reconcileEveryoneRoleHierarchyPosition(
  pool: pg.Pool,
  serverId: string,
): Promise<void> {
  const result = await pool.query(
    `
    WITH ordered AS (
      SELECT id,
        ROW_NUMBER() OVER (
          ORDER BY
            CASE WHEN name = '@everyone' THEN 0 ELSE 1 END DESC,
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

/** One-time / startup: fix all servers (e.g. after bad imports or legacy data). */
export async function migrateEveryoneRoleHierarchyPositions(
  pool: pg.Pool,
): Promise<void> {
  const result = await pool.query(
    `
    WITH ordered AS (
      SELECT id, server_id,
        ROW_NUMBER() OVER (
          PARTITION BY server_id
          ORDER BY
            CASE WHEN name = '@everyone' THEN 0 ELSE 1 END DESC,
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

export async function listEchoRolesForServer(
  pool: pg.Pool,
  serverId: string,
  options?: ListEchoRolesForServerOptions,
): Promise<EchoRoleDto[]> {
  const includeAuthority = options?.includeAuthorityRoles !== false;
  const r = await pool.query<EchoRoleRow>(
    `SELECT id, name, color, dark_color, light_color, separate_theme_colors, position, permissions, hoist, default_on_join, role_category_id, role_icon_url, role_icon_emoji_id, role_type FROM echo_roles WHERE server_id = $1 ORDER BY position DESC`,
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
      isEveryone: name === '@everyone',
      roleCategoryId,
      roleIconUrl,
      roleIconEmojiId,
      permissions,
      roleType,
    });
  }
  return out;
}

export type UpdateEchoRoleResult =
  | 'ok'
  | 'forbidden'
  | 'not_found'
  | 'invalid_body';

/** Top-to-bottom UI order (highest role first). @everyone is forced to bottom; must be a permutation of server roles. */
export async function replaceEchoServerRoleOrder(
  pool: pg.Pool,
  serverId: string,
  actorId: string,
  roleIdsTopToBottom: string[],
): Promise<UpdateEchoRoleResult> {
  const actorPerms = await getMergedRolePermissions(pool, serverId, actorId);
  if (!canAssignEchoMemberRoles(actorPerms)) return 'forbidden';
  const actorIsOwner = await isEchoServerOwner(pool, serverId, actorId);
  const dbRows = await pool.query(
    `SELECT id, name, position FROM echo_roles WHERE server_id = $1`,
    [serverId],
  );
  const byId = new Map<string, { name: string; position: number }>();
  for (const row of dbRows.rows as {
    id: string;
    name: string;
    position: unknown;
  }[]) {
    byId.set(String(row.id), {
      name: String(row.name),
      position: Number(row.position ?? 0),
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
  const everyoneIdx = ordered.findIndex(
    (id) => byId.get(id)?.name === '@everyone',
  );
  if (everyoneIdx >= 0) {
    const [ev] = ordered.splice(everyoneIdx, 1);
    ordered.push(ev!);
  }
  const n = ordered.length;
  if (!actorIsOwner) {
    const actorTop = await getMemberTopRolePosition(pool, serverId, actorId);
    const nextPositionByRoleId = new Map<string, number>();
    for (let i = 0; i < n; i++) {
      nextPositionByRoleId.set(ordered[i]!, n - 1 - i);
    }
    for (const [roleId, row] of byId) {
      if (row.position < actorTop) continue;
      const nextPos = nextPositionByRoleId.get(roleId);
      if (nextPos == null || nextPos !== row.position) {
        // Non-owners may not reorder peers/superiors at or above their top role.
        return 'forbidden';
      }
    }
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const values: unknown[] = [];
    const tuples: string[] = [];
    for (let i = 0; i < n; i++) {
      values.push(n - 1 - i, serverId, ordered[i]!);
      const base = i * 3;
      tuples.push(`($${base + 1}, $${base + 2}, $${base + 3})`);
    }
    await client.query(
      `UPDATE echo_roles AS r
       SET position = v.position::int
       FROM (VALUES ${tuples.join(', ')}) AS v(position, server_id, id)
       WHERE r.server_id = v.server_id AND r.id = v.id`,
      values,
    );
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
  invalidateEchoPermissionCacheForServer(serverId);
  await reconcileEveryoneRoleHierarchyPosition(pool, serverId);
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
    /** Server settings category; null clears. Not valid for @everyone. */
    roleCategoryId?: string | null;
    roleIconUrl?: string | null;
    roleIconEmojiId?: string | null;
    roleType?: unknown;
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
    patch.roleIconUrl !== undefined ||
    patch.roleIconEmojiId !== undefined ||
    patch.roleType !== undefined;
  if (!touched) return 'invalid_body';

  const actorPerms = await getMergedRolePermissions(pool, serverId, actorId);
  if (!canAssignEchoMemberRoles(actorPerms)) return 'forbidden';

  const rowQ = await pool.query(
    `SELECT name, position, role_type, color, dark_color, light_color, separate_theme_colors, hoist, default_on_join FROM echo_roles WHERE server_id = $1 AND id = $2 LIMIT 1`,
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
  };
  const currentName = String(row0.name);
  const currentPosition = Number(row0.position ?? 0);
  const currentType = normalizeEchoRoleType(row0.role_type);
  let nextType =
    patch.roleType !== undefined
      ? normalizeEchoRoleType(patch.roleType)
      : currentType;
  if (currentName === '@everyone') {
    nextType = 'mixed';
  }
  if (
    patch.roleType !== undefined &&
    currentName === '@everyone' &&
    normalizeEchoRoleType(patch.roleType) !== 'mixed'
  ) {
    return 'invalid_body';
  }

  const actorIsOwner = await isEchoServerOwner(pool, serverId, actorId);
  if (!actorIsOwner) {
    const actorTop = await getMemberTopRolePosition(pool, serverId, actorId);
    if (!(actorTop > currentPosition)) return 'forbidden';
  }

  if (patch.name !== undefined) {
    const nm = normalizeRoleName(patch.name);
    if (!nm) return 'invalid_body';
    if (currentName === '@everyone' && nm !== '@everyone')
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
    if (currentName === '@everyone') return 'invalid_body';
  }

  if (patch.roleCategoryId !== undefined) {
    if (currentName === '@everyone') return 'invalid_body';
    if (patch.roleCategoryId === null) {
      /* ok */
    } else if (typeof patch.roleCategoryId === 'string') {
      const cid = patch.roleCategoryId.trim();
      if (!cid) return 'invalid_body';
      const ok = await echoRoleCategoryExistsForServer(pool, serverId, cid);
      if (!ok) return 'invalid_body';
    } else {
      return 'invalid_body';
    }
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
    sets.push(`role_category_id = $${vals.length + 1}`);
    vals.push(
      patch.roleCategoryId == null ? null : String(patch.roleCategoryId).trim(),
    );
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
  if (patch.roleType !== undefined && currentName !== '@everyone') {
    sets.push(`role_type = $${vals.length + 1}`);
    vals.push(nextType);
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

/** userId -> role ids (including @everyone). */
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
  | 'cannot_remove_everyone';

async function getEveryoneRoleIdForServer(
  pool: pg.Pool,
  serverId: string,
): Promise<string | null> {
  const r = await pool.query(
    `SELECT id FROM echo_roles WHERE server_id = $1 AND name = '@everyone' LIMIT 1`,
    [serverId],
  );
  return r.rows[0] ? String(r.rows[0].id) : null;
}

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
    const actorTop = await getMemberTopRolePosition(pool, serverId, actorId);
    if (!(actorTop > rolePosition)) return 'forbidden';

    if (actorId !== targetUserId) {
      const targetTop = await getMemberTopRolePosition(
        pool,
        serverId,
        targetUserId,
      );
      if (!(actorTop > targetTop)) return 'forbidden';
    } else {
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
  if (everyoneId && roleId === everyoneId) return 'cannot_remove_everyone';

  const tmem = await pool.query(
    `SELECT 1 FROM echo_server_members WHERE server_id = $1 AND user_id = $2`,
    [serverId, targetUserId],
  );
  if (tmem.rows.length === 0) return 'not_member';

  const roleRow = await pool.query<{ position: unknown }>(
    `SELECT position FROM echo_roles WHERE server_id = $1 AND id = $2 LIMIT 1`,
    [serverId, roleId],
  );
  if (roleRow.rows.length === 0) return 'invalid_role';
  const rolePosition = Number(roleRow.rows[0]!.position ?? 0);

  if (!actorIsOwner) {
    const actorTop = await getMemberTopRolePosition(pool, serverId, actorId);
    if (!(actorTop > rolePosition)) return 'forbidden';

    if (actorId !== targetUserId) {
      const targetTop = await getMemberTopRolePosition(
        pool,
        serverId,
        targetUserId,
      );
      if (!(actorTop > targetTop)) return 'forbidden';
    }
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
    roleIconUrl?: string | null;
    roleIconEmojiId?: string | null;
    roleType?: unknown;
  },
): Promise<
  { roleId: string } | 'forbidden' | 'invalid_body' | 'limit_reached'
> {
  const actorPerms = await getMergedRolePermissions(pool, serverId, actorId);
  if (!canAssignEchoMemberRoles(actorPerms)) return 'forbidden';
  const actorIsOwner = await isEchoServerOwner(pool, serverId, actorId);
  const name = normalizeRoleName(body.name);
  if (!name) return 'invalid_body';
  const color = normalizeRoleColor(body.color);
  if (color == null) return 'invalid_body';
  const darkColor = normalizeRoleColor(body.darkColor);
  if (darkColor == null) return 'invalid_body';
  const lightColor = normalizeRoleColor(body.lightColor);
  if (lightColor == null) return 'invalid_body';
  let separateThemeColors = body.separateThemeColors === true;
  let hoist = body.hoist === true;
  let defaultOnJoin = body.defaultOnJoin === true;
  if (defaultOnJoin && name === '@everyone') return 'invalid_body';

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

  let roleCategoryId: string | null = null;
  if (body.roleCategoryId !== undefined && body.roleCategoryId !== null) {
    if (typeof body.roleCategoryId !== 'string') return 'invalid_body';
    const cid = body.roleCategoryId.trim();
    if (!cid) return 'invalid_body';
    const ok = await echoRoleCategoryExistsForServer(pool, serverId, cid);
    if (!ok) return 'invalid_body';
    roleCategoryId = cid;
  } else if (body.roleCategoryId === null) {
    roleCategoryId = null;
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

  // New roles should start at the bottom of the hierarchy (just above @everyone),
  // matching chat UX and preventing accidental "new role becomes top role" behavior.
  const r = await pool.query(
    `
    SELECT
      COUNT(*)::int AS role_count,
      COALESCE(
        (SELECT MIN(position) FROM echo_roles WHERE server_id = $1 AND name <> '@everyone'),
        0
      ) - 1 AS p
    FROM echo_roles
    WHERE server_id = $1
    `,
    [serverId],
  );
  const roleCount = Number(r.rows[0]?.role_count ?? 0);
  if (roleCount >= ECHO_SERVER_ROLE_LIMIT) return 'limit_reached';
  const pos = Number(r.rows[0]?.p ?? -1);
  const id = nextEchoSnowflakeId();
  let normalized =
    roleType === 'visual'
      ? normalizeVisualRolePermissionsForStorage(body.permissions)
      : normalizePermissionListForStorage(body.permissions, ALLOWED_PERMS_SET);
  if (
    !actorMayGrantPermissionSet(actorPerms, new Set(normalized), actorIsOwner)
  ) {
    return 'forbidden';
  }
  await pool.query(
    `INSERT INTO echo_roles (id, server_id, name, color, dark_color, light_color, separate_theme_colors, position, permissions, hoist, default_on_join, role_category_id, role_icon_url, role_icon_emoji_id, role_type) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10, $11, $12, $13, $14, $15)`,
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
      roleIconUrl,
      roleIconEmojiId,
      roleType,
    ],
  );
  invalidateEchoPermissionCacheForServer(serverId);
  await reconcileEveryoneRoleHierarchyPosition(pool, serverId);
  return { roleId: id };
}

export type DeleteEchoRoleResult =
  | 'ok'
  | 'forbidden'
  | 'not_found'
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
  if (!canAssignEchoMemberRoles(actorPerms)) return 'forbidden';
  const rowQ = await pool.query(
    `SELECT name, position FROM echo_roles WHERE server_id = $1 AND id = $2 LIMIT 1`,
    [serverId, roleId],
  );
  if (rowQ.rows.length === 0) return 'not_found';
  const row0 = rowQ.rows[0] as { name: string; position: unknown };
  const name = String(row0.name);
  const rolePosition = Number(row0.position ?? 0);
  if (name === '@everyone') return 'cannot_delete_everyone';

  const actorIsOwner = await isEchoServerOwner(pool, serverId, actorId);
  if (!actorIsOwner) {
    const actorTop = await getMemberTopRolePosition(pool, serverId, actorId);
    if (!(actorTop > rolePosition)) return 'forbidden';
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
  await reconcileEveryoneRoleHierarchyPosition(pool, serverId);
  return 'ok';
}
