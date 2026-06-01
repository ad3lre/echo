import type {
  FastifyInstance,
  FastifyPluginOptions,
  FastifyReply,
  FastifyRequest,
} from 'fastify';
import { getPgPool } from '../../db/pg';
import {
  listDiscordGuildIdsWithPendingBotExport,
  markDiscordBotExportReadyForGuild,
} from '../../domain/discordBotExportPendingRepo';
import { publishEchoWorkspaceEvent } from '../../platform/echoPlatformEvents';
import { sendError } from '../errors';
import { consumeWebhookDeliveryOnce } from '../../services/webhookReplayGuard';
import {
  discordBotSignedWebhookPlugin,
  requireBotWebhookPostSignature,
  requireBotWebhookSecret,
  requireWebhookDeliveryId,
} from '../discordBotWebhookAuth';

export default async function discordBotHookRoutes(
  fastify: FastifyInstance,
  _opts: FastifyPluginOptions,
): Promise<void> {
  await fastify.register(discordBotSignedWebhookPlugin);

  fastify.get('/hooks/discord-bot/export-pending', async (req, reply) => {
    if (!requireBotWebhookSecret(req, reply)) return;
    const pool = getPgPool();
    if (!pool)
      return sendError(reply, 503, 'NOT_AVAILABLE', 'Database unavailable.');
    const pending = await listDiscordGuildIdsWithPendingBotExport(pool);
    return reply.code(200).send({ pending });
  });

  fastify.post<{ Body: { discordGuildId?: unknown } }>(
    '/hooks/discord-bot/export-ready',
    async (
      req: FastifyRequest<{ Body: { discordGuildId?: unknown } }>,
      reply: FastifyReply,
    ) => {
      const secret = requireBotWebhookSecret(req, reply);
      if (!secret) return;
      if (!requireBotWebhookPostSignature(req, reply, secret)) return;
      const deliveryId = requireWebhookDeliveryId(req, reply);
      if (!deliveryId) return;
      const firstDelivery = await consumeWebhookDeliveryOnce(
        'discord-bot-export-ready',
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
      const raw = req.body?.discordGuildId;
      const discordGuildId = typeof raw === 'string' ? raw.trim() : '';
      if (!discordGuildId) {
        return sendError(
          reply,
          400,
          'INVALID_BODY',
          'discordGuildId is required',
        );
      }
      const pool = getPgPool();
      if (!pool)
        return sendError(reply, 503, 'NOT_AVAILABLE', 'Database unavailable.');
      let notified: {
        echoUserId: string;
        discordGuildId: string;
        guildName: string;
      }[];
      try {
        notified = await markDiscordBotExportReadyForGuild(
          pool,
          discordGuildId,
        );
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Invalid guild id';
        return sendError(reply, 400, 'INVALID_GUILD_ID', msg);
      }
      const ver = String(Date.now());
      for (const row of notified) {
        publishEchoWorkspaceEvent(
          fastify,
          {
            kind: 'discord_export_ready',
            version: ver,
            userId: row.echoUserId,
            discordGuildId: row.discordGuildId,
            guildName: row.guildName,
          },
          { userId: row.echoUserId },
        );
      }
      return reply
        .code(200)
        .send({ ok: true as const, notified: notified.length });
    },
  );
}
