import {
  GUILD_SETTINGS_SECTION_GROUPS,
  type GuildSettingsGroup,
  type GuildSettingsSection,
  type GuildSettingsSectionGroup,
} from '@/features/layout/urlNavigationServerSettingsIds';
import type { EchoRoleType } from '@shared/echoRoleTypes';
import type { EchoRoleScope } from '@shared/echoRoleScope';

export type ServerSettingsSection = GuildSettingsSection;
export type ServerSettingsGroup = GuildSettingsGroup;

export type SectionGroup = GuildSettingsSectionGroup;

export const SECTION_GROUPS: SectionGroup[] = GUILD_SETTINGS_SECTION_GROUPS;

export const SECTION_COPY: Record<ServerSettingsSection, string> = {
  Overview: 'Manage branding and the core information members see first.',
  Events:
    'Create scheduled events with RSVPs. Upcoming events appear in the channel sidebar for members.',
  Structure:
    'Reorder categories and channels in a simple list. This mirrors the sidebar drag order and is handy on touch devices.',
  Members: 'Members, import placeholders, moderation.',
  Roles:
    'Review the role ladder, member distribution, and default permissions at a glance.',
  Emoji: 'Manage emoji slots and server visual identity.',
  Discord:
    'Discord import status, refresh from the latest export, and optional realtime bridge.',
  Security:
    'Configure verification gates and guest access for who can participate.',
  Access:
    'Control who can discover and join this server, plus optional join applications and waitlist.',
  Automod:
    'Define custom AutoMod rules—conditions and actions—that run in order after the built-in spam filter.',
  Moderation:
    'Tune anti-raid protection, content filters, and built-in moderation defaults (spam filter, mentions).',
  'Audit Log':
    'Review administrative actions and moderation events across your server.',
  Bans: 'Review banned members, reasons, and moderation ownership.',
  'Danger Zone':
    'Perform high-risk administrative actions for ownership, archival, and deletion.',
};

export type RolePermissionKey =
  | 'viewChannels'
  | 'manageChannels'
  | 'manageRoles'
  | 'assignRoles'
  | 'addExpressions'
  | 'manageExpressions'
  | 'viewAuditLog'
  | 'viewServerStats'
  | 'manageServer'
  | 'createInvite'
  | 'changeNickname'
  | 'manageNicknames'
  | 'manageApprovals'
  | 'kickMembers'
  | 'banMembers'
  | 'timeoutMembers'
  | 'sendMessages'
  | 'sendMedia'
  | 'mentionEveryone'
  | 'mentionActive'
  | 'manageMessages'
  | 'readMessageHistory'
  | 'createPolls'
  | 'connectToVoice'
  | 'video'
  | 'muteDeafenMembers'
  | 'moveMembers'
  | 'setVoiceChannelStatus'
  | 'administrator';

export type RolePermissions = Record<RolePermissionKey, boolean>;

export type ManagedRoleLink = {
  linkedRoleId: string;
  twoWay: boolean;
};

export interface ManagedRole {
  id: string;
  name: string;
  color: string;
  roleIconUrl: string | null;
  roleIconEmojiId: string | null;
  darkColor: string;
  lightColor: string;
  separateThemeColors: boolean;
  displaySeparately: boolean;
  /** When true, new members receive this role automatically (not shown for @everyone). */
  defaultOnJoin: boolean;
  /** Other roles implied when this role is assigned (Server Settings → Roles → Display). */
  linkedRoles: ManagedRoleLink[];
  mentionable: boolean;
  memberCount: number;
  /** Echo server settings only: organizer tab assignment; null = uncategorized. */
  roleCategoryId: string | null;
  /** When true, manage/assign on this role applies to all categories. */
  roleScope: EchoRoleScope;
  permissions: RolePermissions;
  /** Echo-only: mixed (default), authority (hidden from non–Manage Roles), or visual (no permission bits). */
  roleType: EchoRoleType;
}

export const ROLE_PERMISSION_DEFS: Array<{
  key: RolePermissionKey;
  label: string;
  group:
    | 'General'
    | 'Expressions'
    | 'Invites'
    | 'Profile'
    | 'Moderation'
    | 'Text'
    | 'Voice'
    | 'Advanced';
}> = [
  { key: 'viewChannels', label: 'View channels', group: 'General' },
  { key: 'manageChannels', label: 'Manage Channels', group: 'General' },
  { key: 'manageRoles', label: 'Manage Roles', group: 'General' },
  { key: 'assignRoles', label: 'Assign Roles', group: 'General' },
  { key: 'viewAuditLog', label: 'View Audit Log', group: 'General' },
  { key: 'viewServerStats', label: 'View Server Stats', group: 'General' },
  {
    key: 'manageServer',
    label: 'Manage Server (overview & branding)',
    group: 'General',
  },
  { key: 'addExpressions', label: 'Add Expressions', group: 'Expressions' },
  {
    key: 'manageExpressions',
    label: 'Manage Expressions',
    group: 'Expressions',
  },
  { key: 'createInvite', label: 'Create Invite', group: 'Invites' },
  { key: 'changeNickname', label: 'Change Nickname', group: 'Profile' },
  { key: 'manageNicknames', label: 'Manage Nicknames', group: 'Profile' },
  { key: 'manageApprovals', label: 'Manage Approvals', group: 'Moderation' },
  { key: 'kickMembers', label: 'Kick Members', group: 'Moderation' },
  { key: 'banMembers', label: 'Ban Members', group: 'Moderation' },
  { key: 'timeoutMembers', label: 'Timeout Members', group: 'Moderation' },
  { key: 'sendMessages', label: 'Send Messages', group: 'Text' },
  { key: 'sendMedia', label: 'Send Media', group: 'Text' },
  { key: 'mentionEveryone', label: 'Mention @Everyone', group: 'Text' },
  { key: 'mentionActive', label: 'Mention @Active', group: 'Text' },
  { key: 'manageMessages', label: 'Manage Messages', group: 'Text' },
  { key: 'readMessageHistory', label: 'Read Message History', group: 'Text' },
  { key: 'createPolls', label: 'Create Polls', group: 'Text' },
  { key: 'connectToVoice', label: 'Connect to Voice', group: 'Voice' },
  { key: 'video', label: 'Video', group: 'Voice' },
  { key: 'muteDeafenMembers', label: 'Mute & Deafen Members', group: 'Voice' },
  { key: 'moveMembers', label: 'Move Members', group: 'Voice' },
  {
    key: 'setVoiceChannelStatus',
    label: 'Set Voice channel Status',
    group: 'Voice',
  },
  {
    key: 'administrator',
    label: 'Administrator (God Perm)',
    group: 'Advanced',
  },
];

/** Permission keys exposed in the server settings role editor for Echo-backed servers. */
export const ECHO_SERVER_SETTINGS_ROLE_PERMISSION_KEYS: RolePermissionKey[] = [
  'viewChannels',
  'manageChannels',
  'manageRoles',
  'assignRoles',
  'createInvite',
  'sendMessages',
  'mentionEveryone',
  'manageMessages',
  'manageServer',
  'kickMembers',
  'banMembers',
  'timeoutMembers',
  'administrator',
  'changeNickname',
  'manageNicknames',
  'addExpressions',
  'manageExpressions',
  'connectToVoice',
  'video',
  'muteDeafenMembers',
  'moveMembers',
];

export const ROLE_PERMISSION_GROUPS: Array<
  | 'General'
  | 'Expressions'
  | 'Invites'
  | 'Profile'
  | 'Moderation'
  | 'Text'
  | 'Voice'
  | 'Advanced'
> = [
  'General',
  'Expressions',
  'Invites',
  'Profile',
  'Moderation',
  'Text',
  'Voice',
  'Advanced',
];

export type RoleColorPreset = {
  value: string;
  label: string;
};

export const ROLE_COLOR_PRESETS = [
  { value: '', label: 'Colorless' },
  { value: '#ED4245', label: '#ED4245' },
  { value: '#FAA61A', label: '#FAA61A' },
  { value: '#3BA55D', label: '#3BA55D' },
  { value: '#00A8FC', label: '#00A8FC' },
  { value: '#5865F2', label: '#5865F2' },
  { value: '#8EA1E1', label: '#8EA1E1' },
  { value: '#EB459E', label: '#EB459E' },
  { value: '#9B59B6', label: '#9B59B6' },
  { value: '#A45E3A', label: '#A45E3A' },
  { value: '#E67E22', label: '#E67E22' },
  { value: '#2ECC71', label: '#2ECC71' },
] satisfies RoleColorPreset[];
