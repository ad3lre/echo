import type { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { getPgPool } from '../../db/pg';
import {
  upsertDiscordPresence,
  type DiscordPresenceRow,
} from '../../domain/discordPresenceRepo';
import { listDiscordVoiceMirrorWatchGuildIds } from '../../domain/discordVoiceMirrorRepo';
import { consumeWebhookDeliveryOnce } from '../../services/webhookReplayGuard';
import { sendError } from '../errors';
import {
  discordBotSignedWebhookPlugin,
  requireBotWebhookPostSignature,
  requireBotWebhookSecret,
  requireWebhookDeliveryId,
} from '../discordBotWebhookAuth';

export default async function discordPresenceHookRoutes(
  fastify: FastifyInstance,
  _opts: FastifyPluginOptions,
): Promise<void> {
  await fastify.register(discordBotSignedWebhookPlugin);

  fastify.get('/hooks/discord-presence/watchlist', async (req, reply) => {
    if (!requireBotWebhookSecret(req, reply)) return;
    const pool = getPgPool();
    if (!pool)
      return sendError(reply, 503, 'NOT_AVAILABLE', 'Database unavailable.');
    const guildIds = await listDiscordVoiceMirrorWatchGuildIds(pool);
    return reply.code(200).send({ guildIds });
  });

  fastify.post<{ Body: Record<string, unknown> }>(
    '/hooks/discord-presence/snapshot',
    async (req, reply) => {
      const secret = requireBotWebhookSecret(req, reply);
      if (!secret) return;
      if (!requireBotWebhookPostSignature(req, reply, secret)) return;
      const deliveryId = requireWebhookDeliveryId(req, reply);
      if (!deliveryId) return;
      const firstDelivery = await consumeWebhookDeliveryOnce(
        'discord-presence-snapshot',
        deliveryId,
      );
      if (!firstDelivery) {
        return sendError(
          reply,
          409,
          'WEBHOOK_REPLAYED',
          'Webhook delivery already processed',
        );
      }

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

      const results = await Promise.allSettled(
        presences.map((p) => upsertDiscordPresence(pool, p)),
      );

      const succeeded = results.filter((r) => r.status === 'fulfilled').length;
      const failed = results.filter((r) => r.status === 'rejected').length;

      if (failed > 0) {
        req.log.warn(
          { failed, total: presences.length, discordGuildId },
          'discord_presence_hook partial upsert failure',
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
