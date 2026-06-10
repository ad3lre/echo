import { echoT } from '@/i18n';
import type { SettingsSection } from '@/features/settings/types';
import type { ServerSettingsSection } from '@/features/server-settings/types';
import type { ChannelSettingsTab } from '@/features/channel-settings/types';
import type { RolePermissionKey } from '@/features/server-settings/types';
import type { ChannelPermissionKey } from '@shared/types';
import type { EchoServerNotificationLevel } from '@shared/types';

const SETTINGS_SECTION_I18N: Record<SettingsSection, string> = {
  Profile: 'settings.sections.profile.blurb',
  Account: 'settings.sections.account.blurb',
  Friends: 'settings.sections.friends.blurb',
  'Terms & policies': 'settings.sections.termsAndPolicies.blurb',
  'Report abuse': 'settings.sections.reportAbuse.blurb',
  'Formatting guide': 'settings.sections.formattingGuide.blurb',
  Discord: 'settings.sections.discord.blurb',
  Google: 'settings.sections.google.blurb',
  YouTube: 'settings.sections.youtube.blurb',
  'Log out': 'settings.sections.logOut.blurb',
  'Data & Privacy': 'settings.sections.dataAndPrivacy.blurb',
  Style: 'settings.sections.style.blurb',
  Desktop: 'settings.sections.desktop.blurb',
  Accessibility: 'settings.sections.accessibility.blurb',
  'Voice & Video': 'settings.sections.voiceAndVideo.blurb',
  Notifications: 'settings.sections.notifications.blurb',
  Sounds: 'settings.sections.sounds.blurb',
  Keybinds: 'settings.sections.keybinds.blurb',
  'Time & Language': 'settings.sections.timeAndLanguage.blurb',
  'Echo+': 'settings.sections.echoPlus.blurb',
  Subscriptions: 'settings.sections.subscriptions.blurb',
  Advanced: 'settings.sections.advanced.blurb',
};

const SERVER_SETTINGS_SECTION_I18N: Record<ServerSettingsSection, string> = {
  Overview: 'serverSettings.sections.overview',
  Events: 'serverSettings.sections.events',
  Structure: 'serverSettings.sections.structure',
  Members: 'serverSettings.sections.members',
  Roles: 'serverSettings.sections.roles',
  Emoji: 'serverSettings.sections.emoji',
  Discord: 'serverSettings.sections.discord',
  Security: 'serverSettings.sections.security',
  Access: 'serverSettings.sections.access',
  Tickets: 'serverSettings.sections.tickets',
  'Self-assignable Roles': 'serverSettings.sections.selfAssignableRoles',
  'Banned Words': 'serverSettings.sections.bannedWords',
  Moderation: 'serverSettings.sections.moderation',
  'Audit Log': 'serverSettings.sections.auditLog',
  Bans: 'serverSettings.sections.bans',
  'Danger Zone': 'serverSettings.sections.dangerZone',
};

const CHANNEL_TAB_I18N: Record<
  ChannelSettingsTab,
  { title: string; description: string }
> = {
  overview: {
    title: 'channelSettings.tabs.overview.title',
    description: 'channelSettings.tabs.overview.description',
  },
  permissions: {
    title: 'channelSettings.tabs.permissions.title',
    description: 'channelSettings.tabs.permissions.description',
  },
  webhooks: {
    title: 'channelSettings.tabs.webhooks.title',
    description: 'channelSettings.tabs.webhooks.description',
  },
  discord_sync: {
    title: 'channelSettings.tabs.discord_sync.title',
    description: 'channelSettings.tabs.discord_sync.description',
  },
  discord_voice_mirror: {
    title: 'channelSettings.tabs.discord_voice_mirror.title',
    description: 'channelSettings.tabs.discord_voice_mirror.description',
  },
  forum_creator: {
    title: 'channelSettings.tabs.forum_creator.title',
    description: 'channelSettings.tabs.forum_creator.description',
  },
  format: {
    title: 'channelSettings.tabs.format.title',
    description: 'channelSettings.tabs.format.description',
  },
  danger_zone: {
    title: 'channelSettings.tabs.danger_zone.title',
    description: 'channelSettings.tabs.danger_zone.description',
  },
  discord_chat_sync: {
    title: 'channelSettings.tabs.discord_chat_sync.title',
    description: 'channelSettings.tabs.discord_chat_sync.description',
  },
};

export function settingsSectionBlurb(section: SettingsSection): string {
  const key = SETTINGS_SECTION_I18N[section];
  return key ? echoT(key) : '';
}

export function serverSettingsSectionCopy(
  section: ServerSettingsSection,
): string {
  const key = SERVER_SETTINGS_SECTION_I18N[section];
  return key ? echoT(key) : '';
}

export function rolePermissionLabel(key: RolePermissionKey): string {
  return echoT(`serverSettings.permissions.${key}`);
}

export function channelPermissionLabel(key: ChannelPermissionKey): string {
  const i18nKey = `channelSettings.permissions.${key}`;
  const translated = echoT(i18nKey);
  return translated !== i18nKey ? translated : key;
}

export function channelTabCopy(tab: ChannelSettingsTab): {
  title: string;
  description: string;
} {
  const keys = CHANNEL_TAB_I18N[tab];
  return {
    title: echoT(keys.title),
    description: echoT(keys.description),
  };
}

export function serverNotificationOption(level: EchoServerNotificationLevel): {
  label: string;
  description: string;
} {
  return {
    label: echoT(`serverNotifications.options.${level}.label`),
    description: echoT(`serverNotifications.options.${level}.description`),
  };
}

export function serverNotificationSummary(
  level: EchoServerNotificationLevel,
): string {
  return echoT(`serverNotifications.options.${level}.label`);
}

export function legalDocTabLabel(
  id: 'privacy' | 'terms' | 'community' | 'attributions',
): string {
  return echoT(`legal.tabs.${id}`);
}
