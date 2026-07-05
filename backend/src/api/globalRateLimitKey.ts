import type { FastifyRequest } from 'fastify';
import {
  LEGACY_SESSION_COOKIE,
  SESSION_COOKIE,
  isServerSessionIdFormat,
  serverSessionExists,
} from '../auth/serverSession';
import { getAccessUserIdFromAuthHeader } from '../auth/token';
import { clientIpFromFastifyRequest } from '../net/clientIp';

function sessionCookieFromRequest(req: FastifyRequest): string | undefined {
  const cookies = req.cookies as Record<string, string | undefined> | undefined;
  return (
    cookies?.[SESSION_COOKIE]?.trim() ||
    cookies?.[LEGACY_SESSION_COOKIE]?.trim() ||
    undefined
  );
}

/**
 * Global HTTP rate-limit key: bearer user id, else verified session cookie, else IP.
 * Unvalidated session cookies must not get their own bucket (forged echo_sid rotation).
 */
export async function globalHttpRateLimitKey(
  req: FastifyRequest,
): Promise<string> {
  const userId = getAccessUserIdFromAuthHeader(req.headers.authorization);
  if (userId) return `uid:${userId}`;

  const ip = clientIpFromFastifyRequest(req);
  const sessionId = sessionCookieFromRequest(req);
  if (
    sessionId &&
    isServerSessionIdFormat(sessionId) &&
    (await serverSessionExists(sessionId))
  ) {
    return `sid:${sessionId}`;
  }

  return `ip:${ip}`;
}
