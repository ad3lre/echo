export type GuildSettingsSection =
  | 'Overview'
  | 'Events'
  | 'Structure'
  | 'Members'
  | 'Roles'
  | 'Emoji'
  | 'Discord'
  | 'Security'
  | 'Access'
  | 'Tickets'
  | 'Self-assignable Roles'
  | 'Banned Words'
  | 'Moderation'
  | 'Audit Log'
  | 'Bans'
  | 'Danger Zone';

/**
 * Sidebar section buckets for server settings (labels only; `guild_section=` uses item ids).
 * Kept granular enough to scan, coarse enough to avoid a flat list of 14 tabs.
 */
export type GuildSettingsGroup =
  | 'General'
  | 'Community'
  | 'Integrations'
  | 'Safety'
  | 'Danger zone';

export interface GuildSettingsSectionGroup {
  label: GuildSettingsGroup;
  items: GuildSettingsSection[];
}

export const GUILD_SETTINGS_SECTION_GROUPS: GuildSettingsSectionGroup[] = [
  {
    label: 'General',
    items: ['Overview', 'Structure', 'Events'],
  },
  {
    label: 'Community',
    items: ['Members', 'Roles', 'Emoji'],
  },
  {
    label: 'Integrations',
    items: ['Discord'],
  },
  {
    label: 'Safety',
    items: [
      'Security',
      'Access',
      'Tickets',
      'Self-assignable Roles',
      'Banned Words',
      'Moderation',
      'Bans',
      'Audit Log',
    ],
  },
  {
    label: 'Danger zone',
    items: ['Danger Zone'],
  },
];
