import type pg from 'pg';

/** Skip workspace backfill when user is already a member or was checked recently. */
const OFFICIAL_MEMBERSHIP_CHECK_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_CACHED_USERS = 50_000;

const checkedAtByUserId = new Map<string, number>();

export function markOfficialEchoServerMembershipChecked(userId: string): void {
  const uid = userId.trim();
  if (!uid) return;
  if (
    checkedAtByUserId.size >= MAX_CACHED_USERS &&
    !checkedAtByUserId.has(uid)
  ) {
    const now = Date.now();
    for (const [id, at] of checkedAtByUserId) {
      if (now - at >= OFFICIAL_MEMBERSHIP_CHECK_TTL_MS)
        checkedAtByUserId.delete(id);
    }
    while (checkedAtByUserId.size >= MAX_CACHED_USERS) {
      const oldest = checkedAtByUserId.keys().next().value;
      if (oldest === undefined) break;
      checkedAtByUserId.delete(oldest);
    }
  }
  checkedAtByUserId.set(uid, Date.now());
}

export function shouldSkipOfficialEchoServerMembershipBackfill(
  userId: string,
): boolean {
  const uid = userId.trim();
  if (!uid) return true;
  const at = checkedAtByUserId.get(uid);
  if (!at) return false;
  if (Date.now() - at >= OFFICIAL_MEMBERSHIP_CHECK_TTL_MS) {
    checkedAtByUserId.delete(uid);
    return false;
  }
  return true;
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
