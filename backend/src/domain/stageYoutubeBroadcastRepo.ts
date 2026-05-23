import type { Pool } from 'pg';

export type StageYoutubeBroadcastStatus =
  | 'starting'
  | 'live'
  | 'stopping'
  | 'ended'
  | 'failed';

export type StageYoutubeBroadcastRow = {
  serverId: string;
  channelId: string;
  startedByUserId: string;
  youtubeLinkUserId: string;
  youtubeBroadcastId: string;
  youtubeStreamId: string;
  livekitEgressId: string | null;
  status: StageYoutubeBroadcastStatus;
  privacyStatus: 'public' | 'unlisted' | 'private';
  title: string;
  watchUrl: string | null;
  errorCode: string | null;
  startedAt: string;
  endedAt: string | null;
  updatedAt: string;
};

function rowFromDb(r: Record<string, unknown>): StageYoutubeBroadcastRow {
  return {
    serverId: String(r.server_id),
    channelId: String(r.channel_id),
    startedByUserId: String(r.started_by_user_id),
    youtubeLinkUserId: String(r.youtube_link_user_id),
    youtubeBroadcastId: String(r.youtube_broadcast_id),
    youtubeStreamId: String(r.youtube_stream_id),
    livekitEgressId:
      r.livekit_egress_id != null ? String(r.livekit_egress_id) : null,
    status: String(r.status) as StageYoutubeBroadcastStatus,
    privacyStatus: String(r.privacy_status) as
      | 'public'
      | 'unlisted'
      | 'private',
    title: String(r.title ?? ''),
    watchUrl: r.watch_url != null ? String(r.watch_url) : null,
    errorCode: r.error_code != null ? String(r.error_code) : null,
    startedAt: String(r.started_at),
    endedAt: r.ended_at != null ? String(r.ended_at) : null,
    updatedAt: String(r.updated_at),
  };
}

export async function getStageYoutubeBroadcast(
  pool: Pool,
  serverId: string,
  channelId: string,
): Promise<StageYoutubeBroadcastRow | null> {
  const r = await pool.query(
    `SELECT * FROM echo_stage_youtube_broadcasts WHERE server_id = $1 AND channel_id = $2`,
    [serverId, channelId],
  );
  if (!r.rows[0]) return null;
  return rowFromDb(r.rows[0] as Record<string, unknown>);
}

export async function upsertStageYoutubeBroadcast(
  pool: Pool,
  input: {
    serverId: string;
    channelId: string;
    startedByUserId: string;
    youtubeLinkUserId: string;
    youtubeBroadcastId: string;
    youtubeStreamId: string;
    livekitEgressId: string | null;
    status: StageYoutubeBroadcastStatus;
    privacyStatus: 'public' | 'unlisted' | 'private';
    title: string;
    watchUrl: string | null;
    errorCode?: string | null;
  },
): Promise<void> {
  await pool.query(
    `
    INSERT INTO echo_stage_youtube_broadcasts (
      server_id, channel_id, started_by_user_id, youtube_link_user_id,
      youtube_broadcast_id, youtube_stream_id, livekit_egress_id, status,
      privacy_status, title, watch_url, error_code, started_at, ended_at, updated_at
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW(), NULL, NOW())
    ON CONFLICT (server_id, channel_id) DO UPDATE SET
      started_by_user_id = EXCLUDED.started_by_user_id,
      youtube_link_user_id = EXCLUDED.youtube_link_user_id,
      youtube_broadcast_id = EXCLUDED.youtube_broadcast_id,
      youtube_stream_id = EXCLUDED.youtube_stream_id,
      livekit_egress_id = EXCLUDED.livekit_egress_id,
      status = EXCLUDED.status,
      privacy_status = EXCLUDED.privacy_status,
      title = EXCLUDED.title,
      watch_url = EXCLUDED.watch_url,
      error_code = EXCLUDED.error_code,
      started_at = CASE
        WHEN echo_stage_youtube_broadcasts.status IN ('ended', 'failed')
        THEN NOW()
        ELSE echo_stage_youtube_broadcasts.started_at
      END,
      ended_at = NULL,
      updated_at = NOW()
    `,
    [
      input.serverId,
      input.channelId,
      input.startedByUserId,
      input.youtubeLinkUserId,
      input.youtubeBroadcastId,
      input.youtubeStreamId,
      input.livekitEgressId,
      input.status,
      input.privacyStatus,
      input.title,
      input.watchUrl,
      input.errorCode ?? null,
    ],
  );
}

export async function updateStageYoutubeBroadcastStatus(
  pool: Pool,
  serverId: string,
  channelId: string,
  input: {
    status: StageYoutubeBroadcastStatus;
    livekitEgressId?: string | null;
    watchUrl?: string | null;
    errorCode?: string | null;
    ended?: boolean;
  },
): Promise<void> {
  await pool.query(
    `
    UPDATE echo_stage_youtube_broadcasts SET
      status = $3,
      livekit_egress_id = COALESCE($4, livekit_egress_id),
      watch_url = COALESCE($5, watch_url),
      error_code = $6,
      ended_at = CASE WHEN $7 THEN NOW() ELSE ended_at END,
      updated_at = NOW()
    WHERE server_id = $1 AND channel_id = $2
    `,
    [
      serverId,
      channelId,
      input.status,
      input.livekitEgressId ?? null,
      input.watchUrl ?? null,
      input.errorCode ?? null,
      Boolean(input.ended),
    ],
  );
}

export async function clearStageYoutubeBroadcast(
  pool: Pool,
  serverId: string,
  channelId: string,
): Promise<void> {
  await pool.query(
    `DELETE FROM echo_stage_youtube_broadcasts WHERE server_id = $1 AND channel_id = $2`,
    [serverId, channelId],
  );
}

const ACTIVE_YOUTUBE_STATUSES = ['starting', 'live', 'stopping'] as const;

export async function listActiveStageYoutubeBroadcastsForLinkUser(
  pool: Pool,
  youtubeLinkUserId: string,
): Promise<StageYoutubeBroadcastRow[]> {
  const r = await pool.query(
    `
    SELECT * FROM echo_stage_youtube_broadcasts
    WHERE youtube_link_user_id = $1
      AND status = ANY($2::text[])
    `,
    [youtubeLinkUserId, ACTIVE_YOUTUBE_STATUSES],
  );
  return r.rows.map((row) => rowFromDb(row as Record<string, unknown>));
}

/**
 * Reserves the stage slot for a new go-live attempt. Returns false if already active.
 */
export async function tryClaimStageYoutubeBroadcastStart(
  pool: Pool,
  input: {
    serverId: string;
    channelId: string;
    startedByUserId: string;
    youtubeLinkUserId: string;
    privacyStatus: 'public' | 'unlisted' | 'private';
    title: string;
  },
): Promise<boolean> {
  const r = await pool.query(
    `
    INSERT INTO echo_stage_youtube_broadcasts (
      server_id, channel_id, started_by_user_id, youtube_link_user_id,
      youtube_broadcast_id, youtube_stream_id, livekit_egress_id, status,
      privacy_status, title, watch_url, error_code, started_at, ended_at, updated_at
    )
    VALUES ($1, $2, $3, $4, '', '', NULL, 'starting', $5, $6, NULL, NULL, NOW(), NULL, NOW())
    ON CONFLICT (server_id, channel_id) DO UPDATE SET
      started_by_user_id = EXCLUDED.started_by_user_id,
      youtube_link_user_id = EXCLUDED.youtube_link_user_id,
      youtube_broadcast_id = '',
      youtube_stream_id = '',
      livekit_egress_id = NULL,
      status = 'starting',
      privacy_status = EXCLUDED.privacy_status,
      title = EXCLUDED.title,
      watch_url = NULL,
      error_code = NULL,
      started_at = NOW(),
      ended_at = NULL,
      updated_at = NOW()
    WHERE echo_stage_youtube_broadcasts.status NOT IN ('starting', 'live', 'stopping')
    RETURNING server_id
    `,
    [
      input.serverId,
      input.channelId,
      input.startedByUserId,
      input.youtubeLinkUserId,
      input.privacyStatus,
      input.title,
    ],
  );
  return (r.rowCount ?? 0) > 0;
}
