import type pg from 'pg';
import { filterVisibleEchoUserIds } from './social';

/** Peer ids visible via an existing 1:1 DM thread or pending/accepted message request. */
const PROFILE_VISIBLE_VIA_DM_SQL = [
  'WITH requested(peer_id) AS (SELECT UNNEST($2::text[]))',
  'SELECT r.peer_id FROM requested r',
  'WHERE EXISTS (',
  '  SELECT 1 FROM echo_dm_threads d',
  '  WHERE (d.user_low = $1 AND d.user_high = r.peer_id)',
  '     OR (d.user_high = $1 AND d.user_low = r.peer_id)',
  ') OR EXISTS (',
  '  SELECT 1 FROM echo_dm_message_requests mr',
  "  WHERE mr.status IN ('pending', 'accepted')",
  '    AND ((mr.requester_user_id = $1 AND mr.recipient_user_id = r.peer_id)',
  '      OR (mr.requester_user_id = r.peer_id AND mr.recipient_user_id = $1))',
  ')',
].join('\n');

/**
 * True when the viewer may resolve the peer's public profile (display name, avatar) for DM UI.
 * Covers mutual visibility (friends / shared servers), an existing 1:1 DM thread, or a pending /
 * accepted message request — including cases where the peer is absent from workspace snapshots.
 */
export async function echoPeerProfileVisibleToViewer(
  pool: pg.Pool,
  viewerUserId: string,
  peerUserId: string,
): Promise<boolean> {
  const viewer = viewerUserId.trim();
  const peer = peerUserId.trim();
  if (!viewer || !peer) return false;
  const visible = await filterProfileVisibleEchoUserIds(pool, viewer, [peer]);
  return visible.includes(peer);
}

/**
 * Batch form of {@link echoPeerProfileVisibleToViewer} for profile list endpoints.
 * Prefer this over N visibility round-trips when hydrating an inbox.
 */
export async function filterProfileVisibleEchoUserIds(
  pool: pg.Pool,
  viewerUserId: string,
  candidateUserIds: string[],
): Promise<string[]> {
  const viewer = viewerUserId.trim();
  const unique = [
    ...new Set(candidateUserIds.map((id) => id.trim()).filter(Boolean)),
  ];
  if (!viewer || unique.length === 0) return [];
  const socialVisible = await filterVisibleEchoUserIds(pool, viewer, unique);
  const remaining = unique.filter((id) => !socialVisible.includes(id));
  if (remaining.length === 0) return socialVisible;

  const r = await pool.query<{ peer_id: string }>(PROFILE_VISIBLE_VIA_DM_SQL, [
    viewer,
    remaining,
  ]);
  const dmVisible = r.rows.map((row) => String(row.peer_id));
  return [...new Set([...socialVisible, ...dmVisible])];
}
