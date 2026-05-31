import type {
  FastifyInstance,
  FastifyPluginOptions,
  FastifyReply,
  FastifyRequest,
} from 'fastify';
import { config } from '../../config';
import { getPgPool } from '../../db/pg';
import {
  listDiscordGuildIdsWithPendingBotExport,
  markDiscordBotExportReadyForGuild,
} from '../../domain/discordBotExportPendingRepo';
import { publishEchoWorkspaceEvent } from '../../platform/echoPlatformEvents';
import { sendError } from '../errors';
import { safeCompare } from '../../shared/safeCompare';
import { consumeWebhookDeliveryOnce } from '../../services/webhookReplayGuard';
import { verifyEchoWebhookHmac } from '../../services/echoWebhookSignature';

function requireBotWebhookSecret(
  req: FastifyRequest,
  reply: FastifyReply,
): string | null {
  const secret = config.echoDiscordBotWebhookSecret.trim();
  if (!secret) {
    sendError(
      reply,
      503,
      'NOT_CONFIGURED',
      'Discord bot webhook is not configured.',
    );
    return null;
  }
  const hdr = req.headers['x-echo-discord-bot-secret'];
  const presented = typeof hdr === 'string' ? hdr.trim() : '';
  if (!safeCompare(presented, secret)) {
    sendError(reply, 401, 'UNAUTHORIZED', 'Invalid webhook secret.');
    return null;
  }
  return secret;
}

function requireBotWebhookPostSignature(
  req: FastifyRequest,
  reply: FastifyReply,
  secret: string,
): boolean {
  if (!config.isProduction) return true;
  const rawBody = JSON.stringify(req.body ?? {});
  if (verifyEchoWebhookHmac(secret, rawBody, req)) return true;
  sendError(reply, 401, 'UNAUTHORIZED', 'Invalid webhook signature.');
  return false;
}

export default async function discordBotHookRoutes(
  fastify: FastifyInstance,
  _opts: FastifyPluginOptions,
): Promise<void> {
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
      const deliveryIdHdr = req.headers['x-echo-delivery-id'];
      const deliveryId =
        typeof deliveryIdHdr === 'string' ? deliveryIdHdr.trim() : '';
      if (!deliveryId) {
        return sendError(
          reply,
          400,
          'INVALID_BODY',
          'x-echo-delivery-id header is required',
        );
      }
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
