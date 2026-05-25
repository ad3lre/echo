import type { FastifyInstance, FastifyBaseLogger } from 'fastify';
import type pg from 'pg';
import type { BannedWordActionKind } from '../../../shared/types/bannedWords';
import type { BannedWordMatch } from '../domain/echoStore/bannedWords/matcher';
import { softDeleteEchoMessageSql } from '../domain/echoMessagesDal';
import { runEchoModerationActionAndBroadcast } from './echoModerationOps';
import { insertEchoAudit } from '../domain/echoStore/auditLog';
import { getOrCreateEchoDmThread } from '../domain/echoStore';
import { echoAutomodPostOwnerChannelNotice } from './echoPersistedMessageCreate';
import type { Server } from 'socket.io';

/**
 * Apply post-send actions for banned-words matches that didn't block the message
 * (e.g. delete_message, timeout, warn_dm).
 */
export async function applyBannedWordsAfterMessagePersisted(
  fastify: FastifyInstance,
  pool: pg.Pool,
  input: {
    serverId: string;
    ownerActorId: string;
    channelId: string;
    userId: string;
    messageId: string;
    matches: BannedWordMatch[];
    action: BannedWordActionKind;
    log: FastifyBaseLogger;
  },
): Promise<void> {
  const { action } = input;

  try {
    if (action === 'delete_message') {
      const io = (fastify as FastifyInstance & { io?: Server }).io;
      await softDeleteEchoMessageSql(pool, input.channelId, input.messageId);
      if (io) {
        const { broadcastToEchoChannel } =
          await import('../sockets/channelBroadcast');
        broadcastToEchoChannel(io, input.channelId, 'message:deleted', {
          channelId: input.channelId,
          messageId: input.messageId,
        });
      }
    }

    if (action === 'timeout_5m' || action === 'timeout_60m') {
      const minutes = action === 'timeout_5m' ? 5 : 60;
      await runEchoModerationActionAndBroadcast(
        fastify,
        pool,
        input.serverId,
        input.ownerActorId,
        'timeout',
        input.userId,
        { timeoutMinutes: minutes, reason: 'Banned words filter' },
      );
    }

    if (action === 'warn_dm') {
      const words = input.matches.map((m) => m.word).join(', ');
      const text = `Your message in this server contained words that are not allowed: ${words}. Please keep the conversation respectful.`;
      const dm = await getOrCreateEchoDmThread(
        pool,
        input.ownerActorId,
        input.userId,
      );
      if (dm.ok) {
        const io = (fastify as FastifyInstance & { io?: Server }).io;
        await echoAutomodPostOwnerChannelNotice(pool, io, input.log, {
          guildServerId: input.serverId,
          targetChannelId: dm.channelId,
          ownerActorId: input.ownerActorId,
          content: `[Word Filter] ${text}`,
          correlationId: `bw-${input.messageId}`,
        });
      }
    }
  } catch (e) {
    input.log.error(
      {
        err: e,
        msg: 'echo.banned_words.action_failed',
        serverId: input.serverId,
        userId: input.userId,
        action,
      },
      'Banned-words action failed',
    );
  }

  await insertEchoAudit(
    pool,
    input.serverId,
    input.ownerActorId,
    'banned_words.triggered',
    'user',
    input.userId,
    {
      messageId: input.messageId,
      channelId: input.channelId,
      action,
      matchedWords: input.matches.map((m) => m.word),
    },
  );
}
