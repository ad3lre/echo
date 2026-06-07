import { randomInt } from 'crypto';
import type {
  FastifyInstance,
  FastifyPluginOptions,
  FastifyReply,
  FastifyRequest,
} from 'fastify';
import rateLimit from '@fastify/rate-limit';
import { sendError } from '../errors';
import { requireAuth } from '../../auth/middleware';
import { getAuthStore } from '../../auth/store';
import { issueEchoBrowserSession } from '../../auth/issueBrowserSession';
import { loginAuditDigests } from '../../auth/loginAudit';
import {
  clearGuestBindingCookie,
  sessionCookieBaseAttrs,
} from '../../auth/sessionCookies';
import { config } from '../../config';
import { getPgPool } from '../../db/pg';
import { encryptDiscordToken } from '../../auth/discordTokenCrypto';
import { ensureFederatedOAuthTokenEncryptionReady } from '../../auth/federatedOAuthEncryptionGate';
import {
  buildGoogleAuthorizeUrl,
  exchangeGoogleOAuthCode,
  type FetchLike,
} from '../../services/integrations/googleApiClient';
import { resolveGoogleUserFromOAuthTokenResponse } from '../../services/integrations/googleOidc';
import { createPkceChallengeS256, createPkceVerifier } from '../../auth/pkce';
import {
  createGoogleOAuthState,
  decodeGoogleOAuthCookieValue,
  googleOAuthCookieMaxAgeSec,
  googleOAuthCookieName,
  encodeGoogleOAuthLinkCookieValue,
  encodeGoogleOAuthLoginCookieValue,
} from '../../domain/googleOAuthState';
import { tryJoinOfficialEchoServerOnSignup } from '../../services/auth/officialEchoServerOnSignup';
import {
  findGoogleLinkOwnerForGoogleSub,
  getUserIdByGoogleSub,
  upsertGoogleUserLink,
} from '../../domain/googleUserLinkRepo';
import {
  googleOAuthAppRedirect,
  isGoogleOauthConfigured,
} from '../../domain/googleOAuthRedirect';
import { oauthDesktopBridgeHandoffRedirect } from '../../domain/oauthDesktopBridgeRedirect';
import { validateAndHashDesktopOauthHandoffNonce } from '../../domain/desktopOAuthHandoffNonce';
import { createDesktopOauthHandoff } from '../../domain/desktopOAuthHandoffRepo';
import { isOAuthLoginStartOriginAllowed } from '../../auth/oauthLoginOrigin';

const OAUTH_FETCH: FetchLike = globalThis.fetch.bind(globalThis);

type GoogleLoginStartBody = {
  desktopBrowserHandoff?: boolean | string | number;
  desktopHandoffNonce?: string;
};

function isTruthyDesktopHandoffFlag(
  raw: GoogleLoginStartBody['desktopBrowserHandoff'],
): boolean {
  if (raw === true || raw === 1) return true;
  if (typeof raw === 'string') {
    const t = raw.trim().toLowerCase();
    return t === '1' || t === 'true' || t === 'yes' || t === 'on';
  }
  return false;
}

async function beginGoogleLogin(
  req: FastifyRequest,
  reply: FastifyReply,
  fastify: FastifyInstance,
  body?: GoogleLoginStartBody,
): Promise<{ authorizeUrl: string; redirectUri: string } | null> {
  const { mode } = await getAuthStore();
  if (mode !== 'postgres') {
    await sendError(
      reply,
      503,
      'NOT_AVAILABLE',
      'Google sign-in requires a database.',
    );
    return null;
  }
  if (!isGoogleOauthConfigured()) {
    fastify.log.warn(
      {
        hasGoogleOauthClientId: Boolean(config.googleOauthClientId),
        hasGoogleOauthClientSecret: Boolean(config.googleOauthClientSecret),
        hasGoogleOauthRedirectUri: Boolean(config.googleOauthRedirectUri),
      },
      'google/login/start: Google OAuth env incomplete',
    );
    await sendError(
      reply,
      503,
      'NOT_CONFIGURED',
      'Google sign-in is not enabled on this Echo API.',
    );
    return null;
  }
  if (config.isProduction && !config.echoDiscordTokenEncryptionKey) {
    await sendError(
      reply,
      503,
      'NOT_CONFIGURED',
      'ECHO_DISCORD_TOKEN_ENCRYPTION_KEY is required in production.',
    );
    return null;
  }
  if (!ensureFederatedOAuthTokenEncryptionReady(reply, fastify.log))
    return null;
  if (!getPgPool()) {
    await sendError(reply, 503, 'NOT_AVAILABLE', 'Database unavailable.');
    return null;
  }

  const desktopBrowserHandoff = isTruthyDesktopHandoffFlag(
    body?.desktopBrowserHandoff,
  );
  const desktopHandoffNonceHash = desktopBrowserHandoff
    ? validateAndHashDesktopOauthHandoffNonce(
        typeof body?.desktopHandoffNonce === 'string'
          ? body.desktopHandoffNonce
          : '',
      )
    : null;
  if (desktopBrowserHandoff && !desktopHandoffNonceHash) {
    await sendError(
      reply,
      400,
      'BAD_REQUEST',
      'Desktop handoff nonce is required.',
    );
    return null;
  }

  const state = createGoogleOAuthState();
  const pkceVerifier = createPkceVerifier();
  const pkceChallenge = createPkceChallengeS256(pkceVerifier);
  const exp = Date.now() + googleOAuthCookieMaxAgeSec() * 1000;
  const cookieVal = encodeGoogleOAuthLoginCookieValue(
    state,
    pkceVerifier,
    exp,
    desktopHandoffNonceHash ? { desktopHandoffNonceHash } : undefined,
  );
  setOAuthCookie(reply, cookieVal, req);

  const redirectUri = config.googleOauthRedirectUri;
  const authorizeUrl = buildGoogleAuthorizeUrl(state, false, pkceChallenge);
  return { authorizeUrl, redirectUri };
}

function setOAuthCookie(
  reply: FastifyReply,
  value: string,
  request: FastifyRequest,
) {
  const base = sessionCookieBaseAttrs(request);
  reply.setCookie(googleOAuthCookieName(), value, {
    httpOnly: true,
    ...base,
    maxAge: googleOAuthCookieMaxAgeSec(),
  });
}

function clearOAuthCookie(reply: FastifyReply) {
  reply.clearCookie(googleOAuthCookieName(), { path: '/' });
}

export default async function googleOAuthRoutes(
  fastify: FastifyInstance,
  _opts: FastifyPluginOptions,
) {
  await fastify.register(rateLimit, {
    max: 60,
    timeWindow: '15 minutes',
    keyGenerator: (req) => `google_oauth:${req.ip}`,
    addHeaders: { 'retry-after': true },
  });

  fastify.post(
    '/google/start',
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
          'Google linking requires a database.',
        );
      }
      if (!isGoogleOauthConfigured()) {
        fastify.log.warn(
          {
            hasGoogleOauthClientId: Boolean(config.googleOauthClientId),
            hasGoogleOauthClientSecret: Boolean(config.googleOauthClientSecret),
            hasGoogleOauthRedirectUri: Boolean(config.googleOauthRedirectUri),
          },
          'POST /google/start: Google OAuth env incomplete',
        );
        return sendError(
          reply,
          503,
          'NOT_CONFIGURED',
          'Google linking is not enabled on this Echo API. Set GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET, and GOOGLE_OAUTH_REDIRECT_URI on the backend process.',
        );
      }
      if (config.isProduction && !config.echoDiscordTokenEncryptionKey) {
        return sendError(
          reply,
          503,
          'NOT_CONFIGURED',
          'ECHO_DISCORD_TOKEN_ENCRYPTION_KEY is required in production for Google linking (federated tokens).',
        );
      }
      if (!ensureFederatedOAuthTokenEncryptionReady(reply, fastify.log)) return;
      const pool = getPgPool();
      if (!pool) {
        return sendError(reply, 503, 'NOT_AVAILABLE', 'Database unavailable.');
      }

      const state = createGoogleOAuthState();
      const pkceVerifier = createPkceVerifier();
      const pkceChallenge = createPkceChallengeS256(pkceVerifier);
      const exp = Date.now() + googleOAuthCookieMaxAgeSec() * 1000;
      const cookieVal = encodeGoogleOAuthLinkCookieValue(
        req.authUser.id,
        state,
        pkceVerifier,
        exp,
      );
      setOAuthCookie(reply, cookieVal, req);

      const redirectUri = config.googleOauthRedirectUri;
      if (!config.isProduction) {
        fastify.log.info(
          { redirectUri },
          'google_oauth: Google must list this exact URL under OAuth 2.0 Client IDs',
        );
      }

      const authorizeUrl = buildGoogleAuthorizeUrl(state, true, pkceChallenge); // prompt consent for refresh token
      return reply.code(200).send({ authorizeUrl, redirectUri });
    },
  );

  fastify.post<{ Body?: GoogleLoginStartBody }>(
    '/google/login/start',
    async (req: FastifyRequest, reply: FastifyReply) => {
      const out = await beginGoogleLogin(
        req,
        reply,
        fastify,
        (req.body as GoogleLoginStartBody | undefined) ?? undefined,
      );
      if (!out) return;
      const { authorizeUrl, redirectUri } = out;
      return reply.code(200).send({ authorizeUrl, redirectUri });
    },
  );

  fastify.get<{
    Querystring: {
      desktopBrowserHandoff?: string;
      desktopHandoffNonce?: string;
    };
  }>(
    '/google/login/start',
    async (req: FastifyRequest, reply: FastifyReply) => {
      const fetchSite = req.headers['sec-fetch-site'];
      const fetchMode = req.headers['sec-fetch-mode'];
      if (
        fetchSite === 'cross-site' ||
        fetchMode === 'no-cors' ||
        fetchMode === 'cors'
      ) {
        return sendError(
          reply,
          403,
          'FORBIDDEN',
          'Cross-site initiation of OAuth login is not permitted.',
        );
      }
      if (!fetchSite) {
        if (!isOAuthLoginStartOriginAllowed(req.headers)) {
          return sendError(
            reply,
            403,
            'FORBIDDEN',
            'Cross-site initiation of OAuth login is not permitted.',
          );
        }
      }
      const q = req.query as
        | { desktopBrowserHandoff?: string; desktopHandoffNonce?: string }
        | undefined;
      const out = await beginGoogleLogin(req, reply, fastify, {
        desktopBrowserHandoff:
          q?.desktopBrowserHandoff === '1' ||
          q?.desktopBrowserHandoff === 'true',
        desktopHandoffNonce: q?.desktopHandoffNonce,
      });
      if (!out) return;
      return reply.code(302).redirect(out.authorizeUrl);
    },
  );

  fastify.get<{
    Querystring: {
      code?: string;
      state?: string;
      error?: string;
      error_description?: string;
    };
  }>('/google/callback', async (req, reply) => {
    if (!isGoogleOauthConfigured()) {
      return reply
        .code(302)
        .redirect(googleOAuthAppRedirect(false, 'not_configured'));
    }
    if (config.isProduction && !config.echoDiscordTokenEncryptionKey) {
      return reply
        .code(302)
        .redirect(googleOAuthAppRedirect(false, 'missing_encryption_key'));
    }

    const q = req.query;
    if (typeof q.error === 'string' && q.error) {
      clearOAuthCookie(reply);
      const raw = q.error.trim();
      const code =
        raw
          .replace(/[^a-zA-Z0-9_-]/g, '')
          .slice(0, 64)
          .toLowerCase() || 'oauth_error';
      fastify.log.warn(
        { googleOAuthCallbackError: raw },
        'google_oauth: Google redirected with error=',
      );
      return reply.code(302).redirect(googleOAuthAppRedirect(false, code));
    }
    const code = typeof q.code === 'string' ? q.code.trim() : '';
    const state = typeof q.state === 'string' ? q.state.trim() : '';
    if (!code || !state) {
      clearOAuthCookie(reply);
      return reply
        .code(302)
        .redirect(googleOAuthAppRedirect(false, 'invalid_callback'));
    }

    const rawCookie =
      (req.cookies as Record<string, string | undefined>)?.[
        googleOAuthCookieName()
      ] ?? '';
    const payload = rawCookie ? decodeGoogleOAuthCookieValue(rawCookie) : null;
    clearOAuthCookie(reply);

    if (!payload || payload.state !== state) {
      return reply
        .code(302)
        .redirect(googleOAuthAppRedirect(false, 'bad_state'));
    }

    const pool = getPgPool();
    if (!pool) {
      return reply
        .code(302)
        .redirect(googleOAuthAppRedirect(false, 'no_database'));
    }

    let tokenResponse: Awaited<ReturnType<typeof exchangeGoogleOAuthCode>>;
    try {
      tokenResponse = await exchangeGoogleOAuthCode(
        code,
        config.googleOauthRedirectUri,
        payload.pkceVerifier,
        OAUTH_FETCH,
      );
    } catch (e) {
      fastify.log.warn(e, 'google_oauth_token_exchange_failed');
      return reply
        .code(302)
        .redirect(googleOAuthAppRedirect(false, 'token_exchange'));
    }

    let me: Awaited<ReturnType<typeof resolveGoogleUserFromOAuthTokenResponse>>;
    try {
      me = await resolveGoogleUserFromOAuthTokenResponse(
        tokenResponse,
        OAUTH_FETCH,
      );
    } catch (e) {
      fastify.log.warn(e, 'google_oauth_me_failed');
      return reply
        .code(302)
        .redirect(googleOAuthAppRedirect(false, 'google_me'));
    }

    const googleSub = me.sub;
    if (!googleSub) {
      fastify.log.warn('google_oauth_me_missing_sub');
      return reply
        .code(302)
        .redirect(googleOAuthAppRedirect(false, 'google_me'));
    }

    const loginFlow = payload.flow === 'login';
    const redirectOpts = loginFlow
      ? ({ kind: 'login' as const } as const)
      : undefined;
    const { store, mode } = await getAuthStore();
    if (mode !== 'postgres') {
      return reply
        .code(302)
        .redirect(googleOAuthAppRedirect(false, 'not_available', redirectOpts));
    }

    let targetUserId: string;
    if (payload.flow === 'login') {
      const echoUserId = await getUserIdByGoogleSub(pool, googleSub);
      if (!echoUserId) {
        // Provision
        try {
          const email = me.email?.trim() || undefined;
          const displayName = (me.name || me.given_name || '').trim();
          const usernameBase = email
            ? email.split('@')[0]
            : me.given_name || 'google_user';

          // Simple uniqueness logic: try username, if fail, try username+random
          let userRecord;
          try {
            userRecord = await store.createOAuthUser({
              username: usernameBase,
              email,
              displayName: displayName || undefined,
              emailVerifiedFromIdp: Boolean(me.email_verified),
            });
          } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : undefined;
            if (msg === 'EMAIL_IN_USE') {
              return reply
                .code(302)
                .redirect(
                  googleOAuthAppRedirect(
                    false,
                    'oauth_email_conflict',
                    redirectOpts,
                  ),
                );
            }
            if (msg === 'INVALID_EMAIL_PROVIDER') {
              return reply
                .code(302)
                .redirect(
                  googleOAuthAppRedirect(
                    false,
                    'invalid_email_provider',
                    redirectOpts,
                  ),
                );
            }
            if (msg === 'USERNAME_TAKEN') {
              const randomSuffix = randomInt(1000, 10_000);
              userRecord = await store.createOAuthUser({
                username: `${usernameBase}${randomSuffix}`,
                email,
                displayName: displayName || undefined,
                emailVerifiedFromIdp: Boolean(me.email_verified),
              });
            } else {
              throw err;
            }
          }
          targetUserId = userRecord.id;
          void tryJoinOfficialEchoServerOnSignup(fastify.log, targetUserId, {
            joinClientIp: req.ip,
          });
        } catch (err: unknown) {
          fastify.log.error(err, 'google_oauth_provision_failed');
          const msg = err instanceof Error ? err.message : undefined;
          if (msg === 'EMAIL_IN_USE') {
            return reply
              .code(302)
              .redirect(
                googleOAuthAppRedirect(
                  false,
                  'oauth_email_conflict',
                  redirectOpts,
                ),
              );
          }
          if (msg === 'INVALID_EMAIL_PROVIDER') {
            return reply
              .code(302)
              .redirect(
                googleOAuthAppRedirect(
                  false,
                  'invalid_email_provider',
                  redirectOpts,
                ),
              );
          }
          return reply
            .code(302)
            .redirect(
              googleOAuthAppRedirect(false, 'persist_failed', redirectOpts),
            );
        }
      } else {
        targetUserId = echoUserId;
      }
    } else {
      targetUserId = payload.userId;
    }

    const otherUser = await findGoogleLinkOwnerForGoogleSub(
      pool,
      googleSub,
      targetUserId,
    );
    if (otherUser) {
      return reply
        .code(302)
        .redirect(
          googleOAuthAppRedirect(false, 'google_already_linked', redirectOpts),
        );
    }

    const user = await store.getUserById(targetUserId);
    if (!user) {
      return reply
        .code(302)
        .redirect(googleOAuthAppRedirect(false, 'user_gone', redirectOpts));
    }

    if (payload.flow === 'login') {
      if (user.totpEnabled) {
        return reply
          .code(302)
          .redirect(
            googleOAuthAppRedirect(false, 'google_login_mfa', redirectOpts),
          );
      }
      if (user.isGuest) {
        return reply
          .code(302)
          .redirect(
            googleOAuthAppRedirect(false, 'google_not_linked', redirectOpts),
          );
      }
    }

    const expiresAt =
      typeof tokenResponse.expires_in === 'number' &&
      Number.isFinite(tokenResponse.expires_in)
        ? new Date(Date.now() + tokenResponse.expires_in * 1000).toISOString()
        : null;

    let accessCipher: string;
    let refreshCipher: string | null = null;
    try {
      // Reuse ECHO_DISCORD_TOKEN_ENCRYPTION_KEY since they are both federation tokens
      accessCipher = encryptDiscordToken(tokenResponse.access_token);
      if (tokenResponse.refresh_token) {
        refreshCipher = encryptDiscordToken(tokenResponse.refresh_token);
      }
    } catch (err) {
      fastify.log.error(err, 'google_oauth_encrypt_failed');
      return reply
        .code(302)
        .redirect(
          googleOAuthAppRedirect(false, 'encrypt_failed', redirectOpts),
        );
    }

    const normalizedJson = {
      name: me.name || me.given_name,
      picture: me.picture,
      emailPresent: Boolean(me.email),
    };

    try {
      await upsertGoogleUserLink(pool, {
        userId: targetUserId,
        googleSub,
        accessTokenCipher: accessCipher,
        refreshTokenCipher: refreshCipher,
        tokenExpiresAt: expiresAt,
        scope: tokenResponse.scope || config.googleOauthScopes,
        googleNormalized: normalizedJson,
        mergeKind: 'partial',
      });
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code;
      if (code === '23505') {
        return reply
          .code(302)
          .redirect(
            googleOAuthAppRedirect(
              false,
              'google_already_linked',
              redirectOpts,
            ),
          );
      }
      fastify.log.error(err, 'google_oauth_upsert_failed');
      return reply
        .code(302)
        .redirect(
          googleOAuthAppRedirect(false, 'persist_failed', redirectOpts),
        );
    }

    if (payload.flow === 'login') {
      clearGuestBindingCookie(reply);
      const audit = loginAuditDigests(req);
      const desktopHandoff = payload.desktopHandoff === true;
      const desktopHandoffNonceHash = payload.desktopHandoffNonceHash;
      try {
        if (desktopHandoff) {
          if (!desktopHandoffNonceHash) {
            return reply
              .code(302)
              .redirect(
                googleOAuthAppRedirect(false, 'bad_state', redirectOpts),
              );
          }
          const { code } = await createDesktopOauthHandoff(
            pool,
            user.id,
            desktopHandoffNonceHash,
          );
          fastify.log.info(
            {
              userId: user.id,
              handoffCodeLen: code.length,
              hasNonceHash: Boolean(desktopHandoffNonceHash),
            },
            'google_oauth_desktop_handoff_created',
          );
          return reply
            .code(302)
            .redirect(oauthDesktopBridgeHandoffRedirect(code));
        }
        await issueEchoBrowserSession(
          store,
          { id: user.id, username: user.username },
          reply,
          req,
        );
        void store.recordLoginEvent({
          userId: user.id,
          eventType: 'login_success',
          ipDigest: audit.ipDigest,
          uaDigest: audit.uaDigest,
        });
      } catch (err) {
        fastify.log.error(err, 'google_oauth_login_session_failed');
        return reply
          .code(302)
          .redirect(
            googleOAuthAppRedirect(false, 'persist_failed', redirectOpts),
          );
      }
      return reply
        .code(302)
        .redirect(googleOAuthAppRedirect(true, undefined, { kind: 'login' }));
    }

    return reply.code(302).redirect(googleOAuthAppRedirect(true));
  });
}
