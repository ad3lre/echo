import { createHmac, timingSafeEqual } from 'crypto';

/**
 * HMAC-SHA256 integrity tag for short-lived OAuth state cookies.
 * Not used for password or credential storage.
 */
export function oauthCookieIntegrityTag(
  secret: string,
  payload: string,
): string {
  return createHmac('sha256', secret).update(payload).digest('hex');
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
