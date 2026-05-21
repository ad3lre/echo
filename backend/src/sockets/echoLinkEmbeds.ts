import type { FastifyBaseLogger } from 'fastify';
import type pg from 'pg';
import type { Server } from 'socket.io';
import { buildLinkEmbedsFromPlainText } from '../services/linkUnfurl/linkUnfurl';
import {
  getEchoChannelServerId,
  getEffectiveChannelPermissions,
  updateEchoMessageEmbeds,
} from '../domain/echoStore';
import { broadcastToEchoChannel } from './channelBroadcast';

/**
 * Resolves Open Graph metadata for URLs in `content`, persists link embeds on the message row,
 * and notifies the channel room (including empty `embeds` after an edit that removed links).
 */
export async function resolveAndBroadcastLinkEmbeds(
  pool: pg.Pool,
  io: Server,
  log: FastifyBaseLogger,
  opts: {
    channelId: string;
    messageId: string;
    authorId: string;
    content: string;
    contentJson?: unknown;
    correlationId?: string;
  },
): Promise<void> {
  const { channelId, messageId, authorId, content, contentJson, correlationId } =
    opts;
  try {
    const serverId = await getEchoChannelServerId(pool, channelId);
    if (!serverId) return;
    const perms = await getEffectiveChannelPermissions(
      pool,
      serverId,
      authorId,
      channelId,
    );
    const allow = perms.has('EMBED_LINKS');
    const embeds = await buildLinkEmbedsFromPlainText(content, {
      allow,
      maxUrls: 2,
      budgetMs: 5000,
      pool,
      embedViewerUserId: authorId,
      contentJson,
    });
    await updateEchoMessageEmbeds(
      pool,
      channelId,
      messageId,
      embeds.length ? embeds : null,
    );
    broadcastToEchoChannel(io, channelId, 'message:embeds', {
      channelId,
      messageId,
      embeds,
    });
    log.debug(
      {
        msg: 'echo.message_embeds',
        correlationId,
        channelId,
        messageId,
        count: embeds.length,
      },
      'link embeds resolved',
    );
  } catch (e) {
    log.warn(
      {
        err: e,
        msg: 'echo.message_embeds_failed',
        correlationId,
        channelId,
        messageId,
      },
      'link embeds failed',
    );
  }
}
