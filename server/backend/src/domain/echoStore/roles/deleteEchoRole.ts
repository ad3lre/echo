import type pg from 'pg';
import { invalidateEchoPermissionCacheForServer } from '../../permissions/echoPermissionCache';
import { isEchoServerOwner } from '../members/access';
import type { DeleteEchoRoleResult } from './echoRoleDto';
import {
  canManageEchoRolesCatalog,
  getMergedRolePermissions,
} from './permissions';
import { reconcileMembersRoleHierarchyPosition } from './roleHierarchy';
import { actorMayMutateTargetRoleById } from './roleScope';

/**
 * Removes a role and role-target permission rows (no FK from overwrites to echo_roles).
 * Cascades: member_roles, role_links, etc.
 */
export async function deleteEchoRole(
  pool: pg.Pool,
  serverId: string,
  actorId: string,
  roleId: string,
  mutationClient?: pg.PoolClient,
): Promise<DeleteEchoRoleResult> {
  const queryable = mutationClient ?? pool;
  const actorPerms = await getMergedRolePermissions(
    queryable as pg.Pool,
    serverId,
    actorId,
  );
  if (!canManageEchoRolesCatalog(actorPerms)) return 'forbidden';
  const rowQ = await queryable.query(
    `SELECT name, position FROM echo_roles WHERE server_id = $1 AND id = $2 LIMIT 1`,
    [serverId, roleId],
  );
  if (rowQ.rows.length === 0) return 'not_found';
  const row0 = rowQ.rows[0] as { name: string; position: unknown };
  const name = String(row0.name);
  if (name === '@members' || name === '@global') return 'cannot_delete_members';

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

  await queryable.query(
    `DELETE FROM echo_channel_permission_overwrite_rows WHERE server_id = $1 AND target_type = 'role' AND target_id = $2`,
    [serverId, roleId],
  );
  await queryable.query(
    `DELETE FROM echo_category_permission_overwrite_rows WHERE server_id = $1 AND target_type = 'role' AND target_id = $2`,
    [serverId, roleId],
  );

  const del = await queryable.query(
    `DELETE FROM echo_roles WHERE server_id = $1 AND id = $2`,
    [serverId, roleId],
  );
  if ((del.rowCount ?? 0) < 1) return 'not_found';
  await reconcileMembersRoleHierarchyPosition(
    queryable,
    serverId,
    mutationClient,
  );
  if (!mutationClient) invalidateEchoPermissionCacheForServer(serverId);
  return 'ok';
}
