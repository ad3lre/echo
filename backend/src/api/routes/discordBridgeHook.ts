import type {
  FastifyInstance,
  FastifyPluginOptions,
  FastifyReply,
  FastifyRequest,
} from 'fastify';
import { config } from '../../config';
import { getPgPool } from '../../db/pg';
import { listDiscordInboundBridgeRows } from '../../domain/discordBridgeRepo';
import { ingestDiscordBridgeMessage } from '../../services/discordBridgeInbound';
import { consumeWebhookDeliveryOnce } from '../../services/webhookReplayGuard';
import { sendError } from '../errors';
import { safeCompare } from '../../shared/safeCompare';
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
      'Discord bot webhook secret is not configured.',
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

export default async function discordBridgeHookRoutes(
  fastify: FastifyInstance,
  _opts: FastifyPluginOptions,
): Promise<void> {
  fastify.get('/hooks/discord-bridge/allowlist', async (req, reply) => {
    if (!requireBotWebhookSecret(req, reply)) return;
    const pool = getPgPool();
    if (!pool)
      return sendError(reply, 503, 'NOT_AVAILABLE', 'Database unavailable.');
    const channels = await listDiscordInboundBridgeRows(pool);
    return reply.code(200).send({ channels });
  });

  fastify.post<{ Body: Record<string, unknown> }>(
    '/hooks/discord-bridge/inbound',
    async (req, reply) => {
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
        'discord-bridge-inbound',
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
      const discordChannelId =
        typeof b.discordChannelId === 'string' ? b.discordChannelId.trim() : '';
      const discordMessageId =
        typeof b.discordMessageId === 'string' ? b.discordMessageId.trim() : '';
      const timestamp =
        typeof b.timestamp === 'string' ? b.timestamp : undefined;
      const content = typeof b.content === 'string' ? b.content : '';
      const author =
        b.author && typeof b.author === 'object'
          ? (b.author as Record<string, unknown>)
          : undefined;
      const webhookId =
        b.webhookId === null || b.webhookId === undefined
          ? null
          : String(b.webhookId);

      const io = (fastify as { io?: import('socket.io').Server }).io;
      const res = await ingestDiscordBridgeMessage(pool, io, fastify.log, {
        discordGuildId,
        discordChannelId,
        discordMessageId,
        timestamp,
        content,
        author,
        attachments: b.attachments,
        stickers: b.stickers,
        embeds: b.embeds,
        messageReference: b.messageReference,
        webhookId,
      });

      if (!res.ok) {
        if (res.statusCode === 400) {
          return sendError(reply, 400, 'INVALID_BODY', res.reason);
        }
        if (res.statusCode === 404) {
          return sendError(reply, 404, 'NOT_FOUND', res.reason);
        }
        if (res.statusCode === 403) {
          return sendError(reply, 403, 'FORBIDDEN', res.reason);
        }
        if (res.statusCode === 500) {
          return sendError(reply, 500, 'PERSIST_FAILED', res.reason);
        }
        if (res.reason === 'duplicate' || res.reason === 'webhook_loop_skip') {
          return reply.code(204).send();
        }
        return sendError(reply, 400, 'BRIDGE_SKIP', res.reason);
      }
      return reply.code(200).send({ ok: true as const, message: res.message });
    },
  );
}
