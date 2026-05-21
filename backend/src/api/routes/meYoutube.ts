import type {
  FastifyInstance,
  FastifyPluginOptions,
  FastifyReply,
  FastifyRequest,
} from 'fastify';
import { sendError } from '../errors';
import { requireAuth } from '../../auth/middleware';
import { getAuthStore } from '../../auth/store';
import { getPgPool } from '../../db/pg';
import {
  deleteYoutubeChannelLink,
  getYoutubeLinkByUserId,
} from '../../domain/youtubeUserLinkRepo';
import { isYoutubeOauthConfigured } from '../../domain/youtubeOAuthRedirect';
import { stopAllActiveStageYoutubeStreamsForLinkUser } from '../../services/stage/stageYoutubeStream';

export default async function meYoutubeRoutes(
  fastify: FastifyInstance,
  _opts: FastifyPluginOptions,
) {
  fastify.get(
    '/me/youtube',
    { preHandler: [requireAuth] },
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
      return reply.code(200).send({
        configured: isYoutubeOauthConfigured(),
        linked: Boolean(row),
        profile: row
          ? {
              youtubeChannelId: row.youtubeChannelId,
              channelTitle: row.channelTitle,
              channelThumbnailUrl: row.channelThumbnailUrl,
            }
          : null,
      });
    },
  );

  fastify.delete(
    '/me/youtube',
    { preHandler: [requireAuth] },
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
