import { echoT } from '@/i18n';

export function messageForGoogleOAuthError(code: string | null): string {
  const key = code?.trim() || 'unknown';
  const i18nKey = `integrations.google.oauthErrors.${key}`;
  const translated = echoT(i18nKey);
  if (translated !== i18nKey) return translated;
  return echoT('integrations.google.oauthErrors.unknown');
}

export const googleSettingsSectionTitle = () =>
  echoT('integrations.google.settingsSectionTitle');
export const googleConnectCta = () => echoT('integrations.google.connectCta');
export const googleReconnectCta = () =>
  echoT('integrations.google.reconnectCta');
export const googleDisconnectCta = () =>
  echoT('integrations.google.disconnectCta');
export const googleOAuthCallbackUrlIntro = () =>
  echoT('integrations.google.oauthCallbackUrlIntro');
export const googleMergeHintFull = () =>
  echoT('integrations.google.mergeHintFull');
export const googleMergeHintPartial = () =>
  echoT('integrations.google.mergeHintPartial');
export const googleYoutubeRequiresLinkHint = () =>
  echoT('integrations.google.youtubeRequiresLinkHint');
