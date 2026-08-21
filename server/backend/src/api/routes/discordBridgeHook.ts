import type {
  FastifyInstance,
  FastifyPluginOptions,
  FastifyReply,
  FastifyRequest,
} from 'fastify';
import { config } from '../../config';
import { getPgPool } from '../../db/pg';
import { listDiscordInboundBridgeRows } from '../../domain/discord/discordBridgeRepo';
import {
  deleteDiscordBridgeMessage,
  ingestDiscordBridgeMessage,
  updateDiscordBridgeMessage,
} from '../../services/discordBridge/discordBridgeInbound';
import { consumeWebhookDeliveryOnce } from '../../services/webhookReplayGuard';
import { sendError } from '../errors';
import {
  discordBotSignedWebhookPlugin,
  requireBotWebhookPostSignature,
  requireBotWebhookSecret,
  requireWebhookDeliveryId,
} from '../discordBotWebhookAuth';
import { DISCORD_BOT_WEBHOOK_ROUTE_RATE } from '../sharedMutationRateLimits';
import { echoDiscordBridgeInboundTotal } from '../../observability/echoMetrics';

function parseBridgeEvent(
  body: Record<string, unknown>,
): 'create' | 'update' | 'delete' {
  const raw =
    typeof body.event === 'string' ? body.event.trim().toLowerCase() : '';
  if (raw === 'update' || raw === 'message_update') return 'update';
  if (raw === 'delete' || raw === 'message_delete') return 'delete';
  return 'create';
}

function parseInboundPayload(b: Record<string, unknown>) {
  return {
    discordGuildId:
      typeof b.discordGuildId === 'string' ? b.discordGuildId.trim() : '',
    discordChannelId:
      typeof b.discordChannelId === 'string' ? b.discordChannelId.trim() : '',
    discordMessageId:
      typeof b.discordMessageId === 'string' ? b.discordMessageId.trim() : '',
    timestamp: typeof b.timestamp === 'string' ? b.timestamp : undefined,
    content: typeof b.content === 'string' ? b.content : '',
    author:
      b.author && typeof b.author === 'object'
        ? (b.author as Record<string, unknown>)
        : undefined,
    attachments: b.attachments,
    stickers: b.stickers,
    embeds: b.embeds,
    messageReference: b.messageReference,
    webhookId:
      b.webhookId === null || b.webhookId === undefined
        ? null
        : String(b.webhookId),
  };
}

export default async function discordBridgeHookRoutes(
  fastify: FastifyInstance,
  _opts: FastifyPluginOptions,
): Promise<void> {
  await fastify.register(discordBotSignedWebhookPlugin);

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
    { config: { rateLimit: DISCORD_BOT_WEBHOOK_ROUTE_RATE } },
    async (req, reply) => {
      const secret = requireBotWebhookSecret(req, reply);
      if (!secret) return;
      if (!requireBotWebhookPostSignature(req, reply, secret)) return;
      const deliveryId = requireWebhookDeliveryId(req, reply);
      if (!deliveryId) return;
      const firstDelivery = await consumeWebhookDeliveryOnce(
        'discord-bridge-inbound',
        deliveryId,
      );
      if (!firstDelivery) {
        echoDiscordBridgeInboundTotal.inc({ event: 'any', result: 'replay' });
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
      const event = parseBridgeEvent(b);
      const payload = parseInboundPayload(b);
      const io = (fastify as { io?: import('socket.io').Server }).io;

      if (event === 'delete') {
        const res = await deleteDiscordBridgeMessage(
          pool,
          io,
          fastify.log,
          payload,
        );
        if (!res.ok) {
          echoDiscordBridgeInboundTotal.inc({
            event: 'delete',
            result: res.reason,
          });
          if (res.statusCode === 404) {
            return sendError(reply, 404, 'NOT_FOUND', res.reason);
          }
          if (res.statusCode === 403) {
            return sendError(reply, 403, 'FORBIDDEN', res.reason);
          }
          if (
            res.reason === 'not_found' ||
            res.reason === 'not_bridge_message'
          ) {
            return reply.code(204).send();
          }
          return sendError(reply, 400, 'BRIDGE_SKIP', res.reason);
        }
        echoDiscordBridgeInboundTotal.inc({ event: 'delete', result: 'ok' });
        return reply.code(200).send({ ok: true as const, deleted: true });
      }

      if (event === 'update') {
        const res = await updateDiscordBridgeMessage(
          pool,
          io,
          fastify.log,
          payload,
        );
        if (!res.ok) {
          echoDiscordBridgeInboundTotal.inc({
            event: 'update',
            result: res.reason,
          });
          if (res.statusCode === 400) {
            return sendError(reply, 400, 'INVALID_BODY', res.reason);
          }
          if (res.statusCode === 404) {
            return sendError(reply, 404, 'NOT_FOUND', res.reason);
          }
          if (res.statusCode === 403) {
            return sendError(reply, 403, 'FORBIDDEN', res.reason);
          }
          if (res.reason === 'not_found') {
            return reply.code(204).send();
          }
          return sendError(reply, 400, 'BRIDGE_SKIP', res.reason);
        }
        echoDiscordBridgeInboundTotal.inc({ event: 'update', result: 'ok' });
        return reply
          .code(200)
          .send({ ok: true as const, message: res.message });
      }

      const res = await ingestDiscordBridgeMessage(
        pool,
        io,
        fastify.log,
        payload,
      );
      if (!res.ok) {
        echoDiscordBridgeInboundTotal.inc({
          event: 'create',
          result: res.reason,
        });
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
      echoDiscordBridgeInboundTotal.inc({ event: 'create', result: 'ok' });
      return reply.code(200).send({ ok: true as const, message: res.message });
    },
  );
}
