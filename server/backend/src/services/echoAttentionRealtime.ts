import type { FastifyBaseLogger } from 'fastify';
import type pg from 'pg';
import type { Server } from 'socket.io';
import type { EchoAttentionChannelSummary } from '../../../../contracts/types';
import {
  buildEchoAttentionSnapshot,
  getEchoChannelServerId,
  listEchoDmParticipantUserIds,
  listEchoServerMemberUserIdsCached,
} from '../domain/echoStore';
import {
  scheduleEchoAttentionSnapshotsForUsers,
  type EchoAttentionFanoutScope,
} from './echoAttentionSnapshotScheduler';

export async function emitEchoAttentionSnapshotForUser(
  pool: pg.Pool,
  io: Server,
  userId: string,
): Promise<void> {
  const snapshot = await buildEchoAttentionSnapshot(pool, userId);
  io.to(`echo:user:${userId}`).emit('attention:update', snapshot);
}

export async function emitEchoAttentionSnapshotsForUsers(
  pool: pg.Pool,
  io: Server,
  userIds: Iterable<string>,
  log?: FastifyBaseLogger,
  scope?: EchoAttentionFanoutScope,
): Promise<void> {
  scheduleEchoAttentionSnapshotsForUsers(pool, io, userIds, log, scope);
}

export function emitEchoReadStateUpdate(
  io: Server,
  userId: string,
  channelId: string,
  lastReadMessageId: string | null,
  channelAttention?: EchoAttentionChannelSummary,
): void {
  io.to(`echo:user:${userId}`).emit('read_state:update', {
    channelId,
    lastReadMessageId,
    ...(channelAttention ? { channelAttention } : {}),
  });
}

/** Debounced channel-scoped attention deltas after message create/edit/delete activity. */
export async function emitEchoAttentionForChannelMessageActivity(
  pool: pg.Pool,
  io: Server,
  channelId: string,
  log?: FastifyBaseLogger,
): Promise<void> {
  const trimmedChannelId = channelId.trim();
  if (!trimmedChannelId) return;

  const dmParticipants = await listEchoDmParticipantUserIds(
    pool,
    trimmedChannelId,
  );
  if (dmParticipants.length > 0) {
    await emitEchoAttentionSnapshotsForUsers(pool, io, dmParticipants, log, {
      mode: 'channel',
      channelId: trimmedChannelId,
      serverId: null,
    });
    return;
  }

  const serverId = await getEchoChannelServerId(pool, trimmedChannelId);
  if (!serverId) return;

  const memberIds = await listEchoServerMemberUserIdsCached(pool, serverId);
  await emitEchoAttentionSnapshotsForUsers(pool, io, memberIds, log, {
    mode: 'channel',
    channelId: trimmedChannelId,
    serverId,
  });
}
