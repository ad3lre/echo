import type { Server } from 'socket.io';
import { echoGatewayFanoutDurationSeconds } from '../observability/echoHotPathMetrics';

/**
 * Single place for Echo channel room broadcasts (prepares for Redis / multi-node adapter).
 * All persisted chat side-effects should use this instead of `io.to(id).emit` directly.
 *
 * Timed under {@link echoGatewayFanoutDurationSeconds}: with the in-process adapter this is
 * the local emit cost; with the NATS adapter it also covers the cross-node publish.
 */
export function broadcastToEchoChannel(
  io: Server,
  channelId: string,
  event: string,
  payload: unknown,
): void {
  const end = echoGatewayFanoutDurationSeconds.startTimer({ event });
  try {
    io.to(channelId).emit(event, payload);
  } finally {
    end();
  }
}
