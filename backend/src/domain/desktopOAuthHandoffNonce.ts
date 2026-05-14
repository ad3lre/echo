import { createHash } from 'crypto';

const DESKTOP_OAUTH_HANDOFF_NONCE_RE = /^[0-9a-f]{64}$/;

export function isValidDesktopOauthHandoffNonce(nonce: string): boolean {
  return DESKTOP_OAUTH_HANDOFF_NONCE_RE.test(nonce.trim());
}

export function hashDesktopOauthHandoffNonce(nonce: string): string {
  return createHash('sha256').update(nonce.trim(), 'utf8').digest('hex');
}

/** Returns SHA-256 hex of the nonce when it matches the desktop handoff format. */
export function validateAndHashDesktopOauthHandoffNonce(
  nonce: string,
): string | null {
  if (!isValidDesktopOauthHandoffNonce(nonce)) return null;
  return hashDesktopOauthHandoffNonce(nonce);
}
