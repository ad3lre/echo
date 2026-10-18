import type pg from 'pg';
import { isEchoServerOwner } from '../members/access';
import type { UpdateEchoRoleResult } from './echoRoleDto';
import {
  canManageEchoRolesCatalog,
  getMergedRolePermissions,
} from './permissions';
import { echoRoleCategoryExistsForServer } from './roleCategories';
import {
  reconcileEveryoneRoleHierarchyPosition,
  reconcileMembersRoleHierarchyPosition,
} from './roleHierarchy';
import {
  applyRolePositionsFromCategoryBlocks,
  buildCategoryRoleOrderMap,
} from './roleOrdering';
import { actorMayMutateTargetRoleById } from './roleScope';

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
  const pinnedTail: string[] = [];
  for (const reservedName of ['@members', '@everyone', '@global'] as const) {
    const idx = ordered.findIndex((id) => byId.get(id)?.name === reservedName);
    if (idx < 0) continue;
    const [row] = ordered.splice(idx, 1);
    if (row) pinnedTail.push(row);
  }
  ordered.push(...pinnedTail);
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
    if (!row || row.name === '@members' || row.name === '@global') continue;
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
  const expected = inCat.rows.filter(
    (r) => r.name !== '@members' && r.name !== '@global',
  );
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
