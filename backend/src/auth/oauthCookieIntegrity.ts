import { createHmac, scryptSync, timingSafeEqual } from 'crypto';

const OAUTH_COOKIE_MAC_SALT = 'echo-oauth-cookie-mac-v1';

/**
 * Domain-separated MAC key derivation. This is NOT password storage — passwords
 * use bcrypt in the auth store. scrypt here derives a fixed HMAC signing key from
 * the server master secret with N=2^14 / r=8 / p=1 (sufficient for key derivation).
 */
function resolveOAuthCookieMacKey(masterSecret: string): Buffer {
  return scryptSync(masterSecret, OAUTH_COOKIE_MAC_SALT, 32, {
    N: 16384,
    r: 8,
    p: 1,
  });
}

/**
 * HMAC-SHA256 integrity tag for short-lived OAuth state cookies.
 * Not used for password or credential storage.
 */
export function oauthCookieIntegrityTag(
  masterSecret: string,
  payload: string,
): string {
  const key = resolveOAuthCookieMacKey(masterSecret);
  return createHmac('sha256', key).update(payload).digest('hex');
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
