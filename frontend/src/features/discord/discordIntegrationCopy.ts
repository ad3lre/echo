/**
 * Shared user-facing strings for Discord integration (user OAuth vs server import).
 * Keep tone friendly; avoid env vars and stack jargon in default UI.
 */

/** Server settings → Discord import: clarify import vs personal link. */
export const discordServerImportSeparateFromAccountLink =
  'Server import pulls channels and roles from a Discord server. Your personal Discord link in Settings is separate and doesn’t replace import.';

export const discordConnectCta = 'Connect Discord';
export const discordReconnectCta = 'Refresh from Discord';

/** Intro line when we show the exact callback URL after starting OAuth. */
export const discordOAuthCallbackUrlIntro =
  'If you were asked for a callback link (for example when setting up Discord for Echo), use this:';

export const DISCORD_OAUTH_ERROR_MESSAGES: Record<string, string> = {
  not_configured:
    'Discord linking isn’t turned on for this Echo server yet. Ask an admin to enable it.',
  missing_encryption_key:
    'This Echo server isn’t set up to store Discord safely yet. Ask an admin.',
  access_denied: 'You cancelled the Discord prompt. You can try again anytime.',
  invalid_callback: 'That Discord sign-in didn’t finish. Try connecting again.',
  bad_state:
    'That sign-in took too long or the page was refreshed. Try connecting again.',
  no_database:
    'Echo can’t reach its database right now. Try again in a moment.',
  token_exchange: 'Discord couldn’t finish signing you in. Try again.',
  discord_me: 'We couldn’t read your Discord profile. Try again.',
  discord_already_linked:
    'That Discord account is already linked to someone else on Echo.',
  not_available: 'That isn’t available right now. Try again later.',
  user_gone: 'You’re signed out. Sign back in, then try linking Discord again.',
  merge_failed:
    'We couldn’t update your Echo profile from Discord. Try again or contact support.',
  encrypt_failed:
    'We couldn’t store your Discord connection securely. Try again later.',
  persist_failed: 'We couldn’t save your Discord link. Try again.',
  discord_not_linked:
    'No Echo account is linked to that Discord yet. Create an account and link Discord in Settings, or sign in with your username and password.',
  discord_login_mfa:
    'This account uses two-factor authentication. Sign in with your password and authenticator code instead.',
  oauth_email_conflict:
    'An account with that email already exists, but it isn’t linked to this Discord account. Sign in with your password, then link Discord in Settings.',
  discord_no_email:
    'Discord didn’t share an email with Echo. Allow the email permission when Discord asks, or create an account with email and password instead.',
  session_restore_failed:
    'Discord sign-in finished, but Echo couldn’t start your session. Try signing in again. If this keeps happening, check that the app URL matches your API (same host/port as in DISCORD_OAUTH_REDIRECT_URI / ECHO_APP_PUBLIC_URL).',
  desktop_handoff_failed:
    'Echo couldn’t complete sign-in from the browser. Try Discord sign-in again, or use username and password.',
  unknown: 'Something went wrong while connecting Discord. Try again.',
};

export function messageForDiscordOAuthError(code: string | null): string {
  if (!code) return DISCORD_OAUTH_ERROR_MESSAGES.unknown;
  return (
    DISCORD_OAUTH_ERROR_MESSAGES[code] ?? DISCORD_OAUTH_ERROR_MESSAGES.unknown
  );
}

/** Section title in user settings. */
export const discordSettingsSectionTitle = 'Discord';

/** Linked card: how we used Discord data for guests vs full accounts. */
export const discordMergeHintFull =
  'We updated your Echo profile from Discord where we could (name, picture, and more when available).';

export const discordMergeHintPartial =
  'Your Echo username and email stay as they are. We keep these Discord details for reference and display.';

/** One-time prompt + Discord settings: import avatar, banner, display name, and bio from Discord. */
export const discordProfileImportPromptTitle =
  'Finish your profile from Discord?';

export const discordProfileImportPromptBody =
  'Your Discord account is linked. We can copy your Discord avatar, banner, display name, and bio into your Echo profile. You can change them anytime in Settings.';

export const discordProfileImportPromptImportCta = 'Import from Discord';

export const discordProfileImportPromptNotNowCta = 'Not now';

/** Discord settings tab — same action as the prompt. */
export const discordImportProfileIntoEchoCta = 'Import profile into Echo';
