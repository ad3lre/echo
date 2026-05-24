export const GOOGLE_OAUTH_ERROR_MESSAGES: Record<string, string> = {
  not_configured:
    'Google linking isn’t turned on for this Echo server yet. Ask an admin to enable it.',
  missing_encryption_key:
    'This Echo server isn’t set up to store Google safely yet. Ask an admin.',
  access_denied: 'You cancelled the Google prompt. You can try again anytime.',
  invalid_callback: 'That Google sign-in didn’t finish. Try connecting again.',
  bad_state:
    'That sign-in took too long or the page was refreshed. Try connecting again.',
  no_database:
    'Echo can’t reach its database right now. Try again in a moment.',
  token_exchange: 'Google couldn’t finish signing you in. Try again.',
  google_me: 'We couldn’t read your Google profile. Try again.',
  google_already_linked:
    'That Google account is already linked to someone else on Echo.',
  not_available: 'That isn’t available right now. Try again later.',
  user_gone: 'You’re signed out. Sign back in, then try linking Google again.',
  merge_failed:
    'We couldn’t update your Echo profile from Google. Try again or contact support.',
  encrypt_failed:
    'We couldn’t store your Google connection securely. Try again later.',
  persist_failed: 'We couldn’t save your Google link. Try again.',
  google_not_linked:
    'No Echo account is linked to that Google yet. Create an account and link Google in Settings, or sign in with your username and password.',
  google_login_mfa:
    'This account uses two-factor authentication. Sign in with your password and authenticator code instead.',
  oauth_email_conflict:
    'An account with that email already exists, but it isn’t linked to this Google account. Sign in with your password, then link Google in Settings.',
  session_restore_failed:
    'Google sign-in finished, but Echo couldn’t start your session. Try signing in again. If this keeps happening, check that the app URL matches your API (same host/port as in GOOGLE_OAUTH_REDIRECT_URI / ECHO_APP_PUBLIC_URL).',
  unknown: 'Something went wrong while connecting Google. Try again.',
};

export function messageForGoogleOAuthError(code: string | null): string {
  if (!code) return GOOGLE_OAUTH_ERROR_MESSAGES.unknown;
  return (
    GOOGLE_OAUTH_ERROR_MESSAGES[code] ?? GOOGLE_OAUTH_ERROR_MESSAGES.unknown
  );
}

export const googleSettingsSectionTitle = 'Google';
export const googleConnectCta = 'Connect Google account';
export const googleReconnectCta = 'Reconnect Google';
export const googleDisconnectCta = 'Disconnect Google';

export const googleOAuthCallbackUrlIntro =
  'Echo opens Google’s consent screen. After you approve, your Google account is linked to Echo for sign-in and YouTube. See Settings → Legal → Privacy policy (Section 14) for how we use Google user data.';

export const googleMergeHintFull =
  'Echo can use your Google name and photo where your profile allows it.';

export const googleMergeHintPartial =
  'Google is linked for sign-in. Profile fields from Google are only applied when you choose to use them.';

export const googleYoutubeRequiresLinkHint =
  'Link your Google account here first, then connect YouTube in Settings → YouTube using the same Google account that owns your channel.';
