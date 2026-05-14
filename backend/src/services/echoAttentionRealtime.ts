import type { FastifyBaseLogger } from 'fastify';
import type pg from 'pg';
import type { Server } from 'socket.io';
import type { EchoAttentionChannelSummary } from '../../../shared/types';
import { buildEchoAttentionSnapshot } from '../domain/echoStore';

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
): Promise<void> {
  const seen = new Set<string>();
  for (const userId of userIds) {
    const trimmed = userId.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    try {
      await emitEchoAttentionSnapshotForUser(pool, io, trimmed);
    } catch (err) {
      log?.error({ err, userId: trimmed }, 'emit attention snapshot failed');
    }
  }
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
