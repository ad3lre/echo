import { createHash } from 'crypto';
import type { FastifyRequest, FastifyReply } from 'fastify';
import { getEchoStore } from '../../../domain/echoStore/bootstrap';

export interface BotApp {
  id: string;
  name: string;
  ownerUserId: string;
}

declare module 'fastify' {
  interface FastifyRequest {
    botApp?: BotApp;
  }
}

function discordError(
  reply: FastifyReply,
  status: number,
  message: string,
): FastifyReply {
  return reply.code(status).send({ code: 0, message });
}

/**
 * Fastify preHandler that validates `Authorization: Bot <token>` against
 * `echo_bot_applications.token_hash`. On success, attaches `req.botApp`.
 */
export async function requireBotAuth(
  req: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const header = req.headers.authorization;
  if (!header || typeof header !== 'string' || !header.startsWith('Bot ')) {
    discordError(reply, 401, '401: Unauthorized');
    return;
  }
  const token = header.slice('Bot '.length).trim();
  if (!token) {
    discordError(reply, 401, '401: Unauthorized');
    return;
  }

  const tokenHash = createHash('sha256').update(token).digest('hex');

  const { pool, enabled } = await getEchoStore();
  if (!enabled || !pool) {
    discordError(reply, 503, '503: Service Unavailable');
    return;
  }

  const r = await pool.query(
    `SELECT id, name, owner_user_id FROM echo_bot_applications WHERE token_hash = $1`,
    [tokenHash],
  );
  if (r.rows.length === 0) {
    discordError(reply, 401, '401: Unauthorized');
    return;
  }

  const row = r.rows[0] as Record<string, unknown>;
  req.botApp = {
    id: String(row.id),
    name: String(row.name),
    ownerUserId: String(row.owner_user_id),
  };
}

/**
 * Returns the installed guild IDs for a bot from the DB.
 */
export async function getBotInstalledGuildIds(
  botId: string,
): Promise<string[]> {
  const { pool, enabled } = await getEchoStore();
  if (!enabled || !pool) return [];
  const r = await pool.query(
    `SELECT guild_id FROM echo_bot_guild_installs WHERE bot_id = $1`,
    [botId],
  );
  return r.rows.map((row: Record<string, unknown>) => String(row.guild_id));
}

/**
 * Returns the user ID who installed the bot to a guild.
 */
export async function getBotInstallerUserId(
  botId: string,
  guildId: string,
): Promise<string | null> {
  const { pool, enabled } = await getEchoStore();
  if (!enabled || !pool) return null;
  const r = await pool.query(
    `SELECT installed_by_user_id FROM echo_bot_guild_installs WHERE bot_id = $1 AND guild_id = $2`,
    [botId, guildId],
  );
  if (r.rows.length === 0) return null;
  return r.rows[0].installed_by_user_id
    ? String(r.rows[0].installed_by_user_id)
    : null;
}
