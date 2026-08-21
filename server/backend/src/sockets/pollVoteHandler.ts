import type { FastifyBaseLogger } from 'fastify';
import type { Socket, Server } from 'socket.io';
import type { PollVoteFailedCode } from '../../../../contracts/types';
import { validatePollVotePayload } from './messageValidation';
import { getEchoStore } from '../domain/echoStore';
import { getSharedSocketMessageRateLimiter } from './messageRateLimiter';
import { castEchoPollVoteAndBroadcast } from '../services/echoPollVoteOps';

function emitPollVoteFailed(
  socket: Socket,
  payload: {
    code: PollVoteFailedCode;
    channelId?: string;
    messageId?: string;
    detail?: string;
  },
): void {
  socket.emit('poll:vote_failed', payload);
}

function isAnonymousSocketUser(userId: string): boolean {
  return userId.startsWith('user_');
}

export function registerPollVoteHandler(
  socket: Socket,
  io: Server,
  log: FastifyBaseLogger,
  userId: string,
  options: { authenticated: boolean },
): void {
  const checkRate = getSharedSocketMessageRateLimiter();
  const { authenticated } = options;

  socket.on('poll:vote', (payload) => {
    void (async () => {
      const parsed = validatePollVotePayload(payload);
      if (!parsed.ok) {
        emitPollVoteFailed(socket, {
          code: 'VALIDATION',
          detail: parsed.error,
        });
        return;
      }
      const { channelId, messageId, optionId, correlationId } = parsed.value;

      if (!authenticated || isAnonymousSocketUser(userId)) {
        emitPollVoteFailed(socket, {
          code: 'UNAUTHENTICATED',
          channelId,
          messageId,
        });
        return;
      }

      if (!checkRate(userId, channelId)) {
        emitPollVoteFailed(socket, {
          code: 'FORBIDDEN',
          channelId,
          messageId,
          detail: 'rate_limit',
        });
        return;
      }

      const { enabled, pool } = await getEchoStore();
      if (!enabled || !pool) {
        emitPollVoteFailed(socket, {
          code: 'NOT_FOUND',
          channelId,
          messageId,
          detail: 'Echo store disabled',
        });
        return;
      }

      const result = await castEchoPollVoteAndBroadcast(
        pool,
        io,
        userId,
        channelId,
        messageId,
        optionId,
      );
      if (!result.ok) {
        emitPollVoteFailed(socket, {
          code: result.code,
          channelId,
          messageId,
          detail: result.detail,
        });
        return;
      }

      log.info({
        msg: 'echo.socket.poll_vote',
        correlationId,
        channelId,
        messageId,
        userId,
        socketId: socket.id,
      });
    })();
  });
}
