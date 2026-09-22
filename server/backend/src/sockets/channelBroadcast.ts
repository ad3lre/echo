import type { Server } from 'socket.io';
import { echoGatewayFanoutDurationSeconds } from '../observability/echoHotPathMetrics';
import { config } from '../config';
import { getPgPool } from '../db/pg';
import { canUserAccessChannel } from '../domain/permissions/echoPermissions';

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
  void (async () => {
    const end = echoGatewayFanoutDurationSeconds.startTimer({ event });
    try {
      const pool = getPgPool();
      // In production, room membership is only an optimization. Re-check the
      // current channel permission for every recipient so a stale room cannot
      // deliver messages after a leave, ban, or permission change.
      if (!pool) {
        if (!config.isProduction) io.to(channelId).emit(event, payload);
        return;
      }
      const sockets = await io.in(channelId).fetchSockets();
      await Promise.all(
        sockets.map(async (socket) => {
          if (!socket.data?.authenticated) return;
          const userId = String(socket.data.userId ?? '').trim();
          if (!userId) return;
          if (await canUserAccessChannel(pool, userId, channelId)) {
            socket.emit(event, payload);
          }
        }),
      );
    } finally {
      end();
    }
  })().catch(() => {
    // Authorization failures fail closed; the next state refresh will repair
    // the recipient's view without leaking the payload.
  });
}
