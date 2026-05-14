/**
 * Mirrors {@link assignEchoMemberRole} / {@link removeEchoMemberRole} in
 * `backend/src/domain/echoStore/roles.ts` so the Manage Roles UI only offers
 * mutations the API will accept (hierarchy + self-grant permission subset).
 */
export type EchoMemberRoleMutateCatalogRow = {
  id: string;
  position: number;
  isEveryone?: boolean;
  permissions: readonly string[];
};

function topRolePosition(
  userRoleIds: readonly string[] | undefined,
  catalog: readonly EchoMemberRoleMutateCatalogRow[],
): number {
  const byId = new Map(catalog.map((r) => [r.id, r]));
  let max = -1;
  for (const rid of userRoleIds ?? []) {
    const r = byId.get(rid);
    if (!r) continue;
    const p = Number(r.position ?? 0);
    if (p > max) max = p;
  }
  return max;
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
    if (!assign) return false;
    return false;
  }

  if (!actorIsServerOwner && targetIsServerOwner) return false;

  if (actorIsServerOwner) return true;

  const actorRoleIds = assignments[actorUserId] ?? [];
  const targetRoleIds = assignments[targetUserId] ?? [];
  const actorTop = topRolePosition(actorRoleIds, catalog);
  const rolePosition = Number(role.position ?? 0);

  if (!(actorTop > rolePosition)) return false;

  if (actorUserId !== targetUserId) {
    const targetTop = topRolePosition(targetRoleIds, catalog);
    if (!(actorTop > targetTop)) return false;
    return true;
  }

  if (assign) {
    const actorUnion = unionPermissionsFromRoles(actorRoleIds, catalog);
    return actorMayGrantRolePermissions(actorUnion, role, false);
  }

  return true;
}
