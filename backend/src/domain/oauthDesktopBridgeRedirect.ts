import { config } from '../config';

/** Static page under `ECHO_APP_PUBLIC_URL` that redirects into `echo://` with a one-time handoff code. */
export function oauthDesktopBridgeHandoffRedirect(handoffCode: string): string {
  let base = config.echoAppPublicUrl.trim().replace(/\/$/, '');
  let u: URL;
  try {
    u = new URL(base);
  } catch {
    u = new URL('http://localhost:8080');
  }
  const path = u.pathname.replace(/\/$/, '');
  u.pathname = `${path}/oauth-desktop-bridge.html`.replace(/\/+/g, '/');
  u.search = '';
  // Fragment avoids query-string leakage via Referer, proxy logs, and browser history.
  u.hash = `echo_handoff=${encodeURIComponent(handoffCode)}`;
  return u.toString();
}
