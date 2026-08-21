import type pg from 'pg';
import {
  getCachedMemberAccessState,
  setCachedMemberAccessState,
  type EchoMemberAccessState,
} from '../../echoMemberStateCache';
import { getEchoPermissionCacheGeneration } from '../../permissions/echoPermissionCache';

export type { EchoMemberAccessState };

/**
 * Membership + active ban + active timeout for a member, in **one** round-trip, cached
 * for a short window via `echoMemberStateCache`. These three are read on every guild
 * message send/reaction; folding them into a single cached read removes three uncached
 * queries from the hot write path. Never used for DM channels (no server membership).
 *
 * Lives in its own module (not `access.ts`) so the aggregate permission fold can import it
 * without a runtime cycle through the evaluator.
 */
export async function getEchoMemberAccessState(
  pool: pg.Pool,
  serverId: string,
  userId: string,
): Promise<EchoMemberAccessState> {
  const cached = getCachedMemberAccessState(serverId, userId);
  if (cached) return cached;
  const startGen = getEchoPermissionCacheGeneration(serverId);
  const r = await pool.query<{
    is_member: boolean;
    banned: boolean;
    timeout_until: string | Date | null;
  }>(
    `
    SELECT
      EXISTS(
        SELECT 1 FROM echo_server_members WHERE server_id = $1 AND user_id = $2
      ) AS is_member,
      EXISTS(
        SELECT 1 FROM echo_server_bans
        WHERE server_id = $1 AND user_id = $2
          AND (expires_at IS NULL OR expires_at > NOW())
      ) AS banned,
      (
        SELECT timeout_until FROM echo_server_member_timeouts
        WHERE server_id = $1 AND user_id = $2 AND timeout_until > NOW()
      ) AS timeout_until
    `,
    [serverId, userId],
  );
  const row = r.rows[0];
  let timeoutUntilEpochMs: number | null = null;
  if (row?.timeout_until != null) {
    const iso =
      row.timeout_until instanceof Date
        ? row.timeout_until.toISOString()
        : new Date(String(row.timeout_until)).toISOString();
    const epoch = Date.parse(iso);
    timeoutUntilEpochMs = Number.isFinite(epoch) ? epoch : null;
  }
  const state: EchoMemberAccessState = {
    isMember: row?.is_member === true,
    banned: row?.banned === true,
    timeoutUntilEpochMs,
  };
  if (getEchoPermissionCacheGeneration(serverId) === startGen) {
    setCachedMemberAccessState(serverId, userId, state);
  }
  return state;
}
