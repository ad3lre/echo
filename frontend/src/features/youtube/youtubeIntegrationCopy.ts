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
  google_not_linked:
    'Link your Google account in Settings → Google first, then connect YouTube with the same Google account.',
  google_account_mismatch:
    'Use the same Google account you linked in Settings → Google when connecting YouTube.',
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

export const youtubeRequiresGoogleLinkHint =
  'Connect Google in Settings → Google before linking a YouTube channel.';

export const youtubeNativeConnectionTitle = 'YouTube channel (recommended)';
export const youtubeNativeConnectionBlurb =
  'Echo creates the live broadcast and sends video over RTMP. Requires Google + YouTube linking and live streaming on your channel.';

export const youtubeStreamKeyTitle = 'Stream key only';
export const youtubeStreamKeyBlurb =
  'Paste the stream key from YouTube Studio → Go live → Stream. Echo sends video to that ingest URL. You start and manage the broadcast in YouTube yourself.';

export const youtubeStreamKeyNeverShownAgain =
  'After you save, Echo encrypts your key and never shows it again. Revoke here anytime to replace it.';

export const youtubeStreamKeySwitchToNativeHint =
  'You can switch anytime to a full YouTube channel connection above for automatic broadcasts and watch links in Echo.';

export const youtubeStageLiveStreamingUnavailableHint =
  'Live streaming to YouTube isn’t configured on this Echo server yet (LiveKit egress). Go live from a stage won’t work until an admin enables the egress service and sets LIVEKIT_EGRESS_ENABLED=true.';

export const youtubeStreamKeySavedLabel = 'Stream key saved';
export const youtubeStreamKeyRevokeCta = 'Revoke stream key';
export const youtubeStreamKeySaveCta = 'Save stream key';

export const youtubeStageStreamKeyLiveHint =
  'Echo is sending video to your saved stream key. Start or end the broadcast in YouTube Studio — watch links are not created by Echo in this mode.';

export const youtubeGoLiveModalTitle = 'Go live on YouTube';
export const youtubeGoLiveModalSubtitle =
  'Echo sends your stage program feed to YouTube over RTMP. Set how the broadcast appears before you start.';

export const youtubeGoLiveThumbnailHint =
  'Echo does not upload custom thumbnails yet. Your linked channel avatar is shown as a preview — change the thumbnail in YouTube Studio after you go live.';

export const youtubeGoLiveStreamKeyModalHint =
  'Privacy and watch links are managed in YouTube Studio when using a saved stream key.';

export const youtubeGoLiveDescriptionPlaceholder =
  'Tell viewers what this stream is about (optional)';

export const STAGE_YOUTUBE_ERROR_MESSAGES: Record<string, string> = {
  GOOGLE_NOT_LINKED:
    'Link your Google account in Settings → Google before using YouTube live.',
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
  return (
    STAGE_YOUTUBE_ERROR_MESSAGES[code] ??
    'Could not update YouTube live stream.'
  );
}
