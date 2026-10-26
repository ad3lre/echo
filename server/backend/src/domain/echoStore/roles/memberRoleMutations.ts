import type pg from 'pg';
import { applyEchoRoleLinksAfterAssignment } from './roleLinks';
import { invalidateEchoPermissionCacheForServer } from '../../permissions/echoPermissionCache';
import { expandStoredRolePermissionsToCanonSet } from '../../permissions/echoPermissionPrimitives';
import { isEchoServerOwner } from '../members/access';
import type { EchoMemberRoleMutationResult } from './echoRoleDto';
import {
  canAssignEchoMemberRoles,
  getMergedRolePermissions,
} from './permissions';
import { actorMayGrantPermissionSet } from './roleGrantGuards';
import { actorMayMutateTargetRoleById } from './roleScope';

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
  mutationClient?: pg.PoolClient,
): Promise<EchoMemberRoleMutationResult> {
  const queryable = mutationClient ?? pool;
  const actorPerms = await getMergedRolePermissions(
    queryable as pg.Pool,
    serverId,
    actorId,
  );
  if (!canAssignEchoMemberRoles(actorPerms)) return 'forbidden';

  const actorIsOwner = await isEchoServerOwner(
    queryable as pg.Pool,
    serverId,
    actorId,
  );
  const targetIsOwner = await isEchoServerOwner(
    queryable as pg.Pool,
    serverId,
    targetUserId,
  );
  if (!actorIsOwner && targetIsOwner) return 'forbidden';

  const tmem = await queryable.query(
    `SELECT 1 FROM echo_server_members WHERE server_id = $1 AND user_id = $2`,
    [serverId, targetUserId],
  );
  if (tmem.rows.length === 0) return 'not_member';

  const roleRow = await queryable.query<{
    position: unknown;
    permissions: unknown;
  }>(
    `SELECT position, permissions FROM echo_roles WHERE server_id = $1 AND id = $2 LIMIT 1`,
    [serverId, roleId],
  );
  if (roleRow.rows.length === 0) return 'invalid_role';

  if (!actorIsOwner) {
    const ok = await actorMayMutateTargetRoleById(
      queryable as pg.Pool,
      serverId,
      actorId,
      roleId,
      'assign',
      targetUserId,
    );
    if (!ok) return 'forbidden';
    const roleGrantSet = expandStoredRolePermissionsToCanonSet(
      roleRow.rows[0]!.permissions,
    );
    if (!actorMayGrantPermissionSet(actorPerms, roleGrantSet, false)) {
      return 'forbidden';
    }
  }

  const ins = await queryable.query(
    `INSERT INTO echo_member_roles (server_id, user_id, role_id) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING RETURNING server_id`,
    [serverId, targetUserId, roleId],
  );
  if ((ins.rowCount ?? 0) < 1) return 'unchanged';
  await applyEchoRoleLinksAfterAssignment(
    queryable,
    serverId,
    targetUserId,
    roleId,
  );
  if (!mutationClient) invalidateEchoPermissionCacheForServer(serverId);
  return 'ok';
}

export async function removeEchoMemberRole(
  pool: pg.Pool,
  serverId: string,
  actorId: string,
  targetUserId: string,
  roleId: string,
  mutationClient?: pg.PoolClient,
): Promise<EchoMemberRoleMutationResult> {
  const queryable = mutationClient ?? pool;
  const actorPerms = await getMergedRolePermissions(
    queryable as pg.Pool,
    serverId,
    actorId,
  );
  if (!canAssignEchoMemberRoles(actorPerms)) return 'forbidden';

  const actorIsOwner = await isEchoServerOwner(
    queryable as pg.Pool,
    serverId,
    actorId,
  );
  const targetIsOwner = await isEchoServerOwner(
    queryable as pg.Pool,
    serverId,
    targetUserId,
  );
  if (!actorIsOwner && targetIsOwner) return 'forbidden';

  const everyoneId = await getEveryoneRoleIdForServer(
    queryable as pg.Pool,
    serverId,
  );
  if (everyoneId && roleId === everyoneId) return 'cannot_remove_members';

  const tmem = await queryable.query(
    `SELECT 1 FROM echo_server_members WHERE server_id = $1 AND user_id = $2`,
    [serverId, targetUserId],
  );
  if (tmem.rows.length === 0) return 'not_member';

  const roleRow = await queryable.query(
    `SELECT 1 FROM echo_roles WHERE server_id = $1 AND id = $2 LIMIT 1`,
    [serverId, roleId],
  );
  if (roleRow.rows.length === 0) return 'invalid_role';

  if (!actorIsOwner) {
    const ok = await actorMayMutateTargetRoleById(
      queryable as pg.Pool,
      serverId,
      actorId,
      roleId,
      'assign',
      targetUserId,
    );
    if (!ok) return 'forbidden';
  }

  const del = await queryable.query(
    `DELETE FROM echo_member_roles WHERE server_id = $1 AND user_id = $2 AND role_id = $3 RETURNING server_id`,
    [serverId, targetUserId, roleId],
  );
  if ((del.rowCount ?? 0) < 1) return 'unchanged';
  if (!mutationClient) invalidateEchoPermissionCacheForServer(serverId);
  return 'ok';
}
