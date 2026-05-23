/**
 * Mirrors {@link assignEchoMemberRole} / {@link removeEchoMemberRole} in
 * `backend/src/domain/echoStore/roles.ts` so the Manage Roles UI only offers
 * mutations the API will accept (hierarchy + category scope).
 */
import { normalizeEchoRoleScope } from '@shared/echoRoleScope';

export type EchoMemberRoleMutateCatalogRow = {
  id: string;
  position: number;
  rankInCategory?: number;
  roleCategoryId?: string | null;
  roleScope?: string;
  isEveryone?: boolean;
  permissions: readonly string[];
};

function roleHasManage(perms: readonly string[]): boolean {
  return perms.includes('MANAGE_ROLES') || perms.includes('ADMINISTRATOR');
}

function roleHasAssign(perms: readonly string[]): boolean {
  return (
    perms.includes('ASSIGN_ROLES') ||
    perms.includes('MANAGE_ROLES') ||
    perms.includes('ADMINISTRATOR')
  );
}

function topRankInCategory(
  userRoleIds: readonly string[] | undefined,
  catalog: readonly EchoMemberRoleMutateCatalogRow[],
  categoryId: string | null,
): number {
  const byId = new Map(catalog.map((r) => [r.id, r]));
  let max = -1;
  for (const rid of userRoleIds ?? []) {
    const r = byId.get(rid);
    if (!r || r.isEveryone) continue;
    if ((r.roleCategoryId ?? null) !== categoryId) continue;
    const p = Number(r.rankInCategory ?? 0);
    if (p > max) max = p;
  }
  return max;
}

function topRolePositionGlobal(
  userRoleIds: readonly string[] | undefined,
  catalog: readonly EchoMemberRoleMutateCatalogRow[],
): number {
  const byId = new Map(catalog.map((r) => [r.id, r]));
  let max = -1;
  for (const rid of userRoleIds ?? []) {
    const r = byId.get(rid);
    if (!r || r.isEveryone) continue;
    const p = Number(r.position ?? 0);
    if (p > max) max = p;
  }
  return max;
}

function actorHasGlobalGrant(
  actorRoleIds: readonly string[],
  catalog: readonly EchoMemberRoleMutateCatalogRow[],
  kind: 'manage' | 'assign',
): boolean {
  const byId = new Map(catalog.map((r) => [r.id, r]));
  const check = kind === 'manage' ? roleHasManage : roleHasAssign;
  for (const rid of actorRoleIds) {
    const r = byId.get(rid);
    if (!r || r.isEveryone) continue;
    if (normalizeEchoRoleScope(r.roleScope) !== 'global') continue;
    if (check(r.permissions)) return true;
  }
  return false;
}

function actorHasCategoryGrant(
  actorRoleIds: readonly string[],
  catalog: readonly EchoMemberRoleMutateCatalogRow[],
  categoryId: string | null,
  kind: 'manage' | 'assign',
): boolean {
  const byId = new Map(catalog.map((r) => [r.id, r]));
  const check = kind === 'manage' ? roleHasManage : roleHasAssign;
  for (const rid of actorRoleIds) {
    const r = byId.get(rid);
    if (!r || r.isEveryone) continue;
    if ((r.roleCategoryId ?? null) !== categoryId) continue;
    if (check(r.permissions)) return true;
  }
  return false;
}

function unionPermissionsFromRoles(
  userRoleIds: readonly string[] | undefined,
  catalog: readonly EchoMemberRoleMutateCatalogRow[],
): Set<string> {
  const byId = new Map(catalog.map((r) => [r.id, r]));
  const out = new Set<string>();
  for (const rid of userRoleIds ?? []) {
    const r = byId.get(rid);
    if (!r?.permissions?.length) continue;
    for (const p of r.permissions) out.add(p);
  }
  return out;
}

/** Same rules as `actorMayGrantPermissionSet` (non-owner branch). */
function actorMayGrantRolePermissions(
  actorPermUnion: ReadonlySet<string>,
  role: EchoMemberRoleMutateCatalogRow,
  actorIsOwner: boolean,
): boolean {
  if (actorIsOwner) return true;
  if (actorPermUnion.has('ADMINISTRATOR')) return true;
  for (const p of role.permissions) {
    if (!actorPermUnion.has(p)) return false;
  }
  return true;
}

export function canMutateEchoMemberRole(params: {
  assign: boolean;
  actorUserId: string;
  targetUserId: string;
  roleId: string;
  actorIsServerOwner: boolean;
  targetIsServerOwner: boolean;
  catalog: readonly EchoMemberRoleMutateCatalogRow[];
  assignments: Readonly<Record<string, string[]>>;
}): boolean {
  const {
    assign,
    actorUserId,
    targetUserId,
    roleId,
    actorIsServerOwner,
    targetIsServerOwner,
    catalog,
    assignments,
  } = params;

  const role = catalog.find((r) => r.id === roleId);
  if (!role) return false;

  if (role.isEveryone) {
    return false;
  }

  if (!actorIsServerOwner && targetIsServerOwner) return false;

  if (actorIsServerOwner) return true;

  const kind = assign ? 'assign' : 'manage';
  const actorRoleIds = assignments[actorUserId] ?? [];
  const targetRoleIds = assignments[targetUserId] ?? [];
  const targetCategoryId = role.roleCategoryId ?? null;

  const globalGrant = actorHasGlobalGrant(actorRoleIds, catalog, kind);
  const categoryGrant =
    targetCategoryId != null &&
    actorHasCategoryGrant(actorRoleIds, catalog, targetCategoryId, kind);

  if (!globalGrant && !categoryGrant) return false;

  if (globalGrant) {
    const actorTop = topRolePositionGlobal(actorRoleIds, catalog);
    if (!(actorTop > Number(role.position ?? 0))) return false;
    if (actorUserId !== targetUserId) {
      const targetTop = topRolePositionGlobal(targetRoleIds, catalog);
      if (!(actorTop > targetTop)) return false;
    }
  } else {
    const actorTop = topRankInCategory(actorRoleIds, catalog, targetCategoryId);
    if (!(actorTop > Number(role.rankInCategory ?? 0))) return false;
    if (actorUserId !== targetUserId) {
      const targetTop = topRankInCategory(
        targetRoleIds,
        catalog,
        targetCategoryId,
      );
      if (!(actorTop > targetTop)) return false;
    }
  }

  if (actorUserId !== targetUserId) {
    return true;
  }

  if (assign) {
    const actorUnion = unionPermissionsFromRoles(actorRoleIds, catalog);
    return actorMayGrantRolePermissions(actorUnion, role, false);
  }

  return true;
}
