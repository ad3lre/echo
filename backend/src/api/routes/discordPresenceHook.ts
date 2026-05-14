import type {
  FastifyInstance,
  FastifyPluginOptions,
  FastifyReply,
  FastifyRequest,
} from 'fastify';
import { config } from '../../config';
import { getPgPool } from '../../db/pg';
import {
  upsertDiscordPresence,
  type DiscordPresenceRow,
} from '../../domain/discordPresenceRepo';
import { listDiscordVoiceMirrorWatchGuildIds } from '../../domain/discordVoiceMirrorRepo';
import { sendError } from '../errors';
import { safeCompare } from '../../shared/safeCompare';

function requireBotWebhookSecret(
  req: FastifyRequest,
  reply: FastifyReply,
): boolean {
  const secret = config.echoDiscordBotWebhookSecret.trim();
  if (!secret) {
    sendError(
      reply,
      503,
      'NOT_CONFIGURED',
      'Discord bot webhook secret is not configured.',
    );
    return false;
  }
  const hdr = req.headers['x-echo-discord-bot-secret'];
  const presented = typeof hdr === 'string' ? hdr.trim() : '';
  if (!safeCompare(presented, secret)) {
    sendError(reply, 401, 'UNAUTHORIZED', 'Invalid webhook secret.');
    return false;
  }
  return true;
}

export default async function discordPresenceHookRoutes(
  fastify: FastifyInstance,
  _opts: FastifyPluginOptions,
): Promise<void> {
  /**
   * GET /hooks/discord-presence/watchlist
   * Returns the list of guild IDs that should have presence polled.
   * For now, reuses the voice mirror watchlist (guilds with Discord integration enabled).
   */
  fastify.get('/hooks/discord-presence/watchlist', async (req, reply) => {
    if (!requireBotWebhookSecret(req, reply)) return;
    const pool = getPgPool();
    if (!pool)
      return sendError(reply, 503, 'NOT_AVAILABLE', 'Database unavailable.');
    const guildIds = await listDiscordVoiceMirrorWatchGuildIds(pool);
    return reply.code(200).send({ guildIds });
  });

  /**
   * POST /hooks/discord-presence/snapshot
   * Receives batched presence snapshots from the Discord bot.
   */
  fastify.post<{ Body: Record<string, unknown> }>(
    '/hooks/discord-presence/snapshot',
    async (req, reply) => {
      if (!requireBotWebhookSecret(req, reply)) return;

      const pool = getPgPool();
      if (!pool)
        return sendError(reply, 503, 'NOT_AVAILABLE', 'Database unavailable.');

      const b = req.body && typeof req.body === 'object' ? req.body : {};
      const discordGuildId =
        typeof b.discordGuildId === 'string' ? b.discordGuildId.trim() : '';
      const guildName =
        typeof b.guildName === 'string' ? b.guildName.trim() : '';
      const snapshotAt =
        typeof b.snapshotAt === 'number' ? b.snapshotAt : Date.now();
      const rawPresences = b.presences;

      if (!discordGuildId) {
        return sendError(
          reply,
          400,
          'INVALID_BODY',
          'discordGuildId is required',
        );
      }

      if (!Array.isArray(rawPresences) || rawPresences.length === 0) {
        return reply.code(200).send({ ok: true, processed: 0 });
      }

      const presences: DiscordPresenceRow[] = [];
      for (const p of rawPresences) {
        if (!p || typeof p !== 'object') continue;
        const o = p as Record<string, unknown>;

        const discordUserId =
          typeof o.discordUserId === 'string' ? o.discordUserId.trim() : '';
        if (!discordUserId) continue;

        const activities: DiscordPresenceRow['activities'] = [];
        if (Array.isArray(o.activities)) {
          for (const a of o.activities) {
            if (!a || typeof a !== 'object') continue;
            activities.push({
              name: String(a.name ?? ''),
              type: Number(a.type ?? 0),
              details: a.details ? String(a.details) : undefined,
              state: a.state ? String(a.state) : undefined,
            });
          }
        }

        const status = String(o.status ?? 'offline');
        const isOnline = Boolean(o.isOnline ?? status !== 'offline');

        presences.push({
          discordUserId,
          discordUsername: String(o.discordUsername ?? ''),
          status: status as DiscordPresenceRow['status'],
          activities,
          isOnline,
          snapshotAt: new Date(snapshotAt),
          discordGuildId,
        });
      }

      // Upsert all presences
      const results = await Promise.allSettled(
        presences.map((p) => upsertDiscordPresence(pool, p)),
      );

      const succeeded = results.filter((r) => r.status === 'fulfilled').length;
      const failed = results.filter((r) => r.status === 'rejected').length;

      if (failed > 0) {
        console.warn(
          `[discord-presence-hook] ${failed}/${presences.length} upserts failed for guild ${discordGuildId}`,
        );
      }

      return reply.code(200).send({
        ok: true,
        processed: succeeded,
        failed,
        guildName,
      });
    },
  );
}
