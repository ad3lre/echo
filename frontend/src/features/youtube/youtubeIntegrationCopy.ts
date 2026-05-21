export const YOUTUBE_OAUTH_ERROR_MESSAGES: Record<string, string> = {
  not_configured:
    'YouTube linking isn’t turned on for this Echo server yet. Ask an admin to enable it.',
  missing_encryption_key:
    'This Echo server isn’t set up to store YouTube tokens safely yet. Ask an admin.',
  access_denied: 'You cancelled the Google prompt. You can try again anytime.',
  invalid_callback: 'That YouTube sign-in didn’t finish. Try connecting again.',
  bad_state:
    'That sign-in took too long or the page was refreshed. Try connecting again.',
  no_database:
    'Echo can’t reach its database right now. Try again in a moment.',
  token_exchange: 'Google couldn’t finish signing you in. Try again.',
  youtube_channel:
    'We couldn’t read your YouTube channel. Make sure live streaming is enabled on your channel.',
  youtube_already_linked:
    'That YouTube channel is already linked to someone else on Echo.',
  not_available: 'That isn’t available right now. Try again later.',
  persist_failed: 'We couldn’t save your YouTube link. Try again.',
  unknown: 'Something went wrong while connecting YouTube. Try again.',
};

export function messageForYoutubeOAuthError(code: string | null): string {
  if (!code) return YOUTUBE_OAUTH_ERROR_MESSAGES.unknown;
  return (
    YOUTUBE_OAUTH_ERROR_MESSAGES[code] ?? YOUTUBE_OAUTH_ERROR_MESSAGES.unknown
  );
}

export const youtubeSettingsSectionTitle = 'YouTube';
export const youtubeConnectCta = 'Connect YouTube channel';
export const youtubeReconnectCta = 'Reconnect YouTube';
export const youtubeOAuthCallbackUrlIntro =
  'Echo opens Google’s consent screen. After you approve, you return here with your channel linked for stage live streaming.';

export const STAGE_YOUTUBE_ERROR_MESSAGES: Record<string, string> = {
  YOUTUBE_NOT_LINKED: 'Link your YouTube channel in Settings → YouTube first.',
  YOUTUBE_TOKEN_EXPIRED: 'Reconnect YouTube in Settings, then try again.',
  VOICE_E2EE_BLOCKS_EGRESS:
    'Turn off voice E2EE on this stage to stream to YouTube.',
  LIVEKIT_EGRESS_DISABLED:
    'Live streaming isn’t configured on this Echo server (LiveKit egress).',
  ALREADY_LIVE: 'This stage is already live on YouTube.',
  FORBIDDEN: 'You need Manage Channels to start or stop YouTube live.',
  YOUTUBE_API_ERROR:
    'Could not reach YouTube right now. Try again in a few minutes.',
  NOT_FOUND: 'That channel was not found.',
  YOUTUBE_GO_LIVE_FAILED: 'YouTube rejected the live transition. Try again.',
  LIVEKIT_EGRESS_FAILED: 'Could not start the RTMP stream to YouTube.',
};

export function messageForStageYoutubeError(code: string | null): string {
  if (!code) return 'Could not update YouTube live stream.';
  return STAGE_YOUTUBE_ERROR_MESSAGES[code] ?? 'Could not update YouTube live stream.';
}
