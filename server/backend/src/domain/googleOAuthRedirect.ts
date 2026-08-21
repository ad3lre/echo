import { GOOGLE_INTEGRATION_ENABLED } from '../../../../contracts/integrationKillSwitches';
import { config } from '../config';

export type GoogleOAuthRedirectKind = 'link' | 'login';

/** Redirect browser to SPA after Google OAuth callback (no secrets in query). */
export function googleOAuthAppRedirect(
  ok: boolean,
  errorCode?: string,
  opts?: { kind?: GoogleOAuthRedirectKind },
): string {
  const base = config.echoAppPublicUrl.trim().replace(/\/$/, '');
  let u: URL;
  try {
    u = new URL(base);
  } catch {
    u = new URL('http://localhost:8080');
  }
  if (ok) {
    if (opts?.kind === 'login') {
      u.searchParams.set('google_login', '1');
    } else {
      u.searchParams.set('google_linked', '1');
    }
  } else {
    u.searchParams.set('google_linked', '0');
    if (errorCode) u.searchParams.set('google_error', errorCode);
  }
  return u.toString();
}

export function isGoogleOauthConfigured(): boolean {
  if (!GOOGLE_INTEGRATION_ENABLED) return false;
  return Boolean(
    config.googleOauthClientId &&
    config.googleOauthClientSecret &&
    config.googleOauthRedirectUri,
  );
}
