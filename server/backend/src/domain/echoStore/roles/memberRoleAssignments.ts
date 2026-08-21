import type pg from 'pg';

/**
 * userId -> role ids for a specific set of users in one server. Use this
 * instead of `listEchoMemberRoleAssignmentsByUser` (roles.ts) when the caller
 * already knows which users it needs (e.g. message attention fanout) — it
 * avoids loading every member's rows in large servers.
 */
export async function listEchoMemberRoleAssignmentsForUsers(
  pool: pg.Pool,
  serverId: string,
  userIds: string[],
): Promise<Record<string, string[]>> {
  const ids = [...new Set(userIds.map((id) => id.trim()).filter(Boolean))];
  if (ids.length === 0) return {};
  const r = await pool.query(
    `SELECT user_id, role_id FROM echo_member_roles WHERE server_id = $1 AND user_id = ANY($2::text[])`,
    [serverId, ids],
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
