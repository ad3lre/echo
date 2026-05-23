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
import {
  deleteGoogleUserLink,
  getGoogleLinkByUserId,
} from '../../domain/googleUserLinkRepo';
import { isGoogleOauthConfigured } from '../../domain/googleOAuthRedirect';
import { deleteYoutubeChannelLink } from '../../domain/youtubeUserLinkRepo';
import { deleteYoutubeStreamKey } from '../../domain/youtubeStreamKeyRepo';
import { stopAllActiveStageYoutubeStreamsForLinkUser } from '../../services/stage/stageYoutubeStream';

function googleOauthRedirectUriForClient(): string | null {
  if (!isGoogleOauthConfigured()) return null;
  const uri = config.googleOauthRedirectUri.trim();
  return uri || null;
}

export default async function meGoogleRoutes(
  fastify: FastifyInstance,
  _opts: FastifyPluginOptions,
) {
  fastify.get(
    '/me/google',
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
          'Google linking requires a database.',
        );
      }
      const pool = getPgPool();
      if (!pool)
        return sendError(reply, 503, 'NOT_AVAILABLE', 'Database unavailable.');

      const row = await getGoogleLinkByUserId(pool, req.authUser.id);
      const oauthRedirectUri = googleOauthRedirectUriForClient();
      if (!row) {
        return reply.code(200).send({
          linked: false,
          configured: isGoogleOauthConfigured(),
          oauthRedirectUri,
        });
      }

      const p = row.googleNormalized;
      return reply.code(200).send({
        linked: true,
        configured: isGoogleOauthConfigured(),
        oauthRedirectUri,
        mergeKind: row.mergeKind,
        profile: {
          googleSub: row.googleSub,
          name: typeof p.name === 'string' ? p.name : null,
          picture: typeof p.picture === 'string' ? p.picture : null,
          emailPresent: Boolean(p.emailPresent),
        },
      });
    },
  );

  fastify.delete(
    '/me/google',
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
          'Google linking requires a database.',
        );
      }
      const pool = getPgPool();
      if (!pool)
        return sendError(reply, 503, 'NOT_AVAILABLE', 'Database unavailable.');

      await stopAllActiveStageYoutubeStreamsForLinkUser(pool, req.authUser.id);
      await deleteYoutubeChannelLink(pool, req.authUser.id);
      await deleteYoutubeStreamKey(pool, req.authUser.id);

      const deleted = await deleteGoogleUserLink(pool, req.authUser.id);
      if (!deleted) {
        return sendError(
          reply,
          404,
          'NOT_FOUND',
          'Google account is not linked.',
        );
      }
      return reply.code(200).send({ ok: true });
    },
  );
}
