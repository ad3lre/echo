import type { Server } from 'socket.io';
import type { MessageReaction } from '../../../shared/types';
import { broadcastToEchoChannel } from './channelBroadcast';

export function broadcastEchoMessageReactionsSnapshot(
  io: Server,
  channelId: string,
  messageId: string,
  reactions: MessageReaction[],
): void {
  broadcastToEchoChannel(io, channelId, 'message:reactions', {
    channelId,
    messageId,
    reactions,
  });
}
