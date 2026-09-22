import { createHmac, timingSafeEqual } from 'crypto';

const OAUTH_COOKIE_MAC_SALT = 'echo-oauth-cookie-mac-v1';

/**
 * HMAC-SHA256 integrity tag for short-lived OAuth state cookies.
 * The server secret is already a high-entropy key; use HMAC directly with a
 * domain-separated prefix instead of a password KDF. Passwords use bcrypt in
 * the auth store.
 */
export function oauthCookieIntegrityTag(
  masterSecret: string,
  payload: string,
): string {
  return createHmac('sha256', masterSecret)
    .update(OAUTH_COOKIE_MAC_SALT)
    .update('\0')
    .update(payload)
    .digest('hex');
}

export function oauthCookieIntegrityTagsEqual(
  expectedHex: string,
  actualHex: string,
): boolean {
  try {
    const a = Buffer.from(actualHex, 'hex');
    const b = Buffer.from(expectedHex, 'hex');
    return a.length === b.length && timingSafeEqual(a, b);
  } catch {
    return false;
  }
}
