import type {
  FastifyInstance,
  FastifyPluginOptions,
  FastifyReply,
  FastifyRequest,
} from 'fastify';
import { ME_FEDERATED_LINK_RATE } from '../meLinkRouteRateLimits';
import { sendError } from '../errors';
import { requireAuth } from '../../auth/middleware';
import { getAuthStore } from '../../auth/store';
import { config } from '../../config';
import { getPgPool } from '../../db/pg';
import { encryptDiscordToken } from '../../auth/discordTokenCrypto';
import { ensureFederatedOAuthTokenEncryptionReady } from '../../auth/federatedOAuthEncryptionGate';
import {
  deleteYoutubeChannelLink,
  getYoutubeLinkByUserId,
} from '../../domain/youtube/youtubeUserLinkRepo';
import { getGoogleLinkByUserId } from '../../domain/googleUserLinkRepo';
import { isYoutubeOauthConfigured } from '../../domain/youtube/youtubeOAuthRedirect';
import { getYoutubeConnectionModeForSettings } from '../../domain/youtube/youtubeDeliveryMode';
import {
  deleteYoutubeStreamKey,
  getYoutubeStreamKeyByUserId,
  upsertYoutubeStreamKey,
} from '../../domain/youtube/youtubeStreamKeyRepo';
import { buildYoutubeRtmpIngestUrl } from '../../domain/youtube/youtubeRtmpIngest';
import { stopAllActiveStageYoutubeStreamsForLinkUser } from '../../services/stage/stageYoutubeStream';

function youtubeOauthRedirectUriForClient(): string | null {
  if (!isYoutubeOauthConfigured()) return null;
  const uri = config.youtubeOauthRedirectUri.trim();
  return uri || null;
}

const STREAM_KEY_SAVE_RATE = {
  max: 8,
  timeWindow: '15 minutes' as const,
  keyGenerator: (req: FastifyRequest) =>
    `youtube_stream_key_save:${req.authUser?.id ?? req.ip}`,
};

type StreamKeyBody = {
  streamKey?: string;
  serverUrl?: string;
  rtmpUrl?: string;
};

export default async function meYoutubeRoutes(
  fastify: FastifyInstance,
  _opts: FastifyPluginOptions,
) {
  fastify.get(
    '/me/youtube',
    {
      preHandler: [requireAuth],
      config: { rateLimit: ME_FEDERATED_LINK_RATE },
    },
    async (req: FastifyRequest, reply: FastifyReply) => {
      if (!req.authUser)
        return sendError(reply, 401, 'UNAUTHORIZED', 'Unauthorized');
      const { mode } = await getAuthStore();
      if (mode !== 'postgres') {
        return sendError(
          reply,
          503,
          'NOT_AVAILABLE',
          'YouTube linking requires a database.',
        );
      }
      const pool = getPgPool();
      if (!pool)
        return sendError(reply, 503, 'NOT_AVAILABLE', 'Database unavailable.');

      const row = await getYoutubeLinkByUserId(pool, req.authUser.id);
      const googleRow = await getGoogleLinkByUserId(pool, req.authUser.id);
      const streamKeyRow = await getYoutubeStreamKeyByUserId(
        pool,
        req.authUser.id,
      );
      const connectionMode = await getYoutubeConnectionModeForSettings(
        pool,
        req.authUser.id,
      );

      const stageLiveStreamingConfigured =
        config.liveKitEnabled && config.liveKitEgressEnabled;

      return reply.code(200).send({
        configured: isYoutubeOauthConfigured(),
        oauthRedirectUri: youtubeOauthRedirectUriForClient(),
        googleLinked: Boolean(googleRow),
        connectionMode,
        linked: Boolean(row),
        profile: row
          ? {
              youtubeChannelId: row.youtubeChannelId,
              channelTitle: row.channelTitle,
              channelThumbnailUrl: row.channelThumbnailUrl,
            }
          : null,
        streamKey: streamKeyRow ? { savedAt: streamKeyRow.updatedAt } : null,
        stageLiveStreamingConfigured,
      });
    },
  );

  fastify.put<{ Body?: StreamKeyBody }>(
    '/me/youtube/stream-key',
    { preHandler: [requireAuth], config: { rateLimit: STREAM_KEY_SAVE_RATE } },
    async (req: FastifyRequest, reply: FastifyReply) => {
      if (!req.authUser)
        return sendError(reply, 401, 'UNAUTHORIZED', 'Unauthorized');
      const { mode } = await getAuthStore();
      if (mode !== 'postgres') {
        return sendError(
          reply,
          503,
          'NOT_AVAILABLE',
          'YouTube stream key requires a database.',
        );
      }
      if (config.isProduction && !config.echoDiscordTokenEncryptionKey) {
        return sendError(
          reply,
          503,
          'NOT_CONFIGURED',
          'ECHO_DISCORD_TOKEN_ENCRYPTION_KEY is required in production to store stream keys.',
        );
      }
      if (!ensureFederatedOAuthTokenEncryptionReady(reply, fastify.log)) return;

      const pool = getPgPool();
      if (!pool)
        return sendError(reply, 503, 'NOT_AVAILABLE', 'Database unavailable.');

      const body = (req.body as StreamKeyBody | undefined) ?? {};
      const built = buildYoutubeRtmpIngestUrl({
        rtmpUrl: body.rtmpUrl,
        serverUrl: body.serverUrl,
        streamKey: body.streamKey,
      });
      if (!built.ok) {
        return sendError(reply, 400, 'INVALID_STREAM_KEY', built.message);
      }

      try {
        encryptDiscordToken(built.rtmpUrl);
      } catch {
        return sendError(
          reply,
          503,
          'NOT_CONFIGURED',
          'Could not encrypt stream key for storage.',
        );
      }

      await upsertYoutubeStreamKey(pool, req.authUser.id, built.rtmpUrl);
      const streamKeyRow = await getYoutubeStreamKeyByUserId(
        pool,
        req.authUser.id,
      );

      return reply.code(200).send({
        ok: true,
        connectionMode: await getYoutubeConnectionModeForSettings(
          pool,
          req.authUser.id,
        ),
        streamKey: streamKeyRow
          ? { savedAt: streamKeyRow.updatedAt }
          : { savedAt: new Date().toISOString() },
      });
    },
  );

  fastify.delete(
    '/me/youtube/stream-key',
    {
      preHandler: [requireAuth],
      config: { rateLimit: ME_FEDERATED_LINK_RATE },
    },
    async (req: FastifyRequest, reply: FastifyReply) => {
      if (!req.authUser)
        return sendError(reply, 401, 'UNAUTHORIZED', 'Unauthorized');
      const { mode } = await getAuthStore();
      if (mode !== 'postgres') {
        return sendError(
          reply,
          503,
          'NOT_AVAILABLE',
          'YouTube stream key requires a database.',
        );
      }
      const pool = getPgPool();
      if (!pool)
        return sendError(reply, 503, 'NOT_AVAILABLE', 'Database unavailable.');

      await stopAllActiveStageYoutubeStreamsForLinkUser(pool, req.authUser.id);

      const deleted = await deleteYoutubeStreamKey(pool, req.authUser.id);
      if (!deleted) {
        return sendError(reply, 404, 'NOT_FOUND', 'No stream key is saved.');
      }
      return reply.code(200).send({ ok: true });
    },
  );

  fastify.delete(
    '/me/youtube',
    {
      preHandler: [requireAuth],
      config: { rateLimit: ME_FEDERATED_LINK_RATE },
    },
    async (req: FastifyRequest, reply: FastifyReply) => {
      if (!req.authUser)
        return sendError(reply, 401, 'UNAUTHORIZED', 'Unauthorized');
      const { mode } = await getAuthStore();
      if (mode !== 'postgres') {
        return sendError(
          reply,
          503,
          'NOT_AVAILABLE',
          'YouTube linking requires a database.',
        );
      }
      const pool = getPgPool();
      if (!pool)
        return sendError(reply, 503, 'NOT_AVAILABLE', 'Database unavailable.');

      await stopAllActiveStageYoutubeStreamsForLinkUser(pool, req.authUser.id);

      const deleted = await deleteYoutubeChannelLink(pool, req.authUser.id);
      if (!deleted) {
        return sendError(
          reply,
          404,
          'NOT_FOUND',
          'YouTube channel is not linked.',
        );
      }
      return reply.code(200).send({ ok: true });
    },
  );
}
