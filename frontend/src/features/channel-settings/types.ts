import type { ChannelPermissionKey, EchoChannelType } from '@shared/types';
import { CHANNEL_WEBHOOKS_ENABLED } from '@shared/integrationKillSwitches';

export type PermissionOverwriteTargetType =
  | 'members'
  | 'global'
  | 'role'
  | 'member'
  | 'everyone';

export interface PermissionOverwriteRowDraft {
  targetType: PermissionOverwriteTargetType;
  targetId?: string | null;
  partial: Partial<Record<ChannelPermissionKey, boolean>>;
}

export interface PermissionOverwriteSubjectOption {
  id: string;
  label: string;
  subtitle?: string;
  color?: string;
  avatarUrl?: string;
}

export interface EchoPermissionEditorState {
  loading: boolean;
  roles: PermissionOverwriteSubjectOption[];
  members: PermissionOverwriteSubjectOption[];
  rows: PermissionOverwriteRowDraft[];
}

/** Snapshot when opening category settings (rename + permission defaults). */
export interface CategorySettingsSnapshot {
  categoryId: string;
  originalName: string;
  name: string;
  /** Echo server id (guild) — set when opened from a real server. */
  serverId?: string;
  /** Number of channels in this category (for delete confirmation copy). */
  channelCount: number;
  /** Text + forum channels only — used for Discord chat bulk sync copy. */
  textForumChannelCount?: number;
  /** Category-wide message auto-delete TTL (seconds); null = off. */
  autoDeleteAfterSeconds?: number | null;
  channelPermissionDefaults: Partial<Record<ChannelPermissionKey, boolean>>;
  echoPermissionRows?: PermissionOverwriteRowDraft[];
}

/** Tabs shared with category settings. */
export type CategorySettingsTab =
  | 'overview'
  | 'permissions'
  | 'discord_chat_sync'
  | 'discord_voice_mirror'
  | 'danger_zone';

export type ChannelSettingsTab =
  | CategorySettingsTab
  | 'discord_sync'
  | 'webhooks'
  | 'forum_creator'
  | 'format';

export const CHANNEL_TAB_COPY: Record<
  ChannelSettingsTab,
  { title: string; description: string }
> = {
  overview: {
    title: 'Overview',
    description:
      'Set the channel name, category, slowmode, and other channel options.',
  },
  permissions: {
    title: 'Permissions',
    description: 'Control who can see this channel and what they can do here.',
  },
  webhooks: {
    title: 'Webhooks',
    description:
      'Create secret URLs that external services can use to post messages into this channel.',
  },
  discord_sync: {
    title: 'Discord Sync',
    description:
      'Mirror messages between this Echo channel and a Discord channel.',
  },
  format: {
    title: 'Format',
    description:
      'Default text inserted in the message box. Soft: users can delete it. Hard: prefix stays and is enforced when sending text.',
  },
  forum_creator: {
    title: 'Post creators',
    description:
      'Defaults for members who start a post: extra control over their own thread without server-wide mod permissions.',
  },
  danger_zone: {
    title: 'Danger Zone',
    description:
      'Sensitive actions that permanently remove this channel. Proceed carefully.',
  },
  discord_voice_mirror: {
    title: 'Discord voice mirror',
    description:
      'Show who is in Discord voice channels (display-only in Echo — join voice in Discord).',
  },
  discord_chat_sync: {
    title: 'Discord chat sync',
    description:
      'Apply the same live message mirroring to every text and forum channel in a category.',
  },
};

/** Section labels for channel permission overwrites (ordered via {@link CHANNEL_PERMISSION_GROUPS}). */
export type ChannelPermissionGroup =
  | 'Access'
  | 'Messaging'
  | 'Media & links'
  | 'Reactions & emoji'
  | 'Mentions'
  | 'Apps & commands'
  | 'Polls'
  | 'Threads'
  | 'Voice'
  | 'Voice moderation'
  | 'Activities & events'
  | 'Paper';

export const CHANNEL_PERMISSION_GROUPS: ChannelPermissionGroup[] = [
  'Access',
  'Messaging',
  'Media & links',
  'Reactions & emoji',
  'Mentions',
  'Apps & commands',
  'Polls',
  'Threads',
  'Voice',
  'Voice moderation',
  'Activities & events',
  'Paper',
];

/** Stable section order for permission overwrite UIs. */
export function groupChannelPermissionDefs(
  defs: ChannelPermissionDef[],
): Array<[ChannelPermissionGroup, ChannelPermissionDef[]]> {
  const map = new Map<ChannelPermissionGroup, ChannelPermissionDef[]>();
  for (const def of defs) {
    const bucket = map.get(def.group) ?? [];
    bucket.push(def);
    map.set(def.group, bucket);
  }
  return CHANNEL_PERMISSION_GROUPS.filter((group) => map.has(group)).map(
    (group) => [group, map.get(group)!],
  );
}

export interface ChannelPermissionDef {
  key: ChannelPermissionKey;
  label: string;
  group: ChannelPermissionGroup;
}

/** Shared general rows (text + voice). Single source so category merge never drifts. */
export const CHANNEL_GENERAL_PERMISSION_DEFS: ChannelPermissionDef[] = [
  { key: 'viewChannel', label: 'View channel', group: 'Access' },
  {
    key: 'manageChannel',
    label: 'Manage channel',
    group: 'Access',
  },
  {
    key: 'managePermissions',
    label: 'Manage permissions',
    group: 'Access',
  },
  {
    key: 'manageWebhooks',
    label: 'Manage webhooks',
    group: 'Access',
  },
  { key: 'createInvite', label: 'Create invite', group: 'Access' },
];

/**
 * Voice-only channel permissions (canonical wire order: Connect → Speak → Use Voice Activity → …).
 * Always included in voice channel + category UIs from the same source.
 */
export const CHANNEL_VOICE_ONLY_DEFS: ChannelPermissionDef[] = [
  { key: 'connect', label: 'Connect', group: 'Voice' },
  { key: 'speak', label: 'Speak', group: 'Voice' },
  {
    key: 'useVoiceActivity',
    label: 'Use Voice Activity',
    group: 'Voice',
  },
  { key: 'video', label: 'Video', group: 'Voice' },
  {
    key: 'prioritySpeaker',
    label: 'Use priority speaker',
    group: 'Voice',
  },
  { key: 'stream', label: 'Stream', group: 'Voice' },
  { key: 'requestToSpeak', label: 'Request to speak', group: 'Voice' },
  { key: 'muteMembers', label: 'Mute members', group: 'Voice moderation' },
  { key: 'deafenMembers', label: 'Deafen members', group: 'Voice moderation' },
  { key: 'moveMembers', label: 'Move members', group: 'Voice moderation' },
  {
    key: 'useEmbeddedActivities',
    label: 'Use activities',
    group: 'Activities & events',
  },
  {
    key: 'useSoundboard',
    label: 'Use soundboard',
    group: 'Activities & events',
  },
  {
    key: 'useExternalSounds',
    label: 'Use external sounds',
    group: 'Activities & events',
  },
  { key: 'createEvents', label: 'Create events', group: 'Activities & events' },
  { key: 'manageEvents', label: 'Manage events', group: 'Activities & events' },
];

/** Full text-channel permission list (compact). */
export const CHANNEL_PERMISSION_DEFS_TEXT: ChannelPermissionDef[] = [
  ...CHANNEL_GENERAL_PERMISSION_DEFS,
  { key: 'sendMessages', label: 'Send messages', group: 'Messaging' },
  {
    key: 'readMessageHistory',
    label: 'Read message history',
    group: 'Messaging',
  },
  { key: 'manageMessages', label: 'Manage messages', group: 'Messaging' },
  { key: 'pinMessages', label: 'Pin messages', group: 'Messaging' },
  { key: 'bypassSlowmode', label: 'Bypass slowmode', group: 'Messaging' },
  {
    key: 'sendTTS',
    label: 'Send text-to-speech messages',
    group: 'Messaging',
  },
  { key: 'embedLinks', label: 'Embed links', group: 'Media & links' },
  { key: 'attachFiles', label: 'Attach files', group: 'Media & links' },
  {
    key: 'sendVoiceMessages',
    label: 'Send voice messages',
    group: 'Media & links',
  },
  { key: 'addReactions', label: 'Add reactions', group: 'Reactions & emoji' },
  {
    key: 'useExternalEmoji',
    label: 'Use external emoji',
    group: 'Reactions & emoji',
  },
  {
    key: 'useExternalStickers',
    label: 'Use external stickers',
    group: 'Reactions & emoji',
  },
  {
    key: 'mentionEveryone',
    label: 'Mention all roles',
    group: 'Mentions',
  },
  {
    key: 'useApplicationCommands',
    label: 'Use application commands',
    group: 'Apps & commands',
  },
  {
    key: 'useExternalApps',
    label: 'Use external apps',
    group: 'Apps & commands',
  },
  { key: 'createPolls', label: 'Create polls', group: 'Polls' },
  /* Threads */
  {
    key: 'sendMessagesInThreads',
    label: 'Send messages in threads',
    group: 'Threads',
  },
  {
    key: 'createPublicThreads',
    label: 'Create public threads',
    group: 'Threads',
  },
  {
    key: 'createPrivateThreads',
    label: 'Create private threads',
    group: 'Threads',
  },
  { key: 'manageThreads', label: 'Manage threads', group: 'Threads' },
];

/** Voice channel settings: general + voice-only (same rows as category’s Voice section). */
export const CHANNEL_PERMISSION_DEFS_VOICE: ChannelPermissionDef[] = [
  ...CHANNEL_GENERAL_PERMISSION_DEFS,
  ...CHANNEL_VOICE_ONLY_DEFS,
];

export const CHANNEL_PERMISSION_DEFS_PAPER: ChannelPermissionDef[] = [
  ...CHANNEL_GENERAL_PERMISSION_DEFS,
  { key: 'sendMessages', label: 'Author in paper', group: 'Paper' },
  { key: 'commentOnPaper', label: 'Comment on paper', group: 'Paper' },
  { key: 'manageMessages', label: 'Manage comments', group: 'Paper' },
  {
    key: 'readMessageHistory',
    label: 'Download / export paper',
    group: 'Paper',
  },
];

/** Category-level: union of text + voice (deduped by key). */
export const CHANNEL_PERMISSION_DEFS_CATEGORY: ChannelPermissionDef[] = (() => {
  const seen = new Set<ChannelPermissionKey>();
  const out: ChannelPermissionDef[] = [];
  for (const d of [
    ...CHANNEL_PERMISSION_DEFS_TEXT,
    ...CHANNEL_PERMISSION_DEFS_VOICE,
    ...CHANNEL_PERMISSION_DEFS_PAPER,
  ]) {
    if (seen.has(d.key)) continue;
    seen.add(d.key);
    out.push(d);
  }
  return out;
})();

const CHANNEL_VOICE_SETTINGS_KEYS = new Set<ChannelPermissionKey>([
  ...CHANNEL_GENERAL_PERMISSION_DEFS.map((def) => def.key),
  ...CHANNEL_VOICE_ONLY_DEFS.map((def) => def.key),
]);

/** Category + permission overwrite UIs (respects channel webhook kill switch). */
export function getCategoryPermissionDefsForUi(): ChannelPermissionDef[] {
  if (CHANNEL_WEBHOOKS_ENABLED) return CHANNEL_PERMISSION_DEFS_CATEGORY;
  return CHANNEL_PERMISSION_DEFS_CATEGORY.filter(
    (d) => d.key !== 'manageWebhooks',
  );
}

/**
 * Channel settings permissions tab: text channels get text defs; voice channels get the same
 * General + Voice rows as category settings (from merged list), so “Use Voice Activity” is always
 * present for voice in the same order as category defaults.
 */
export function getChannelPermissionDefsForChannelType(
  channelType: EchoChannelType,
): ChannelPermissionDef[] {
  let defs: ChannelPermissionDef[];
  if (channelType === 'paper') defs = CHANNEL_PERMISSION_DEFS_PAPER;
  else if (channelType === 'text' || channelType === 'forum')
    defs = CHANNEL_PERMISSION_DEFS_TEXT;
  else
    defs = CHANNEL_PERMISSION_DEFS_CATEGORY.filter((def) =>
      CHANNEL_VOICE_SETTINGS_KEYS.has(def.key),
    );
  if (CHANNEL_WEBHOOKS_ENABLED) return defs;
  return defs.filter((d) => d.key !== 'manageWebhooks');
}

export const CATEGORY_TAB_COPY: Record<
  CategorySettingsTab,
  { title: string; description: string }
> = {
  overview: {
    title: 'Overview',
    description:
      'Rename this category. Channels that match category permissions use the Permissions tab.',
  },
  permissions: {
    title: 'Permissions',
    description:
      'Set default permissions for this category. Channels that match the category use these rules.',
  },
  discord_chat_sync: {
    title: 'Discord messages (category)',
    description:
      'Turn on the same Discord message linking for every text and forum channel in this category.',
  },
  discord_voice_mirror: {
    title: 'Discord voice activity',
    description:
      'Show who is in voice on Discord for channels in this category. Join voice in Discord to participate.',
  },
  danger_zone: {
    title: 'Danger Zone',
    description:
      'Sensitive actions that permanently remove this category and its channels. Proceed carefully.',
  },
};

export { MESSAGE_AUTO_DELETE_OPTIONS } from '@shared/messageAutoDelete';

export const SLOW_MODE_OPTIONS: { label: string; value: string }[] = [
  { label: 'Off', value: '0' },
  { label: '5 seconds', value: '5' },
  { label: '10 seconds', value: '10' },
  { label: '15 seconds', value: '15' },
  { label: '30 seconds', value: '30' },
  { label: '1 minute', value: '60' },
  { label: '5 minutes', value: '300' },
  { label: '10 minutes', value: '600' },
  { label: '15 minutes', value: '900' },
  { label: '1 hour', value: '3600' },
  { label: '6 hours', value: '21600' },
  { label: '24 hours', value: '86400' },
];
