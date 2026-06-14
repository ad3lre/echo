import type pg from 'pg';

/** Reclaim channel host lock when the holder stops heartbeating (ms). */
export const VC_WATCH_TOGETHER_CHANNEL_HOST_STALE_MS = 15 * 60 * 1000;

export type VcWatchTogetherChannelHostClaimResult =
  | { ok: true }
  | { ok: false; code: 'HOST_TAKEN'; hostUserId: string };

export async function claimVcWatchTogetherChannelHost(
  pool: pg.Pool,
  opts: {
    channelId: string;
    hostUserId: string;
    sessionId: string;
  },
): Promise<VcWatchTogetherChannelHostClaimResult> {
  const channelId = opts.channelId.trim();
  const hostUserId = opts.hostUserId.trim();
  const sessionId = opts.sessionId.trim();
  if (!channelId || !hostUserId || !sessionId) {
    return { ok: false, code: 'HOST_TAKEN', hostUserId: '' };
  }

  const staleMs = VC_WATCH_TOGETHER_CHANNEL_HOST_STALE_MS;
  const existing = await pool.query<{ host_user_id: string }>(
    `SELECT host_user_id FROM echo_vc_watch_together_channel_hosts
     WHERE channel_id = $1
       AND host_user_id <> $2
       AND updated_at >= NOW() - ($3::bigint * INTERVAL '1 millisecond')
     LIMIT 1`,
    [channelId, hostUserId, staleMs],
  );
  const other = existing.rows[0]?.host_user_id?.trim();
  if (other) {
    return { ok: false, code: 'HOST_TAKEN', hostUserId: other };
  }

  await pool.query(
    `INSERT INTO echo_vc_watch_together_channel_hosts
       (channel_id, host_user_id, session_id, updated_at)
     VALUES ($1, $2, $3, NOW())
     ON CONFLICT (channel_id) DO UPDATE SET
       host_user_id = EXCLUDED.host_user_id,
       session_id = EXCLUDED.session_id,
       updated_at = NOW()
     WHERE echo_vc_watch_together_channel_hosts.host_user_id = EXCLUDED.host_user_id
        OR echo_vc_watch_together_channel_hosts.updated_at
           < NOW() - ($4::bigint * INTERVAL '1 millisecond')`,
    [channelId, hostUserId, sessionId, staleMs],
  );

  const verify = await pool.query<{ host_user_id: string }>(
    `SELECT host_user_id FROM echo_vc_watch_together_channel_hosts
     WHERE channel_id = $1 LIMIT 1`,
    [channelId],
  );
  const holder = verify.rows[0]?.host_user_id?.trim();
  if (holder && holder !== hostUserId) {
    return { ok: false, code: 'HOST_TAKEN', hostUserId: holder };
  }
  return { ok: true };
}

export async function releaseVcWatchTogetherChannelHost(
  pool: pg.Pool,
  opts: { channelId: string; hostUserId: string },
): Promise<boolean> {
  const channelId = opts.channelId.trim();
  const hostUserId = opts.hostUserId.trim();
  if (!channelId || !hostUserId) return false;
  const r = await pool.query(
    `DELETE FROM echo_vc_watch_together_channel_hosts
     WHERE channel_id = $1 AND host_user_id = $2`,
    [channelId, hostUserId],
  );
  return (r.rowCount ?? 0) > 0;
}

export async function getVcWatchTogetherChannelHost(
  pool: pg.Pool,
  channelId: string,
): Promise<{ hostUserId: string; sessionId: string } | null> {
  const id = channelId.trim();
  if (!id) return null;
  const staleMs = VC_WATCH_TOGETHER_CHANNEL_HOST_STALE_MS;
  const r = await pool.query<{ host_user_id: string; session_id: string }>(
    `SELECT host_user_id, session_id
     FROM echo_vc_watch_together_channel_hosts
     WHERE channel_id = $1
       AND updated_at >= NOW() - ($2::bigint * INTERVAL '1 millisecond')
     LIMIT 1`,
    [id, staleMs],
  );
  const row = r.rows[0];
  if (!row?.host_user_id?.trim()) return null;
  return {
    hostUserId: row.host_user_id.trim(),
    sessionId: row.session_id.trim(),
  };
}
