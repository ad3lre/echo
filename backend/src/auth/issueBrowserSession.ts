import type { FastifyReply, FastifyRequest } from 'fastify';
import { config } from '../config';
import type { AuthStore } from './store';
import type { AuthUser } from './types';
import { createRefreshToken, hashRefreshToken } from './token';
import {
  createSessionId,
  createCsrfSecret,
  saveServerSession,
} from './serverSession';
import { setBrowserSessionCookies } from './sessionCookies';
import {
  buildNativeAuthResponse,
  nativeBearerEnabledForRequest,
  signSessionBoundAccessToken,
  type NativeAuthTokens,
} from './nativeBearer';
import type { EchoBrowserSessionResult } from './authSessionResponse';
import { sessionClientContextFromRequest } from './sessionClientContext';

export function refreshTokenExpiryIso(): string {
  const ms = config.refreshTokenTtlDays * 24 * 60 * 60 * 1000;
  return new Date(Date.now() + ms).toISOString();
}

export async function issueEchoBrowserSession(
  store: AuthStore,
  user: { id: string; username: string },
  reply: FastifyReply,
  request?: FastifyRequest,
): Promise<EchoBrowserSessionResult> {
  const refreshToken = createRefreshToken();
  const refreshTokenHash = hashRefreshToken(refreshToken);
  const rec = await store.storeRefreshToken(
    user.id,
    refreshTokenHash,
    refreshTokenExpiryIso(),
    sessionClientContextFromRequest(request),
  );
  const full = await store.getUserById(user.id);
  if (!full) {
    throw new Error('USER_MISSING_AFTER_SESSION');
  }
  const sessionId = createSessionId();
  const csrfSecret = createCsrfSecret();
  await saveServerSession(sessionId, {
    userId: user.id,
    refreshTokenId: rec.id,
    csrfSecret,
    cachedUser: full,
  });
  setBrowserSessionCookies(
    reply,
    { sessionId, csrfSecret, refreshToken },
    request,
  );
  const base = { user: full, csrfToken: csrfSecret };
  if (!nativeBearerEnabledForRequest(request)) return base;
  const accessToken = signSessionBoundAccessToken({
    userId: user.id,
    username: user.username,
    sessionId,
  });
  return {
    ...base,
    nativeAuth: buildNativeAuthResponse(accessToken, refreshToken).auth,
  };
}
