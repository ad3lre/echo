import type { Server } from 'socket.io';
import { echoGatewayFanoutDurationSeconds } from '../observability/echoHotPathMetrics';
import {
  emitToAuthorizedLocalChannelSockets,
  publishEchoChannelFanout,
} from './channelFanoutTransport';

/** Authorize and fan out a channel event locally and across NATS nodes. */
export function broadcastToEchoChannel(
  io: Server,
  channelId: string,
  event: string,
  payload: unknown,
): void {
  void (async () => {
    const end = echoGatewayFanoutDurationSeconds.startTimer({ event });
    try {
      await emitToAuthorizedLocalChannelSockets(io, channelId, event, payload);
      publishEchoChannelFanout(io, channelId, event, payload);
    } finally {
      end();
    }
  })().catch(() => {
    // Authorization and transport failures fail closed.
  });
}
