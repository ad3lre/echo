import type { FastifyBaseLogger } from 'fastify';
import type { Server, Socket } from 'socket.io';
import type { MessageFailedCode } from '../../../shared/types';
import { getEchoStore } from '../domain/echoStore';
import {
  addEchoChannelPinAndBroadcast,
  removeEchoChannelPinAndBroadcast,
} from '../services/echoChannelPinsOps';
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

export function registerMessagePinHandler(
  socket: Socket,
  io: Server,
  log: FastifyBaseLogger,
  userId: string,
  options: { authenticated: boolean },
): void {
  const checkRate = getSharedSocketMessageRateLimiter();
  const { authenticated } = options;

  const run = async (
    kind: 'pin' | 'unpin',
    payload: unknown,
  ): Promise<void> => {
    const raw =
      payload && typeof payload === 'object'
        ? (payload as Record<string, unknown>)
        : {};
    const channelId =
      typeof raw.channelId === 'string' ? raw.channelId.trim() : '';
    const messageId =
      typeof raw.messageId === 'string' ? raw.messageId.trim() : '';
    const correlationId =
      typeof raw.correlationId === 'string'
        ? raw.correlationId.slice(0, 128)
        : undefined;
    const fail = (
      code: MessageFailedCode,
      extra?: { channelId?: string; detail?: string },
    ) =>
      emitFailed(socket, code, {
        ...extra,
        ...(correlationId ? { correlationId } : {}),
      });
    if (!channelId || !messageId) {
      log.warn({
        msg: 'echo.socket.pin_invalid',
        kind,
        correlationId,
        socketId: socket.id,
      });
      fail('VALIDATION', {
        channelId: channelId || undefined,
        detail: 'channelId and messageId required',
      });
      return;
    }
    if (!authenticated || isAnonymousSocketUser(userId)) {
      fail('UNAUTHENTICATED', { channelId });
      return;
    }
    if (!checkRate(userId, channelId)) {
      fail('RATE_LIMIT', { channelId });
      return;
    }
    const { enabled, pool } = await getEchoStore();
    if (!enabled || !pool) {
      fail('PERSIST_FAILED', { channelId });
      return;
    }
    const r =
      kind === 'pin'
        ? await addEchoChannelPinAndBroadcast(
            pool,
            io,
            userId,
            channelId,
            messageId,
          )
        : await removeEchoChannelPinAndBroadcast(
            pool,
            io,
            userId,
            channelId,
            messageId,
          );
    if (!r.ok) {
      const code: MessageFailedCode =
        r.code === 'VALIDATION'
          ? 'VALIDATION'
          : r.code === 'NOT_FOUND'
            ? 'VALIDATION'
            : 'FORBIDDEN';
      fail(code, { channelId, detail: r.detail ?? r.code });
    }
  };

  socket.on('message:pin', (payload: unknown) => {
    void run('pin', payload);
  });

  socket.on('message:unpin', (payload: unknown) => {
    void run('unpin', payload);
  });
}
