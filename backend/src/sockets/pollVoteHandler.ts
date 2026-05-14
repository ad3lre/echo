import type { FastifyBaseLogger } from 'fastify';
import type { Socket, Server } from 'socket.io';
import type { PollData, PollVoteFailedCode } from '../../../shared/types';
import { redactPollForViewer } from '../../../shared/types';
import { broadcastToEchoChannel } from './channelBroadcast';
import { validatePollVotePayload } from './messageValidation';
import {
  canUserPostMessage,
  getEchoStore,
  getEchoMessageById,
} from '../domain/echoStore';
import { upsertEchoPollVote } from '../domain/echoPollVotesDal';
import { getSharedSocketMessageRateLimiter } from './messageRateLimiter';

function pollEnded(endsAt?: string): boolean {
  if (!endsAt) return false;
  return Date.now() >= new Date(endsAt).getTime();
}

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

function broadcastPollUpdated(
  io: Server,
  channelId: string,
  messageId: string,
  poll: PollData,
): void {
  if (poll.anonymous !== true) {
    broadcastToEchoChannel(io, channelId, 'poll:updated', {
      channelId,
      messageId,
      poll,
    });
    return;
  }
  const room = io.sockets.adapter.rooms.get(channelId);
  if (!room || room.size === 0) return;
  for (const socketId of room) {
    const sock = io.sockets.sockets.get(socketId);
    if (!sock) continue;
    const viewerId =
      typeof sock.data.userId === 'string' ? sock.data.userId : undefined;
    const payloadPoll = redactPollForViewer(poll, viewerId);
    sock.emit('poll:updated', {
      channelId,
      messageId,
      poll: payloadPoll,
    });
  }
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

      const row = await getEchoMessageById(pool, messageId);
      if (!row || row.channelId !== channelId) {
        emitPollVoteFailed(socket, { code: 'NOT_FOUND', channelId, messageId });
        return;
      }
      if (!row.poll) {
        emitPollVoteFailed(socket, {
          code: 'NOT_FOUND',
          channelId,
          messageId,
          detail: 'Not a poll message',
        });
        return;
      }

      const canVote = await canUserPostMessage(pool, userId, channelId);
      if (!canVote) {
        emitPollVoteFailed(socket, {
          code: 'FORBIDDEN',
          channelId,
          messageId,
          detail: 'You are not allowed to interact with polls in this channel.',
        });
        return;
      }

      if (pollEnded(row.poll.endsAt)) {
        emitPollVoteFailed(socket, {
          code: 'POLL_ENDED',
          channelId,
          messageId,
        });
        return;
      }

      if (!row.poll.options.some((o) => o.id === optionId)) {
        emitPollVoteFailed(socket, {
          code: 'BAD_OPTION',
          channelId,
          messageId,
        });
        return;
      }

      try {
        await upsertEchoPollVote(pool, { messageId, userId, optionId });
      } catch (e) {
        log.error(
          {
            err: e,
            msg: 'echo.socket.poll_vote_persist_failed',
            correlationId,
            channelId,
            messageId,
          },
          'Failed to persist poll vote',
        );
        emitPollVoteFailed(socket, {
          code: 'NOT_FOUND',
          channelId,
          messageId,
          detail: 'Persist failed',
        });
        return;
      }

      const refreshed = await getEchoMessageById(pool, messageId);
      if (!refreshed?.poll) return;

      log.info({
        msg: 'echo.socket.poll_vote',
        correlationId,
        channelId,
        messageId,
        userId,
        socketId: socket.id,
      });

      broadcastPollUpdated(io, channelId, messageId, refreshed.poll);
    })();
  });
}
