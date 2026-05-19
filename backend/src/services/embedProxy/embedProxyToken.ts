/**
 * Short-lived HMAC-signed embed access tokens.
 *
 * Tokens are issued by the authenticated SPA (POST /api/v1/embed/token) and
 * appended to the iframe entry URL (?_eproxy_t=...). They prove the logged-in
 * user explicitly requested access to this slug. Subsequent iframe navigations
 * and subresource requests rely on the echo_sid session cookie instead.
 *
 * Format (dot-separated, URL-safe):
 *   <slug>.<userId>.<expMs>.<hmacHex>
 */

import { createHmac, timingSafeEqual } from 'crypto';

/** Default TTL: 4 hours. Long enough for a gaming session. */
const TOKEN_TTL_MS = 4 * 60 * 60 * 1000;
const SEP = '.';

function hmac(body: string, secret: string): string {
  return createHmac('sha256', secret).update(body).digest('hex');
}

function tokenBody(slug: string, userId: string, expMs: number): string {
  return [slug, userId, String(expMs)].join(SEP);
}

export function mintEmbedToken(
  slug: string,
  userId: string,
  secret: string,
): string {
  const expMs = Date.now() + TOKEN_TTL_MS;
  const body = tokenBody(slug, userId, expMs);
  const sig = hmac(body, secret);
  return `${body}${SEP}${sig}`;
}

export type VerifyEmbedTokenResult =
  | { ok: true; slug: string; userId: string }
  | { ok: false; reason: 'invalid' | 'expired' | 'wrong_slug' };

export function verifyEmbedToken(
  raw: string,
  expectedSlug: string,
  secret: string,
): VerifyEmbedTokenResult {
  const parts = raw.split(SEP);
  if (parts.length !== 4) return { ok: false, reason: 'invalid' };

  const [slug, userId, expStr, sig] = parts as [string, string, string, string];
  const body = tokenBody(slug, userId, Number(expStr));
  const expected = hmac(body, secret);

  // Constant-time comparison
  if (sig.length !== expected.length) return { ok: false, reason: 'invalid' };
  if (
    !timingSafeEqual(Buffer.from(sig, 'hex'), Buffer.from(expected, 'hex'))
  ) {
    return { ok: false, reason: 'invalid' };
  }

  const expMs = Number(expStr);
  if (!Number.isFinite(expMs) || Date.now() > expMs) {
    return { ok: false, reason: 'expired' };
  }
  if (slug !== expectedSlug) return { ok: false, reason: 'wrong_slug' };

  return { ok: true, slug, userId };
}
