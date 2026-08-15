import { config } from '../config';

export type DiscordOAuthRedirectKind = 'link' | 'login';

/** Redirect browser to SPA after Discord OAuth callback (no secrets in query). */
export function discordOAuthAppRedirect(
  ok: boolean,
  errorCode?: string,
  opts?: {
    kind?: DiscordOAuthRedirectKind;
    /** After new Discord signup we send Echo’s own verification email (not Discord’s IdP flag). */
    verifyEmailSent?: boolean;
    /** Discord login created a guest; SPA opens the email/password upgrade form. */
    guestSignup?: boolean;
  },
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
      u.searchParams.set('discord_login', '1');
      if (opts.verifyEmailSent) {
        u.searchParams.set('discord_verify_email_sent', '1');
      }
      if (opts.guestSignup) {
        u.searchParams.set('discord_guest_signup', '1');
      }
    } else {
      u.searchParams.set('discord_linked', '1');
    }
  } else {
    u.searchParams.set('discord_linked', '0');
    if (errorCode) u.searchParams.set('discord_error', errorCode);
  }
  return u.toString();
}

export function isDiscordOauthConfigured(): boolean {
  return Boolean(
    config.discordOauthClientId &&
    config.discordOauthClientSecret &&
    config.discordOauthRedirectUri,
  );
}
