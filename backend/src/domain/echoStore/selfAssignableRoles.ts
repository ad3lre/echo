import type pg from 'pg';
import { nextEchoSnowflakeId } from '../echoSnowflake';
import { expandStoredRolePermissionsToCanonSet } from '../echoPermissionPrimitives';
import { invalidateEchoPermissionCacheForServer } from '../echoPermissionCache';
import { applyEchoRoleLinksAfterAssignment } from './roleLinks';
import {
  getMergedRolePermissions,
  canManageEchoRolesCatalog,
} from './permissions';
import { isEchoServerOwner } from './access';
import { actorMayGrantPermissionSet } from './roles';
import { listEchoCategories } from './categoriesWorkspace';
import {
  ECHO_SELF_ROLES_CHANNEL_NAME,
  type EchoSelfRolesConfig,
  type EchoSelfRolesPanel,
  type SelfRolesCustomCategory,
  type SelfRolesPanelCategory,
  type SelfRolesPanelRole,
} from '../../../../shared/types/selfAssignableRoles';
import type { EchoWorkspaceCategoryBootstrap } from './categoriesWorkspace';

const SELF_ROLES_CHANNEL_TYPE = 'selfRoles';

const DEFAULT_CONFIG: EchoSelfRolesConfig = {
  enabled: false,
  panelChannelId: null,
  customCategories: [],
};

const MAX_CUSTOM_CATEGORIES = 24;
const MAX_CATEGORY_NAME_LEN = 64;
const MAX_ROLES_PER_CUSTOM_CATEGORY = 64;

function parseJsonArray<T>(raw: unknown): T[] {
  if (!Array.isArray(raw)) return [];
  return raw as T[];
}

function roleIsSelfSelectable(permissionsRaw: unknown): boolean {
  return expandStoredRolePermissionsToCanonSet(permissionsRaw).has(
    'SELF_SELECTABLE',
  );
}

function normalizeCustomCategories(raw: unknown): SelfRolesCustomCategory[] {
  if (!Array.isArray(raw)) return [];
  const out: SelfRolesCustomCategory[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const o = item as Record<string, unknown>;
    const id = typeof o.id === 'string' ? o.id.trim() : '';
    const name = typeof o.name === 'string' ? o.name.trim() : '';
    if (!id || !name || name.length > MAX_CATEGORY_NAME_LEN) continue;
    const position = Number(o.position ?? 0);
    const randomEligible = o.randomEligible === true;
    let roleIds: string[] = [];
    if (Array.isArray(o.roleIds)) {
      roleIds = o.roleIds
        .filter((x): x is string => typeof x === 'string')
        .map((x) => x.trim())
        .filter(Boolean)
        .slice(0, MAX_ROLES_PER_CUSTOM_CATEGORY);
    }
    out.push({ id, name, position, roleIds, randomEligible });
  }
  return out.sort(
    (a, b) => a.position - b.position || a.id.localeCompare(b.id),
  );
}

async function findSelfRolesWidgetChannelId(
  pool: pg.Pool,
  serverId: string,
): Promise<string | null> {
  const r = await pool.query<{ id: string }>(
    `SELECT id FROM echo_channels WHERE server_id = $1 AND type = $2 LIMIT 1`,
    [serverId, SELF_ROLES_CHANNEL_TYPE],
  );
  return r.rows[0]?.id ? String(r.rows[0].id) : null;
}

/** Ensures the built-in self-assignable roles widget channel exists for a server. */
export async function ensureSelfRolesWidgetChannel(
  pool: pg.Pool,
  serverId: string,
): Promise<string> {
  const existing = await findSelfRolesWidgetChannelId(pool, serverId);
  if (existing) return existing;

  const cats = await listEchoCategories(pool, serverId);
  let categoryId =
    cats.find((c) => c.name === 'Text Channels')?.id ?? cats[0]?.id ?? null;
  if (!categoryId) {
    categoryId = nextEchoSnowflakeId();
    await pool.query(
      `INSERT INTO echo_categories (id, server_id, name, position) VALUES ($1, $2, $3, 0)`,
      [categoryId, serverId, 'Text Channels'],
    );
  }

  const id = nextEchoSnowflakeId();
  const maxPos = await pool.query<{ p: number }>(
    `SELECT COALESCE(MIN(position), 0) - 1 AS p FROM echo_channels WHERE server_id = $1 AND category_id = $2`,
    [serverId, categoryId],
  );
  const pos = Number(maxPos.rows[0]?.p ?? -1);

  await pool.query(
    `INSERT INTO echo_channels (id, server_id, name, type, category_id, position, icon_key)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      id,
      serverId,
      ECHO_SELF_ROLES_CHANNEL_NAME,
      SELF_ROLES_CHANNEL_TYPE,
      categoryId,
      pos,
      'userTag',
    ],
  );
  invalidateEchoPermissionCacheForServer(serverId);
  return id;
}

/** Hide auto-provisioned widget channels when the feature is disabled. */
export async function stripDisabledSelfRolesChannelsFromWorkspace(
  pool: pg.Pool,
  serverIds: string[],
  categoriesByServer: Record<string, EchoWorkspaceCategoryBootstrap[]>,
): Promise<void> {
  if (!serverIds.length) return;
  const r = await pool.query<{ server_id: string; enabled: boolean }>(
    `SELECT server_id, enabled FROM echo_server_self_roles_config WHERE server_id = ANY($1::text[])`,
    [serverIds],
  );
  const enabledByServer = new Map(
    r.rows.map((row) => [String(row.server_id), Boolean(row.enabled)]),
  );
  for (const sid of serverIds) {
    if (enabledByServer.get(sid) === true) continue;
    const cats = categoriesByServer[sid];
    if (!cats) continue;
    for (const cat of cats) {
      cat.channels = cat.channels.filter(
        (ch) =>
          !ch ||
          typeof ch !== 'object' ||
          (ch as { type?: string }).type !== SELF_ROLES_CHANNEL_TYPE,
      );
    }
  }
}

export async function getEchoSelfRolesConfig(
  pool: pg.Pool,
  serverId: string,
): Promise<EchoSelfRolesConfig> {
  const r = await pool.query(
    `SELECT enabled, panel_channel_id, custom_categories
     FROM echo_server_self_roles_config WHERE server_id = $1 LIMIT 1`,
    [serverId],
  );
  if (r.rows.length === 0) return { ...DEFAULT_CONFIG };
  const row = r.rows[0] as Record<string, unknown>;
  return {
    enabled: Boolean(row.enabled),
    panelChannelId: row.panel_channel_id ? String(row.panel_channel_id) : null,
    customCategories: normalizeCustomCategories(row.custom_categories),
  };
}

export type UpdateEchoSelfRolesConfigInput = Partial<EchoSelfRolesConfig>;

export async function updateEchoSelfRolesConfig(
  pool: pg.Pool,
  serverId: string,
  input: UpdateEchoSelfRolesConfigInput,
): Promise<EchoSelfRolesConfig> {
  const existing = await getEchoSelfRolesConfig(pool, serverId);
  const merged: EchoSelfRolesConfig = {
    enabled: input.enabled ?? existing.enabled,
    panelChannelId: existing.panelChannelId,
    customCategories: input.customCategories ?? existing.customCategories,
  };
  if (merged.customCategories.length > MAX_CUSTOM_CATEGORIES) {
    merged.customCategories = merged.customCategories.slice(
      0,
      MAX_CUSTOM_CATEGORIES,
    );
  }

  if (merged.enabled) {
    merged.panelChannelId = await ensureSelfRolesWidgetChannel(pool, serverId);
  }

  await pool.query(
    `INSERT INTO echo_server_self_roles_config
       (server_id, enabled, panel_channel_id, custom_categories)
     VALUES ($1, $2, $3, $4::jsonb)
     ON CONFLICT (server_id) DO UPDATE SET
       enabled = EXCLUDED.enabled,
       panel_channel_id = EXCLUDED.panel_channel_id,
       custom_categories = EXCLUDED.custom_categories`,
    [
      serverId,
      merged.enabled,
      merged.panelChannelId,
      JSON.stringify(merged.customCategories),
    ],
  );
  return merged;
}

export async function canManageSelfRolesConfig(
  pool: pg.Pool,
  serverId: string,
  userId: string,
): Promise<boolean> {
  if (await isEchoServerOwner(pool, serverId, userId)) return true;
  const perms = await getMergedRolePermissions(pool, serverId, userId);
  return canManageEchoRolesCatalog(perms);
}

type RoleRow = {
  id: string;
  name: string;
  color: string;
  dark_color: string;
  light_color: string;
  separate_theme_colors: boolean;
  position: number;
  permissions: unknown;
  role_category_id: string | null;
  role_icon_url: string | null;
  role_icon_emoji_id: string | null;
  role_type: string;
  is_everyone: boolean;
};

function toPanelRole(row: RoleRow): SelfRolesPanelRole {
  return {
    id: row.id,
    name: row.name,
    color: String(row.color ?? '#99aab5'),
    darkColor: String(row.dark_color ?? row.color ?? '#99aab5'),
    lightColor: String(row.light_color ?? row.color ?? '#99aab5'),
    separateThemeColors: Boolean(row.separate_theme_colors),
    roleIconUrl: row.role_icon_url ? String(row.role_icon_url) : null,
    roleIconEmojiId: row.role_icon_emoji_id
      ? String(row.role_icon_emoji_id)
      : null,
    position: Number(row.position ?? 0),
  };
}

async function loadSelfSelectableRoles(
  pool: pg.Pool,
  serverId: string,
): Promise<RoleRow[]> {
  const r = await pool.query<RoleRow>(
    `
    SELECT id, name, color, dark_color, light_color, separate_theme_colors,
           position, permissions, role_category_id, role_icon_url,
           role_icon_emoji_id, role_type,
           (name = '@everyone') AS is_everyone
    FROM echo_roles
    WHERE server_id = $1
    ORDER BY position DESC, id ASC
    `,
    [serverId],
  );
  return r.rows.filter(
    (row) => !row.is_everyone && roleIsSelfSelectable(row.permissions),
  );
}

async function loadDerivedCategories(
  pool: pg.Pool,
  serverId: string,
  selectableById: Map<string, RoleRow>,
): Promise<SelfRolesPanelCategory[]> {
  const r = await pool.query<{
    id: string;
    name: string;
    position: number;
  }>(
    `
    SELECT id, name, position
    FROM echo_role_categories
    WHERE server_id = $1 AND self_assignable_defaults = true
    ORDER BY position ASC, id ASC
    `,
    [serverId],
  );
  const out: SelfRolesPanelCategory[] = [];
  for (const cat of r.rows) {
    const roles: SelfRolesPanelRole[] = [];
    for (const role of selectableById.values()) {
      const rc = role.role_category_id;
      if (rc === cat.id) roles.push(toPanelRole(role));
    }
    roles.sort((a, b) => b.position - a.position || a.id.localeCompare(b.id));
    if (roles.length === 0) continue;
    out.push({
      id: `derived:${cat.id}`,
      name: cat.name,
      position: Number(cat.position ?? 0),
      source: 'derived',
      roleCategoryId: cat.id,
      roles,
    });
  }
  return out;
}

function buildCustomCategories(
  config: EchoSelfRolesConfig,
  selectableById: Map<string, RoleRow>,
): SelfRolesPanelCategory[] {
  const claimed = new Set<string>();
  for (const cat of config.customCategories) {
    if (!cat.randomEligible) {
      for (const rid of cat.roleIds) claimed.add(rid);
    }
  }

  const out: SelfRolesPanelCategory[] = [];
  for (const cat of config.customCategories) {
    let roleRows: RoleRow[] = [];
    if (cat.randomEligible) {
      roleRows = [...selectableById.values()].filter((r) => !claimed.has(r.id));
    } else {
      roleRows = cat.roleIds
        .map((id) => selectableById.get(id))
        .filter((r): r is RoleRow => !!r);
    }
    roleRows.sort(
      (a, b) => b.position - a.position || a.id.localeCompare(b.id),
    );
    if (roleRows.length === 0) continue;
    out.push({
      id: cat.id,
      name: cat.name,
      position: cat.position,
      source: 'custom',
      randomEligible: cat.randomEligible === true,
      roles: roleRows.map(toPanelRole),
    });
  }
  return out.sort(
    (a, b) => a.position - b.position || a.id.localeCompare(b.id),
  );
}

export async function resolveEchoSelfRolesPanel(
  pool: pg.Pool,
  serverId: string,
  userId: string,
): Promise<EchoSelfRolesPanel> {
  const config = await getEchoSelfRolesConfig(pool, serverId);
  const selectable = await loadSelfSelectableRoles(pool, serverId);
  const selectableById = new Map(selectable.map((r) => [r.id, r]));

  const derived = await loadDerivedCategories(pool, serverId, selectableById);
  const custom = buildCustomCategories(config, selectableById);
  const categories = [...derived, ...custom].sort(
    (a, b) => a.position - b.position || a.id.localeCompare(b.id),
  );

  const assignR = await pool.query<{ role_id: string }>(
    `SELECT role_id FROM echo_member_roles WHERE server_id = $1 AND user_id = $2`,
    [serverId, userId],
  );
  const assignedRoleIds = assignR.rows.map((row) => String(row.role_id));

  return { categories, assignedRoleIds };
}

export type ToggleSelfAssignableRoleResult =
  | 'ok'
  | 'forbidden'
  | 'disabled'
  | 'not_member'
  | 'invalid_role'
  | 'not_self_selectable'
  | 'not_exposed'
  | 'unchanged';

export async function toggleSelfAssignableMemberRole(
  pool: pg.Pool,
  serverId: string,
  userId: string,
  roleId: string,
  assign: boolean,
): Promise<ToggleSelfAssignableRoleResult> {
  const config = await getEchoSelfRolesConfig(pool, serverId);
  if (!config.enabled) return 'disabled';

  const tmem = await pool.query(
    `SELECT 1 FROM echo_server_members WHERE server_id = $1 AND user_id = $2`,
    [serverId, userId],
  );
  if (tmem.rows.length === 0) return 'not_member';

  const roleRow = await pool.query<{ permissions: unknown }>(
    `SELECT permissions FROM echo_roles WHERE server_id = $1 AND id = $2 AND name <> '@everyone' LIMIT 1`,
    [serverId, roleId],
  );
  if (roleRow.rows.length === 0) return 'invalid_role';
  if (!roleIsSelfSelectable(roleRow.rows[0]!.permissions)) {
    return 'not_self_selectable';
  }

  const panel = await resolveEchoSelfRolesPanel(pool, serverId, userId);
  const exposed = new Set(
    panel.categories.flatMap((c) => c.roles.map((r) => r.id)),
  );
  if (!exposed.has(roleId)) return 'not_exposed';

  if (assign) {
    const actorIsOwner = await isEchoServerOwner(pool, serverId, userId);
    if (!actorIsOwner) {
      const actorPerms = await getMergedRolePermissions(pool, serverId, userId);
      const roleGrantSet = expandStoredRolePermissionsToCanonSet(
        roleRow.rows[0]!.permissions,
      );
      if (!actorMayGrantPermissionSet(actorPerms, roleGrantSet, false)) {
        return 'forbidden';
      }
    }
    const ins = await pool.query(
      `INSERT INTO echo_member_roles (server_id, user_id, role_id) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING RETURNING server_id`,
      [serverId, userId, roleId],
    );
    if ((ins.rowCount ?? 0) < 1) return 'unchanged';
    await applyEchoRoleLinksAfterAssignment(pool, serverId, userId, roleId);
    invalidateEchoPermissionCacheForServer(serverId);
    return 'ok';
  }

  const del = await pool.query(
    `DELETE FROM echo_member_roles WHERE server_id = $1 AND user_id = $2 AND role_id = $3 RETURNING server_id`,
    [serverId, userId, roleId],
  );
  if ((del.rowCount ?? 0) < 1) return 'unchanged';
  invalidateEchoPermissionCacheForServer(serverId);
  return 'ok';
}

export function newSelfRolesCustomCategoryId(): string {
  return nextEchoSnowflakeId();
}
