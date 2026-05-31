import type {
  FastifyInstance,
  FastifyPluginOptions,
  FastifyRequest,
  FastifyReply,
} from 'fastify';
import {
  requireBotAuth,
  getBotInstalledGuildIds,
  getBotInstallerUserId,
} from '../botAuth';
import {
  serializeMessage,
  serializeUser,
  serializeBotUser,
} from '../serializers';
import { getEchoStore } from '../../../../domain/echoStore/bootstrap';
import { getAuthStore } from '../../../../auth/store';
import {
  listEchoMessages,
  getEchoMessageById,
  persistAddEchoMessageReaction,
  persistRemoveEchoMessageReaction,
  isEchoServerOwner,
} from '../../../../domain/echoStore';
import { nextEchoSnowflakeId } from '../../../../domain/echoSnowflake';
import { insertEchoMessage } from '../../../../domain/echoStore';
import {
  editEchoMessageAndBroadcast,
  deleteEchoMessageAndBroadcast,
} from '../../../../services/echoMessageEditDeleteOps';
import type { Server } from 'socket.io';
import { getEffectiveChannelPermissions } from '../../../../domain/echoStore/permissions';
import { loadDiscordApiAuthorsByIds } from './userBatch';

function discordError(reply: FastifyReply, status: number, message: string) {
  return reply.code(status).send({ code: 0, message });
}

function getIo(fastify: FastifyInstance): Server | null {
  return (fastify as FastifyInstance & { io?: Server }).io ?? null;
}

/**
 * Verify the bot has access to the channel by checking its guild install and permissions.
 * Returns the guildId and installerId if access is granted, or emits a 403 and returns null.
 */
async function assertBotChannelAccess(
  botId: string,
  channelId: string,
  permission: import('../../../../domain/echoPermissionPrimitives').EchoPermission,
  reply: FastifyReply,
): Promise<{ guildId: string; installerId: string } | null> {
  const { pool, enabled } = await getEchoStore();
  if (!enabled || !pool) {
    discordError(reply, 503, '503: Service Unavailable');
    return null;
  }
  const r = await pool.query(
    `SELECT server_id FROM echo_channels WHERE id = $1`,
    [channelId],
  );
  if (r.rows.length === 0) {
    discordError(reply, 404, '404: Unknown Channel');
    return null;
  }
  const guildId = String(r.rows[0].server_id ?? '');
  const installedGuilds = await getBotInstalledGuildIds(botId);
  if (!installedGuilds.includes(guildId)) {
    discordError(reply, 403, '403: Missing Access');
    return null;
  }

  const installerId = await getBotInstallerUserId(botId, guildId);
  if (!installerId) {
    discordError(reply, 403, '403: Missing Access (No Installer)');
    return null;
  }

  const isOwner = await isEchoServerOwner(pool, guildId, installerId);
  if (isOwner) return { guildId, installerId };

  const perms = await getEffectiveChannelPermissions(
    pool,
    guildId,
    installerId,
    channelId,
  );
  if (!perms.has(permission)) {
    discordError(reply, 403, `403: Missing Permissions (${permission})`);
    return null;
  }

  return { guildId, installerId };
}

export default async function discordMessagesRoutes(
  fastify: FastifyInstance,
  _opts: FastifyPluginOptions,
): Promise<void> {
  /** GET /channels/:channelId/messages */
  fastify.get<{
    Params: { channelId: string };
    Querystring: {
      limit?: string;
      before?: string;
      after?: string;
      around?: string;
    };
  }>(
    '/channels/:channelId/messages',
    { preHandler: [requireBotAuth] },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const channelId = (req.params as { channelId: string }).channelId.trim();
      const access = await assertBotChannelAccess(
        req.botApp!.id,
        channelId,
        'VIEW_CHANNEL',
        reply,
      );
      if (!access) return;

      const { pool } = await getEchoStore();
      if (!pool) return discordError(reply, 503, '503: Service Unavailable');

      const qs = req.query as {
        limit?: string;
        before?: string;
        after?: string;
        around?: string;
      };
      const limit = Math.min(
        100,
        Math.max(1, parseInt(qs.limit ?? '50', 10) || 50),
      );

      const messages = await listEchoMessages(pool, channelId, {
        limit,
        before: qs.before?.trim(),
      });

      const authorIds = [...new Set(messages.map((m) => m.authorId))];
      const authorMap = await loadDiscordApiAuthorsByIds(pool, authorIds);

      const serialized = messages.map((msg) => {
        const author =
          authorMap.get(msg.authorId) ??
          serializeUser({
            id: msg.authorId,
            username: msg.authorDisplayName ?? 'Unknown',
            displayName: msg.authorDisplayName,
            pfp: msg.authorAvatar,
          });
        return serializeMessage(msg, author);
      });

      return reply.code(200).send(serialized);
    },
  );

  /** GET /channels/:channelId/messages/:messageId */
  fastify.get<{ Params: { channelId: string; messageId: string } }>(
    '/channels/:channelId/messages/:messageId',
    { preHandler: [requireBotAuth] },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const { channelId, messageId } = req.params as {
        channelId: string;
        messageId: string;
      };
      const access = await assertBotChannelAccess(
        req.botApp!.id,
        channelId,
        'VIEW_CHANNEL',
        reply,
      );
      if (!access) return;

      const { pool } = await getEchoStore();
      if (!pool) return discordError(reply, 503, '503: Service Unavailable');

      const msg = await getEchoMessageById(pool, messageId.trim());
      if (!msg || msg.channelId !== channelId) {
        return discordError(reply, 404, '404: Unknown Message');
      }

      const { store } = await getAuthStore();
      const user = await store.getUserById(msg.authorId);
      const author = user
        ? serializeUser({
            id: user.id,
            username: user.username,
            displayName: user.displayName,
            pfp: user.pfp,
          })
        : serializeUser({
            id: msg.authorId,
            username: msg.authorDisplayName ?? 'Unknown',
            displayName: msg.authorDisplayName,
            pfp: msg.authorAvatar,
          });

      return reply.code(200).send(serializeMessage(msg, author));
    },
  );

  /** POST /channels/:channelId/messages */
  fastify.post<{
    Params: { channelId: string };
    Body: { content?: string; tts?: boolean };
  }>(
    '/channels/:channelId/messages',
    { preHandler: [requireBotAuth] },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const channelId = (req.params as { channelId: string }).channelId.trim();
      const access = await assertBotChannelAccess(
        req.botApp!.id,
        channelId,
        'SEND_MESSAGES',
        reply,
      );
      if (!access) return;

      const body = req.body as { content?: string };
      const content =
        typeof body?.content === 'string'
          ? body.content.trim().slice(0, 4000)
          : '';
      if (!content) {
        return discordError(
          reply,
          400,
          '400: Invalid Form Body - content is required',
        );
      }

      const { pool } = await getEchoStore();
      if (!pool) return discordError(reply, 503, '503: Service Unavailable');

      const botUserId = req.botApp!.id;
      const messageId = nextEchoSnowflakeId();

      await insertEchoMessage(pool, {
        id: messageId,
        channelId,
        authorId: botUserId,
        content,
        messageFormatVersion: 1,
      });

      const io = getIo(fastify);
      if (io) {
        io.to(channelId).emit('message', {
          id: messageId,
          channelId,
          authorId: botUserId,
          content,
          timestamp: new Date().toISOString(),
          authorDisplayName: req.botApp!.name,
        });
      }

      const author = serializeBotUser(req.botApp!);
      return reply.code(200).send({
        id: messageId,
        channel_id: channelId,
        author,
        content,
        timestamp: new Date().toISOString(),
        edited_timestamp: null,
        tts: false,
        mention_everyone: false,
        mentions: [],
        mention_roles: [],
        attachments: [],
        embeds: [],
        reactions: [],
        pinned: false,
        type: 0,
      });
    },
  );

  /** PATCH /channels/:channelId/messages/:messageId */
  fastify.patch<{
    Params: { channelId: string; messageId: string };
    Body: { content?: string };
  }>(
    '/channels/:channelId/messages/:messageId',
    { preHandler: [requireBotAuth] },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const { channelId, messageId } = req.params as {
        channelId: string;
        messageId: string;
      };
      const access = await assertBotChannelAccess(
        req.botApp!.id,
        channelId,
        'SEND_MESSAGES',
        reply,
      );
      if (!access) return;

      const body = req.body as { content?: string };
      const content =
        typeof body?.content === 'string'
          ? body.content.trim().slice(0, 4000)
          : '';
      if (!content) {
        return discordError(
          reply,
          400,
          '400: Invalid Form Body - content is required',
        );
      }

      const { pool } = await getEchoStore();
      if (!pool) return discordError(reply, 503, '503: Service Unavailable');

      const io = getIo(fastify);
      if (!io) return discordError(reply, 503, '503: Service Unavailable');

      const result = await editEchoMessageAndBroadcast(
        pool,
        io,
        fastify.log,
        channelId.trim(),
        messageId.trim(),
        access.installerId,
        { kind: 'legacy', content },
      );

      if (result === 'not_found')
        return discordError(reply, 404, '404: Unknown Message');
      if (result === 'forbidden')
        return discordError(reply, 403, '403: Missing Permissions');

      const msg = await getEchoMessageById(pool, messageId.trim());
      if (!msg) return discordError(reply, 404, '404: Unknown Message');

      const author = serializeBotUser(req.botApp!);
      return reply.code(200).send(serializeMessage(msg, author));
    },
  );

  /** DELETE /channels/:channelId/messages/:messageId */
  fastify.delete<{ Params: { channelId: string; messageId: string } }>(
    '/channels/:channelId/messages/:messageId',
    { preHandler: [requireBotAuth] },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const { channelId, messageId } = req.params as {
        channelId: string;
        messageId: string;
      };
      const access = await assertBotChannelAccess(
        req.botApp!.id,
        channelId,
        'MANAGE_MESSAGES',
        reply,
      );
      if (!access) return;

      const { pool } = await getEchoStore();
      if (!pool) return discordError(reply, 503, '503: Service Unavailable');

      const io = getIo(fastify);
      if (!io) return discordError(reply, 503, '503: Service Unavailable');

      const result = await deleteEchoMessageAndBroadcast(
        pool,
        io,
        channelId.trim(),
        messageId.trim(),
        access.installerId,
        true,
      );

      if (result === 'not_found')
        return discordError(reply, 404, '404: Unknown Message');
      if (result === 'forbidden')
        return discordError(reply, 403, '403: Missing Permissions');

      return reply.code(204).send();
    },
  );

  /** PUT /channels/:channelId/messages/:messageId/reactions/:emoji/@me */
  fastify.put<{
    Params: { channelId: string; messageId: string; emoji: string };
  }>(
    '/channels/:channelId/messages/:messageId/reactions/:emoji/@me',
    { preHandler: [requireBotAuth] },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const { channelId, messageId, emoji } = req.params as {
        channelId: string;
        messageId: string;
        emoji: string;
      };
      const access = await assertBotChannelAccess(
        req.botApp!.id,
        channelId,
        'ADD_REACTIONS',
        reply,
      );
      if (!access) return;

      const { pool } = await getEchoStore();
      if (!pool) return discordError(reply, 503, '503: Service Unavailable');

      const decodedEmoji = decodeURIComponent(emoji);
      await persistAddEchoMessageReaction(
        pool,
        req.botApp!.id,
        channelId.trim(),
        messageId.trim(),
        decodedEmoji,
      );

      return reply.code(204).send();
    },
  );

  /** DELETE /channels/:channelId/messages/:messageId/reactions/:emoji/@me */
  fastify.delete<{
    Params: { channelId: string; messageId: string; emoji: string };
  }>(
    '/channels/:channelId/messages/:messageId/reactions/:emoji/@me',
    { preHandler: [requireBotAuth] },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const { channelId, messageId, emoji } = req.params as {
        channelId: string;
        messageId: string;
        emoji: string;
      };
      const access = await assertBotChannelAccess(
        req.botApp!.id,
        channelId,
        'ADD_REACTIONS',
        reply,
      );
      if (!access) return;

      const { pool } = await getEchoStore();
      if (!pool) return discordError(reply, 503, '503: Service Unavailable');

      const decodedEmoji = decodeURIComponent(emoji);
      await persistRemoveEchoMessageReaction(
        pool,
        req.botApp!.id,
        channelId.trim(),
        messageId.trim(),
        decodedEmoji,
      );

      return reply.code(204).send();
    },
  );
}
