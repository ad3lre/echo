import type pg from 'pg';
import { getEffectiveChannelPermissions } from './permissions';
import { getEchoChannelType } from './voice';
import { applyEchoVoiceModerationAction } from './voice';

export type StageSpeakRequestResult =
  | 'ok'
  | 'forbidden'
  | 'not_found'
  | 'invalid_body'
  | 'already_speaker'
  | 'already_requested';

export async function requestEchoStageSpeak(
  pool: pg.Pool,
  serverId: string,
  channelId: string,
  userId: string,
): Promise<StageSpeakRequestResult> {
  if ((await getEchoChannelType(pool, serverId, channelId)) !== 'stage')
    return 'not_found';
  const perms = await getEffectiveChannelPermissions(
    pool,
    serverId,
    userId,
    channelId,
  );
  if (!perms.has('REQUEST_TO_SPEAK')) return 'forbidden';
  const vp = await pool.query(
    `SELECT channel_id, stage_speaker FROM echo_voice_participants
     WHERE server_id = $1 AND user_id = $2`,
    [serverId, userId],
  );
  if (!vp.rows[0] || String(vp.rows[0].channel_id) !== channelId)
    return 'not_found';
  if (vp.rows[0].stage_speaker) return 'already_speaker';
  const existing = await pool.query(
    `SELECT 1 FROM echo_stage_speak_requests
     WHERE server_id = $1 AND channel_id = $2 AND user_id = $3`,
    [serverId, channelId, userId],
  );
  if (existing.rows.length > 0) return 'already_requested';
  await pool.query(
    `INSERT INTO echo_stage_speak_requests (server_id, channel_id, user_id)
     VALUES ($1, $2, $3)`,
    [serverId, channelId, userId],
  );
  return 'ok';
}

export async function cancelEchoStageSpeakRequest(
  pool: pg.Pool,
  serverId: string,
  channelId: string,
  userId: string,
): Promise<StageSpeakRequestResult> {
  const r = await pool.query(
    `DELETE FROM echo_stage_speak_requests
     WHERE server_id = $1 AND channel_id = $2 AND user_id = $3`,
    [serverId, channelId, userId],
  );
  return r.rowCount && r.rowCount > 0 ? 'ok' : 'not_found';
}

export async function listEchoStageSpeakRequests(
  pool: pg.Pool,
  serverId: string,
  channelId: string,
): Promise<string[]> {
  const r = await pool.query(
    `SELECT user_id FROM echo_stage_speak_requests
     WHERE server_id = $1 AND channel_id = $2
     ORDER BY requested_at ASC`,
    [serverId, channelId],
  );
  return r.rows.map((row: { user_id: unknown }) => String(row.user_id));
}

export async function resolveEchoStageSpeakRequest(
  pool: pg.Pool,
  serverId: string,
  channelId: string,
  actorId: string,
  targetUserId: string,
  approve: boolean,
): Promise<StageSpeakRequestResult> {
  if ((await getEchoChannelType(pool, serverId, channelId)) !== 'stage')
    return 'not_found';
  const pending = await pool.query(
    `SELECT 1 FROM echo_stage_speak_requests
     WHERE server_id = $1 AND channel_id = $2 AND user_id = $3`,
    [serverId, channelId, targetUserId],
  );
  if (pending.rows.length === 0) return 'not_found';
  if (approve) {
    const mod = await applyEchoVoiceModerationAction(
      pool,
      serverId,
      actorId,
      'invite_to_speak',
      targetUserId,
    );
    if (mod !== 'ok') return mod === 'forbidden' ? 'forbidden' : 'not_found';
  }
  await pool.query(
    `DELETE FROM echo_stage_speak_requests
     WHERE server_id = $1 AND channel_id = $2 AND user_id = $3`,
    [serverId, channelId, targetUserId],
  );
  return 'ok';
}
