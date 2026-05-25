import type { FastifyReply, FastifyRequest } from 'fastify';
import { sendError } from '../api/errors';
import { config } from '../config';
import { verifyAccessToken } from './token';
import { getAuthStore } from './store';
import type { AuthUser } from './types';
import {
  LEGACY_SESSION_COOKIE,
  SESSION_COOKIE,
  getServerSession,
  deleteServerSession,
  touchServerSession,
} from './serverSession';

declare module 'fastify' {
  interface FastifyRequest {
    authUser?: AuthUser;
    /** Set when authenticated via `echo_sid` cookie session. */
    authSessionId?: string;
  }
}

function checkGuestGates(
  user: AuthUser,
): { code: number; errorCode: string; message: string } | null {
  if (user.isGuest && !config.guestAccountsEnabled) {
    return {
      code: 401,
      errorCode: 'GUESTS_DISABLED',
      message:
        'Guest accounts are not available. Create an account or sign in.',
    };
  }
  if (user.isGuest && user.guestDeletedAt) {
    return {
      code: 401,
      errorCode: 'UNAUTHORIZED',
      message: 'Guest session is no longer valid',
    };
  }
  if (user.isGuest && user.guestSuspendedUntil) {
    const until = new Date(user.guestSuspendedUntil).getTime();
    if (until > Date.now()) {
      return {
        code: 403,
        errorCode: 'GUEST_SUSPENDED',
        message: 'This guest session is temporarily suspended',
      };
    }
  }
  return null;
}

/**
 * Returns the authenticated user from a request that has passed `requireAuth`.
 * Prefer this over `req.authUser!` — it centralises the assertion and gives
 * a non-optional return type so call-sites don't need `!`.
 */
export function getAuthUser(req: FastifyRequest): AuthUser {
  const user = req.authUser;
  if (!user) throw new Error('getAuthUser called on unauthenticated request');
  return user;
}

export async function requireAuth(req: FastifyRequest, reply: FastifyReply) {
  const debugAuth = process.env.ECHO_DEBUG_AUTH === '1';
  const cookies = req.cookies as Record<string, string | undefined> | undefined;
  const sid = (
    cookies?.[SESSION_COOKIE] ?? cookies?.[LEGACY_SESSION_COOKIE]
  )?.trim();

  if (sid) {
    const sess = await getServerSession(sid);
    if (sess) {
      const { store } = await getAuthStore();
      const active = await store.findRefreshTokenById(sess.refreshTokenId);
      if (!active || active.userId !== sess.userId) {
        await deleteServerSession(sid, sess.userId);
        return sendError(
          reply,
          401,
          'UNAUTHORIZED',
          'Missing or invalid session',
        );
      }
      /* Session existence is authoritative: it is deleted on logout, token
       * revocation, password change, and account deletion. The cached user
       * avoids a DB round-trip on every request. Fall back to DB for
       * sessions created before the cache was introduced. */
      const user =
        sess.cachedUser ??
        (await (async () => {
          const { store } = await getAuthStore();
          return store.getUserById(sess.userId);
        })());
      if (!user) {
        await deleteServerSession(sid, sess.userId);
        return sendError(reply, 401, 'UNAUTHORIZED', 'User not found');
      }
      const gate = checkGuestGates(user);
      if (gate) {
        if (gate.code === 401) await deleteServerSession(sid, sess.userId);
        return sendError(reply, gate.code, gate.errorCode, gate.message);
      }
      req.authSessionId = sid;
      req.authUser = user;
      void touchServerSession(sid);
      return;
    }
    if (debugAuth) {
      req.log.warn(
        {
          msg: 'echo.debug.auth.reject',
          reason: 'session_cookie_present_but_session_missing',
          requestId: req.id,
          method: req.method,
          url: req.url,
          origin: req.headers.origin,
          host: req.headers.host,
        },
        'auth_reject',
      );
    }
  }

  if (config.authLegacyBearer) {
    const header = req.headers.authorization;
    if (header && typeof header === 'string' && header.startsWith('Bearer ')) {
      const token = header.slice('Bearer '.length);
      let payload: { sub: string; username: string };
      try {
        payload = verifyAccessToken(token);
      } catch {
        if (debugAuth) {
          req.log.warn(
            {
              msg: 'echo.debug.auth.reject',
              reason: 'legacy_bearer_invalid_or_expired',
              requestId: req.id,
              method: req.method,
              url: req.url,
              origin: req.headers.origin,
              host: req.headers.host,
            },
            'auth_reject',
          );
        }
        return sendError(
          reply,
          401,
          'UNAUTHORIZED',
          'Invalid or expired token',
        );
      }
      const { store } = await getAuthStore();
      const user = await store.getUserById(payload.sub);
      if (!user) {
        if (debugAuth) {
          req.log.warn(
            {
              msg: 'echo.debug.auth.reject',
              reason: 'legacy_bearer_user_not_found',
              requestId: req.id,
              method: req.method,
              url: req.url,
              origin: req.headers.origin,
              host: req.headers.host,
              userId: payload.sub,
            },
            'auth_reject',
          );
        }
        return sendError(reply, 401, 'UNAUTHORIZED', 'User not found');
      }
      const gate = checkGuestGates(user);
      if (gate) {
        if (debugAuth) {
          req.log.warn(
            {
              msg: 'echo.debug.auth.reject',
              reason: 'legacy_bearer_guest_gate',
              requestId: req.id,
              method: req.method,
              url: req.url,
              origin: req.headers.origin,
              host: req.headers.host,
              userId: user.id,
              gateCode: gate.code,
              gateErrorCode: gate.errorCode,
            },
            'auth_reject',
          );
        }
        return sendError(reply, gate.code, gate.errorCode, gate.message);
      }
      req.authUser = user;
      return;
    }
  }

  if (debugAuth) {
    req.log.warn(
      {
        msg: 'echo.debug.auth.reject',
        reason: 'missing_or_invalid_session',
        requestId: req.id,
        method: req.method,
        url: req.url,
        origin: req.headers.origin,
        host: req.headers.host,
        hasSessionCookie: Boolean(sid),
        hasAuthHeader: typeof req.headers.authorization === 'string',
        legacyBearerEnabled: config.authLegacyBearer,
      },
      'auth_reject',
    );
  }
  return sendError(reply, 401, 'UNAUTHORIZED', 'Missing or invalid session');
}
