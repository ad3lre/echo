import type pg from 'pg';
import { invalidateEchoPermissionCacheForServer } from '../../permissions/echoPermissionCache';

const RECONCILE_MEMBERS_HIERARCHY_SQL = `
WITH ordered AS (
  SELECT id,
    ROW_NUMBER() OVER (
      ORDER BY
        CASE
          WHEN name = '@global' THEN 0
          WHEN name = '@members' THEN 1
          ELSE 2
        END DESC,
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
`;

const MIGRATE_MEMBERS_HIERARCHY_SQL = `
WITH ordered AS (
  SELECT id, server_id,
    ROW_NUMBER() OVER (
      PARTITION BY server_id
      ORDER BY
        CASE
          WHEN name = '@global' THEN 0
          WHEN name = '@members' THEN 1
          ELSE 2
        END DESC,
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
`;

/**
 * Reassigns `echo_roles.position` so the `@members` role is strictly lower than every other role
 * in the server, preserving relative order among non-members roles (by current position DESC, id ASC).
 * Idempotent; no-ops when already satisfied.
 */
export async function reconcileMembersRoleHierarchyPosition(
  pool: pg.Pool | pg.PoolClient,
  serverId: string,
  mutationClient?: pg.PoolClient,
): Promise<void> {
  const result = await pool.query(RECONCILE_MEMBERS_HIERARCHY_SQL, [serverId]);
  if ((result.rowCount ?? 0) > 0 && !mutationClient) {
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
  const result = await pool.query(MIGRATE_MEMBERS_HIERARCHY_SQL);
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
