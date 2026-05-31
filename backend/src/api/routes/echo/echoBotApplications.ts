import { randomBytes } from 'crypto';
import type {
  FastifyInstance,
  FastifyPluginOptions,
  FastifyRequest,
  FastifyReply,
} from 'fastify';
import { getAuthUser, requireAuth } from '../../../auth/middleware';
import { sendError } from '../../errors';
import { nextEchoSnowflakeId } from '../../../domain/echoSnowflake';
import {
  echoPool,
  requireEchoStore,
  trimEchoPathParam,
} from './echoRouteUtils';
import { getMergedRolePermissions } from '../../../domain/echoStore';
import { hashBotTokenForStorage } from '../../../services/botTokenHash';
import { authUserOrIpRateLimitKey } from '../../rateLimitKeys';

function generateBotToken(botId: string): string {
  const idPart = Buffer.from(botId).toString('base64url');
  const secretPart = randomBytes(32).toString('hex');
  return `Echo.${idPart}.${secretPart}`;
}

export default async function echoBotApplicationsRoutes(
  fastify: FastifyInstance,
  _opts: FastifyPluginOptions,
): Promise<void> {
  /** Create a new bot application. Token is returned only once. */
  fastify.post<{ Body: { name?: string } }>(
    '/bot-applications',
    {
      preHandler: [requireAuth, requireEchoStore],
      config: {
        rateLimit: {
          max: 10,
          timeWindow: '1 hour',
          keyGenerator: authUserOrIpRateLimitKey,
        },
      },
    },
    async (req, reply) => {
      const pool = echoPool(req);
      const name =
        typeof req.body?.name === 'string' && req.body.name.trim()
          ? req.body.name.trim().slice(0, 64)
          : '';
      if (!name) {
        return sendError(reply, 400, 'INVALID_BODY', 'name is required');
      }

      const botId = nextEchoSnowflakeId();
      const token = generateBotToken(botId);
      const tokenHash = await hashBotTokenForStorage(token);
      const ownerId = getAuthUser(req).id;

      await pool.query(
        `INSERT INTO echo_bot_applications (id, owner_user_id, name, token_hash) VALUES ($1, $2, $3, $4)`,
        [botId, ownerId, name, tokenHash],
      );

      return reply.code(201).send({
        id: botId,
        name,
        token,
        createdAt: new Date().toISOString(),
      });
    },
  );

  /** List bots owned by the authenticated user. */
  fastify.get(
    '/bot-applications',
    { preHandler: [requireAuth, requireEchoStore] },
    async (req, reply) => {
      const pool = echoPool(req);
      const r = await pool.query(
        `SELECT id, name, created_at FROM echo_bot_applications WHERE owner_user_id = $1 ORDER BY created_at ASC`,
        [getAuthUser(req).id],
      );
      return reply.code(200).send({
        bots: r.rows.map((row: Record<string, unknown>) => ({
          id: String(row.id),
          name: String(row.name),
          createdAt: (row.created_at as Date).toISOString(),
        })),
      });
    },
  );

  /** Delete / revoke a bot. Only the owner can delete it. */
  fastify.delete<{ Params: { botId: string } }>(
    '/bot-applications/:botId',
    { preHandler: [requireAuth, requireEchoStore] },
    async (req, reply) => {
      const pool = echoPool(req);
      const botId = trimEchoPathParam(req.params.botId);
      const r = await pool.query(
        `DELETE FROM echo_bot_applications WHERE id = $1 AND owner_user_id = $2`,
        [botId, getAuthUser(req).id],
      );
      if ((r.rowCount ?? 0) === 0) {
        return sendError(reply, 404, 'NOT_FOUND', 'Bot application not found');
      }
      return reply.code(204).send();
    },
  );

  /** Install bot to a server. Requires caller to have MANAGE_GUILD. */
  fastify.post<{ Params: { botId: string; guildId: string } }>(
    '/bot-applications/:botId/guilds/:guildId',
    { preHandler: [requireAuth, requireEchoStore] },
    async (req, reply) => {
      const pool = echoPool(req);
      const botId = trimEchoPathParam(req.params.botId);
      const guildId = trimEchoPathParam(req.params.guildId);
      const userId = getAuthUser(req).id;

      const botRow = await pool.query(
        `SELECT id, name, owner_user_id FROM echo_bot_applications WHERE id = $1`,
        [botId],
      );
      if (botRow.rows.length === 0) {
        return sendError(reply, 404, 'NOT_FOUND', 'Bot application not found');
      }

      if (String(botRow.rows[0].owner_user_id) !== userId) {
        return sendError(
          reply,
          403,
          'FORBIDDEN',
          'Only the bot owner can install this bot',
        );
      }

      const memberRow = await pool.query(
        `SELECT 1 FROM echo_server_members WHERE server_id = $1 AND user_id = $2`,
        [guildId, userId],
      );
      if (memberRow.rows.length === 0) {
        return sendError(
          reply,
          403,
          'FORBIDDEN',
          'You are not a member of this server',
        );
      }

      const merged = await getMergedRolePermissions(pool, guildId, userId);
      const hasManageGuild =
        merged.has('ADMINISTRATOR') || merged.has('MANAGE_GUILD');
      if (!hasManageGuild) {
        return sendError(
          reply,
          403,
          'FORBIDDEN',
          'MANAGE_GUILD permission required to install bots',
        );
      }

      await pool.query(
        `INSERT INTO echo_bot_guild_installs (bot_id, guild_id, installed_by_user_id) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
        [botId, guildId, userId],
      );

      return reply.code(204).send();
    },
  );

  /** Remove bot from a server. Owner or someone with MANAGE_GUILD can do this. */
  fastify.delete<{ Params: { botId: string; guildId: string } }>(
    '/bot-applications/:botId/guilds/:guildId',
    { preHandler: [requireAuth, requireEchoStore] },
    async (req, reply) => {
      const pool = echoPool(req);
      const botId = trimEchoPathParam(req.params.botId);
      const guildId = trimEchoPathParam(req.params.guildId);
      const userId = getAuthUser(req).id;

      const botRow = await pool.query(
        `SELECT owner_user_id FROM echo_bot_applications WHERE id = $1`,
        [botId],
      );
      if (botRow.rows.length === 0) {
        return sendError(reply, 404, 'NOT_FOUND', 'Bot application not found');
      }

      const isOwner = String(botRow.rows[0].owner_user_id) === userId;

      if (!isOwner) {
        const memberRow = await pool.query(
          `SELECT 1 FROM echo_server_members WHERE server_id = $1 AND user_id = $2`,
          [guildId, userId],
        );
        if (memberRow.rows.length === 0) {
          return sendError(
            reply,
            403,
            'FORBIDDEN',
            'You are not a member of this server',
          );
        }
        const merged = await getMergedRolePermissions(pool, guildId, userId);
        const hasManageGuild =
          merged.has('ADMINISTRATOR') || merged.has('MANAGE_GUILD');
        if (!hasManageGuild) {
          return sendError(
            reply,
            403,
            'FORBIDDEN',
            'MANAGE_GUILD permission required to remove bots',
          );
        }
      }

      await pool.query(
        `DELETE FROM echo_bot_guild_installs WHERE bot_id = $1 AND guild_id = $2`,
        [botId, guildId],
      );

      return reply.code(204).send();
    },
  );
}
