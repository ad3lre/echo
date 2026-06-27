import type { FastifyReply, FastifyRequest } from 'fastify';
import { sendError } from '../api/errors';
import { config } from '../config';
import { verifyAccessToken } from './token';
import {
  nativeBearerEnabledForRequest,
  verifySessionBoundAccessToken,
} from './nativeBearer';
import { getAuthStore } from './store';
import type { AuthUser } from './types';
import {
  LEGACY_SESSION_COOKIE,
  SESSION_COOKIE,
  getServerSession,
  deleteServerSession,
  touchServerSession,
} from './serverSession';
import { clientIpFromFastifyRequest } from '../net/clientIp';
import { replyIfInstanceBanned } from '../domain/instanceBanEnforcement';

declare module 'fastify' {
  interface FastifyRequest {
    authUser?: AuthUser;
    /** Set when authenticated via `echo_sid` cookie session. */
    authSessionId?: string;
    /** Set when authenticated via session-bound native bearer token. */
    authViaNativeBearer?: boolean;
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

async function finalizeAuthenticatedUser(
  req: FastifyRequest,
  reply: FastifyReply,
  user: AuthUser,
  opts?: { sessionId?: string; viaNativeBearer?: boolean },
): Promise<boolean> {
  const gate = checkGuestGates(user);
  if (gate) {
    if (gate.code === 401 && opts?.sessionId) {
      await deleteServerSession(opts.sessionId, user.id);
    }
    sendError(reply, gate.code, gate.errorCode, gate.message);
    return false;
  }
  if (
    await replyIfInstanceBanned(reply, {
      userId: user.id,
      rawIp: clientIpFromFastifyRequest(req),
    })
  ) {
    if (opts?.sessionId) await deleteServerSession(opts.sessionId, user.id);
    return false;
  }
  if (opts?.sessionId) req.authSessionId = opts.sessionId;
  if (opts?.viaNativeBearer) req.authViaNativeBearer = true;
  req.authUser = user;
  if (opts?.sessionId) void touchServerSession(opts.sessionId);
  return true;
}

export async function requireInstanceOperator(
  req: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const user = req.authUser;
  if (!user) {
    return sendError(reply, 401, 'UNAUTHORIZED', 'Missing or invalid session');
  }
  if (!user.isInstanceOperator) {
    return sendError(
      reply,
      403,
      'FORBIDDEN',
      'Instance operator access required',
    );
  }
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
       * revocation, password change, and account deletion. Always load the user
       * from the auth store on each request so suspension/guest gates cannot lag
       * behind `cachedUser` (used only to warm Redis on profile updates). */
      const user = await store.getUserById(sess.userId);
      if (!user) {
        await deleteServerSession(sid, sess.userId);
        return sendError(reply, 401, 'UNAUTHORIZED', 'User not found');
      }
      if (
        !(await finalizeAuthenticatedUser(req, reply, user, { sessionId: sid }))
      ) {
        return;
      }
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

  if (config.authNativeBearer) {
    const header = req.headers.authorization;
    if (header && typeof header === 'string' && header.startsWith('Bearer ')) {
      const token = header.slice('Bearer '.length);
      try {
        const payload = verifySessionBoundAccessToken(token);
        const sess = await getServerSession(payload.sid);
        if (sess && sess.userId === payload.sub) {
          const { store } = await getAuthStore();
          const active = await store.findRefreshTokenById(sess.refreshTokenId);
          if (active && active.userId === sess.userId) {
            const user = await store.getUserById(sess.userId);
            if (!user) {
              await deleteServerSession(payload.sid, sess.userId);
              return sendError(reply, 401, 'UNAUTHORIZED', 'User not found');
            }
            if (
              !(await finalizeAuthenticatedUser(req, reply, user, {
                sessionId: payload.sid,
                viaNativeBearer: true,
              }))
            ) {
              return;
            }
            return;
          }
        }
        if (sess) {
          await deleteServerSession(payload.sid, sess.userId);
        }
      } catch {
        if (debugAuth) {
          req.log.warn(
            {
              msg: 'echo.debug.auth.reject',
              reason: 'native_bearer_invalid_or_expired',
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
      if (!(await finalizeAuthenticatedUser(req, reply, user))) {
        return;
      }
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
