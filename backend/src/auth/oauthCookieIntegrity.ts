import { createHmac, scryptSync, timingSafeEqual } from 'crypto';

const OAUTH_COOKIE_MAC_SALT = 'echo-oauth-cookie-mac-v1';

/** Domain-separated MAC key; not password storage (see bcrypt in auth store). */
function resolveOAuthCookieMacKey(masterSecret: string): Buffer {
  return scryptSync(masterSecret, OAUTH_COOKIE_MAC_SALT, 32);
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
  // codeql[js/insufficient-password-hash] OAuth cookie MAC, not password hashing.
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
