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
import { getGoogleLinkByUserId } from '../../domain/googleUserLinkRepo';
import { isGoogleOauthConfigured } from '../../domain/googleOAuthRedirect';
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

      const googleLink = await getGoogleLinkByUserId(pool, req.authUser.id);
      if (!googleLink) {
        return sendError(
          reply,
          404,
          'NOT_FOUND',
          'Google account is not linked.',
        );
      }
      // External stream shutdown is retryable and happens only after confirming
      // the account is linked. Keep all credential/link row deletion atomic.
      await stopAllActiveStageYoutubeStreamsForLinkUser(pool, req.authUser.id);
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const deleted = await client.query(
          `DELETE FROM auth_google_user_links WHERE user_id = $1 RETURNING user_id`,
          [req.authUser.id],
        );
        if (deleted.rowCount !== 1) {
          await client.query('ROLLBACK');
          return sendError(
            reply,
            404,
            'NOT_FOUND',
            'Google account is not linked.',
          );
        }
        await client.query(
          `DELETE FROM integration_youtube_channel_links WHERE user_id = $1`,
          [req.authUser.id],
        );
        await client.query(
          `DELETE FROM integration_youtube_stream_keys WHERE user_id = $1`,
          [req.authUser.id],
        );
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK').catch(() => undefined);
        throw error;
      } finally {
        client.release();
      }
      return reply.code(200).send({ ok: true });
    },
  );
}
