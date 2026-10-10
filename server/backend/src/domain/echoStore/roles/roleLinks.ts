import type pg from 'pg';
import { invalidateEchoPermissionCacheForServer } from '../../permissions/echoPermissionCache';
import {
  canManageEchoRolesCatalog,
  getMergedRolePermissions,
} from './permissions';
import { getMemberTopRolePosition, isEchoServerOwner } from '../members/access';
import { actorMayGrantPermissionSet } from './roles';
import { expandStoredRolePermissionsToCanonSet } from '../../permissions/echoPermissionPrimitives';

export type EchoRoleLinkDto = {
  anchorRoleId: string;
  linkedRoleId: string;
  twoWay: boolean;
};

const LINK_CLOSURE_MAX_ROUNDS = 32;

async function queryImpliedRoleIdsForAssignment(
  pool: pg.Pool | pg.PoolClient,
  serverId: string,
  assignedRoleId: string,
): Promise<string[]> {
  const r = await pool.query<{ id: string }>(
    `
    SELECT linked_role_id AS id FROM echo_role_links
    WHERE server_id = $1 AND anchor_role_id = $2
    UNION
    SELECT anchor_role_id AS id FROM echo_role_links
    WHERE server_id = $1 AND linked_role_id = $2 AND two_way = true
    `,
    [serverId, assignedRoleId],
  );
  return r.rows.map((row) => String(row.id));
}

/**
 * After a role is assigned, assign any linked roles (one-way from anchor, or reverse of two-way links).
 * Repeats until fixpoint (max rounds) so chains like A→B→C apply in one operation.
 */
export async function applyEchoRoleLinksAfterAssignment(
  pool: pg.Pool | pg.PoolClient,
  serverId: string,
  userId: string,
  seedRoleId: string,
): Promise<void> {
  const seed = await pool.query<{ position: unknown; permissions: unknown }>(
    `SELECT position, permissions FROM echo_roles WHERE server_id = $1 AND id = $2`,
    [serverId, seedRoleId],
  );
  if (!seed.rows[0]) return;
  const seedPosition = Number(seed.rows[0].position ?? 0);
  const seedPermissions = expandStoredRolePermissionsToCanonSet(
    seed.rows[0].permissions,
  );
  let frontier = [seedRoleId];
  for (
    let round = 0;
    round < LINK_CLOSURE_MAX_ROUNDS && frontier.length > 0;
    round++
  ) {
    const next: string[] = [];
    for (const roleId of frontier) {
      const implied = await queryImpliedRoleIdsForAssignment(
        pool,
        serverId,
        roleId,
      );
      for (const rid of implied) {
        const linked = await pool.query<{
          position: unknown;
          permissions: unknown;
        }>(
          `SELECT position, permissions FROM echo_roles WHERE server_id = $1 AND id = $2`,
          [serverId, rid],
        );
        const linkedRole = linked.rows[0];
        if (!linkedRole || Number(linkedRole.position ?? 0) > seedPosition)
          continue;
        const linkedPermissions = expandStoredRolePermissionsToCanonSet(
          linkedRole.permissions,
        );
        if (
          [...linkedPermissions].some(
            (permission) => !seedPermissions.has(permission),
          )
        )
          continue;
        const ins = await pool.query(
          `INSERT INTO echo_member_roles (server_id, user_id, role_id) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING RETURNING role_id`,
          [serverId, userId, rid],
        );
        if ((ins.rowCount ?? 0) > 0) next.push(rid);
      }
    }
    frontier = next;
  }
}

export async function listEchoRoleLinksForServer(
  pool: pg.Pool,
  serverId: string,
): Promise<EchoRoleLinkDto[]> {
  const r = await pool.query<{
    anchor_role_id: string;
    linked_role_id: string;
    two_way: boolean;
  }>(
    `SELECT anchor_role_id, linked_role_id, two_way FROM echo_role_links WHERE server_id = $1`,
    [serverId],
  );
  return r.rows.map((row) => ({
    anchorRoleId: String(row.anchor_role_id),
    linkedRoleId: String(row.linked_role_id),
    twoWay: Boolean(row.two_way),
  }));
}

export type ReplaceEchoRoleLinksResult =
  | 'ok'
  | 'forbidden'
  | 'invalid_body'
  | 'not_found';

async function roleIsEveryone(
  pool: pg.Pool,
  serverId: string,
  roleId: string,
): Promise<boolean> {
  const r = await pool.query(
    `SELECT name FROM echo_roles WHERE server_id = $1 AND id = $2 LIMIT 1`,
    [serverId, roleId],
  );
  if (!r.rows[0]) return false;
  return String((r.rows[0] as { name: string }).name) === '@everyone';
}

export async function replaceEchoRoleLinksFromAnchor(
  pool: pg.Pool,
  serverId: string,
  actorId: string,
  anchorRoleId: string,
  links: { linkedRoleId: string; twoWay: boolean }[],
  mutationClient?: pg.PoolClient,
): Promise<ReplaceEchoRoleLinksResult> {
  const queryable = mutationClient ?? pool;
  const actorPerms = await getMergedRolePermissions(
    queryable as pg.Pool,
    serverId,
    actorId,
  );
  if (!canManageEchoRolesCatalog(actorPerms)) return 'forbidden';

  const actorIsOwner = await isEchoServerOwner(
    queryable as pg.Pool,
    serverId,
    actorId,
  );
  const actorTop = actorIsOwner
    ? Infinity
    : await getMemberTopRolePosition(queryable as pg.Pool, serverId, actorId);

  const anchorOk = await queryable.query(
    `SELECT position, permissions FROM echo_roles WHERE server_id = $1 AND id = $2`,
    [serverId, anchorRoleId],
  );
  if (anchorOk.rows.length === 0) return 'not_found';
  const anchorPosition = Number(anchorOk.rows[0].position ?? 0);

  if (!actorIsOwner) {
    if (!(actorTop > anchorPosition)) return 'forbidden';
  }

  if (await roleIsEveryone(queryable as pg.Pool, serverId, anchorRoleId))
    return 'invalid_body';

  const seen = new Set<string>();
  for (const row of links) {
    const lid = String(row.linkedRoleId ?? '').trim();
    if (!lid) return 'invalid_body';
    if (lid === anchorRoleId) return 'invalid_body';
    if (seen.has(lid)) return 'invalid_body';
    seen.add(lid);
    if (typeof row.twoWay !== 'boolean') return 'invalid_body';
    const ok = await queryable.query(
      `SELECT position, permissions FROM echo_roles WHERE server_id = $1 AND id = $2`,
      [serverId, lid],
    );
    if (ok.rows.length === 0) return 'invalid_body';
    if (await roleIsEveryone(queryable as pg.Pool, serverId, lid))
      return 'invalid_body';

    const lidPosition = Number(ok.rows[0].position ?? 0);

    if (!actorIsOwner) {
      if (!(actorTop > lidPosition)) return 'forbidden';

      const lidGrantSet = expandStoredRolePermissionsToCanonSet(
        ok.rows[0].permissions,
      );
      if (!actorMayGrantPermissionSet(actorPerms, lidGrantSet, false)) {
        return 'forbidden';
      }

      if (row.twoWay) {
        const anchorGrantSet = expandStoredRolePermissionsToCanonSet(
          anchorOk.rows[0].permissions,
        );
        if (!actorMayGrantPermissionSet(actorPerms, anchorGrantSet, false)) {
          return 'forbidden';
        }
      }
    }
  }

  const client = mutationClient ?? (await pool.connect());
  const ownsTransaction = mutationClient === undefined;
  try {
    if (ownsTransaction) await client.query('BEGIN');
    await client.query(
      `DELETE FROM echo_role_links WHERE server_id = $1 AND anchor_role_id = $2`,
      [serverId, anchorRoleId],
    );
    for (const row of links) {
      await client.query(
        `INSERT INTO echo_role_links (server_id, anchor_role_id, linked_role_id, two_way) VALUES ($1, $2, $3, $4)`,
        [serverId, anchorRoleId, row.linkedRoleId, row.twoWay],
      );
    }
    if (ownsTransaction) await client.query('COMMIT');
  } catch (e) {
    if (ownsTransaction) await client.query('ROLLBACK');
    throw e;
  } finally {
    if (ownsTransaction) client.release();
  }
  if (!mutationClient) invalidateEchoPermissionCacheForServer(serverId);
  return 'ok';
}
