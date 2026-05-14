export type GuildSettingsSection =
  | 'Overview'
  | 'Structure'
  | 'Members'
  | 'Roles'
  | 'Emoji'
  | 'Discord'
  | 'Security'
  | 'Moderation'
  | 'Audit Log'
  | 'Bans'
  | 'Danger Zone';

export type GuildSettingsGroup = 'Server' | 'Access';

export interface GuildSettingsSectionGroup {
  label: GuildSettingsGroup;
  items: GuildSettingsSection[];
}

export const GUILD_SETTINGS_SECTION_GROUPS: GuildSettingsSectionGroup[] = [
  {
    label: 'Server',
    items: ['Overview', 'Structure', 'Members', 'Roles', 'Emoji', 'Discord'],
  },
  {
    label: 'Access',
    items: ['Security', 'Moderation', 'Audit Log', 'Bans', 'Danger Zone'],
  },
];
