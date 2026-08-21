import { createHmac, timingSafeEqual } from 'crypto';
import type { FastifyReply } from 'fastify';
import { config } from '../config';
import {
  CSRF_COOKIE,
  LEGACY_CSRF_COOKIE,
  LEGACY_SESSION_COOKIE,
  SESSION_COOKIE,
} from './serverSession';

export const LEGACY_REFRESH_COOKIE = 'echo_rt';
export const REFRESH_COOKIE = config.isProduction
  ? '__Host-echo_rt'
  : LEGACY_REFRESH_COOKIE;

export const LEGACY_GUEST_BINDING_COOKIE = 'echo_guest_uid';
export const GUEST_BINDING_COOKIE = config.isProduction
  ? '__Host-echo_guest_uid'
  : LEGACY_GUEST_BINDING_COOKIE;
const GUEST_BINDING_COOKIE_MAX_AGE_SEC = 365 * 24 * 60 * 60;

type GuestBindingCookiePayload = {
  userId: string;
  exp: number;
};

function signGuestBindingCookie(userId: string, exp: number): string {
  return createHmac('sha256', config.echoGuestBindingSecret)
    .update(`guest_binding_cookie_v2\n${userId}\n${exp}`)
    .digest('hex');
}

export function encodeGuestBindingCookieValue(userId: string): string {
  const exp = Date.now() + GUEST_BINDING_COOKIE_MAX_AGE_SEC * 1000;
  const body = Buffer.from(
    JSON.stringify({ u: userId, e: exp }),
    'utf8',
  ).toString('base64url');
  return `${body}.${signGuestBindingCookie(userId, exp)}`;
}

export function decodeGuestBindingCookieValue(
  raw: string,
): GuestBindingCookiePayload | null {
  const [bodyB64, sig] = raw.split('.');
  if (!bodyB64 || !sig) return null;
  let parsed: { u?: string; e?: number };
  try {
    parsed = JSON.parse(Buffer.from(bodyB64, 'base64url').toString('utf8')) as {
      u?: string;
      e?: number;
    };
  } catch {
    return null;
  }
  const userId = typeof parsed.u === 'string' ? parsed.u.trim() : '';
  const exp = typeof parsed.e === 'number' ? parsed.e : 0;
  if (!userId || !Number.isFinite(exp) || Date.now() > exp) return null;
  const expected = signGuestBindingCookie(userId, exp);
  try {
    if (
      expected.length !== sig.length ||
      !timingSafeEqual(Buffer.from(expected), Buffer.from(sig))
    ) {
      return null;
    }
  } catch {
    return null;
  }
  return { userId, exp };
}

function baseCookieOpts() {
  return {
    sameSite: 'lax' as const,
    secure: config.isProduction,
    path: '/' as const,
  };
}

/** OAuth state cookies (Discord/Google) — same attributes as session cookies. */
export function sessionCookieBaseAttrs() {
  return baseCookieOpts();
}

export function setRefreshCookie(reply: FastifyReply, refreshToken: string) {
  const o = baseCookieOpts();
  reply.setCookie(REFRESH_COOKIE, refreshToken, {
    httpOnly: true,
    ...o,
    /** Match `echo_sid` / `echo_csrf` so refresh is sent on every API request (avoids proxy/path edge cases). */
    maxAge: config.refreshTokenTtlDays * 24 * 60 * 60,
  });
}

export function clearRefreshCookie(reply: FastifyReply) {
  reply.clearCookie(REFRESH_COOKIE, { path: '/' });
  reply.clearCookie(LEGACY_REFRESH_COOKIE, { path: '/' });
  /** Legacy jars used a narrow path; clear both so logout and rotation cannot leave a stale `echo_rt`. */
  reply.clearCookie(REFRESH_COOKIE, { path: '/api/v1/auth' });
  reply.clearCookie(LEGACY_REFRESH_COOKIE, { path: '/api/v1/auth' });
}

export function setGuestBindingCookie(reply: FastifyReply, userId: string) {
  const o = baseCookieOpts();
  reply.setCookie(GUEST_BINDING_COOKIE, encodeGuestBindingCookieValue(userId), {
    httpOnly: true,
    ...o,
    maxAge: GUEST_BINDING_COOKIE_MAX_AGE_SEC,
  });
}

export function clearGuestBindingCookie(reply: FastifyReply) {
  reply.clearCookie(GUEST_BINDING_COOKIE, { path: '/' });
  reply.clearCookie(LEGACY_GUEST_BINDING_COOKIE, { path: '/' });
}

export function setBrowserSessionCookies(
  reply: FastifyReply,
  opts: { sessionId: string; csrfSecret: string; refreshToken: string },
) {
  const maxAge = config.refreshTokenTtlDays * 24 * 60 * 60;
  const o = baseCookieOpts();
  reply.setCookie(SESSION_COOKIE, opts.sessionId, {
    httpOnly: true,
    ...o,
    maxAge,
  });
  reply.setCookie(CSRF_COOKIE, opts.csrfSecret, {
    httpOnly: false,
    ...o,
    maxAge,
  });
  setRefreshCookie(reply, opts.refreshToken);
}

export function clearBrowserSessionCookies(reply: FastifyReply) {
  reply.clearCookie(SESSION_COOKIE, { path: '/' });
  reply.clearCookie(CSRF_COOKIE, { path: '/' });
  reply.clearCookie(LEGACY_SESSION_COOKIE, { path: '/' });
  reply.clearCookie(LEGACY_CSRF_COOKIE, { path: '/' });
  clearRefreshCookie(reply);
}
