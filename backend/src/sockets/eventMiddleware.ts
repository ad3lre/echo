import type { FastifyBaseLogger } from 'fastify';
import type { Socket } from 'socket.io';
import { config } from '../config';

const RATE_LIMITED_EVENTS = new Set([
  'message',
  'message:edit',
  'message:delete',
  'message:reaction_toggle',
  'message:pin',
  'message:unpin',
  'poll:vote',
  'presence:set',
  'presence:heartbeat',
  'joinChannel',
  'leaveChannel',
]);

export function attachSocketEventLogger(
  socket: Socket,
  log: FastifyBaseLogger,
): void {
  const maxPerSec = config.echoSocketMaxEventsPerSecond;
  const windowMs = 1000;
  const timestamps: number[] = [];

  socket.use((packet, next) => {
    const event = packet[0];
    if (typeof event === 'string' && RATE_LIMITED_EVENTS.has(event)) {
      const now = Date.now();
      const cutoff = now - windowMs;
      while (timestamps.length && timestamps[0]! < cutoff) {
        timestamps.shift();
      }
      if (timestamps.length >= maxPerSec) {
        log.warn(
          { socketId: socket.id, msg: 'echo.socket.event_flood', event },
          'Socket event flood',
        );
        return next(new Error('RATE_LIMIT'));
      }
      timestamps.push(now);
    }

    log.info(
      { socketId: socket.id, event, msg: 'echo.socket.packet' },
      'Socket event received',
    );
    next();
  });
}
