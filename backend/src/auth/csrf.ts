import type { FastifyRequest, FastifyReply } from 'fastify';
import { sendError } from '../api/errors';
import { safeCompare } from '../shared/safeCompare';
import { isNativeBearerCsrfExempt } from './nativeBearer';
import {
  CSRF_COOKIE,
  LEGACY_CSRF_COOKIE,
  LEGACY_SESSION_COOKIE,
  SESSION_COOKIE,
  getServerSession,
} from './serverSession';

const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/** Exact paths (no query) that may mutate without browser CSRF tokens (login/bootstrap/webhooks). */
const CSRF_EXEMPT_EXACT = new Set([
  '/api/v1/auth/login',
  '/api/v1/auth/register',
  '/api/v1/auth/guest',
  '/api/v1/auth/refresh',
  '/api/v1/auth/login/mfa',
  '/api/v1/auth/forgot-password',
  '/api/v1/auth/reset-password',
  /** Sign-in with Discord from the login modal (no session / CSRF cookie yet). */
  '/api/v1/auth/discord/login/start',
  /** Sign-in with Google from the login modal (no session / CSRF cookie yet). */
  '/api/v1/auth/google/login/start',
  /** Desktop Discord OAuth handoff redeem (one-time code from system browser). */
  '/api/v1/auth/desktop/redeem-handoff',
  /**
   * Public marketing-site support form (`marketing/src/pages/support.astro`).
   * Honeypot + IP rate-limit + Reply-To, no session yet — no CSRF cookie to compare against.
   */
  '/api/v1/echo/support/contact',
  '/api/v1/hooks/livekit',
  '/api/v1/dev/diagnostics/ingest',
  '/api/v1/echo/uploads/local/put',
  '/api/v1/auth/passkey/login/options',
  '/api/v1/auth/passkey/login/verify',
]);

/** Prefix exemptions kept narrow for grouped webhook routes. */
const CSRF_EXEMPT_PREFIXES = [
  /** Discord bot hooks use `x-echo-discord-bot-secret`, not browser CSRF cookies. */
  '/api/v1/hooks/discord-bot/',
  '/api/v1/hooks/discord-bridge/',
  '/api/v1/hooks/discord-voice-mirror/',
  '/api/v1/hooks/echo-channel-webhooks/',
];

function pathOnly(url: string): string {
  const q = url.indexOf('?');
  return q === -1 ? url : url.slice(0, q);
}

export function isCsrfExemptPath(path: string): boolean {
  if (!path.startsWith('/api/v1')) return true;
  if (CSRF_EXEMPT_EXACT.has(path)) return true;
  for (const p of CSRF_EXEMPT_PREFIXES) if (path.startsWith(p)) return true;
  return false;
}

/**
 * Enforce double-submit CSRF for mutating /api/v1 requests.
 * Header must match `echo_csrf` cookie and (when present) server session record.
 */
export async function enforceApiCsrf(
  req: FastifyRequest,
  reply: FastifyReply,
): Promise<boolean> {
  const method = req.method.toUpperCase();
  if (!MUTATING.has(method)) return true;

  const path = pathOnly(req.url);
  if (isCsrfExemptPath(path)) return true;
  if (isNativeBearerCsrfExempt(req)) return true;

  const headerRaw = req.headers['x-csrf-token'];
  const header = typeof headerRaw === 'string' ? headerRaw.trim() : '';
  const cookies = req.cookies as Record<string, string | undefined> | undefined;
  const cookieTok =
    (cookies?.[CSRF_COOKIE] ?? cookies?.[LEGACY_CSRF_COOKIE])?.trim() ?? '';

  if (!header || !cookieTok || !safeCompare(header, cookieTok)) {
    await sendError(
      reply,
      403,
      'CSRF_REQUIRED',
      'Invalid or missing CSRF token',
    );
    return false;
  }

  const sid = (
    cookies?.[SESSION_COOKIE] ?? cookies?.[LEGACY_SESSION_COOKIE]
  )?.trim();
  if (sid) {
    const sess = await getServerSession(sid);
    if (!sess) {
      /* Stale echo_sid (e.g. in-memory sessions lost on restart): must be 401 so
       * clients can run cookie refresh; 403 would look like CSRF and skip refresh. */
      await sendError(reply, 401, 'UNAUTHORIZED', 'Missing or invalid session');
      return false;
    }
    if (!safeCompare(sess.csrfSecret, header)) {
      await sendError(
        reply,
        403,
        'CSRF_REQUIRED',
        'Invalid or missing CSRF token',
      );
      return false;
    }
  }

  return true;
}
