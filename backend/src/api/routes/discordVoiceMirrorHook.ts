import type { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { getPgPool } from '../../db/pg';
import { listDiscordVoiceMirrorWatchGuildIds } from '../../domain/discordVoiceMirrorRepo';
import { ingestDiscordVoiceMirrorPayload } from '../../services/discordVoiceMirrorIngest';
import type { DiscordVoiceMirrorInboundChannel } from '../../services/discordVoiceMirrorIngest';
import { consumeWebhookDeliveryOnce } from '../../services/webhookReplayGuard';
import { sendError } from '../errors';
import {
  discordBotSignedWebhookPlugin,
  requireBotWebhookPostSignature,
  requireBotWebhookSecret,
  requireWebhookDeliveryId,
} from '../discordBotWebhookAuth';

export default async function discordVoiceMirrorHookRoutes(
  fastify: FastifyInstance,
  _opts: FastifyPluginOptions,
): Promise<void> {
  await fastify.register(discordBotSignedWebhookPlugin);

  fastify.get('/hooks/discord-voice-mirror/watchlist', async (req, reply) => {
    if (!requireBotWebhookSecret(req, reply)) return;
    const pool = getPgPool();
    if (!pool)
      return sendError(reply, 503, 'NOT_AVAILABLE', 'Database unavailable.');
    const guildIds = await listDiscordVoiceMirrorWatchGuildIds(pool);
    return reply.code(200).send({ guildIds });
  });

  fastify.post<{ Body: Record<string, unknown> }>(
    '/hooks/discord-voice-mirror/snapshot',
    async (req, reply) => {
      const secret = requireBotWebhookSecret(req, reply);
      if (!secret) return;
      if (!requireBotWebhookPostSignature(req, reply, secret)) return;
      const deliveryId = requireWebhookDeliveryId(req, reply);
      if (!deliveryId) return;
      const firstDelivery = await consumeWebhookDeliveryOnce(
        'discord-voice-mirror-snapshot',
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
      const rawChans = b.channels;
      if (!discordGuildId) {
        return sendError(reply, 400, 'INVALID_BODY', 'discordGuildId required');
      }
      const channels: DiscordVoiceMirrorInboundChannel[] = [];
      if (Array.isArray(rawChans)) {
        for (const item of rawChans) {
          if (!item || typeof item !== 'object') continue;
          const o = item as Record<string, unknown>;
          const discordChannelId =
            typeof o.discordChannelId === 'string'
              ? o.discordChannelId.trim()
              : '';
          if (!discordChannelId) continue;
          const discordParentCategoryId =
            typeof o.discordParentCategoryId === 'string'
              ? o.discordParentCategoryId.trim()
              : null;
          const name =
            typeof o.name === 'string' ? o.name.trim().slice(0, 100) : '';
          const memRaw = o.members;
          const members: DiscordVoiceMirrorInboundChannel['members'] = [];
          if (Array.isArray(memRaw)) {
            for (const m of memRaw) {
              if (!m || typeof m !== 'object') continue;
              const u = m as Record<string, unknown>;
              const id = typeof u.id === 'string' ? u.id.trim() : '';
              if (!id) continue;
              members.push({
                id,
                username:
                  typeof u.username === 'string' ? u.username : 'Unknown',
                ...(typeof u.globalName === 'string'
                  ? { globalName: u.globalName }
                  : {}),
                avatar:
                  u.avatar === null || u.avatar === undefined
                    ? null
                    : String(u.avatar),
              });
            }
          }
          channels.push({
            discordChannelId,
            discordParentCategoryId,
            name,
            members,
          });
        }
      }

      const res = await ingestDiscordVoiceMirrorPayload(
        pool,
        fastify,
        discordGuildId,
        channels,
      );
      if (!res.ok) {
        return sendError(reply, 400, 'INVALID_BODY', res.reason);
      }
      return reply.code(200).send({ ok: true as const });
    },
  );
}
