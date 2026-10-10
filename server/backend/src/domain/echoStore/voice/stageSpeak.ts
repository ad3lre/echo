import type pg from 'pg';
import { getEffectiveChannelPermissions } from '../roles/permissions';
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
  const inserted = await pool.query(
    `INSERT INTO echo_stage_speak_requests (server_id, channel_id, user_id)
     VALUES ($1, $2, $3)
     ON CONFLICT (server_id, channel_id, user_id) DO NOTHING
     RETURNING user_id`,
    [serverId, channelId, userId],
  );
  return inserted.rows.length > 0 ? 'ok' : 'already_requested';
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
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const pending = await client.query(
      `SELECT 1 FROM echo_stage_speak_requests
       WHERE server_id = $1 AND channel_id = $2 AND user_id = $3
       FOR UPDATE`,
      [serverId, channelId, targetUserId],
    );
    if (pending.rows.length === 0) {
      await client.query('ROLLBACK');
      return 'not_found';
    }
    if (approve) {
      // Keep the pending row locked until promotion succeeds. A concurrent
      // reject/approve waits, then observes the committed deletion.
      const mod = await applyEchoVoiceModerationAction(
        pool,
        serverId,
        actorId,
        'invite_to_speak',
        targetUserId,
        undefined,
        client,
      );
      if (mod !== 'ok') {
        await client.query('ROLLBACK');
        return mod === 'forbidden' ? 'forbidden' : 'not_found';
      }
    }
    await client.query(
      `DELETE FROM echo_stage_speak_requests
       WHERE server_id = $1 AND channel_id = $2 AND user_id = $3`,
      [serverId, channelId, targetUserId],
    );
    await client.query('COMMIT');
    return 'ok';
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}
