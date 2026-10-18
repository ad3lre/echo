import type pg from 'pg';

/**
 * userId -> role ids for a specific set of users in one server. Use this
 * instead of `listEchoMemberRoleAssignmentsByUser` when the caller
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

/** userId -> role ids (including @members).
 * @deprecated Note: @everyone was renamed to @members.
 */
export async function listEchoMemberRoleAssignmentsByUser(
  pool: pg.Pool,
  serverId: string,
): Promise<Record<string, string[]>> {
  const r = await pool.query(
    `SELECT user_id, role_id FROM echo_member_roles WHERE server_id = $1`,
    [serverId],
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

/**
 * Returns a single user's role ids across many servers in one query, keyed by
 * server id. Use this instead of calling listEchoMemberRoleAssignmentsByUser per
 * server when only the viewer's own roles are needed — it avoids both the N+1
 * across servers and loading every member's rows.
 */
export async function listEchoSelfRoleIdsByServer(
  pool: pg.Pool,
  userId: string,
  serverIds: string[],
): Promise<Map<string, Set<string>>> {
  const out = new Map<string, Set<string>>();
  if (serverIds.length === 0) return out;
  const r = await pool.query(
    `SELECT server_id, role_id FROM echo_member_roles WHERE server_id = ANY($1) AND user_id = $2`,
    [serverIds, userId],
  );
  for (const row of r.rows) {
    const sid = String(row.server_id);
    const rid = String(row.role_id);
    let set = out.get(sid);
    if (!set) {
      set = new Set<string>();
      out.set(sid, set);
    }
    set.add(rid);
  }
  return out;
}

export async function echoAuthorityRoleIdsForServer(
  pool: pg.Pool,
  serverId: string,
): Promise<Set<string>> {
  const r = await pool.query(
    `SELECT id FROM echo_roles WHERE server_id = $1 AND role_type = 'authority'`,
    [serverId],
  );
  return new Set(r.rows.map((row: { id: unknown }) => String(row.id)));
}

/** Strip authority role ids from member→role lists for viewers without Manage Roles. */
export function withoutEchoAuthorityAssignments(
  assignments: Record<string, string[]>,
  authorityIds: ReadonlySet<string>,
): Record<string, string[]> {
  if (authorityIds.size === 0) return assignments;
  const next: Record<string, string[]> = {};
  for (const [uid, list] of Object.entries(assignments)) {
    next[uid] = list.filter((id) => !authorityIds.has(id));
  }
  return next;
}
