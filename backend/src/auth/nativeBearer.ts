import type { FastifyRequest } from 'fastify';
import { config } from '../config';
import {
  signAccessToken,
  verifyAccessToken,
  type AccessTokenPayload,
} from './token';

export const NATIVE_BEARER_TOKEN_TYP = 'native_session' as const;

export type SessionBoundAccessTokenPayload = AccessTokenPayload & {
  sid: string;
  typ: typeof NATIVE_BEARER_TOKEN_TYP;
};

export function isNativeBearerClient(req: FastifyRequest | undefined): boolean {
  const raw = req?.headers?.['x-echo-client'];
  return typeof raw === 'string' && raw.trim().toLowerCase() === 'ios';
}

export function nativeBearerEnabledForRequest(
  req: FastifyRequest | undefined,
): boolean {
  return config.authNativeBearer && isNativeBearerClient(req);
}

/** CSRF protects cookie sessions; native bearer uses Authorization header instead. */
export function isNativeBearerCsrfExempt(req: FastifyRequest): boolean {
  if (!config.authNativeBearer) return false;
  if (!isNativeBearerClient(req)) return false;
  const auth = req.headers.authorization;
  return typeof auth === 'string' && auth.startsWith('Bearer ');
}

export function signSessionBoundAccessToken(input: {
  userId: string;
  username: string;
  sessionId: string;
}): string {
  return signAccessToken({
    sub: input.userId,
    username: input.username,
    sid: input.sessionId,
    typ: NATIVE_BEARER_TOKEN_TYP,
  });
}

export function verifySessionBoundAccessToken(
  token: string,
): SessionBoundAccessTokenPayload {
  const decoded = verifyAccessToken(token) as SessionBoundAccessTokenPayload;
  if (
    decoded?.typ !== NATIVE_BEARER_TOKEN_TYP ||
    typeof decoded.sid !== 'string' ||
    !decoded.sid.trim()
  ) {
    throw new Error('Invalid native session token');
  }
  return decoded;
}

/** Approximate access-token TTL in seconds (matches `config.jwtExpiresIn`). */
export function nativeAccessTokenExpiresInSec(): number {
  const raw = config.jwtExpiresIn.trim();
  const m = /^(\d+)\s*m$/i.exec(raw);
  if (m) return Math.max(60, parseInt(m[1]!, 10) * 60);
  const s = /^(\d+)\s*s$/i.exec(raw);
  if (s) return Math.max(60, parseInt(s[1]!, 10));
  const h = /^(\d+)\s*h$/i.exec(raw);
  if (h) return Math.max(60, parseInt(h[1]!, 10) * 3600);
  return 900;
}

export type NativeAuthTokens = {
  accessToken: string;
  refreshToken: string;
  expiresInSec: number;
};

export function buildNativeAuthResponse(
  accessToken: string,
  refreshToken: string,
): { auth: NativeAuthTokens } {
  return {
    auth: {
      accessToken,
      refreshToken,
      expiresInSec: nativeAccessTokenExpiresInSec(),
    },
  };
}
