import type pg from 'pg';
import { nextEchoSnowflakeId } from '../../echoSnowflake';
import { isEchoPairBlocked } from '../members/blocks';

export async function areEchoAcceptedFriends(
  pool: pg.Pool,
  a: string,
  b: string,
): Promise<boolean> {
  const r = await pool.query(
    `
    SELECT 1 FROM echo_friendships
    WHERE status = 'accepted'
      AND ((user_id = $1 AND peer_id = $2) OR (user_id = $2 AND peer_id = $1))
    `,
    [a, b],
  );
  return r.rows.length > 0;
}

export async function echoUsersShareAnyServer(
  pool: pg.Pool,
  userIdA: string,
  userIdB: string,
): Promise<boolean> {
  const r = await pool.query(
    `
    SELECT 1
    FROM echo_server_members m
    WHERE m.user_id = $1
      AND m.server_id IN (
        SELECT server_id FROM echo_server_members WHERE user_id = $2
      )
    LIMIT 1
    `,
    [userIdA, userIdB],
  );
  return r.rows.length > 0;
}

export async function canViewEchoPeerSocialGraph(
  pool: pg.Pool,
  viewerId: string,
  peerId: string,
): Promise<boolean> {
  if (viewerId === peerId) return true;
  if (await isEchoPairBlocked(pool, viewerId, peerId)) return false;
  if (await areEchoAcceptedFriends(pool, viewerId, peerId)) return true;
  return echoUsersShareAnyServer(pool, viewerId, peerId);
}

export async function filterVisibleEchoUserIds(
  pool: pg.Pool,
  viewerId: string,
  candidateUserIds: string[],
): Promise<string[]> {
  const unique = [
    ...new Set(candidateUserIds.map((id) => id.trim()).filter(Boolean)),
  ];
  if (unique.length === 0) return [];
  const r = await pool.query<{ candidate_id: string }>(
    `
    WITH requested(candidate_id) AS (
      SELECT UNNEST($2::text[])
    )
    SELECT r.candidate_id
    FROM requested r
    WHERE r.candidate_id = $1
       OR (
         NOT EXISTS (
           SELECT 1
           FROM echo_user_blocks b
           WHERE (b.blocker_id = $1 AND b.blocked_id = r.candidate_id)
              OR (b.blocked_id = $1 AND b.blocker_id = r.candidate_id)
         )
         AND (
           EXISTS (
             SELECT 1
             FROM echo_friendships f
             WHERE f.status = 'accepted'
               AND (
                 (f.user_id = $1 AND f.peer_id = r.candidate_id)
                 OR (f.user_id = r.candidate_id AND f.peer_id = $1)
               )
           )
           OR EXISTS (
             SELECT 1
             FROM echo_server_members mine
             INNER JOIN echo_server_members theirs
               ON theirs.server_id = mine.server_id
             WHERE mine.user_id = $1
               AND theirs.user_id = r.candidate_id
           )
         )
       )
    `,
    [viewerId, unique],
  );
  return r.rows.map((row) => String(row.candidate_id));
}

/**
 * Given a subject user and candidate viewers, return viewer ids who should
 * receive presence updates for that subject (one query vs N sequential checks).
 */
export async function filterEchoViewersWhoCanSeeSubject(
  pool: pg.Pool,
  subjectUserId: string,
  viewerUserIds: string[],
): Promise<string[]> {
  const subject = subjectUserId.trim();
  const viewers = [
    ...new Set(viewerUserIds.map((id) => id.trim()).filter(Boolean)),
  ];
  if (!subject || viewers.length === 0) return [];
  const r = await pool.query<{ viewer_id: string }>(
    `
    WITH viewers(viewer_id) AS (
      SELECT UNNEST($2::text[])
    )
    SELECT v.viewer_id
    FROM viewers v
    WHERE v.viewer_id = $1
       OR (
         NOT EXISTS (
           SELECT 1
           FROM echo_user_blocks b
           WHERE (b.blocker_id = v.viewer_id AND b.blocked_id = $1)
              OR (b.blocked_id = v.viewer_id AND b.blocker_id = $1)
         )
         AND (
           EXISTS (
             SELECT 1
             FROM echo_friendships f
             WHERE f.status = 'accepted'
               AND (
                 (f.user_id = v.viewer_id AND f.peer_id = $1)
                 OR (f.user_id = $1 AND f.peer_id = v.viewer_id)
               )
           )
           OR EXISTS (
             SELECT 1
             FROM echo_server_members mine
             INNER JOIN echo_server_members theirs
               ON theirs.server_id = mine.server_id
             WHERE mine.user_id = v.viewer_id
               AND theirs.user_id = $1
           )
         )
       )
    `,
    [subject, viewers],
  );
  return r.rows.map((row) => String(row.viewer_id));
}

export type EchoDiscoverableUser = {
  id: string;
  name: string;
  username: string;
  pfp: string;
};

/**
 * People-search / suggested-users surface for add-friend.
 * Empty `query` returns recent full accounts the viewer is not already related to.
 */
export async function listEchoDiscoverableUsers(
  pool: pg.Pool,
  viewerId: string,
  query: string,
  limit: number,
): Promise<EchoDiscoverableUser[]> {
  const q = query.trim();
  const capped = Math.min(20, Math.max(1, limit));
  const pattern = `%${q.replace(/[%_\\]/g, '\\$&')}%`;
  const result = await pool.query<{
    id: string;
    name: string;
    username: string;
    pfp: string;
  }>(
    `
    SELECT u.id,
           COALESCE(NULLIF(TRIM(u.display_name), ''), u.username) AS name,
           u.username,
           COALESCE(u.pfp, '') AS pfp
      FROM auth_users u
     WHERE u.id <> $1
       AND COALESCE(u.is_guest, false) = false
       AND COALESCE(u.is_discord_shadow, false) = false
       AND ($2 = '' OR u.username ILIKE $3 ESCAPE '\\' OR u.display_name ILIKE $3 ESCAPE '\\')
       AND NOT EXISTS (
         SELECT 1
           FROM echo_user_blocks b
          WHERE (b.blocker_id = $1 AND b.blocked_id = u.id)
             OR (b.blocked_id = $1 AND b.blocker_id = u.id)
       )
       AND NOT EXISTS (
         SELECT 1
           FROM echo_friendships f
          WHERE (f.user_id = $1 AND f.peer_id = u.id)
             OR (f.user_id = u.id AND f.peer_id = $1)
       )
     ORDER BY CASE WHEN $2 <> '' AND LOWER(u.username) = LOWER($2) THEN 0 ELSE 1 END,
              u.signup_ordinal DESC NULLS LAST,
              LOWER(u.username) ASC
     LIMIT $4
    `,
    [viewerId, q, pattern, capped],
  );
  return result.rows.map((row) => ({
    id: String(row.id),
    name: String(row.name ?? row.username ?? 'Echo user'),
    username: String(row.username ?? ''),
    pfp: String(row.pfp ?? ''),
  }));
}

export async function listEchoFriends(
  pool: pg.Pool,
  userId: string,
): Promise<{ peerId: string; status: string }[]> {
  const r = await pool.query(
    `
    SELECT CASE WHEN f.user_id = $1 THEN f.peer_id ELSE f.user_id END AS peer_id, f.status
    FROM echo_friendships f
    WHERE (f.user_id = $1 OR f.peer_id = $1) AND f.status = 'accepted'
      AND NOT EXISTS (
        SELECT 1 FROM echo_user_blocks b
        WHERE
          (b.blocker_id = $1 AND b.blocked_id = (CASE WHEN f.user_id = $1 THEN f.peer_id ELSE f.user_id END))
          OR (b.blocked_id = $1 AND b.blocker_id = (CASE WHEN f.user_id = $1 THEN f.peer_id ELSE f.user_id END))
      )
    `,
    [userId],
  );
  return r.rows.map((row: Record<string, unknown>) => ({
    peerId: String(row.peer_id),
    status: String(row.status),
  }));
}

export type AddEchoFriendRequestResult =
  | 'created'
  | 'blocked'
  | 'already_related';

export async function addEchoFriendRequest(
  pool: pg.Pool,
  fromUserId: string,
  toUserId: string,
): Promise<AddEchoFriendRequestResult> {
  if (fromUserId === toUserId) return 'already_related';
  if (await isEchoPairBlocked(pool, fromUserId, toUserId)) return 'blocked';
  const dup = await pool.query(
    `SELECT 1 FROM echo_friendships WHERE (user_id = $1 AND peer_id = $2) OR (user_id = $2 AND peer_id = $1)`,
    [fromUserId, toUserId],
  );
  if (dup.rows.length > 0) return 'already_related';
  const id = nextEchoSnowflakeId();
  await pool.query(
    `INSERT INTO echo_friendships (id, user_id, peer_id, status) VALUES ($1, $2, $3, 'pending')`,
    [id, fromUserId, toUserId],
  );
  return 'created';
}

export async function acceptEchoFriendship(
  pool: pg.Pool,
  recipientId: string,
  peerId: string,
): Promise<boolean> {
  if (await isEchoPairBlocked(pool, recipientId, peerId)) return false;
  const r = await pool.query(
    `
    UPDATE echo_friendships SET status = 'accepted'
    WHERE user_id = $2 AND peer_id = $1 AND status = 'pending'
    RETURNING id
    `,
    [recipientId, peerId],
  );
  return r.rowCount != null && r.rowCount > 0;
}

export type EchoPendingFriendIncoming = {
  id: string;
  fromUserId: string;
  fromUser: { id: string; name: string; username: string; pfp: string };
};
export type EchoPendingFriendOutgoing = { id: string; toUserId: string };

export async function listEchoPendingFriendRequestsIncoming(
  pool: pg.Pool,
  userId: string,
): Promise<EchoPendingFriendIncoming[]> {
  const r = await pool.query(
    `
    SELECT f.id,
           f.user_id AS from_user_id,
           COALESCE(NULLIF(TRIM(u.display_name), ''), u.username) AS from_name,
           u.username AS from_username,
           COALESCE(u.pfp, '') AS from_pfp
    FROM echo_friendships f
    INNER JOIN auth_users u ON u.id = f.user_id
    WHERE f.peer_id = $1 AND f.status = 'pending'
      AND NOT EXISTS (
        SELECT 1 FROM echo_user_blocks b
        WHERE (b.blocker_id = $1 AND b.blocked_id = f.user_id)
           OR (b.blocked_id = $1 AND b.blocker_id = f.user_id)
      )
    ORDER BY f.created_at ASC
    `,
    [userId],
  );
  return r.rows.map(
    (row: {
      id: string;
      from_user_id: string;
      from_name: string;
      from_username: string;
      from_pfp: string;
    }) => ({
      id: String(row.id),
      fromUserId: String(row.from_user_id),
      fromUser: {
        id: String(row.from_user_id),
        name: String(row.from_name ?? row.from_username ?? 'Echo user'),
        username: String(row.from_username ?? ''),
        pfp: String(row.from_pfp ?? ''),
      },
    }),
  );
}

export async function listEchoPendingFriendRequestsOutgoing(
  pool: pg.Pool,
  userId: string,
): Promise<EchoPendingFriendOutgoing[]> {
  const r = await pool.query(
    `
    SELECT f.id, f.peer_id AS to_user_id
    FROM echo_friendships f
    WHERE f.user_id = $1 AND f.status = 'pending'
      AND NOT EXISTS (
        SELECT 1 FROM echo_user_blocks b
        WHERE (b.blocker_id = $1 AND b.blocked_id = f.peer_id)
           OR (b.blocked_id = $1 AND b.blocker_id = f.peer_id)
      )
    ORDER BY f.created_at ASC
    `,
    [userId],
  );
  return r.rows.map((row: { id: string; to_user_id: string }) => ({
    id: String(row.id),
    toUserId: String(row.to_user_id),
  }));
}

/** Recipient declines a pending request from peerId (request row: user_id = peerId, peer_id = recipient). */
export async function declineEchoPendingFriendRequest(
  pool: pg.Pool,
  recipientId: string,
  peerId: string,
): Promise<boolean> {
  if (await isEchoPairBlocked(pool, recipientId, peerId)) return false;
  const r = await pool.query(
    `
    DELETE FROM echo_friendships
    WHERE status = 'pending' AND user_id = $2 AND peer_id = $1
    RETURNING id
    `,
    [recipientId, peerId],
  );
  return r.rowCount != null && r.rowCount > 0;
}

/** Initiator cancels a pending request to peerId. */
export async function cancelEchoPendingFriendRequest(
  pool: pg.Pool,
  fromUserId: string,
  peerId: string,
): Promise<boolean> {
  if (await isEchoPairBlocked(pool, fromUserId, peerId)) return false;
  const r = await pool.query(
    `
    DELETE FROM echo_friendships
    WHERE status = 'pending' AND user_id = $1 AND peer_id = $2
    RETURNING id
    `,
    [fromUserId, peerId],
  );
  return r.rowCount != null && r.rowCount > 0;
}

/** Removes an accepted friendship row (either orientation). */
export async function removeEchoAcceptedFriendship(
  pool: pg.Pool,
  userId: string,
  peerId: string,
): Promise<boolean> {
  if (userId === peerId) return false;
  const r = await pool.query(
    `
    DELETE FROM echo_friendships
    WHERE status = 'accepted'
      AND ((user_id = $1 AND peer_id = $2) OR (user_id = $2 AND peer_id = $1))
    RETURNING id
    `,
    [userId, peerId],
  );
  return r.rowCount != null && r.rowCount > 0;
}

/** Peer user ids who are accepted friends of both viewer and peer, excluding viewer/peer and viewer-blocked edges (same filter as listEchoFriends for viewer). */
export async function listEchoMutualFriendPeerIds(
  pool: pg.Pool,
  viewerId: string,
  peerId: string,
): Promise<string[]> {
  if (viewerId === peerId) return [];
  const r = await pool.query<{ uid: string }>(
    `
    WITH my_friends AS (
      SELECT CASE WHEN f.user_id = $1 THEN f.peer_id ELSE f.user_id END AS uid
      FROM echo_friendships f
      WHERE (f.user_id = $1 OR f.peer_id = $1) AND f.status = 'accepted'
    ),
    their_friends AS (
      SELECT CASE WHEN f.user_id = $2 THEN f.peer_id ELSE f.user_id END AS uid
      FROM echo_friendships f
      WHERE (f.user_id = $2 OR f.peer_id = $2) AND f.status = 'accepted'
    )
    SELECT m.uid AS uid
    FROM my_friends m
    INNER JOIN their_friends t ON m.uid = t.uid
    WHERE m.uid NOT IN ($1, $2)
      AND NOT EXISTS (
        SELECT 1 FROM echo_user_blocks b
        WHERE (b.blocker_id = $1 AND b.blocked_id = m.uid)
           OR (b.blocked_id = $1 AND b.blocker_id = m.uid)
      )
    `,
    [viewerId, peerId],
  );
  return r.rows.map((row) => String(row.uid));
}
