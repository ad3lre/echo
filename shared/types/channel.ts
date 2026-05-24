/**
 * Channel-level permission overrides (mock; full permission key set).
 * Text vs voice UIs filter which keys are shown.
 */

import type { ForumCreatorDefaultPerms } from './forumCreator';

export type ChannelPermissionKey =
  /* General (text + voice) */
  | 'viewChannel'
  | 'manageChannel'
  | 'managePermissions'
  | 'manageWebhooks'
  | 'createInvite'
  /* Text */
  | 'sendMessages'
  | 'sendMessagesInThreads'
  | 'createPublicThreads'
  | 'createPrivateThreads'
  | 'embedLinks'
  | 'attachFiles'
  | 'addReactions'
  | 'useExternalEmoji'
  | 'useExternalStickers'
  | 'mentionEveryone'
  | 'manageMessages'
  | 'manageThreads'
  | 'readMessageHistory'
  | 'sendTTS'
  | 'useApplicationCommands'
  | 'createPolls'
  /** T, V, S — Legacy “Send Voice Messages” */
  | 'sendVoiceMessages'
  /** T — Legacy “Pin Messages” */
  | 'pinMessages'
  /** T, V, S */
  | 'bypassSlowmode'
  /** T, V, S */
  | 'useExternalApps'
  /* Voice */
  | 'connect'
  | 'speak'
  | 'video'
  | 'muteMembers'
  | 'deafenMembers'
  | 'moveMembers'
  | 'useVoiceActivity'
  | 'prioritySpeaker'
  | 'stream'
  | 'useEmbeddedActivities'
  /** S (stage); shown for parity / future stage channels */
  | 'requestToSpeak'
  /** V, S */
  | 'manageEvents'
  /** V, S */
  | 'createEvents'
  /** V */
  | 'useSoundboard'
  /** V */
  | 'useExternalSounds'
  /** Paper channels — margin comments (independent of author / SEND_MESSAGES). */
  | 'commentOnPaper';

export interface ChannelPermissionsState {
  /** When true, category defaults apply; overrides are ignored. */
  syncWithCategory: boolean;
  /** Explicit allow/deny when not syncing (true = allow). */
  overrides: Partial<Record<ChannelPermissionKey, boolean>>;
}

export type ForumTag = {
  id: string;
  name: string;
  emoji?: string;
  moderated?: boolean;
};

export interface Channel {
  id: string;
  name: string;
  serverId: string;
  type: 'text' | 'voice' | 'forum' | 'stage' | 'paper';
  parentChannelId?: string;
  createdAt: string;
  updatedAt: string;
  /** Optional UI icon key (matches frontend `icons` map, mock). */
  iconKey?: string;
  /** Slow mode interval in seconds; 0 = off (mock). */
  slowModeSeconds?: number;
  /** Max concurrent users; 0 = unlimited (mock). */
  userLimit?: number;
  /** Voice: manual bitrate in bits per second; omit/null = server default. */
  bitrateBps?: number | null;
  /**
   * Voice: when true, LiveKit joins require the voice E2EE epoch + envelope flow
   * (SFU forwards ciphertext only).
   */
  voiceE2eeEnabled?: boolean;
  /** Age-restricted / sensitive content marker. */
  nsfw?: boolean;
  /**
   * Text channels: where the message list opens after load — newest at bottom (default)
   * or the start of the loaded page at the top.
   */
  messageHistoryAnchor?: 'top' | 'bottom';
  /** Channel-owned auto-delete TTL (seconds); used when not syncing to category. */
  autoDeleteAfterSeconds?: number | null;
  /** When true (default), effective TTL comes from the parent category. */
  autoDeleteSyncedToCategory?: boolean;
  /** Parent category TTL for UI when synced (seconds); null = off. */
  categoryAutoDeleteAfterSeconds?: number | null;
  channelPermissions?: ChannelPermissionsState;
  /** Echo workspace: effective MANAGE_CHANNELS on this channel for the current user. */
  canManageChannel?: boolean;
  /** Echo workspace: effective MANAGE_WEBHOOKS (or admin-equivalent) for channel webhook settings. */
  canManageWebhooks?: boolean;
  /**
   * Echo workspace: voice channels only — effective CONNECT for the current user.
   * Omitted on text channels; join UI should require `true` before calling voice APIs.
   */
  canConnectVoice?: boolean;
  /** Echo: Discord Channel ID if this channel was imported. */
  discordChannelId?: string;
  /** Forum channel only: available post tags for this forum. */
  forumAvailableTags?: ForumTag[];
  /** Forum post (child channel) only: selected tag ids. */
  forumPostTagIds?: string[];
  /** Forum post only: pinned in the forum list. */
  forumPostPinned?: boolean;
  /** Forum post only: locked for new messages. */
  forumPostLocked?: boolean;
  /** Forum post only: archived timestamp (ISO) when archived; null/omit = active. */
  forumPostArchivedAt?: string | null;
  /** Forum channel only: defaults for users who create a post in this forum. */
  forumCreatorDefaultPerms?: ForumCreatorDefaultPerms;
  /** Text/forum: default message prefix injected in composer (empty = off). */
  messageFormatTemplate?: string;
  /** Text/forum: when true with non-empty template, prefix cannot be removed; enforced on send. */
  messageFormatHard?: boolean;
  /** Forum post (child) only: Echo user id of the member who created this post. */
  forumPostCreatorUserId?: string;
  /** Echo workspace: server member user ids that effectively have VIEW_CHANNEL for this channel. */
  accessibleMemberUserIds?: string[];
  /**
   * Display-only Discord VC mirror — Echo denies CONNECT; roster shown from Discord.
   */
  discordVoiceMirrorOnly?: boolean;
  /** Echo workspace: voice channel — user ids in VC (server snapshot). */
  voiceParticipantIds?: string[];
  /** Echo workspace: voice channel — server-mute flags by user id. */
  voiceServerMuteByUserId?: Record<string, boolean>;
  /** Echo workspace: voice channel — server-deafen flags by user id. */
  voiceServerDeafenByUserId?: Record<string, boolean>;
  /**
   * Echo workspace: stage channel — users allowed to publish mic (speakers).
   * Omitted on non-stage channels.
   */
  voiceStageSpeakerByUserId?: Record<string, boolean>;
  /** Paper channel: margin comments enabled. */
  paperCommentsEnabled?: boolean;
  /** Paper channel: show author names in left gutter. */
  paperShowAuthorGutter?: boolean;
}

/** Minimal channel info for UI display (e.g. channel list, chat header). */
export type ChannelSummary = Pick<
  Channel,
  | 'id'
  | 'name'
  | 'type'
  | 'parentChannelId'
  | 'iconKey'
  | 'slowModeSeconds'
  | 'userLimit'
  | 'bitrateBps'
  | 'voiceE2eeEnabled'
  | 'nsfw'
  | 'messageHistoryAnchor'
  | 'autoDeleteAfterSeconds'
  | 'autoDeleteSyncedToCategory'
  | 'categoryAutoDeleteAfterSeconds'
  | 'channelPermissions'
  | 'canManageChannel'
  | 'canManageWebhooks'
  | 'canConnectVoice'
  | 'discordChannelId'
  | 'forumAvailableTags'
  | 'forumPostTagIds'
  | 'forumPostPinned'
  | 'forumPostLocked'
  | 'forumPostArchivedAt'
  | 'forumCreatorDefaultPerms'
  | 'messageFormatTemplate'
  | 'messageFormatHard'
  | 'forumPostCreatorUserId'
  | 'accessibleMemberUserIds'
  | 'discordVoiceMirrorOnly'
  | 'voiceParticipantIds'
  | 'voiceServerMuteByUserId'
  | 'voiceServerDeafenByUserId'
  | 'voiceStageSpeakerByUserId'
  | 'paperCommentsEnabled'
  | 'paperShowAuthorGutter'
>;
