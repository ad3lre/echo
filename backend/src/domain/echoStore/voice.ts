import type pg from 'pg';
import {
  canActorModerateTargetMember,
  getUserCommunicationTimeoutState,
  isEchoServerOwner,
  isUserBannedFromServer,
} from './access';
import { getEffectiveChannelPermissions } from './permissions';
import { type EchoPermission } from '../echoPermissionPrimitives';

async function canActorEchoVoiceMuteOrDeafenOnChannel(
  pool: pg.Pool,
  serverId: string,
  actorId: string,
  targetUserId: string,
  voiceChannelId: string,
  perm: 'MUTE_MEMBERS' | 'DEAFEN_MEMBERS',
): Promise<boolean> {
  if (actorId === targetUserId) return false;
  if (await isEchoServerOwner(pool, serverId, actorId)) return true;
  if (await isEchoServerOwner(pool, serverId, targetUserId)) return false;
  const p = await getEffectiveChannelPermissions(
    pool,
    serverId,
    actorId,
    voiceChannelId,
  );
  return p.has(perm);
}

export type EchoVoiceJoinDeniedReason =
  | 'not_found'
  | 'not_member'
  | 'banned'
  | 'timeout'
  | 'no_view_channel'
  | 'no_connect'
  | 'full';

export type EchoVoiceJoinResult =
  | { ok: true }
  | { ok: false; reason: EchoVoiceJoinDeniedReason };

export async function joinEchoVoiceChannel(
  pool: pg.Pool,
  serverId: string,
  channelId: string,
  userId: string,
): Promise<EchoVoiceJoinResult> {
  const ch = await pool.query(
    `SELECT id, type, user_limit FROM echo_channels WHERE id = $1 AND server_id = $2`,
    [channelId, serverId],
  );
  if (!ch.rows[0]) return { ok: false, reason: 'not_found' };
  if (String(ch.rows[0].type) !== 'voice')
    return { ok: false, reason: 'not_found' };
  const mem = await pool.query(
    `SELECT 1 FROM echo_server_members WHERE server_id = $1 AND user_id = $2`,
    [serverId, userId],
  );
  if (mem.rows.length === 0) return { ok: false, reason: 'not_member' };
  if (await isUserBannedFromServer(pool, serverId, userId))
    return { ok: false, reason: 'banned' };
  const timeoutState = await getUserCommunicationTimeoutState(
    pool,
    serverId,
    userId,
  );
  if (timeoutState.active) return { ok: false, reason: 'timeout' };
  const perms = await getEffectiveChannelPermissions(
    pool,
    serverId,
    userId,
    channelId,
  );
  if (!perms.has('VIEW_CHANNEL'))
    return { ok: false, reason: 'no_view_channel' };
  if (!perms.has('CONNECT')) return { ok: false, reason: 'no_connect' };

  const userLimit = Number(ch.rows[0].user_limit ?? 0);
  const modBypass = perms.has('MANAGE_ROLES') || perms.has('MANAGE_GUILD');
  if (userLimit > 0 && !modBypass) {
    const cur = await pool.query(
      `SELECT channel_id FROM echo_voice_participants WHERE server_id = $1 AND user_id = $2`,
      [serverId, userId],
    );
    const alreadyHere =
      cur.rows[0] && String(cur.rows[0].channel_id) === channelId;
    if (!alreadyHere) {
      const cnt = await pool.query(
        `SELECT COUNT(*)::int AS c FROM echo_voice_participants WHERE server_id = $1 AND channel_id = $2`,
        [serverId, channelId],
      );
      const n = Number(cnt.rows[0]?.c ?? 0);
      if (n >= userLimit) return { ok: false, reason: 'full' };
    }
  }

  await pool.query(
    `
    INSERT INTO echo_voice_participants (server_id, channel_id, user_id)
    VALUES ($1, $2, $3)
    ON CONFLICT (server_id, user_id) DO UPDATE SET channel_id = $2, joined_at = NOW()
    `,
    [serverId, channelId, userId],
  );
  return { ok: true };
}

export async function leaveEchoVoiceChannel(
  pool: pg.Pool,
  serverId: string,
  userId: string,
): Promise<void> {
  await pool.query(
    `DELETE FROM echo_voice_participants WHERE server_id = $1 AND user_id = $2`,
    [serverId, userId],
  );
}

export async function listEchoVoiceParticipants(
  pool: pg.Pool,
  serverId: string,
  channelId: string,
): Promise<string[]> {
  const r = await pool.query(
    `SELECT user_id FROM echo_voice_participants WHERE server_id = $1 AND channel_id = $2 ORDER BY joined_at ASC`,
    [serverId, channelId],
  );
  return r.rows.map((row: { user_id: unknown }) => String(row.user_id));
}

export type DeletedEchoVoiceParticipant = {
  serverId: string;
  channelId: string;
  userId: string;
};

/**
 * Removes all voice participant rows for the given users.
 *
 * This is the server-side truth cleanup: an offline user cannot remain in a VC.
 */
export async function deleteEchoVoiceParticipantsForUsers(
  pool: pg.Pool,
  userIds: string[],
): Promise<DeletedEchoVoiceParticipant[]> {
  const ids = userIds.map((x) => x.trim()).filter(Boolean);
  if (ids.length === 0) return [];
  const r = await pool.query(
    `
    DELETE FROM echo_voice_participants
    WHERE user_id = ANY($1::text[])
    RETURNING server_id, channel_id, user_id
    `,
    [ids],
  );
  return (
    r.rows as { server_id: unknown; channel_id: unknown; user_id: unknown }[]
  ).map((row) => ({
    serverId: String(row.server_id),
    channelId: String(row.channel_id),
    userId: String(row.user_id),
  }));
}

export type EchoVoiceModerationResult =
  | 'ok'
  | 'forbidden'
  | 'not_found'
  | 'invalid_body';

export type EchoVoiceModerationAction =
  | 'disconnect'
  | 'move'
  | 'server_mute'
  | 'server_unmute'
  | 'server_deafen'
  | 'server_undeafen';

export async function applyEchoVoiceModerationAction(
  pool: pg.Pool,
  serverId: string,
  actorId: string,
  action: EchoVoiceModerationAction,
  targetUserId: string,
  targetChannelId?: string,
): Promise<EchoVoiceModerationResult> {
  if (
    action === 'server_mute' ||
    action === 'server_unmute' ||
    action === 'server_deafen' ||
    action === 'server_undeafen'
  ) {
    const vp = await pool.query(
      `SELECT channel_id FROM echo_voice_participants WHERE server_id = $1 AND user_id = $2`,
      [serverId, targetUserId],
    );
    if (!vp.rows[0]) return 'not_found';
    const vch = String(vp.rows[0].channel_id);
    if (action === 'server_mute') {
      if (
        !(await canActorEchoVoiceMuteOrDeafenOnChannel(
          pool,
          serverId,
          actorId,
          targetUserId,
          vch,
          'MUTE_MEMBERS',
        ))
      )
        return 'forbidden';
      await pool.query(
        `UPDATE echo_voice_participants SET server_muted = TRUE WHERE server_id = $1 AND user_id = $2`,
        [serverId, targetUserId],
      );
      return 'ok';
    }
    if (action === 'server_unmute') {
      if (
        !(await canActorEchoVoiceMuteOrDeafenOnChannel(
          pool,
          serverId,
          actorId,
          targetUserId,
          vch,
          'MUTE_MEMBERS',
        ))
      )
        return 'forbidden';
      await pool.query(
        `UPDATE echo_voice_participants SET server_muted = FALSE WHERE server_id = $1 AND user_id = $2`,
        [serverId, targetUserId],
      );
      return 'ok';
    }
    if (action === 'server_deafen') {
      if (
        !(await canActorEchoVoiceMuteOrDeafenOnChannel(
          pool,
          serverId,
          actorId,
          targetUserId,
          vch,
          'DEAFEN_MEMBERS',
        ))
      )
        return 'forbidden';
      await pool.query(
        `UPDATE echo_voice_participants SET server_deafened = TRUE WHERE server_id = $1 AND user_id = $2`,
        [serverId, targetUserId],
      );
      return 'ok';
    }
    if (
      !(await canActorEchoVoiceMuteOrDeafenOnChannel(
        pool,
        serverId,
        actorId,
        targetUserId,
        vch,
        'DEAFEN_MEMBERS',
      ))
    )
      return 'forbidden';
    await pool.query(
      `UPDATE echo_voice_participants SET server_deafened = FALSE WHERE server_id = $1 AND user_id = $2`,
      [serverId, targetUserId],
    );
    return 'ok';
  }

  const requiredPerm: EchoPermission =
    action === 'disconnect' || action === 'move'
      ? 'MOVE_MEMBERS'
      : 'MODERATE_MEMBERS';

  if (
    !(await canActorModerateTargetMember(
      pool,
      serverId,
      actorId,
      targetUserId,
      requiredPerm,
    ))
  )
    return 'forbidden';
  if (action === 'disconnect') {
    await pool.query(
      `DELETE FROM echo_voice_participants WHERE server_id = $1 AND user_id = $2`,
      [serverId, targetUserId],
    );
    return 'ok';
  }
  if (!targetChannelId) return 'invalid_body';
  const ch = await pool.query(
    `SELECT server_id, type FROM echo_channels WHERE id = $1`,
    [targetChannelId],
  );
  if (
    !ch.rows[0] ||
    String(ch.rows[0].server_id) !== serverId ||
    String(ch.rows[0].type) !== 'voice'
  )
    return 'not_found';
  const vp = await pool.query(
    `SELECT 1 FROM echo_voice_participants WHERE server_id = $1 AND user_id = $2`,
    [serverId, targetUserId],
  );
  if (!vp.rows[0]) return 'not_found';
  const actorTargetPerms = await getEffectiveChannelPermissions(
    pool,
    serverId,
    actorId,
    targetChannelId,
  );
  if (
    !actorTargetPerms.has('VIEW_CHANNEL') ||
    !actorTargetPerms.has('CONNECT')
  ) {
    return 'forbidden';
  }
  const upd = await pool.query(
    `UPDATE echo_voice_participants SET channel_id = $1, joined_at = NOW() WHERE server_id = $2 AND user_id = $3`,
    [targetChannelId, serverId, targetUserId],
  );
  if (upd.rowCount === 0) return 'not_found';
  return 'ok';
}
