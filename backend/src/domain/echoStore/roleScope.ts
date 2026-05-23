import type pg from 'pg';
import { expandStoredRolePermissionsToCanonSet } from '../echoPermissionPrimitives';
import {
  canAssignEchoMemberRoles,
  canManageEchoRolesCatalog,
} from './permissions';
import { isEchoServerOwner } from './access';
import {
  normalizeEchoRoleScope,
  type EchoRoleScope,
} from '../../../../shared/echoRoleScope';

export type EchoRoleCatalogEntry = {
  id: string;
  name: string;
  position: number;
  rankInCategory: number;
  roleCategoryId: string | null;
  roleScope: EchoRoleScope;
  permissions: unknown;
  isEveryone?: boolean;
};

export type RoleMutationKind = 'manage' | 'assign';

function catalogRowPerms(row: EchoRoleCatalogEntry): Set<string> {
  return expandStoredRolePermissionsToCanonSet(row.permissions);
}

function rowGrantsMutation(
  row: EchoRoleCatalogEntry,
  kind: RoleMutationKind,
): boolean {
  const perms = catalogRowPerms(row);
  if (kind === 'manage') return canManageEchoRolesCatalog(perms);
  return canAssignEchoMemberRoles(perms);
}

function topRankInCategory(
  roleIds: readonly string[],
  catalogById: Map<string, EchoRoleCatalogEntry>,
  categoryId: string | null,
): number {
  let max = -1;
  for (const rid of roleIds) {
    const row = catalogById.get(rid);
    if (!row || row.isEveryone) continue;
    if (row.roleCategoryId !== categoryId) continue;
    const p = Number(row.rankInCategory ?? 0);
    if (p > max) max = p;
  }
  return max;
}

function topPositionGlobal(
  roleIds: readonly string[],
  catalogById: Map<string, EchoRoleCatalogEntry>,
): number {
  let max = -1;
  for (const rid of roleIds) {
    const row = catalogById.get(rid);
    if (!row || row.isEveryone) continue;
    const p = Number(row.position ?? 0);
    if (p > max) max = p;
  }
  return max;
}

function actorHasGlobalGrant(
  actorRoleIds: readonly string[],
  catalogById: Map<string, EchoRoleCatalogEntry>,
  kind: RoleMutationKind,
): boolean {
  for (const rid of actorRoleIds) {
    const row = catalogById.get(rid);
    if (!row || row.isEveryone) continue;
    if (normalizeEchoRoleScope(row.roleScope) !== 'global') continue;
    if (rowGrantsMutation(row, kind)) return true;
  }
  return false;
}

function actorHasCategoryGrant(
  actorRoleIds: readonly string[],
  catalogById: Map<string, EchoRoleCatalogEntry>,
  categoryId: string | null,
  kind: RoleMutationKind,
): boolean {
  for (const rid of actorRoleIds) {
    const row = catalogById.get(rid);
    if (!row || row.isEveryone) continue;
    if (row.roleCategoryId !== categoryId) continue;
    if (rowGrantsMutation(row, kind)) return true;
  }
  return false;
}

/**
 * Whether the actor may manage or assign the target role (hierarchy + category scope).
 */
export function actorMayMutateTargetRole(params: {
  actorIsOwner: boolean;
  actorRoleIds: readonly string[];
  targetRole: EchoRoleCatalogEntry;
  targetUserRoleIds?: readonly string[];
  catalog: readonly EchoRoleCatalogEntry[];
  kind: RoleMutationKind;
}): boolean {
  const {
    actorIsOwner,
    actorRoleIds,
    targetRole,
    targetUserRoleIds = [],
    catalog,
    kind,
  } = params;

  if (targetRole.isEveryone || targetRole.name === '@everyone') {
    return false;
  }

  if (actorIsOwner) return true;

  const catalogById = new Map(catalog.map((r) => [r.id, r]));
  const targetCategoryId = targetRole.roleCategoryId;

  const globalGrant = actorHasGlobalGrant(actorRoleIds, catalogById, kind);
  const categoryGrant =
    targetCategoryId != null &&
    actorHasCategoryGrant(actorRoleIds, catalogById, targetCategoryId, kind);

  if (!globalGrant && !categoryGrant) return false;

  if (globalGrant) {
    const actorTop = topPositionGlobal(actorRoleIds, catalogById);
    const targetPosition = Number(targetRole.position ?? 0);
    if (!(actorTop > targetPosition)) return false;
    if (targetUserRoleIds.length > 0) {
      const targetTop = topPositionGlobal(targetUserRoleIds, catalogById);
      if (!(actorTop > targetTop)) return false;
    }
  } else {
    const actorTop = topRankInCategory(
      actorRoleIds,
      catalogById,
      targetCategoryId,
    );
    const targetRank = Number(targetRole.rankInCategory ?? 0);
    if (!(actorTop > targetRank)) return false;
    if (targetUserRoleIds.length > 0) {
      const targetTop = topRankInCategory(
        targetUserRoleIds,
        catalogById,
        targetCategoryId,
      );
      if (!(actorTop > targetTop)) return false;
    }
  }

  return true;
}

export async function loadEchoRoleCatalogForServer(
  pool: pg.Pool,
  serverId: string,
): Promise<EchoRoleCatalogEntry[]> {
  const r = await pool.query(
    `
    SELECT id, name, position, rank_in_category, role_category_id, role_scope, permissions
    FROM echo_roles
    WHERE server_id = $1
    `,
    [serverId],
  );
  return (r.rows as Record<string, unknown>[]).map((row) => ({
    id: String(row.id),
    name: String(row.name),
    position: Number(row.position ?? 0),
    rankInCategory: Number(row.rank_in_category ?? 0),
    roleCategoryId:
      row.role_category_id != null && String(row.role_category_id).trim()
        ? String(row.role_category_id).trim()
        : null,
    roleScope: normalizeEchoRoleScope(row.role_scope),
    permissions: row.permissions,
    isEveryone: String(row.name) === '@everyone',
  }));
}

export async function actorMayMutateTargetRoleById(
  pool: pg.Pool,
  serverId: string,
  actorId: string,
  targetRoleId: string,
  kind: RoleMutationKind,
  targetUserId?: string,
): Promise<boolean> {
  const actorIsOwner = await isEchoServerOwner(pool, serverId, actorId);
  const catalog = await loadEchoRoleCatalogForServer(pool, serverId);
  const targetRole = catalog.find((r) => r.id === targetRoleId);
  if (!targetRole) return false;

  const actorAssign = await pool.query<{ role_id: string }>(
    `SELECT role_id FROM echo_member_roles WHERE server_id = $1 AND user_id = $2`,
    [serverId, actorId],
  );
  const actorRoleIds = actorAssign.rows.map((row) => String(row.role_id));

  let targetUserRoleIds: string[] = [];
  if (targetUserId) {
    const t = await pool.query<{ role_id: string }>(
      `SELECT role_id FROM echo_member_roles WHERE server_id = $1 AND user_id = $2`,
      [serverId, targetUserId],
    );
    targetUserRoleIds = t.rows.map((row) => String(row.role_id));
  }

  return actorMayMutateTargetRole({
    actorIsOwner,
    actorRoleIds,
    targetRole,
    targetUserRoleIds,
    catalog,
    kind,
  });
}
