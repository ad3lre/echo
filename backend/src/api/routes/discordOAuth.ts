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
import { tryJoinOfficialEchoServerOnSignup } from '../../services/auth/officialEchoServerOnSignup';
import { getPgPool } from '../../db/pg';
import { ensureAppSchema } from '../../db/ensureAppSchema';
import { encryptDiscordToken } from '../../auth/discordTokenCrypto';
import { ensureFederatedOAuthTokenEncryptionReady } from '../../auth/federatedOAuthEncryptionGate';
import {
  buildDiscordAuthorizeUrl,
  exchangeDiscordOAuthCode,
  fetchDiscordConnectionsCount,
  fetchDiscordGuildCount,
  fetchDiscordMe,
  type FetchLike,
} from '../../services/integrations/discordApiClient';
import type { DecodedDiscordOAuthCookie } from '../../domain/discordOAuthState';
import {
  createDiscordOAuthState,
  decodeDiscordLoginSignedState,
  decodeDiscordOAuthCookieValue,
  discordOAuthCookieMaxAgeSec,
  discordOAuthCookieName,
  encodeDiscordLoginSignedState,
  encodeDiscordOAuthLinkCookieValue,
  encodeDiscordOAuthLoginCookieValue,
} from '../../domain/discordOAuthState';
import { validateAndHashDesktopOauthHandoffNonce } from '../../domain/desktopOAuthHandoffNonce';
import { mapDiscordUserToNormalized } from '../../domain/discordNormalized';
import { applyDiscordProfileMerge } from '../../domain/discordProfileMerge';
import { mergeDiscordShadows } from '../../domain/discordShadowMerge';
import { reapplyDiscordGrantRolesForLinkedUser } from '../../domain/discordImportParity';
import {
  findDiscordLinkOwnerForDiscordUser,
  getUserIdByDiscordUserId,
  upsertDiscordUserLink,
} from '../../domain/discordUserLinkRepo';
import {
  discordOAuthAppRedirect,
  discordOAuthDesktopBridgeRedirect,
  isDiscordOauthConfigured,
} from '../../domain/discordOAuthRedirect';
import { createDesktopOauthHandoff } from '../../domain/desktopOAuthHandoffRepo';
import { isValidEmailFormat } from '../../auth/email';
import { isOAuthLoginStartOriginAllowed } from '../../auth/oauthLoginOrigin';
import { clientIpFromFastifyRequest } from '../../net/clientIp';
import {
  evaluateGuestMint,
  recordGuestMintSuccess,
} from '../../services/auth/guestAbuseLimiter';

const OAUTH_FETCH: FetchLike = globalThis.fetch.bind(globalThis);

function setOAuthCookie(
  reply: FastifyReply,
  value: string,
  request: FastifyRequest,
) {
  const base = sessionCookieBaseAttrs(request);
  reply.setCookie(discordOAuthCookieName(), value, {
    httpOnly: true,
    ...base,
    maxAge: discordOAuthCookieMaxAgeSec(),
  });
}

function clearOAuthCookie(reply: FastifyReply) {
  reply.clearCookie(discordOAuthCookieName(), { path: '/' });
}

type DiscordLoginStartBody = {
  desktopBrowserHandoff?: boolean | string | number;
  desktopHandoffNonce?: string;
};

function isTruthyDesktopHandoffFlag(
  raw: DiscordLoginStartBody['desktopBrowserHandoff'],
): boolean {
  if (raw === true || raw === 1) return true;
  if (typeof raw === 'string') {
    const t = raw.trim().toLowerCase();
    return t === '1' || t === 'true' || t === 'yes' || t === 'on';
  }
  return false;
}

async function beginDiscordLogin(
  req: FastifyRequest,
  reply: FastifyReply,
  fastify: FastifyInstance,
  body?: DiscordLoginStartBody,
): Promise<{ authorizeUrl: string; redirectUri: string } | null> {
  const { mode } = await getAuthStore();
  if (mode !== 'postgres') {
    await sendError(
      reply,
      503,
      'NOT_AVAILABLE',
      'Discord sign-in requires a database.',
    );
    return null;
  }
  if (!isDiscordOauthConfigured()) {
    fastify.log.warn(
      {
        hasDiscordOauthClientId: Boolean(config.discordOauthClientId),
        hasDiscordOauthClientSecret: Boolean(config.discordOauthClientSecret),
        hasDiscordOauthRedirectUri: Boolean(config.discordOauthRedirectUri),
      },
      'discord/login/start: Discord OAuth env incomplete',
    );
    await sendError(
      reply,
      503,
      'NOT_CONFIGURED',
      'Discord sign-in is not enabled on this Echo API. Set DISCORD_OAUTH_CLIENT_ID, DISCORD_OAUTH_CLIENT_SECRET, and DISCORD_OAUTH_REDIRECT_URI.',
    );
    return null;
  }
  if (config.isProduction && !config.echoDiscordTokenEncryptionKey) {
    await sendError(
      reply,
      503,
      'NOT_CONFIGURED',
      'ECHO_DISCORD_TOKEN_ENCRYPTION_KEY is required in production for Discord OAuth.',
    );
    return null;
  }
  if (!ensureFederatedOAuthTokenEncryptionReady(reply, fastify.log))
    return null;
  const pool = getPgPool();
  if (!pool) {
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

  const { stateForDiscord, exp } = encodeDiscordLoginSignedState(
    desktopBrowserHandoff,
    desktopHandoffNonceHash ?? undefined,
  );
  const cookieVal = encodeDiscordOAuthLoginCookieValue(stateForDiscord, exp);
  setOAuthCookie(reply, cookieVal, req);

  const redirectUri = config.discordOauthRedirectUri;
  if (!config.isProduction) {
    fastify.log.info(
      { redirectUri },
      'discord_oauth_login: Discord must list this exact URL under OAuth2 → Redirects',
    );
  }

  return {
    authorizeUrl: buildDiscordAuthorizeUrl(stateForDiscord),
    redirectUri,
  };
}

export default async function discordOAuthRoutes(
  fastify: FastifyInstance,
  _opts: FastifyPluginOptions,
) {
  await fastify.register(rateLimit, {
    max: 60,
    timeWindow: '15 minutes',
    keyGenerator: (req) => `discord_oauth:${req.ip}`,
    addHeaders: { 'retry-after': true },
  });

  fastify.post(
    '/discord/start',
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
          'Discord linking requires a database.',
        );
      }
      if (!isDiscordOauthConfigured()) {
        fastify.log.warn(
          {
            hasDiscordOauthClientId: Boolean(config.discordOauthClientId),
            hasDiscordOauthClientSecret: Boolean(
              config.discordOauthClientSecret,
            ),
            hasDiscordOauthRedirectUri: Boolean(config.discordOauthRedirectUri),
          },
          'POST /discord/start: Discord OAuth env incomplete (not the Discord bot token)',
        );
        return sendError(
          reply,
          503,
          'NOT_CONFIGURED',
          'Discord linking is not enabled on this Echo API. Set DISCORD_OAUTH_CLIENT_ID, DISCORD_OAUTH_CLIENT_SECRET, and DISCORD_OAUTH_REDIRECT_URI on the backend process (separate from DISCORD_BOT_TOKEN).',
        );
      }
      if (config.isProduction && !config.echoDiscordTokenEncryptionKey) {
        return sendError(
          reply,
          503,
          'NOT_CONFIGURED',
          'ECHO_DISCORD_TOKEN_ENCRYPTION_KEY is required in production for Discord linking.',
        );
      }
      if (!ensureFederatedOAuthTokenEncryptionReady(reply, fastify.log)) return;
      const pool = getPgPool();
      if (!pool) {
        return sendError(reply, 503, 'NOT_AVAILABLE', 'Database unavailable.');
      }

      const state = createDiscordOAuthState();
      const exp = Date.now() + discordOAuthCookieMaxAgeSec() * 1000;
      const cookieVal = encodeDiscordOAuthLinkCookieValue(
        req.authUser.id,
        state,
        exp,
      );
      setOAuthCookie(reply, cookieVal, req);

      const redirectUri = config.discordOauthRedirectUri;
      if (!config.isProduction) {
        fastify.log.info(
          { redirectUri },
          'discord_oauth: Discord must list this exact URL under OAuth2 → Redirects (invalid OAuth2 redirect_uri = mismatch)',
        );
      }

      const authorizeUrl = buildDiscordAuthorizeUrl(state);
      return reply.code(200).send({ authorizeUrl, redirectUri });
    },
  );

  fastify.post<{
    Body: DiscordLoginStartBody;
  }>(
    '/discord/login/start',
    async (req: FastifyRequest, reply: FastifyReply) => {
      const out = await beginDiscordLogin(
        req,
        reply,
        fastify,
        req.body as DiscordLoginStartBody | undefined,
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
    '/discord/login/start',
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
      const out = await beginDiscordLogin(req, reply, fastify, {
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
  }>('/discord/callback', async (req, reply) => {
    if (!isDiscordOauthConfigured()) {
      return reply
        .code(302)
        .redirect(discordOAuthAppRedirect(false, 'not_configured'));
    }
    if (config.isProduction && !config.echoDiscordTokenEncryptionKey) {
      return reply
        .code(302)
        .redirect(discordOAuthAppRedirect(false, 'missing_encryption_key'));
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
      let desc = '';
      if (typeof q.error_description === 'string') {
        try {
          desc = decodeURIComponent(q.error_description).slice(0, 500);
        } catch {
          desc = q.error_description.slice(0, 500);
        }
      }
      fastify.log.warn(
        {
          discordOAuthCallbackError: raw,
          discordOAuthCallbackErrorDescription: desc || undefined,
        },
        'discord_oauth: Discord redirected to callback with error= (user cancel, invalid_scope, redirect mismatch, etc.)',
      );
      return reply.code(302).redirect(discordOAuthAppRedirect(false, code));
    }
    const code = typeof q.code === 'string' ? q.code.trim() : '';
    const state = typeof q.state === 'string' ? q.state.trim() : '';
    if (!code || !state) {
      clearOAuthCookie(reply);
      return reply
        .code(302)
        .redirect(discordOAuthAppRedirect(false, 'invalid_callback'));
    }

    const rawCookie =
      (req.cookies as Record<string, string | undefined>)?.[
        discordOAuthCookieName()
      ] ?? '';
    const signedLogin = decodeDiscordLoginSignedState(state);
    const cookiePayload = rawCookie
      ? decodeDiscordOAuthCookieValue(rawCookie)
      : null;
    clearOAuthCookie(reply);

    let payload: DecodedDiscordOAuthCookie | null = null;
    let desktopHandoff = false;
    let desktopHandoffNonceHash: string | undefined;

    if (signedLogin) {
      desktopHandoff = signedLogin.desktopHandoff;
      desktopHandoffNonceHash = signedLogin.desktopHandoffNonceHash;
      /**
       * Web login must prove browser continuity with the HttpOnly OAuth cookie.
       * Only the desktop handoff flow may fall back to signed `state` alone
       * because the callback can land in a different system browser that does
       * not share the API cookie jar.
       */
      if (desktopHandoff) {
        if (!desktopHandoffNonceHash) {
          return reply
            .code(302)
            .redirect(discordOAuthAppRedirect(false, 'bad_state'));
        }
        payload = { flow: 'login', state, exp: signedLogin.exp };
      } else if (
        cookiePayload?.flow === 'login' &&
        cookiePayload.state === state
      ) {
        payload = cookiePayload;
      }
    } else if (cookiePayload && cookiePayload.state === state) {
      payload = cookiePayload;
      if (cookiePayload.flow === 'login') desktopHandoff = false;
    }

    if (!payload) {
      const reason =
        !signedLogin && !rawCookie.trim()
          ? 'no_cookie'
          : !signedLogin && !cookiePayload
            ? 'cookie_expired_or_invalid_signature'
            : 'state_mismatch';
      fastify.log.warn(
        {
          discordOAuthBadStateReason: reason,
          callbackHost: req.hostname,
        },
        'discord_oauth: bad_state (see discordOAuthBadStateReason — often redirect URI host/port ≠ cookie origin, or JWT_SECRET changed, or >10min on Discord)',
      );
      return reply
        .code(302)
        .redirect(discordOAuthAppRedirect(false, 'bad_state'));
    }

    const redirectOpts =
      payload.flow === 'login'
        ? ({ kind: 'login' as const } as const)
        : undefined;

    const pool = getPgPool();
    if (!pool) {
      return reply
        .code(302)
        .redirect(discordOAuthAppRedirect(false, 'no_database'));
    }
    try {
      await ensureAppSchema(pool);
    } catch (err) {
      fastify.log.error(err, 'discord_oauth_schema_ensure_failed');
      return reply
        .code(302)
        .redirect(
          discordOAuthAppRedirect(false, 'persist_failed', redirectOpts),
        );
    }

    let tokenResponse: Awaited<ReturnType<typeof exchangeDiscordOAuthCode>>;
    try {
      tokenResponse = await exchangeDiscordOAuthCode(
        code,
        config.discordOauthRedirectUri,
        undefined,
        OAUTH_FETCH,
      );
    } catch (e) {
      fastify.log.warn(e, 'discord_oauth_token_exchange_failed');
      return reply
        .code(302)
        .redirect(discordOAuthAppRedirect(false, 'token_exchange'));
    }

    let me: Awaited<ReturnType<typeof fetchDiscordMe>>;
    try {
      me = await fetchDiscordMe(tokenResponse.access_token, OAUTH_FETCH);
    } catch (e) {
      fastify.log.warn(e, 'discord_oauth_me_failed');
      return reply
        .code(302)
        .redirect(discordOAuthAppRedirect(false, 'discord_me'));
    }

    const normalized = mapDiscordUserToNormalized(me);
    const scopeStr = (
      tokenResponse.scope || config.discordOauthScopes
    ).toLowerCase();
    if (scopeStr.includes('guilds')) {
      normalized.guildCount = await fetchDiscordGuildCount(
        tokenResponse.access_token,
        OAUTH_FETCH,
      );
    }
    if (scopeStr.includes('connections')) {
      normalized.connectionsCount = await fetchDiscordConnectionsCount(
        tokenResponse.access_token,
        OAUTH_FETCH,
      );
    }

    const { store, mode } = await getAuthStore();
    if (mode !== 'postgres') {
      return reply
        .code(302)
        .redirect(
          discordOAuthAppRedirect(false, 'not_available', redirectOpts),
        );
    }

    let targetUserId: string;
    /** True when this callback created a new guest via Discord login (finish signup in-app). */
    let provisionedNewGuestViaDiscordLogin = false;
    if (payload.flow === 'login') {
      const echoUserId = await getUserIdByDiscordUserId(
        pool,
        normalized.discordUserId,
      );
      if (!echoUserId) {
        if (!config.guestAccountsEnabled) {
          return reply
            .code(302)
            .redirect(
              discordOAuthAppRedirect(false, 'guests_disabled', redirectOpts),
            );
        }
        const mintIp = clientIpFromFastifyRequest(req);
        const mintGate = await evaluateGuestMint(mintIp);
        if (!mintGate.ok) {
          const errCode =
            mintGate.reason === 'GUEST_MINT_BLOCKED'
              ? 'guest_mint_blocked'
              : 'guest_mint_limit';
          return reply
            .code(302)
            .redirect(discordOAuthAppRedirect(false, errCode, redirectOpts));
        }
        const guest = await store.createGuestUser();
        if (!guest) {
          return reply
            .code(302)
            .redirect(
              discordOAuthAppRedirect(false, 'persist_failed', redirectOpts),
            );
        }
        await recordGuestMintSuccess(mintIp);
        const emailHint = me.email?.trim();
        if (emailHint && isValidEmailFormat(emailHint)) {
          await store.setGuestPendingEmail(guest.id, emailHint);
        }
        targetUserId = guest.id;
        provisionedNewGuestViaDiscordLogin = true;
        void tryJoinOfficialEchoServerOnSignup(fastify.log, targetUserId, {
          joinClientIp: mintIp,
          io: fastify.io,
        });
      } else {
        targetUserId = echoUserId;
      }
    } else {
      targetUserId = payload.userId;
    }

    const otherUser = await findDiscordLinkOwnerForDiscordUser(
      pool,
      normalized.discordUserId,
      targetUserId,
    );
    if (otherUser) {
      return reply
        .code(302)
        .redirect(
          discordOAuthAppRedirect(
            false,
            'discord_already_linked',
            redirectOpts,
          ),
        );
    }

    const user = await store.getUserById(targetUserId);
    if (!user) {
      return reply
        .code(302)
        .redirect(discordOAuthAppRedirect(false, 'user_gone', redirectOpts));
    }

    if (payload.flow === 'login' && !user.isGuest && user.totpEnabled) {
      return reply
        .code(302)
        .redirect(
          discordOAuthAppRedirect(false, 'discord_login_mfa', redirectOpts),
        );
    }

    // When a guest links Discord (onboarding), carry over Discord email as a suggested
    // upgrade email so the client can prefill the "create password" step.
    if (user.isGuest) {
      const emailHint = me.email?.trim();
      if (emailHint && isValidEmailFormat(emailHint)) {
        try {
          await store.setGuestPendingEmail(user.id, emailHint);
        } catch {
          /* not a blocker for linking */
        }
      }
    }

    let mergeKind: 'full' | 'partial';
    try {
      mergeKind = await applyDiscordProfileMerge({
        store,
        user,
        me,
        normalized,
        pool,
      });
    } catch (err) {
      fastify.log.error(err, 'discord_oauth_merge_failed');
      return reply
        .code(302)
        .redirect(discordOAuthAppRedirect(false, 'merge_failed', redirectOpts));
    }

    const expiresAt =
      typeof tokenResponse.expires_in === 'number' &&
      Number.isFinite(tokenResponse.expires_in)
        ? new Date(Date.now() + tokenResponse.expires_in * 1000).toISOString()
        : null;

    let accessCipher: string;
    let refreshCipher: string | null = null;
    try {
      accessCipher = encryptDiscordToken(tokenResponse.access_token);
      if (tokenResponse.refresh_token) {
        refreshCipher = encryptDiscordToken(tokenResponse.refresh_token);
      }
    } catch (err) {
      fastify.log.error(err, 'discord_oauth_encrypt_failed');
      return reply
        .code(302)
        .redirect(
          discordOAuthAppRedirect(false, 'encrypt_failed', redirectOpts),
        );
    }

    const rawCache = {
      fetchedAt: new Date().toISOString(),
      me: { id: me.id, username: me.username },
    };

    try {
      await upsertDiscordUserLink(pool, {
        userId: targetUserId,
        discordUserId: normalized.discordUserId,
        accessTokenCipher: accessCipher,
        refreshTokenCipher: refreshCipher,
        tokenExpiresAt: expiresAt,
        scope: tokenResponse.scope || config.discordOauthScopes,
        discordNormalized: normalized,
        discordRawCache: rawCache,
        mergeKind,
      });

      // 5. Merge shadow users created by Discord message imports
      try {
        await mergeDiscordShadows(pool, {
          discordUserId: normalized.discordUserId,
          canonicalUserId: targetUserId,
        });
      } catch (mergeErr) {
        req.log.error(
          {
            err: mergeErr,
            userId: targetUserId,
            discordUserId: normalized.discordUserId,
          },
          'discord_oauth_shadow_merge_failed',
        );
        /* not a blocker for the main link flow */
      }

      try {
        await reapplyDiscordGrantRolesForLinkedUser(pool, {
          echoUserId: targetUserId,
          discordUserId: normalized.discordUserId,
        });
      } catch (reapplyErr) {
        req.log.warn(
          {
            err: reapplyErr,
            userId: targetUserId,
            discordUserId: normalized.discordUserId,
          },
          'discord_oauth_role_reapply_failed',
        );
      }
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code;
      if (code === '23505') {
        return reply
          .code(302)
          .redirect(
            discordOAuthAppRedirect(
              false,
              'discord_already_linked',
              redirectOpts,
            ),
          );
      }
      fastify.log.error(err, 'discord_oauth_upsert_failed');
      return reply
        .code(302)
        .redirect(
          discordOAuthAppRedirect(false, 'persist_failed', redirectOpts),
        );
    }

    if (payload.flow === 'login') {
      clearGuestBindingCookie(reply);
      const audit = loginAuditDigests(req);
      try {
        if (desktopHandoff) {
          if (!desktopHandoffNonceHash) {
            return reply
              .code(302)
              .redirect(
                discordOAuthAppRedirect(false, 'bad_state', redirectOpts),
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
              discordUserId: normalized.discordUserId,
              handoffCodeLen: code.length,
              hasNonceHash: Boolean(desktopHandoffNonceHash),
            },
            'discord_oauth_desktop_handoff_created',
          );
          return reply
            .code(302)
            .redirect(discordOAuthDesktopBridgeRedirect(code));
        }
        const { user: sessionUser } = await issueEchoBrowserSession(
          store,
          { id: user.id, username: user.username },
          reply,
          req,
        );
        void store.recordLoginEvent({
          userId: sessionUser.id,
          eventType: 'login_success',
          ipDigest: audit.ipDigest,
          uaDigest: audit.uaDigest,
        });
        return reply.code(302).redirect(
          discordOAuthAppRedirect(true, undefined, {
            kind: 'login',
            verifyEmailSent: false,
            guestSignup: provisionedNewGuestViaDiscordLogin,
          }),
        );
      } catch (err) {
        fastify.log.error(err, 'discord_oauth_login_session_failed');
        return reply
          .code(302)
          .redirect(
            discordOAuthAppRedirect(false, 'persist_failed', redirectOpts),
          );
      }
    }

    return reply.code(302).redirect(discordOAuthAppRedirect(true));
  });
}
