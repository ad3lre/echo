import type { Server } from 'socket.io';

/**
 * Single place for Echo channel room broadcasts (prepares for Redis / multi-node adapter).
 * All persisted chat side-effects should use this instead of `io.to(id).emit` directly.
 */
export function broadcastToEchoChannel(
  io: Server,
  channelId: string,
  event: string,
  payload: unknown,
): void {
  io.to(channelId).emit(event, payload);
}
