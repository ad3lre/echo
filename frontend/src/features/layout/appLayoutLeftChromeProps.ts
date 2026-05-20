import type { ServerNotificationLevel } from '@/features/server-notifications/types';
import type { ServerPingBubbleDisplay } from '@shared/attentionPing';
import type {
  ServerPingChannelDotsForServerRail,
  ServerPingKind,
} from '@/features/server-notifications/serverPing';
import type { PopoutAnchorRect } from '@/utils/memberProfiles';
import type { ChannelCategory } from '@/features/channel-panel/composables/useChannelPanelVoiceState';
import type { ChannelSummary } from '@shared/types';
import type { VcActivityPresenceKind } from '@/features/voice/vcActivityTypes';
import type { DmSubView, RailTab } from '@/features/layout/mainSurface';
import type { DmMentionNotificationRow } from '@/features/dm/collectDmMentionNotifications';
import type { NotificationReadPreset } from '@/features/dm/filterDmMentionNotificationRows';

/** Active guild VC row for DM panel “voice activity” strip (horizontal carousel). */
export type GuildVoiceActivityCard = {
  serverId: string;
  serverName: string;
  /** Raw guild icon URL; use `serverGuildIconDisplayUrl` when rendering. */
  serverImageUrl?: string;
  channelId: string;
  channelName: string;
  channelDisplayName: string;
  participantCount: number;
  userLimit?: number;
  participantPfpUrls: string[];
  /** Echo user ids aligned with `participantPfpUrls` (for stable avatar session keys). */
  participantPreviewUserIds: string[];
};

/** Signed-up upcoming guild events for DM panel strip (parallel to voice activity). */
export type GuildEventActivityCard = {
  serverId: string;
  serverName: string;
  serverImageUrl?: string;
  /** Event cover / hero image (optional). */
  eventImageUrl?: string;
  eventId: string;
  title: string;
  startsAt: string;
  channelId: string | null;
  /** Present when the event uses a custom (non-channel) location string. */
  customLocation?: string | null;
  channelDisplayName: string | null;
  goingCount: number;
};

/** Props for `AppLayoutLeftChrome` — optional when `LAYOUT_LEFT_CHROME_KEY` is provided. */
export type AppLayoutLeftChromeProps = {
  /**
   * Guild horizontal pager (compact viewports): show server-rail channel/member affordances
   * even when grid `channelPanelCollapsed` / `memberPanelCollapsed` are false.
   */
  compactTriPaneGuildNav?: boolean;
  /** Tri-pane guild: channel/DM/more column visible (after explicit channel-list open, not swipe-only). */
  compactGuildTriPaneChannelPanelOpen?: boolean;
  /** Collapses the server rail column; used when the welcome-back explore gate is full-width. */
  hideServerRail?: boolean;
  isAuthenticated: boolean;
  guestFriendsLocked?: boolean;
  activeRailTab: RailTab;
  channelPanelCollapsed: boolean;
  channelPanelBubbleMode?: boolean;
  /** Same semantics as chat surface `memberPanelCollapsed` (includes NSFW gate). */
  memberPanelCollapsed: boolean;
  /** User preference only — server rail “show members” must not appear when only NSFW hides the list. */
  memberPanelCollapsedRaw: boolean;
  isDmUiContext: boolean;
  isServerEmptyOnboarding: boolean;
  isExploreView: boolean;
  inDmMode: boolean;
  dmPanelOpen: boolean;
  channelPanelLoading?: boolean;
  currentUserForServerList: {
    id: string;
    name: string;
    pfp: string;
    status?: string;
  } | null;
  /** Live socket presence overlay keyed by user id — fed into DM panel for authoritative status. */
  presenceByUserId?: Record<string, string | undefined>;
  /** Sparse: user id on mobile-class Echo Web (server rail self badge). */
  presenceMobileByUserId?: Record<string, true>;
  serverNotificationLevelsMap: Record<string, ServerNotificationLevel>;
  serverPingKindsMap: Record<string, ServerPingKind>;
  /** Ping tier + unread sum for server rail (strongest tier wins). */
  serverPingBubblesMap: Record<string, ServerPingBubbleDisplay>;
  /** Per-channel ping dots around each server icon (cap + overflow in payload). */
  serverPingChannelDotsMap: Record<string, ServerPingChannelDotsForServerRail>;
  /** Non-mention unread: compact indicator on server row (sparse `true` flags). */
  serverUnreadActivityDotMap?: Record<string, true>;
  /** Guild channels with unread messages — brighter sidebar labels when unread badges are on. */
  channelMissedActivityByChannelId?: Record<string, true>;
  /** True when a server currently has at least one active voice participant. */
  serverActiveVoiceByServerId?: Record<string, boolean>;
  /**
   * Voice channels with ≥1 participant across all joined guilds (DM panel live strip).
   */
  guildVoiceActivityCards?: GuildVoiceActivityCard[];
  /** Upcoming events the user RSVP’d “going” to (DM Messages strip). */
  guildEventActivityCards?: GuildEventActivityCard[];
  /** Guild VC id when the user is already connected (matches strip cards by channel id). */
  guildVoiceActivityCurrentVoiceChannelId?: string | null;
  canOpenServerSettingsForServer: (serverId: string) => boolean;
  /** CREATE_INVITE — show invite UI for this guild when true. */
  canOpenInviteForServer: (serverId: string) => boolean;
  /** Drag-reorder joined servers on the rail (compact). */
  reorderVisibleServers: (
    fromIndex: number,
    toIndex: number,
    overflowServerId?: string | null,
  ) => void;
  isMoreServersPanelOpen: boolean;
  isMoreServersCompact: boolean;
  isMoreServersPinned: boolean;
  dmActiveTab: DmSubView;
  /** Unread incoming DMs (1:1 + group) for server-rail avatar stack (under DM icon). */
  dmIncomingRailCluster: {
    avatars: Array<
      | {
          kind: 'user';
          userId: string;
          name: string;
          pfp: string;
          unreadCount: number;
        }
      | {
          kind: 'group';
          channelId: string;
          name: string;
          pfp: string;
          unreadCount: number;
        }
    >;
    overflowCount: number;
    totalUnreadCount: number;
  };
  /**
   * Client-only: whether a 1:1 DM is favorited (pinned to top of Messages list).
   */
  isDmInboxUserFavorite?: (userId: string) => boolean;
  /**
   * Client-only: whether a group DM is favorited (pinned to top of Messages list).
   */
  isDmInboxGroupFavorite?: (channelId: string) => boolean;
  /** Merged 1:1 + group DM rows (Messages tab), recency-sorted. */
  dmInboxEntries: Array<
    | {
        kind: 'user';
        id: string;
        name: string;
        pfp: string;
        status: string;
        customStatus?: string;
        unreadDmCount?: number;
      }
    | {
        kind: 'group';
        id: string;
        name: string;
        pfp: string;
        unreadDmCount?: number;
      }
  >;
  /** Server channel list + VC participant name/avatar resolution (member roster). */
  usersForChannelPanel: {
    id: string;
    name: string;
    pfp: string;
    status?: string;
    customStatus?: string;
  }[];
  currentUserId: string;
  selectedDmUserId: string | null;
  selectedMessageRequestId: string | null;
  friendIds: string[];
  messageRequests: unknown[];
  friendRequestsIncoming: unknown[];
  friendRequestsOutgoing: unknown[];
  dmMentionNotifications?: DmMentionNotificationRow[];
  dmNotificationReadStateByChannelId?: Readonly<Record<string, string | null>>;
  mentionNotificationCategoriesByServer?: Readonly<
    Record<string, ChannelCategory[]>
  >;
  mentionNotificationServers?: ReadonlyArray<{
    id: string;
    name: string;
    imageUrl?: string;
  }>;
  isPersistedEchoDmThread?: (channelId: string) => boolean;
  dmNotificationsReadPreset?: NotificationReadPreset;
  dmNotificationsSourceKey?: string;
  /** Snowflake / client group thread id when a group DM is open — highlights the row in the Messages list. */
  selectedGroupDmChannelId?: string | null;
  /** Active DM or group call target (Echo peer id or group thread id) — DM list in-call indicator. */
  dmCallWithUserId?: string | null;
  dmCallRinging?: boolean;
  dmCallRingRemoteVanishing?: boolean;
  phoneCallIcon?: string;
  selectedServer: {
    id: string;
    name: string;
    imageUrl: string;
    bannerImageUrl?: string;
    bannerBlurEnabled?: boolean;
    bannerBlackoutEnabled?: boolean;
    ownerId?: string;
  } | null;
  categoriesForServer: ChannelCategory[];
  activeChannelId: string;
  currentUser?: { id: string; name: string; pfp: string };
  /** Guild channel list voice strip (guild VC or DM call transport when on servers rail). */
  guildVoiceChannelId: string | null;
  guildVoiceChannelName: string;
  liveKitState?: 'idle' | 'connecting' | 'connected' | 'error';
  liveKitNetworkStats?: {
    latencyMs: number;
    jitterMs: number;
    packetLossPct: number;
    bitrateKbps: number;
    codec: string;
    serverRegion?: string;
  } | null;
  liveKitRoom?: unknown;
  /** Per-user output level for VC (same path as CallView / LiveKit). */
  getRemoteParticipantVolume?: (userId: string) => number;
  setRemoteParticipantVolume?: (userId: string, volumePercent: number) => void;
  /** Local mic level 0–1 for VC input meter. */
  vcMicInputLevel?: number;
  openMemberProfile: (
    userId: string,
    anchorRect: PopoutAnchorRect | null,
  ) => void;
  activeMemberProfileId: string | null;
  guildVcMuted: boolean;
  guildVcDeafened: boolean;
  guildVcVideo: boolean;
  guildVcScreenshare: boolean;
  canUseVideo: boolean;
  canJoinPreviewVoiceChannel: (channelId: string) => boolean;
  voiceSideChatCollapsed: boolean;
  canCreateChannels: boolean;
  /** Echo: reorder channels via drag handle (MANAGE_CHANNELS). */
  handleChannelReorder?: (payload: {
    channelId: string;
    targetCategoryId: string | null;
    siblingIndex: number;
  }) => void | Promise<void>;
  handleCategoryReorder?: (payload: {
    categoryId: string;
    siblingIndex: number;
  }) => void | Promise<void>;
  canManageThisChannel: (channel: ChannelSummary) => boolean;
  startChannelResize: (e: MouseEvent) => void;
  resetChannelWidth: () => void;
  showServerSettingsMenuItem: boolean;
  canInviteToCurrentServer: boolean;
  canModerateMemberInServer: (userId: string) => boolean;
  canVcModerateMember: (
    targetUserId: string,
    action:
      | 'serverMute'
      | 'serverDeafen'
      | 'disconnect'
      | 'move'
      | 'inviteToSpeak'
      | 'moveToAudience',
  ) => boolean;
  handleModerateUser: (payload: {
    action: 'kick' | 'ban' | 'timeout';
    targetUserId: string;
    timeoutMinutes?: number;
  }) => void;
  handleVcModerate: (payload: {
    action:
      | 'serverMute'
      | 'serverDeafen'
      | 'disconnect'
      | 'move'
      | 'inviteToSpeak'
      | 'moveToAudience';
    targetUserId: string;
    targetChannelId?: string;
    contextVoiceChannelId?: string;
  }) => void;
  selectDmUser: (userId: string) => void;
  onSwitchCamera?: (deviceId: string) => void;
  bugHunterEnabled?: boolean;
  /** Echo user id driving synced VC activity (YouTube / games); empty when none. */
  vcActivityKingUserId?: string;
  /** Per-user VC activity surface (YouTube, activities picker) — compact roster badges. */
  getVcActivityPresence?: (userId: string) => VcActivityPresenceKind[];
  /** Cached LiveKit activity kinds for a guild voice channel (join-from-profile). */
  getVcChannelActivityPresence?: (
    channelId: string,
  ) => VcActivityPresenceKind[];
  /** LiveKit-aware VC row state for channel list avatars (speaking ring, levels); same as CallView. */
  voiceSessionParticipants?: Array<{
    id: string;
    muted: boolean;
    deafened: boolean;
    streaming: boolean;
    video: boolean;
    serverMuted: boolean;
    serverDeafened: boolean;
    speaking?: boolean;
    audioLevel?: number;
  }>;
  /** Compact guild: VC row opens lobby sheet instead of immediate LiveKit join. */
  mobileVoiceChannelTapOpensLobby?: boolean;
  /** Lobby target channel id (sidebar highlight). */
  voiceLobbyChannelId?: string | null;
  /** Optional: hide channel-list VC transport strip (mute/deafen/devices). Rare; CallView has no duplicate controls. */
  hideChannelPanelVoiceChrome?: boolean;
  /**
   * Emerald speaking ring on the rail PFP when voice is active elsewhere: DM/group call
   * thread not focused, or guild VC while browsing another server / Explore / DMs.
   */
  railProfileAwaySelfSpeaking?: boolean;
  /** Guild VC: open owning server, select this voice channel in the sidebar, expand channel list. */
  focusGuildVoiceChannelInSidebar?: () => void;
};
