import { YOUTUBE_INTEGRATION_ENABLED } from '../../../shared/integrationKillSwitches';
import { config } from '../config';

/** Redirect browser to SPA after YouTube OAuth callback. */
export function youtubeOAuthAppRedirect(
  ok: boolean,
  errorCode?: string,
): string {
  let base = config.echoAppPublicUrl.trim().replace(/\/$/, '');
  let u: URL;
  try {
    u = new URL(base);
  } catch {
    u = new URL('http://localhost:8080');
  }
  if (ok) {
    u.searchParams.set('youtube_linked', '1');
  } else {
    u.searchParams.set('youtube_linked', '0');
    if (errorCode) u.searchParams.set('youtube_error', errorCode);
  }
  return u.toString();
}

export function isYoutubeOauthConfigured(): boolean {
  if (!YOUTUBE_INTEGRATION_ENABLED) return false;
  return Boolean(
    config.googleOauthClientId &&
    config.googleOauthClientSecret &&
    config.youtubeOauthRedirectUri,
  );
}
