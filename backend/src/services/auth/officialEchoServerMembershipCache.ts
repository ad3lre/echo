import type pg from 'pg';

/** Skip workspace backfill when user is already a member or was checked recently. */
const OFFICIAL_MEMBERSHIP_CHECK_TTL_MS = 24 * 60 * 60 * 1000;

const checkedAtByUserId = new Map<string, number>();

export function markOfficialEchoServerMembershipChecked(userId: string): void {
  const uid = userId.trim();
  if (!uid) return;
  checkedAtByUserId.set(uid, Date.now());
}

export function shouldSkipOfficialEchoServerMembershipBackfill(
  userId: string,
): boolean {
  const uid = userId.trim();
  if (!uid) return true;
  const at = checkedAtByUserId.get(uid);
  if (!at) return false;
  return Date.now() - at < OFFICIAL_MEMBERSHIP_CHECK_TTL_MS;
}

/**
 * Fast path: if user is already in the official server, cache and skip the
 * transactional backfill on every workspace bootstrap.
 */
export async function isUserAlreadyInOfficialEchoServer(
  pool: pg.Pool,
  userId: string,
  officialServerId: string,
): Promise<boolean> {
  const r = await pool.query(
    `SELECT 1 FROM echo_server_members WHERE server_id = $1 AND user_id = $2 LIMIT 1`,
    [officialServerId, userId.trim()],
  );
  return r.rows.length > 0;
}

export function resetOfficialEchoServerMembershipCacheForTests(): void {
  checkedAtByUserId.clear();
}
