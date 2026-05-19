import type { Server } from 'socket.io';
import type pg from 'pg';
import { broadcastToEchoChannel } from './channelBroadcast';
import { listPinnedMessageIdsForChannel } from '../domain/echoStore/channelPinsPersistence';

export async function broadcastEchoChannelPinsSnapshot(
  pool: pg.Pool,
  io: Server,
  channelId: string,
): Promise<void> {
  const messageIds = await listPinnedMessageIdsForChannel(pool, channelId);
  broadcastToEchoChannel(io, channelId, 'message:pins', {
    channelId,
    messageIds,
  });
}
