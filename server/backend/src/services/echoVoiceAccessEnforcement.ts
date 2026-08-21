import type pg from 'pg';
import type { FastifyInstance } from 'fastify';
import { config } from '../config';
import {
  getEffectiveChannelPermissions,
  getUserCommunicationTimeoutState,
  isUserBannedFromServer,
} from '../domain/echoStore';
import {
  publishEchoWorkspaceEvent,
  publishVoiceRosterDelta,
} from '../platform/echoPlatformEvents';
import {
  liveKitRoomName,
  removeLiveKitParticipant,
} from './livekit/livekitAdapter';

type VoiceAccessEnforcementLogger = {
  warn: (obj: Record<string, unknown>, msg?: string) => void;
};

export type EchoVoiceAccessRemovalReason =
  | 'not_member'
  | 'banned'
  | 'timeout'
  | 'no_view_channel'
  | 'no_connect';

export type EchoVoiceAccessRemoval = {
  serverId: string;
  channelId: string;
  userId: string;
  reason: EchoVoiceAccessRemovalReason;
};

async function currentRemovalReason(
  pool: pg.Pool,
  row: { serverId: string; channelId: string; userId: string },
): Promise<EchoVoiceAccessRemovalReason | null> {
  const member = await pool.query(
    `SELECT 1 FROM echo_server_members WHERE server_id = $1 AND user_id = $2`,
    [row.serverId, row.userId],
  );
  if (member.rows.length === 0) return 'not_member';
  if (await isUserBannedFromServer(pool, row.serverId, row.userId)) {
    return 'banned';
  }
  const timeoutState = await getUserCommunicationTimeoutState(
    pool,
    row.serverId,
    row.userId,
  );
  if (timeoutState.active) return 'timeout';
  const perms = await getEffectiveChannelPermissions(
    pool,
    row.serverId,
    row.userId,
    row.channelId,
  );
  if (!perms.has('VIEW_CHANNEL')) return 'no_view_channel';
  if (!perms.has('CONNECT')) return 'no_connect';
  return null;
}

export async function removeEchoVoiceParticipantsWithoutCurrentAccess(
  pool: pg.Pool,
  opts: {
    serverId: string;
    channelId?: string;
    userId?: string;
    log?: VoiceAccessEnforcementLogger;
  },
): Promise<EchoVoiceAccessRemoval[]> {
  const serverId = opts.serverId.trim();
  const channelId = opts.channelId?.trim() ?? '';
  const userId = opts.userId?.trim() ?? '';
  if (!serverId) return [];

  const values: string[] = [serverId];
  const clauses = ['vp.server_id = $1', `ch.type IN ('voice', 'stage')`];
  if (channelId) {
    values.push(channelId);
    clauses.push(`vp.channel_id = $${values.length}`);
  }
  if (userId) {
    values.push(userId);
    clauses.push(`vp.user_id = $${values.length}`);
  }

  const participants = await pool.query<{
    server_id: string;
    channel_id: string;
    user_id: string;
  }>(
    `
    SELECT vp.server_id, vp.channel_id, vp.user_id
    FROM echo_voice_participants vp
    INNER JOIN echo_channels ch
      ON ch.server_id = vp.server_id
     AND ch.id = vp.channel_id
    WHERE ${clauses.join(' AND ')}
    ORDER BY vp.joined_at ASC
    `,
    values,
  );

  const removals: EchoVoiceAccessRemoval[] = [];
  for (const participant of participants.rows) {
    const row = {
      serverId: String(participant.server_id),
      channelId: String(participant.channel_id),
      userId: String(participant.user_id),
    };
    const reason = await currentRemovalReason(pool, row);
    if (!reason) continue;

    await pool.query(
      `
      DELETE FROM echo_stage_speak_requests
      WHERE server_id = $1 AND channel_id = $2 AND user_id = $3
      `,
      [row.serverId, row.channelId, row.userId],
    );
    const deleted = await pool.query(
      `
      DELETE FROM echo_voice_participants
      WHERE server_id = $1 AND channel_id = $2 AND user_id = $3
      RETURNING 1
      `,
      [row.serverId, row.channelId, row.userId],
    );
    if (deleted.rows.length === 0) continue;

    removals.push({ ...row, reason });
    if (config.liveKitEnabled) {
      const roomName = liveKitRoomName(row.serverId, row.channelId);
      try {
        await removeLiveKitParticipant(roomName, row.userId);
      } catch (err) {
        opts.log?.warn(
          {
            err,
            serverId: row.serverId,
            channelId: row.channelId,
            userId: row.userId,
            roomName,
            reason,
          },
          '[LiveKit] removeParticipant after voice access revocation failed',
        );
      }
    }
  }

  return removals;
}

export async function enforceAndPublishEchoVoiceAccess(
  fastify: FastifyInstance,
  pool: pg.Pool,
  opts: {
    serverId: string;
    channelId?: string;
    userId?: string;
    version: string;
  },
): Promise<EchoVoiceAccessRemoval[]> {
  const removals = await removeEchoVoiceParticipantsWithoutCurrentAccess(pool, {
    serverId: opts.serverId,
    channelId: opts.channelId,
    userId: opts.userId,
    log: fastify.log,
  });

  for (const removal of removals) {
    publishVoiceRosterDelta(
      fastify,
      removal.serverId,
      {
        channelId: removal.channelId,
        userId: removal.userId,
        action: 'disconnect',
      },
      opts.version,
    );
    publishEchoWorkspaceEvent(
      fastify,
      {
        kind: 'voice_roster_delta',
        version: opts.version,
        serverId: removal.serverId,
        voiceRosterDelta: {
          serverId: removal.serverId,
          channelId: removal.channelId,
          userId: removal.userId,
          action: 'disconnect',
          workspaceVersion: opts.version,
          occurredAt: new Date().toISOString(),
        },
      },
      { userId: removal.userId },
    );
  }

  return removals;
}
