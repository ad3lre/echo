import { echoT } from '@/i18n';

export function messageForYoutubeOAuthError(code: string | null): string {
  const key = code?.trim() || 'unknown';
  const i18nKey = `integrations.youtube.oauthErrors.${key}`;
  const translated = echoT(i18nKey);
  if (translated !== i18nKey) return translated;
  return echoT('integrations.youtube.oauthErrors.unknown');
}

export const youtubeSettingsSectionTitle = () =>
  echoT('integrations.youtube.settingsSectionTitle');
export const youtubeConnectCta = () => echoT('integrations.youtube.connectCta');
export const youtubeReconnectCta = () =>
  echoT('integrations.youtube.reconnectCta');
export const youtubeOAuthCallbackUrlIntro = () =>
  echoT('integrations.youtube.oauthCallbackUrlIntro');
export const youtubeRequiresGoogleLinkHint = () =>
  echoT('integrations.youtube.requiresGoogleLinkHint');
export const youtubeNativeConnectionTitle = () =>
  echoT('integrations.youtube.nativeConnectionTitle');
export const youtubeNativeConnectionBlurb = () =>
  echoT('integrations.youtube.nativeConnectionBlurb');
export const youtubeStreamKeyTitle = () =>
  echoT('integrations.youtube.streamKeyTitle');
export const youtubeStreamKeyBlurb = () =>
  echoT('integrations.youtube.streamKeyBlurb');
export const youtubeStreamKeyNeverShownAgain = () =>
  echoT('integrations.youtube.streamKeyNeverShownAgain');
export const youtubeStreamKeySwitchToNativeHint = () =>
  echoT('integrations.youtube.streamKeySwitchToNativeHint');
export const youtubeStageLiveStreamingUnavailableHint = () =>
  echoT('integrations.youtube.stageLiveStreamingUnavailableHint');
export const youtubeStreamKeySavedLabel = () =>
  echoT('integrations.youtube.streamKeySavedLabel');
export const youtubeStreamKeyRevokeCta = () =>
  echoT('integrations.youtube.streamKeyRevokeCta');
export const youtubeStreamKeySaveCta = () =>
  echoT('integrations.youtube.streamKeySaveCta');
export const youtubeStageStreamKeyLiveHint = () =>
  echoT('integrations.youtube.stageStreamKeyLiveHint');
export const youtubeGoLiveModalTitle = () =>
  echoT('integrations.youtube.goLiveModalTitle');
export const youtubeGoLiveModalSubtitle = () =>
  echoT('integrations.youtube.goLiveModalSubtitle');
export const youtubeGoLiveThumbnailHint = () =>
  echoT('integrations.youtube.goLiveThumbnailHint');
export const youtubeGoLiveStreamKeyModalHint = () =>
  echoT('integrations.youtube.goLiveStreamKeyModalHint');
export const youtubeGoLiveDescriptionPlaceholder = () =>
  echoT('integrations.youtube.goLiveDescriptionPlaceholder');

export function messageForStageYoutubeError(code: string | null): string {
  if (!code) return echoT('integrations.youtube.stageErrors.default');
  const i18nKey = `integrations.youtube.stageErrors.${code}`;
  const translated = echoT(i18nKey);
  if (translated !== i18nKey) return translated;
  return echoT('integrations.youtube.stageErrors.default');
}

/** @deprecated */
export const YOUTUBE_OAUTH_ERROR_MESSAGES: Record<string, string> = {};
/** @deprecated */
export const STAGE_YOUTUBE_ERROR_MESSAGES: Record<string, string> = {};
