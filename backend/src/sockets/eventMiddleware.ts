import type { FastifyBaseLogger } from 'fastify';
import type { Socket } from 'socket.io';
import { config } from '../config';
import { enterPgQueryContext } from '../db/pgQueryContext';

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
  'client:ping',
]);

/** High-frequency events: sample info logs to reduce log-amplification abuse. */
const HIGH_FREQUENCY_EVENTS = new Set([
  'presence:heartbeat',
  'presence:set',
  'message:reaction_toggle',
  'client:ping',
]);

const HIGH_FREQUENCY_LOG_SAMPLE_RATE = 0.02;

export function attachSocketEventLogger(
  socket: Socket,
  log: FastifyBaseLogger,
): void {
  const maxPerSec = config.echoSocketMaxEventsPerSecond;
  const windowMs = 1000;
  const timestamps: number[] = [];

  socket.use((packet, next) => {
    const event = packet[0];
    if (typeof event === 'string') {
      enterPgQueryContext({
        scope: 'socket',
        label: event.slice(0, 64) || 'unknown',
      });
    } else {
      enterPgQueryContext({ scope: 'socket', label: 'unknown' });
    }
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

    const shouldLogInfo =
      typeof event !== 'string' ||
      !HIGH_FREQUENCY_EVENTS.has(event) ||
      Math.random() < HIGH_FREQUENCY_LOG_SAMPLE_RATE;
    if (shouldLogInfo) {
      log.info(
        { socketId: socket.id, event, msg: 'echo.socket.packet' },
        'Socket event received',
      );
    } else {
      log.debug(
        { socketId: socket.id, event, msg: 'echo.socket.packet' },
        'Socket event received (sampled)',
      );
    }
    next();
  });
}
