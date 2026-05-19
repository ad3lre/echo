import type { FastifyBaseLogger } from 'fastify';
import type { Server, Socket } from 'socket.io';
import type { MessageFailedCode } from '../../../shared/types';
import { getEchoStore } from '../domain/echoStore';
import { toggleEchoMessageReactionAndBroadcast } from '../services/echoMessageReactionOps';
import { echoMessageFailedTotal } from '../observability/echoMetrics';
import { getSharedSocketMessageRateLimiter } from './messageRateLimiter';

function emitFailed(
  socket: Socket,
  code: MessageFailedCode,
  extra?: { channelId?: string; detail?: string; correlationId?: string },
) {
  echoMessageFailedTotal.inc({ code });
  socket.emit('message_failed', { code, ...extra });
}

function isAnonymousSocketUser(userId: string): boolean {
  return userId.startsWith('user_');
}

export function registerMessageReactionHandler(
  socket: Socket,
  io: Server,
  log: FastifyBaseLogger,
  userId: string,
  options: { authenticated: boolean },
): void {
  const checkRate = getSharedSocketMessageRateLimiter();
  const { authenticated } = options;

  socket.on('message:reaction_toggle', (payload: unknown) => {
    void (async () => {
      const raw =
        payload && typeof payload === 'object'
          ? (payload as Record<string, unknown>)
          : {};
      const channelId =
        typeof raw.channelId === 'string' ? raw.channelId.trim() : '';
      const messageId =
        typeof raw.messageId === 'string' ? raw.messageId.trim() : '';
      const emoji = typeof raw.emoji === 'string' ? raw.emoji : '';
      const correlationId =
        typeof raw.correlationId === 'string'
          ? raw.correlationId.slice(0, 128)
          : undefined;
      if (!channelId || !messageId || !emoji.trim()) {
        log.warn({
          msg: 'echo.socket.reaction_invalid',
          correlationId,
          socketId: socket.id,
        });
        emitFailed(socket, 'VALIDATION', {
          channelId: channelId || undefined,
          detail: 'channelId, messageId, emoji required',
          ...(correlationId ? { correlationId } : {}),
        });
        return;
      }
      if (!authenticated || isAnonymousSocketUser(userId)) {
        emitFailed(socket, 'UNAUTHENTICATED', {
          channelId,
          ...(correlationId ? { correlationId } : {}),
        });
        return;
      }
      if (!checkRate(userId, channelId)) {
        emitFailed(socket, 'RATE_LIMIT', {
          channelId,
          ...(correlationId ? { correlationId } : {}),
        });
        return;
      }
      const { enabled, pool } = await getEchoStore();
      if (!enabled || !pool) {
        emitFailed(socket, 'PERSIST_FAILED', {
          channelId,
          ...(correlationId ? { correlationId } : {}),
        });
        return;
      }
      const r = await toggleEchoMessageReactionAndBroadcast(
        pool,
        io,
        userId,
        channelId,
        messageId,
        emoji,
      );
      if (!r.ok) {
        const code: MessageFailedCode =
          r.code === 'VALIDATION'
            ? 'VALIDATION'
            : r.code === 'NOT_FOUND'
              ? 'VALIDATION'
              : 'FORBIDDEN';
        emitFailed(socket, code, {
          channelId,
          detail: r.detail ?? r.code,
          ...(correlationId ? { correlationId } : {}),
        });
      }
    })();
  });
}
