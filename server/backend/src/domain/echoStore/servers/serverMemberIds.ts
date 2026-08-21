import type pg from 'pg';
import {
  getCachedServerMemberUserIds,
  setCachedServerMemberUserIds,
} from '../../echoServerMemberIdsCache';
import { getEchoPermissionCacheGeneration } from '../../permissions/echoPermissionCache';

/**
 * Member user ids for a server, cached in-process (see `echoServerMemberIdsCache`).
 * Lighter than {@link listEchoServerMembers} (no auth_users join, no sort) for the
 * fan-out paths that only need recipient ids. The fill is bracketed by the
 * permission-cache generation so it cannot repopulate the cache with a read that
 * started before an invalidation.
 */
export async function listEchoServerMemberUserIdsCached(
  pool: pg.Pool,
  serverId: string,
): Promise<readonly string[]> {
  const cached = getCachedServerMemberUserIds(serverId);
  if (cached) return cached;
  const startGen = getEchoPermissionCacheGeneration(serverId);
  const r = await pool.query(
    `SELECT user_id FROM echo_server_members WHERE server_id = $1`,
    [serverId],
  );
  const ids: string[] = [];
  for (const row of r.rows as { user_id?: unknown }[]) {
    const id = String(row.user_id ?? '').trim();
    if (id) ids.push(id);
  }
  if (getEchoPermissionCacheGeneration(serverId) === startGen) {
    setCachedServerMemberUserIds(serverId, ids);
  }
  return ids;
}
