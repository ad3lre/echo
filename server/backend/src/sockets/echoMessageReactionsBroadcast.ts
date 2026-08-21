import type { Server } from 'socket.io';
import type { MessageReaction } from '../../../../contracts/types';
import { toMessageReactionFanoutPayload } from '../../../../contracts/messageReactionsWire';
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
    reactions: toMessageReactionFanoutPayload(reactions),
  });
}
