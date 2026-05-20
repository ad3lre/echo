import type { Ref } from 'vue';
import type { RawMessage } from '@/features/chat/chatMessageTypes';
import type { ChannelCategory } from '@/composables/useChannels';
import type { ServerNotificationLevel } from '@/features/server-notifications/types';
import type { MemberRole } from '@/utils/memberProfiles';

export type SocialGraphStatus = 'idle' | 'loading' | 'ready' | 'error';

export interface MessageRequestEntry {
  id: string;
  channelId: string;
  fromUserId: string;
  preview: string;
}

export interface FriendRequestIncomingEntry {
  id: string;
  fromUserId: string;
}

export interface FriendRequestOutgoingEntry {
  id: string;
  toUserId: string;
}

/** Canonical workspace display shape (users, servers, channels, messages). */
export interface MockData {
  users: {
    id: string;
    name: string;
    username?: string;
    pfp: string;
    status: string;
    customStatus?: string;
    bio?: string;
    bannerImage?: string;
    bannerColor?: string;
    bannerRefractionEnabled?: boolean;
    bannerBlurEnabled?: boolean;
    bannerBlackoutEnabled?: boolean;
    badges?: string[];
    timeZone?: string | null;
    /** Higher = newer Echo account (`auth_users.signup_ordinal`). */
    signupOrdinal?: number;
  }[];
  servers: { id: string; name: string; imageUrl: string; ownerId?: string }[];
  categoriesByServer: Record<string, ChannelCategory[]>;
  discoverableServers: {
    id?: string;
    name: string;
    pfp: string;
    banner?: string;
    description?: string;
    memberCount?: number;
    voiceParticipantCount?: number;
    createdAt?: string;
    allowGlobalGuests?: boolean;
  }[];
  messages: Record<string, RawMessage[]>;
  friendIds: string[];
  messageRequests: MessageRequestEntry[];
  friendRequestsIncoming: FriendRequestIncomingEntry[];
  friendRequestsOutgoing: FriendRequestOutgoingEntry[];
  serverMemberIds: Record<string, string[]>;
  friendIdsByUserId: Record<string, string[]>;
  blockedUserIds: string[];
}

export interface WorkspaceStateRefs {
  users: Ref<MockData['users']>;
  servers: Ref<MockData['servers']>;
  categoriesByServer: Ref<MockData['categoriesByServer']>;
  discoverableServers: Ref<MockData['discoverableServers']>;
  messages: Ref<MockData['messages']>;
  friendIds: Ref<MockData['friendIds']>;
  messageRequests: Ref<MockData['messageRequests']>;
  friendRequestsIncoming: Ref<MockData['friendRequestsIncoming']>;
  friendRequestsOutgoing: Ref<MockData['friendRequestsOutgoing']>;
  serverMemberIds: Ref<MockData['serverMemberIds']>;
  friendIdsByUserId: Ref<MockData['friendIdsByUserId']>;
  blockedUserIds: Ref<MockData['blockedUserIds']>;
  bannedUserIdsByServer: Ref<Record<string, string[]>>;
  banMetaByServer: Ref<
    Record<string, Record<string, { reason: string; expiresAt: number | null }>>
  >;
  timeoutUntilByServerUser: Ref<Record<string, Record<string, number>>>;
  vcServerMuteByChannel: Ref<Record<string, Record<string, boolean>>>;
  vcServerDeafenByChannel: Ref<Record<string, Record<string, boolean>>>;
  serverNotificationOverrides: Ref<Record<string, ServerNotificationLevel>>;
  memberRoleOverrides: Ref<Record<string, Record<string, MemberRole[]>>>;
  serverMemberNicknames: Ref<Record<string, Record<string, string>>>;
  /** Echo social graph (friends + requests) hydration status. */
  socialGraphStatus: Ref<SocialGraphStatus>;
  loading: Ref<boolean>;
  fromApi: Ref<boolean>;
  apiError: Ref<string | null>;
}

export type WorkspaceStateApi = {
  users: Ref<MockData['users']>;
  servers: Ref<MockData['servers']>;
  categoriesByServer: Ref<MockData['categoriesByServer']>;
  discoverableServers: Ref<MockData['discoverableServers']>;
  messages: Ref<MockData['messages']>;
  friendIds: Ref<MockData['friendIds']>;
  messageRequests: Ref<MockData['messageRequests']>;
  friendRequestsIncoming: Ref<MockData['friendRequestsIncoming']>;
  friendRequestsOutgoing: Ref<MockData['friendRequestsOutgoing']>;
  serverMemberIds: Ref<MockData['serverMemberIds']>;
  friendIdsByUserId: Ref<MockData['friendIdsByUserId']>;
  blockedUserIds: Ref<MockData['blockedUserIds']>;
  bannedUserIdsByServer: Ref<Record<string, string[]>>;
  timeoutUntilByServerUser: Ref<Record<string, Record<string, number>>>;
  /** Fingerprint refs for timeout-map NOOP when snapshot version + shape unchanged. */
  lastTimeoutWorkspaceVersion: Ref<string>;
  lastTimeoutServerCount: Ref<number>;
  lastTimeoutMemberKeyCount: Ref<number>;
  kickUserFromServer: (serverId: string, userId: string) => boolean;
  banUserFromServer: (
    serverId: string,
    userId: string,
    opts?: { banDurationMinutes?: number | null; reason?: string },
  ) => boolean;
  timeoutUserOnServer: (
    serverId: string,
    userId: string,
    minutes: number,
  ) => boolean;
  clearTimeoutUserOnServer: (serverId: string, userId: string) => boolean;
  isUserBannedFromServer: (serverId: string, userId: string) => boolean;
  vcServerMuteByChannel: Ref<Record<string, Record<string, boolean>>>;
  vcServerDeafenByChannel: Ref<Record<string, Record<string, boolean>>>;
  toggleVcServerMute: (channelId: string, userId: string) => void;
  toggleVcServerDeafen: (channelId: string, userId: string) => void;
  removeUserFromVoiceChannel: (
    serverId: string,
    channelId: string,
    userId: string,
  ) => boolean;
  moveUserBetweenVoiceChannels: (
    serverId: string,
    fromChannelId: string,
    toChannelId: string,
    userId: string,
  ) => boolean;
  serverNotificationOverrides: Ref<Record<string, ServerNotificationLevel>>;
  getServerNotificationLevel: (serverId: string) => ServerNotificationLevel;
  setServerNotificationLevel: (
    serverId: string,
    level: ServerNotificationLevel,
  ) => void;
  memberRoleOverrides: Ref<Record<string, Record<string, MemberRole[]>>>;
  serverMemberNicknames: Ref<Record<string, Record<string, string>>>;
  /** Echo social graph (friends + requests) hydration status. */
  socialGraphStatus: Ref<SocialGraphStatus>;
  setServerMemberNickname: (
    serverId: string,
    userId: string,
    nickname: string,
  ) => void;
  toggleMemberRole: (
    serverId: string,
    userId: string,
    role: MemberRole,
    assign: boolean,
  ) => void;
  loading: Ref<boolean>;
  fromApi: Ref<boolean>;
  apiError: Ref<string | null>;
  refreshExploreDirectory: () => Promise<void>;
  addChannelToCategory: (
    serverId: string,
    categoryId: string,
    channel: {
      name: string;
      type: 'text' | 'voice' | 'forum' | 'stage';
      iconKey?: string;
    },
  ) => Promise<string | null>;
  addCategoryToServer: (serverId: string, rawName: string) => boolean;
  createUserServer: (
    rawName: string,
    opts?: { memberUserId?: string; imageUrl?: string },
  ) => Promise<string | null>;
  deleteUserServer: (serverId: string) => Promise<boolean>;
  updateCategory: (
    serverId: string,
    categoryId: string,
    patch: {
      newName?: string;
      channelPermissionDefaults?: Partial<Record<string, boolean>>;
    },
  ) => boolean;
  updateChannel: (
    serverId: string,
    channelId: string,
    patch: {
      name?: string;
      categoryId?: string;
      iconKey?: string;
      slowModeSeconds?: number;
      userLimit?: number;
      nsfw?: boolean;
      messageHistoryAnchor?: 'top' | 'bottom';
      bitrateBps?: number | null;
      channelPermissions?: any;
      messageFormatTemplate?: string;
      messageFormatHard?: boolean;
    },
  ) => boolean;
  deleteChannel: (serverId: string, channelId: string) => boolean;
  deleteCategory: (serverId: string, categoryId: string) => boolean;
  startInitialLoad: () => Promise<void>;
  consumeSkipEchoWorkspaceHydrate: () => boolean;
  patchUserRowById: (
    userId: string,
    patch: Partial<MockData['users'][number]>,
  ) => void;
};
