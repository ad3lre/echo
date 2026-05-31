import type { FastifyInstance } from 'fastify';
import rateLimit from '@fastify/rate-limit';
import { authUserOrIpRateLimitKey } from '../../rateLimitKeys';
import { sendError } from '../../errors';
import { createRefreshToken, hashRefreshToken } from '../../../auth/token';
import { getAuthStore } from '../../../auth/store';
import { requireAuth } from '../../../auth/middleware';
import {
  createSessionId,
  createCsrfSecret,
  saveServerSession,
  getServerSession,
  deleteServerSession,
  updateSessionRefreshBinding,
  deleteAllServerSessionsForUser,
  deleteServerSessionByRefreshTokenId,
  LEGACY_SESSION_COOKIE,
  SESSION_COOKIE,
} from '../../../auth/serverSession';
import {
  setBrowserSessionCookies,
  clearBrowserSessionCookies,
  setRefreshCookie,
  LEGACY_REFRESH_COOKIE,
  REFRESH_COOKIE,
} from '../../../auth/sessionCookies';
import type { AuthRefreshBody, AuthLogoutBody } from '../../../auth/types';
import { refreshTokenExpiryIso } from '../../../auth/issueBrowserSession';
import { authSessionJsonBody } from '../../../auth/authSessionResponse';
import {
  buildNativeAuthResponse,
  nativeBearerEnabledForRequest,
  signSessionBoundAccessToken,
} from '../../../auth/nativeBearer';
import {
  disconnectAllSocketsForAuthUser,
  disconnectSocketsForAuthSession,
} from '../../../services/auth/socketSessionRevocation';

export default async function sessionRoutes(fastify: FastifyInstance) {
  function refreshLimiterKey(req: {
    ip: string;
    cookies: Record<string, string | undefined>;
    body?: unknown;
  }): string {
    const bodyToken =
      typeof (req.body as AuthRefreshBody | undefined)?.refreshToken ===
      'string'
        ? (req.body as AuthRefreshBody).refreshToken.trim()
        : '';
    const refreshCookie =
      req.cookies?.[REFRESH_COOKIE]?.trim() ||
      req.cookies?.[LEGACY_REFRESH_COOKIE]?.trim() ||
      bodyToken;
    if (refreshCookie) {
      return `auth_refresh_token:${hashRefreshToken(refreshCookie).slice(0, 24)}`;
    }
    return `auth_refresh_ip:${req.ip}`;
  }

  await fastify.register(async (refreshScope) => {
    await refreshScope.register(rateLimit, {
      max: 120,
      timeWindow: '15 minutes',
      keyGenerator: refreshLimiterKey,
      addHeaders: { 'retry-after': true },
    });
    refreshScope.post<{ Body: AuthRefreshBody }>(
      '/refresh',
      {
        schema: {
          body: {
            type: 'object',
            properties: {
              refreshToken: { type: 'string', minLength: 1 },
            },
            additionalProperties: false,
          },
        },
      },
      async (req, reply) => {
        try {
          const { store } = await getAuthStore();
          const cookies = req.cookies as
            | Record<string, string | undefined>
            | undefined;
          const refreshToken =
            req.body?.refreshToken?.trim() ||
            cookies?.[REFRESH_COOKIE] ||
            cookies?.[LEGACY_REFRESH_COOKIE];
          if (!refreshToken) {
            return sendError(
              reply,
              400,
              'REFRESH_TOKEN_REQUIRED',
              'Refresh token is required',
            );
          }
          const tokenHash = hashRefreshToken(refreshToken);
          const existing = await store.findActiveRefreshToken(tokenHash);
          if (!existing) {
            const classification =
              await store.classifyRefreshTokenHash(tokenHash);
            if (classification === 'revoked') {
              return sendError(
                reply,
                401,
                'REFRESH_TOKEN_REUSED',
                'Refresh token was already used. Retry the request.',
              );
            }
            clearBrowserSessionCookies(reply);
            return sendError(
              reply,
              401,
              'INVALID_REFRESH_TOKEN',
              'Refresh token is invalid or expired',
            );
          }
          let user = await store.getUserById(existing.userId);
          if (!user) {
            await store.revokeRefreshToken(existing.id);
            clearBrowserSessionCookies(reply);
            return sendError(
              reply,
              401,
              'INVALID_REFRESH_TOKEN',
              'Refresh token is invalid or expired',
            );
          }

          user = await store.ensureGuestDisplayAliasIfEmpty(user);
          const newRefresh = createRefreshToken();
          const rotation = await store.rotateRefreshTokenAtomic({
            tokenHash,
            nextTokenHash: hashRefreshToken(newRefresh),
            nextExpiresAt: refreshTokenExpiryIso(),
          });
          if (!rotation.ok) {
            if (rotation.reason === 'already_redeemed') {
              return sendError(
                reply,
                401,
                'REFRESH_TOKEN_REUSED',
                'Refresh token was already used. Retry the request.',
              );
            }
            clearBrowserSessionCookies(reply);
            return sendError(
              reply,
              401,
              'INVALID_REFRESH_TOKEN',
              'Refresh token is invalid or expired',
            );
          }
          const newRec = rotation.next;

          const sid = String(
            (req.cookies as Record<string, string | undefined>)?.[
              SESSION_COOKIE
            ] ??
              (req.cookies as Record<string, string | undefined>)?.[
                LEGACY_SESSION_COOKIE
              ] ??
              '',
          ).trim();
          const includeNativeAuth = nativeBearerEnabledForRequest(req);
          if (sid) {
            const sess = await getServerSession(sid);
            if (
              sess &&
              sess.userId === user.id &&
              sess.refreshTokenId === rotation.previousTokenId
            ) {
              await updateSessionRefreshBinding(sid, user.id, newRec.id, user);
              setRefreshCookie(reply, newRefresh, req);
              const accessToken = includeNativeAuth
                ? signSessionBoundAccessToken({
                    userId: user.id,
                    username: user.username,
                    sessionId: sid,
                  })
                : undefined;
              return reply.code(200).send(
                authSessionJsonBody({
                  user,
                  csrfToken: sess.csrfSecret,
                  ...(accessToken
                    ? {
                        nativeAuth: buildNativeAuthResponse(
                          accessToken,
                          newRefresh,
                        ).auth,
                      }
                    : {}),
                }),
              );
            }
            if (sess?.userId === user.id) {
              await deleteServerSession(sid, sess.userId);
            }
          }

          const sessionId = createSessionId();
          const csrfSecret = createCsrfSecret();
          await saveServerSession(sessionId, {
            userId: user.id,
            refreshTokenId: newRec.id,
            csrfSecret,
            cachedUser: user,
          });
          setBrowserSessionCookies(
            reply,
            {
              sessionId,
              csrfSecret,
              refreshToken: newRefresh,
            },
            req,
          );
          const accessToken = includeNativeAuth
            ? signSessionBoundAccessToken({
                userId: user.id,
                username: user.username,
                sessionId,
              })
            : undefined;
          return reply.code(200).send(
            authSessionJsonBody({
              user,
              csrfToken: csrfSecret,
              ...(accessToken
                ? {
                    nativeAuth: buildNativeAuthResponse(accessToken, newRefresh)
                      .auth,
                  }
                : {}),
            }),
          );
        } catch (err) {
          fastify.log.error(err, 'Auth refresh failed');
          return sendError(
            reply,
            500,
            'INTERNAL_ERROR',
            'Internal Server Error',
          );
        }
      },
    );
  });

  fastify.get(
    '/sessions',
    {
      preHandler: [requireAuth],
    },
    async (req, reply) => {
      if (!req.authUser)
        return sendError(reply, 401, 'UNAUTHORIZED', 'Unauthorized');
      const { store } = await getAuthStore();
      const sessions = await store.listActiveRefreshTokensByUser(
        req.authUser.id,
      );
      const sid = req.authSessionId?.trim();
      const sess = sid ? await getServerSession(sid) : null;
      const currentRtId = sess?.refreshTokenId?.trim() || null;

      return reply.code(200).send({
        sessions: sessions.map((s) => {
          const row: {
            id: string;
            createdAt: string;
            expiresAt: string;
            isCurrentSession?: boolean;
          } = {
            id: s.id,
            createdAt: s.createdAt,
            expiresAt: s.expiresAt,
          };
          if (currentRtId) {
            row.isCurrentSession = s.id === currentRtId;
          }
          return row;
        }),
      });
    },
  );

  fastify.post<{ Body: { sessionId: string } }>(
    '/sessions/revoke',
    {
      preHandler: [requireAuth],
      config: {
        rateLimit: {
          max: 30,
          timeWindow: '15 minutes',
          keyGenerator: authUserOrIpRateLimitKey,
        },
      },
      schema: {
        body: {
          type: 'object',
          required: ['sessionId'],
          properties: { sessionId: { type: 'string', minLength: 1 } },
          additionalProperties: false,
        },
      },
    },
    async (req, reply) => {
      if (!req.authUser)
        return sendError(reply, 401, 'UNAUTHORIZED', 'Unauthorized');
      const { store } = await getAuthStore();
      const sessions = await store.listActiveRefreshTokensByUser(
        req.authUser.id,
      );
      const hit = sessions.find((s) => s.id === req.body.sessionId.trim());
      if (!hit) return sendError(reply, 404, 'NOT_FOUND', 'Session not found');
      await store.revokeRefreshToken(hit.id);
      const sid = req.authSessionId?.trim();
      const sess = sid ? await getServerSession(sid) : null;
      if (sess?.refreshTokenId === hit.id) {
        await deleteServerSession(sid!, req.authUser.id);
        await disconnectSocketsForAuthSession(
          fastify,
          req.authUser.id,
          sid!,
          'session_revoked',
        );
        clearBrowserSessionCookies(reply);
      } else {
        const revokedSid = await deleteServerSessionByRefreshTokenId(
          req.authUser.id,
          hit.id,
        );
        if (revokedSid) {
          await disconnectSocketsForAuthSession(
            fastify,
            req.authUser.id,
            revokedSid,
            'session_revoked_remote',
          );
        }
      }
      return reply.code(200).send({ success: true });
    },
  );

  fastify.post<{ Body: AuthLogoutBody }>(
    '/logout',
    {
      preHandler: [requireAuth],
      config: {
        rateLimit: {
          max: 30,
          timeWindow: '15 minutes',
          keyGenerator: authUserOrIpRateLimitKey,
        },
      },
      schema: {
        body: {
          type: 'object',
          properties: {
            refreshToken: { type: 'string' },
            allSessions: { type: 'boolean' },
          },
          additionalProperties: false,
        },
      },
    },
    async (req, reply) => {
      if (!req.authUser)
        return sendError(reply, 401, 'UNAUTHORIZED', 'Unauthorized');
      const { store } = await getAuthStore();
      const allSessions = req.body?.allSessions === true;
      if (allSessions) {
        await store.revokeUserRefreshTokens(req.authUser.id);
        await deleteAllServerSessionsForUser(req.authUser.id);
        await disconnectAllSocketsForAuthUser(
          fastify,
          req.authUser.id,
          'logout_all_sessions',
        );
        clearBrowserSessionCookies(reply);
        return reply.code(200).send({ success: true });
      }
      const cookies = req.cookies as Record<string, string | undefined>;
      const refreshTokenFromReq =
        req.body?.refreshToken?.trim() ||
        cookies?.[REFRESH_COOKIE] ||
        cookies?.[LEGACY_REFRESH_COOKIE];
      const sid = req.authSessionId?.trim();
      const sess = sid ? await getServerSession(sid) : null;

      let revokedRefresh = false;
      if (refreshTokenFromReq) {
        const rec = await store.findActiveRefreshToken(
          hashRefreshToken(refreshTokenFromReq),
        );
        if (rec && rec.userId === req.authUser.id) {
          await store.revokeRefreshToken(rec.id);
          revokedRefresh = true;
        }
      }
      if (
        !revokedRefresh &&
        sess?.userId === req.authUser.id &&
        sess.refreshTokenId
      ) {
        /* `echo_rt` may be missing or stale on POST (cross-site, rotation races). Session always
         * carries the bound refresh token id — revoke so logout clears server-side session. */
        await store.revokeRefreshToken(sess.refreshTokenId);
        revokedRefresh = true;
      }
      if (!revokedRefresh && !sess) {
        return sendError(
          reply,
          400,
          'REFRESH_TOKEN_REQUIRED',
          'refreshToken is required unless allSessions=true',
        );
      }

      if (sid && sess?.userId === req.authUser.id) {
        await deleteServerSession(sid, req.authUser.id);
        await disconnectSocketsForAuthSession(
          fastify,
          req.authUser.id,
          sid,
          'logout',
        );
      }
      clearBrowserSessionCookies(reply);
      return reply.code(200).send({ success: true });
    },
  );
}
