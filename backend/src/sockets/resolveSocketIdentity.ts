import { randomBytes } from 'crypto';
import type { FastifyBaseLogger } from 'fastify';
import type { Handshake } from 'socket.io/dist/socket-types';
import { config } from '../config';
import { getAuthStore } from '../auth/store';
import type { AuthUser } from '../auth/types';
import { verifyAccessToken } from '../auth/token';
import { verifySessionBoundAccessToken } from '../auth/nativeBearer';
import {
  LEGACY_SESSION_COOKIE,
  SESSION_COOKIE,
  getServerSession,
} from '../auth/serverSession';
import { parseCookieValue } from './parseCookieHeader';
import { clientIpFromSocketHandshake } from '../net/clientIp';
import { checkInstanceBanBlocked } from '../domain/instanceBanEnforcement';

type SocketIdentityResult = {
  userId: string;
  authenticated: boolean;
  authSessionId?: string;
  /** True when the resolved auth user is a guest account. */
  isGuest: boolean;
  profileStatus?: AuthUser['status'];
};

const FALLBACK_USER_PREFIX = 'user_';

function getSocketToken(handshake: Handshake): string | undefined {
  const handshakeAuthToken = (handshake.auth as { token?: unknown } | undefined)
    ?.token;
  const authorization = handshake.headers?.authorization;
  const headerToken =
    typeof authorization === 'string' && authorization.startsWith('Bearer ')
      ? authorization.slice('Bearer '.length)
      : undefined;

  if (headerToken && typeof headerToken === 'string') return headerToken;
  if (typeof handshakeAuthToken === 'string') return handshakeAuthToken;
  return undefined;
}

function createFallbackUserId(): string {
  return `${FALLBACK_USER_PREFIX}${randomBytes(6).toString('base64url')}`;
}

async function socketUserBlocked(
  user: AuthUser,
  handshake: Handshake,
  log: FastifyBaseLogger,
  socketId: string,
): Promise<boolean> {
  const ban = await checkInstanceBanBlocked({
    userId: user.id,
    rawIp: clientIpFromSocketHandshake(
      handshake.headers as Record<string, string | string[] | undefined>,
      handshake.address,
    ),
  });
  if (ban.blocked) {
    log.warn(
      { socketId, userId: user.id, hits: ban.hits },
      'Socket connect rejected: instance ban',
    );
    return true;
  }
  return false;
}

async function authenticatedSocketIdentity(
  user: AuthUser,
  handshake: Handshake,
  log: FastifyBaseLogger,
  socketId: string,
  authSessionId?: string,
): Promise<SocketIdentityResult | null> {
  if (user.isGuest && user.guestDeletedAt) {
    return {
      userId: createFallbackUserId(),
      authenticated: false,
      isGuest: false,
    };
  }
  if (user.isGuest && user.guestSuspendedUntil) {
    const until = new Date(user.guestSuspendedUntil).getTime();
    if (until > Date.now()) {
      return {
        userId: createFallbackUserId(),
        authenticated: false,
        isGuest: false,
      };
    }
  }
  if (await socketUserBlocked(user, handshake, log, socketId)) {
    return {
      userId: createFallbackUserId(),
      authenticated: false,
      isGuest: false,
    };
  }
  return {
    userId: user.id,
    authenticated: true,
    authSessionId,
    isGuest: !!user.isGuest,
    profileStatus: user.status,
  };
}

export async function resolveSocketIdentity(
  handshake: Handshake,
  log: FastifyBaseLogger,
  socketId: string,
): Promise<SocketIdentityResult> {
  const fallbackUserId = createFallbackUserId();
  const cookieHeader =
    typeof handshake.headers?.cookie === 'string'
      ? handshake.headers.cookie
      : undefined;
  const sid =
    parseCookieValue(cookieHeader, SESSION_COOKIE) ??
    parseCookieValue(cookieHeader, LEGACY_SESSION_COOKIE);
  if (sid) {
    try {
      const sess = await getServerSession(sid);
      if (sess) {
        const { store } = await getAuthStore();
        const rt = await store.findRefreshTokenById(sess.refreshTokenId);
        if (rt && rt.userId === sess.userId) {
          const user = await store.getUserById(sess.userId);
          if (user) {
            const identity = await authenticatedSocketIdentity(
              user,
              handshake,
              log,
              socketId,
              sid,
            );
            if (identity) return identity;
          }
        }
      }
    } catch (err) {
      log.warn({ socketId, err }, 'Socket cookie session resolve failed');
    }
  }

  const token = getSocketToken(handshake);
  if (token && config.authNativeBearer) {
    try {
      const payload = verifySessionBoundAccessToken(token);
      const sess = await getServerSession(payload.sid);
      if (sess && sess.userId === payload.sub) {
        const { store } = await getAuthStore();
        const rt = await store.findRefreshTokenById(sess.refreshTokenId);
        if (rt && rt.userId === sess.userId) {
          const user = await store.getUserById(sess.userId);
          if (user) {
            const identity = await authenticatedSocketIdentity(
              user,
              handshake,
              log,
              socketId,
              payload.sid,
            );
            if (identity) return identity;
          }
        }
      }
    } catch (err) {
      log.warn({ socketId, err }, 'Socket native bearer resolve failed');
    }
  }

  if (token && config.authLegacyBearer) {
    try {
      const payload = verifyAccessToken(token);
      const { store } = await getAuthStore();
      const user = await store.getUserById(payload.sub);
      if (user) {
        const identity = await authenticatedSocketIdentity(
          user,
          handshake,
          log,
          socketId,
        );
        if (identity) return identity;
      }
      log.warn(
        { socketId, payloadSub: payload.sub },
        'Socket JWT user not found; using fallback user',
      );
    } catch {
      log.warn({ socketId }, 'Socket JWT invalid; using fallback user');
    }
  }

  return { userId: fallbackUserId, authenticated: false, isGuest: false };
}
