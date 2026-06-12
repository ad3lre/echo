import type {
  ChannelPermissionKey,
  DiscordRoleImportIssue,
} from '@shared/types';
import type { EchoRoleType } from '@shared/echoRoleTypes';
import type { EchoRoleScope } from '@shared/echoRoleScope';

export type EchoServerRoleDto = {
  id: string;
  name: string;
  color: string;
  darkColor: string;
  lightColor: string;
  separateThemeColors: boolean;
  position: number;
  hoist: boolean;
  defaultOnJoin: boolean;
  isMembers: boolean;
  /** @deprecated use isMembers */
  isEveryone: boolean;
  /** Server settings organizer; null = uncategorized. */
  roleCategoryId?: string | null;
  rankInCategory?: number;
  roleScope?: EchoRoleScope;
  /** Optional custom icon URL for role chips/list rows. */
  roleIconUrl?: string | null;
  /** Optional source emoji id (custom emoji from library). */
  roleIconEmojiId?: string | null;
  permissions: string[];
  /** Defaults to `mixed` when omitted (legacy API rows). */
  roleType?: EchoRoleType;
  syncWithCategoryDefaults?: boolean;
};

export type EchoRoleCategoryDto = {
  id: string;
  name: string;
  position: number;
  isSystem?: boolean;
  defaultPermissions?: string[];
  defaultHoist?: boolean;
  defaultOnJoin?: boolean;
  defaultRoleScope?: EchoRoleScope;
  defaultRoleType?: EchoRoleType;
  selfAssignableDefaults?: boolean;
};

/** Role A is the anchor (edited in settings); links describe what else to assign when A (or linked, if two-way) is granted. */
export type EchoRoleLinkDto = {
  anchorRoleId: string;
  linkedRoleId: string;
  twoWay: boolean;
};

export type EchoServerMemberDto = {
  userId: string;
  /** Effective display in this server (nickname if set, else account name). */
  name: string;
  /**
   * Account display name for global `users[]` merge (excludes server nickname).
   */
  accountDisplayName?: string;
  /** Server-only nickname when set. */
  serverNickname?: string;
  username?: string;
  pfp: string;
  isDiscordShadow?: boolean;
  /** From workspace / members API when the account is a guest. */
  isGuest?: boolean;
  /** ISO timestamp until which communication is disabled in this server. */
  communicationTimeoutUntil?: string | null;
  /** When this user joined this server (`echo_server_members.joined_at`). */
  joinedAt?: string;
  /** Full-account signup index (`auth_users.signup_ordinal`; higher = newer). */
  signupOrdinal?: number;
  /** Account badges from `auth_users` (workspace bootstrap). */
  badges?: string[];
  /** Profile bio from `auth_users.bio` (server-persisted). */
  bio?: string;
  /** User profile banner (guild peers see updates via workspace hydrate + `workspace_invalidated`). */
  bannerImage?: string;
  bannerColor?: string;
  bannerRefractionEnabled?: boolean;
  bannerBlurEnabled?: boolean;
  bannerBlackoutEnabled?: boolean;
  bannerPositionY?: number;
  /** IANA timezone from `auth_users.time_zone` (Magic Time). */
  timeZone?: string | null;
};

export type EchoPermissionOverwriteRowDto = {
  targetType: 'members' | 'global' | 'role' | 'member' | 'everyone';
  targetId?: string | null;
  partial: Partial<Record<ChannelPermissionKey, boolean>>;
};

export type EchoRolePatch = {
  name?: string;
  color?: string;
  darkColor?: string;
  lightColor?: string;
  separateThemeColors?: boolean;
  hoist?: boolean;
  defaultOnJoin?: boolean;
  permissions?: string[];
  roleCategoryId?: string | null;
  roleScope?: EchoRoleScope;
  roleIconUrl?: string | null;
  roleIconEmojiId?: string | null;
  roleType?: EchoRoleType;
  syncWithCategoryDefaults?: boolean;
};

export type EchoServerCapabilitiesDto = {
  canManageRoles: boolean;
  canAssignRoles?: boolean;
  canManageServer: boolean;
  canCreateChannel: boolean;
  canModerateMembers: boolean;
  canKickMembers?: boolean;
  canBanMembers?: boolean;
  canTimeoutMembers?: boolean;
  canManageMessages: boolean;
  canCreateInvite: boolean;
  canChangeNicknames?: boolean;
  canManageNicknames?: boolean;
  canMentionEveryone?: boolean;
  /** Guild voice: apply server mute (MUTE_MEMBERS). */
  canMuteVoiceMembers?: boolean;
  /** Guild voice: apply server deafen (DEAFEN_MEMBERS). */
  canDeafenVoiceMembers?: boolean;
  /** Guild voice: move members between voice channels (MOVE_MEMBERS). */
  canMoveVoiceMembers?: boolean;
  communicationTimeoutActive?: boolean;
  communicationTimeoutUntil?: string | null;
  communicationTimeoutUntilEpochMs?: number | null;
};

export type EchoChannelCapabilitiesDto = {
  canViewChannel: boolean;
  canSendMessages: boolean;
  canCreatePolls: boolean;
  canUploadFiles: boolean;
  canMentionEveryone: boolean;
  canUseExternalEmoji: boolean;
  canManageChannel: boolean;
  communicationTimeoutActive?: boolean;
  communicationTimeoutUntil?: string | null;
  communicationTimeoutUntilEpochMs?: number | null;
};

export type EchoRoleUiBootstrapDto = {
  capabilities: EchoServerCapabilitiesDto;
  roles: EchoServerRoleDto[];
  assignments: Record<string, string[]>;
  roleLinks?: EchoRoleLinkDto[];
  roleCategories?: EchoRoleCategoryDto[];
};

export type EchoPermissionExplainResponse = {
  effective: string[];
  ownerBypass: boolean;
  explanation: {
    summary: string;
    traces: unknown[];
    byLayer: Record<string, number>;
    compressedBits: unknown[];
  };
  traces: unknown[];
};

export type EchoAuditLogEntryDto = {
  id: string;
  actor_id: string;
  actor_label: string;
  action: string;
  target_type: string;
  target_id: string;
  created_at: string;
};

export type EchoServerBanDto = {
  userId: string;
  username: string;
  displayName: string;
  pfp: string;
  createdAt: string;
  expiresAt: string | null;
  reason: string | null;
  bannedByLabel: string;
};

export type EchoChannelRow = {
  id: string;
  name: string;
  type: string;
  parentChannelId?: string;
  categoryId: string;
  categoryName: string;
  categoryPosition: number;
  position: number;
  permissionOverrides?: unknown;
  slowmodeSeconds: number;
  userLimit: number;
  bitrateBps: number | null;
  voiceE2eeEnabled?: boolean;
  nsfw: boolean;
  /** Echo `icon_key` (e.g. `sparkle.svg`); omitted when empty. */
  iconKey?: string;
  discordChannelId?: string;
  forumAvailableTags?: unknown;
  forumPostTagIds?: unknown;
  forumPostPinned?: boolean;
  forumPostLocked?: boolean;
  forumPostArchivedAt?: string;
  forumCreatorDefaultPerms?: import('@shared/types').ForumCreatorDefaultPerms;
  forumPostCreatorUserId?: string;
  autoDeleteAfterSeconds?: number | null;
  autoDeleteSyncedToCategory?: boolean;
  categoryAutoDeleteAfterSeconds?: number | null;
  messageFormatTemplate?: string;
  messageFormatHard?: boolean;
  paperCommentsEnabled?: boolean;
  paperShowAuthorGutter?: boolean;
};

export type EchoCategoryDto = {
  id: string;
  name: string;
  position: number;
  autoDeleteAfterSeconds?: number | null;
};

export type EchoChannelPatch = {
  name?: string;
  categoryId?: string | null;
  siblingIndex?: number;
  moveOutOfCategoryPermission?: 'sync' | 'keep';
  slowmodeSeconds?: number;
  userLimit?: number;
  bitrateBps?: number | null;
  voiceE2eeEnabled?: boolean;
  nsfw?: boolean;
  iconKey?: string;
  permissionOverrides?: Record<string, boolean> | null;
  forumCreatorDefaultPerms?: import('@shared/types').ForumCreatorDefaultPerms;
  autoDeleteAfterSeconds?: number | null;
  autoDeleteSyncedToCategory?: boolean;
  messageFormatTemplate?: string;
  messageFormatHard?: boolean;
  paperCommentsEnabled?: boolean;
  paperShowAuthorGutter?: boolean;
};

export type EchoDiscordImportState = {
  serverId: string;
  sourceLabel: string;
  sourceDir: string;
  metadataImported: boolean;
  rolesImported: boolean;
  membersImported: boolean;
  channelsImported: boolean;
  metadataImportedAt: string | null;
  rolesImportedAt: string | null;
  membersImportedAt: string | null;
  channelsImportedAt: string | null;
  roleCount: number;
  categoryCount: number;
  channelCount: number;
  /** Discord snowflake → Echo user id for this server’s import (shadow or linked). */
  discordToEchoUserMap: Record<string, string>;
  userMapEntryCount: number;
  warnings: string[];
  lastError: string;
  roleImportIssues: DiscordRoleImportIssue[];
  updatedAt: string | null;
  nextStep: 'metadata' | 'roles' | 'members' | 'channels' | null;
  completedSteps: number;
  preview: null | {
    guildName: string;
    roleCount: number;
    categoryCount: number;
    channelCount: number;
    unsupportedChannelCount: number;
    uncategorizedChannelCount: number;
    orphanedChannelCount: number;
    sampleBuckets: {
      key: string;
      label: string;
      channelNames: string[];
      totalChannels: number;
    }[];
    warnings: string[];
  };
  previewError: string;
};

export type EchoApplicationQuestionType =
  | 'short'
  | 'long'
  | 'single'
  | 'multi'
  | 'attachment';

export type EchoApplicationAttachmentAnswerDto = {
  key: string;
  publicUrl: string;
  name: string;
  size: number;
  contentType: string;
};

export type EchoApplicationQuestionDto = {
  id: string;
  type: EchoApplicationQuestionType;
  label: string;
  required: boolean;
  options?: string[];
  placeholder?: string;
  maxLength?: number;
  maxBytes?: number;
};

export type EchoApplicationFormDto = {
  version: number;
  questions: EchoApplicationQuestionDto[];
};

export type EchoServerApplicationRowDto = {
  id: string;
  userId: string;
  status: string;
  source: string;
  answers: Record<string, unknown>;
  createdAt: string;
  resolvedAt: string | null;
  resolvedBy: string | null;
  resolutionNote: string;
};

export type PatchEchoServerPreferencesBody = {
  /** Display name; 1–100 characters after trim. */
  name?: string;
  automodSpamEnabled?: boolean;
  bannerBlurEnabled?: boolean;
  bannerBlackoutEnabled?: boolean;
  /** Server icon (e.g. data URL or HTTPS URL); persisted in `echo_servers.icon_url`. */
  iconUrl?: string;
  /** Wide banner image; persisted in `echo_servers.banner_url`. */
  bannerUrl?: string;
  /** Vertical crop anchor for banner cover image (0 = top, 50 = center, 100 = bottom). */
  bannerPositionY?: number;
  /** When false, server is omitted from Explore directory. */
  listedInDirectory?: boolean;
  /** When false, token and vanity invites cannot admit new members. */
  inviteJoinEnabled?: boolean;
  vanityCode?: string;
  /** Public Explore blurb; max 400 characters on the server. */
  description?: string;
  /** Public Explore tags; normalized lowercase tokens. */
  tags?: string[];
  /** Burst-join protection toggle. */
  raidProtectionEnabled?: boolean;
  /** Maximum joins allowed in the configured window (2..100). */
  raidJoinThresholdCount?: number;
  /** Sliding window used for join counting, in seconds (10..3600). */
  raidJoinWindowSeconds?: number;
  /** When false, guest accounts cannot use Explore or invite join for this server. */
  allowGlobalGuests?: boolean;
  /** When true, new joins require an account with a verified email address. */
  verificationRequireEmail?: boolean;
  applicationsEnabled?: boolean;
  applicationForm?: EchoApplicationFormDto;
};

export type EchoServerMemberHighlightDto = {
  name: string;
  pfp: string;
};

export type EchoInvitePreviewDto = {
  name: string;
  iconUrl: string;
  bannerUrl: string;
  description: string;
  memberCount: number;
  serverId?: string;
  requiresApplication?: boolean;
  skipsApplication?: boolean;
  applicationForm?: EchoApplicationFormDto;
  voiceChannel?: { id: string; name: string };
  topMembers?: EchoServerMemberHighlightDto[];
};

export type EchoEmojiPackMarketSettingsApi = {
  tags: string[];
};

export type EchoEmojiMarketPackApi = {
  id: string;
  name: string;
  description: string;
  authorServerName?: string;
  totalUseCount?: number;
  marketSettings?: EchoEmojiPackMarketSettingsApi;
  emojis: {
    id: string;
    name: string;
    kind: 'static' | 'animated';
    char?: string;
    previewUrl?: string;
  }[];
  emojiCount?: number;
  previewEmojiUrl?: string;
};

export type EchoEmojiLibraryEmojiApi = {
  id: string;
  serverId?: string;
  name: string;
  animated: boolean;
  imageUrl: string;
  useCount: number;
  /** Present for Discord-imported emojis; <:name:id> in messages may use this id. */
  sourceDiscordEmojiId?: string | null;
};

export type EchoEmojiLibraryPackApi = {
  id: string;
  name: string;
  source: 'market' | 'custom';
  marketPackId: string | null;
  position: number;
  description: string;
  listedInMarket: boolean;
  marketSettings: EchoEmojiPackMarketSettingsApi;
  emojis: EchoEmojiLibraryEmojiApi[];
};
