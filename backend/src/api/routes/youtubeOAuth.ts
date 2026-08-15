import type {
  FastifyInstance,
  FastifyPluginOptions,
  FastifyReply,
  FastifyRequest,
} from 'fastify';
import rateLimit from '@fastify/rate-limit';
import { httpRateLimitStoreOpts } from '../../services/httpRateLimitStore';
import { FEDERATED_OAUTH_FLOW_RATE } from '../meLinkRouteRateLimits';
import { sendError } from '../errors';
import { requireAuth } from '../../auth/middleware';
import { getAuthStore } from '../../auth/store';
import { config } from '../../config';
import { getPgPool } from '../../db/pg';
import { encryptDiscordToken } from '../../auth/discordTokenCrypto';
import { ensureFederatedOAuthTokenEncryptionReady } from '../../auth/federatedOAuthEncryptionGate';
import { createPkceChallengeS256, createPkceVerifier } from '../../auth/pkce';
import {
  buildYoutubeAuthorizeUrl,
  exchangeYoutubeOAuthCode,
  fetchYoutubeMineChannel,
  type FetchLike,
} from '../../services/integrations/youtubeApiClient';
import {
  createYoutubeOAuthState,
  decodeYoutubeOAuthCookieValue,
  encodeYoutubeOAuthLinkCookieValue,
  youtubeOAuthCookieMaxAgeSec,
  youtubeOAuthCookieName,
} from '../../domain/youtubeOAuthState';
import { getGoogleLinkByUserId } from '../../domain/googleUserLinkRepo';
import {
  findYoutubeLinkOwnerForChannelId,
  upsertYoutubeChannelLink,
} from '../../domain/youtubeUserLinkRepo';
import { resolveGoogleUserFromOAuthTokenResponse } from '../../services/integrations/googleOidc';
import {
  isYoutubeOauthConfigured,
  youtubeOAuthAppRedirect,
} from '../../domain/youtubeOAuthRedirect';
import { sessionCookieBaseAttrs } from '../../auth/sessionCookies';

const OAUTH_FETCH: FetchLike = globalThis.fetch.bind(globalThis);

function setOAuthCookie(reply: FastifyReply, value: string) {
  const base = sessionCookieBaseAttrs();
  reply.setCookie(youtubeOAuthCookieName(), value, {
    httpOnly: true,
    ...base,
    maxAge: youtubeOAuthCookieMaxAgeSec(),
  });
}

function clearOAuthCookie(reply: FastifyReply) {
  reply.clearCookie(youtubeOAuthCookieName(), { path: '/' });
}

export default async function youtubeOAuthRoutes(
  fastify: FastifyInstance,
  _opts: FastifyPluginOptions,
) {
  await fastify.register(rateLimit, {
    max: 60,
    timeWindow: '15 minutes',
    keyGenerator: (req) => `youtube_oauth:${req.ip}`,
    addHeaders: { 'retry-after': true },
    ...httpRateLimitStoreOpts('echo-rl-youtube-oauth-'),
  });

  fastify.post(
    '/youtube/start',
    {
      preHandler: [requireAuth],
      config: { rateLimit: FEDERATED_OAUTH_FLOW_RATE },
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
      if (!isYoutubeOauthConfigured()) {
        return sendError(
          reply,
          503,
          'NOT_CONFIGURED',
          'YouTube linking is not enabled. Set GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET, and YOUTUBE_OAUTH_REDIRECT_URI.',
        );
      }
      if (config.isProduction && !config.echoDiscordTokenEncryptionKey) {
        return sendError(
          reply,
          503,
          'NOT_CONFIGURED',
          'ECHO_DISCORD_TOKEN_ENCRYPTION_KEY is required in production for federated tokens.',
        );
      }
      if (!ensureFederatedOAuthTokenEncryptionReady(reply, fastify.log)) return;
      const pool = getPgPool();
      if (!pool) {
        return sendError(reply, 503, 'NOT_AVAILABLE', 'Database unavailable.');
      }
      const googleLink = await getGoogleLinkByUserId(pool, req.authUser.id);
      if (!googleLink) {
        return sendError(
          reply,
          403,
          'GOOGLE_NOT_LINKED',
          'Link your Google account in Settings → Google before connecting YouTube.',
        );
      }

      const state = createYoutubeOAuthState();
      const pkceVerifier = createPkceVerifier();
      const pkceChallenge = createPkceChallengeS256(pkceVerifier);
      const exp = Date.now() + youtubeOAuthCookieMaxAgeSec() * 1000;
      const cookieVal = encodeYoutubeOAuthLinkCookieValue(
        req.authUser.id,
        state,
        pkceVerifier,
        exp,
      );
      setOAuthCookie(reply, cookieVal);

      const authorizeUrl = buildYoutubeAuthorizeUrl(state, pkceChallenge);
      return reply.code(200).send({
        authorizeUrl,
        redirectUri: config.youtubeOauthRedirectUri,
      });
    },
  );

  fastify.get<{
    Querystring: { code?: string; state?: string; error?: string };
  }>(
    '/youtube/callback',
    { config: { rateLimit: FEDERATED_OAUTH_FLOW_RATE } },
    async (req, reply) => {
      clearOAuthCookie(reply);
      const oauthErr = req.query.error?.trim();
      if (oauthErr) {
        return reply
          .code(302)
          .redirect(youtubeOAuthAppRedirect(false, 'access_denied'));
      }

      const code = req.query.code?.trim();
      const stateQs = req.query.state?.trim();
      if (!code || !stateQs) {
        return reply
          .code(302)
          .redirect(youtubeOAuthAppRedirect(false, 'invalid_callback'));
      }

      const rawCookie = req.cookies?.[youtubeOAuthCookieName()];
      const payload = rawCookie
        ? decodeYoutubeOAuthCookieValue(rawCookie)
        : null;
      if (!payload || payload.state !== stateQs) {
        return reply
          .code(302)
          .redirect(youtubeOAuthAppRedirect(false, 'bad_state'));
      }

      if (!isYoutubeOauthConfigured()) {
        return reply
          .code(302)
          .redirect(youtubeOAuthAppRedirect(false, 'not_configured'));
      }
      if (!ensureFederatedOAuthTokenEncryptionReady(reply, fastify.log)) {
        return reply
          .code(302)
          .redirect(youtubeOAuthAppRedirect(false, 'missing_encryption_key'));
      }

      const pool = getPgPool();
      if (!pool) {
        return reply
          .code(302)
          .redirect(youtubeOAuthAppRedirect(false, 'no_database'));
      }

      const googleLink = await getGoogleLinkByUserId(pool, payload.userId);
      if (!googleLink) {
        return reply
          .code(302)
          .redirect(youtubeOAuthAppRedirect(false, 'google_not_linked'));
      }

      let tokenResponse;
      try {
        tokenResponse = await exchangeYoutubeOAuthCode(
          code,
          payload.pkceVerifier,
          OAUTH_FETCH,
        );
      } catch {
        return reply
          .code(302)
          .redirect(youtubeOAuthAppRedirect(false, 'token_exchange'));
      }

      try {
        const googleUser = await resolveGoogleUserFromOAuthTokenResponse(
          tokenResponse,
          OAUTH_FETCH,
        );
        if (googleUser.sub !== googleLink.googleSub) {
          return reply
            .code(302)
            .redirect(
              youtubeOAuthAppRedirect(false, 'google_account_mismatch'),
            );
        }
      } catch {
        return reply
          .code(302)
          .redirect(youtubeOAuthAppRedirect(false, 'token_exchange'));
      }

      let channel;
      try {
        channel = await fetchYoutubeMineChannel(
          tokenResponse.access_token,
          OAUTH_FETCH,
        );
      } catch {
        return reply
          .code(302)
          .redirect(youtubeOAuthAppRedirect(false, 'youtube_channel'));
      }

      const otherUser = await findYoutubeLinkOwnerForChannelId(
        pool,
        channel.channelId,
        payload.userId,
      );
      if (otherUser) {
        return reply
          .code(302)
          .redirect(youtubeOAuthAppRedirect(false, 'youtube_already_linked'));
      }

      const accessCipher = encryptDiscordToken(tokenResponse.access_token);
      const refreshCipher = tokenResponse.refresh_token
        ? encryptDiscordToken(tokenResponse.refresh_token)
        : null;
      const expiresAt =
        typeof tokenResponse.expires_in === 'number' &&
        Number.isFinite(tokenResponse.expires_in)
          ? new Date(Date.now() + tokenResponse.expires_in * 1000).toISOString()
          : null;

      try {
        await upsertYoutubeChannelLink(pool, {
          userId: payload.userId,
          youtubeChannelId: channel.channelId,
          accessTokenCipher: accessCipher,
          refreshTokenCipher: refreshCipher,
          tokenExpiresAt: expiresAt,
          scope: tokenResponse.scope || config.youtubeOauthScopes,
          channelTitle: channel.title,
          channelThumbnailUrl: channel.thumbnailUrl,
        });
      } catch (err: unknown) {
        const pgCode = (err as { code?: string })?.code;
        if (pgCode === '23505') {
          return reply
            .code(302)
            .redirect(youtubeOAuthAppRedirect(false, 'youtube_already_linked'));
        }
        fastify.log.error(err, 'youtube_oauth_upsert_failed');
        return reply
          .code(302)
          .redirect(youtubeOAuthAppRedirect(false, 'persist_failed'));
      }

      return reply.code(302).redirect(youtubeOAuthAppRedirect(true));
    },
  );
}
