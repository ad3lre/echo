/**
 * Shared user-facing strings for Discord integration (user OAuth vs server import).
 * Resolved via vue-i18n — see frontend/src/i18n/locales/en-US/integrations.json.
 */

import { echoT } from '@/i18n';

/** Server settings → Discord import: clarify import vs personal link. */
export const discordServerImportSeparateFromAccountLink = () =>
  echoT('integrations.discord.serverImportSeparateFromAccountLink');

export const discordConnectCta = () => echoT('integrations.discord.connectCta');
export const discordReconnectCta = () =>
  echoT('integrations.discord.reconnectCta');

export const discordOAuthCallbackUrlIntro = () =>
  echoT('integrations.discord.oauthCallbackUrlIntro');

export function messageForDiscordOAuthError(code: string | null): string {
  const key = code?.trim() || 'unknown';
  const i18nKey = `integrations.discord.oauthErrors.${key}`;
  const translated = echoT(i18nKey);
  if (translated !== i18nKey) return translated;
  return echoT('integrations.discord.oauthErrors.unknown');
}

export const discordSettingsSectionTitle = () =>
  echoT('integrations.discord.settingsSectionTitle');

export const discordMergeHintFull = () =>
  echoT('integrations.discord.mergeHintFull');

export const discordMergeHintPartial = () =>
  echoT('integrations.discord.mergeHintPartial');

export const discordProfileImportPromptTitle = () =>
  echoT('integrations.discord.profileImportPromptTitle');

export const discordProfileImportPromptBody = () =>
  echoT('integrations.discord.profileImportPromptBody');

export const discordProfileImportPromptImportCta = () =>
  echoT('integrations.discord.profileImportPromptImportCta');

export const discordProfileImportPromptNotNowCta = () =>
  echoT('integrations.discord.profileImportPromptNotNowCta');

export const discordImportProfileIntoEchoCta = () =>
  echoT('integrations.discord.importProfileIntoEchoCta');

/** @deprecated Use messageForDiscordOAuthError — kept for tests referencing raw map keys. */
export const DISCORD_OAUTH_ERROR_MESSAGES: Record<string, string> = {};
