import type { Component, ComputedRef, Ref, ShallowRef } from 'vue';
import type { Room as LKRoom } from 'livekit-client';
import type { SettingsSection } from '@/features/settings/types';
import type { ServerSettingsSection } from '@/features/server-settings/types';
import type { RolePreviewState } from '@/features/server-settings/composables/useRolePreview';
import type { useServerStore } from '@/stores/server';
import type { useEchoWorkspace } from '@/composables/useEchoWorkspace';
import type { useAuthSessionStore } from '@/stores/authSession';
import type {
  MainSurface,
  NavState,
  RailTab,
  DmSubView,
} from '@/features/layout/mainSurface';
import type { NavAction } from '@/features/layout/navigationReducer';
import type { AppActionRegistrySealed } from '@/features/layout/actions/appActionRegistry.types';
import type { ChatMessageNavBridge } from '@/features/navigation/chatMessageNavBridge';
import type {
  ChannelPermissionKey,
  ChannelPermissionsState,
  ChannelSummary,
  EchoServerNotificationLevel,
  ForumCreatorDefaultPerms,
  MessageWithAuthor,
} from '@shared/types';
import type { Server } from '@shared/types/server';
import type {
  PopoutAnchorRect,
  MemberProfile,
  ExpandedProfile,
} from '@/utils/memberProfiles';
import type { useEchoHistory } from '@/composables/useEchoHistory';
import type { ActionResult } from '@/types/actionResult';
import type { ReactionFavorite } from '@/composables/useReactionFavorites';
import type { ActiveDmThreadCallUi } from '@/features/layout/dmThreadCallUi';
import type { CallOverlayState } from '@/features/layout/callOverlay';
import type { ServerPingBubbleDisplay } from '@shared/attentionPing';
import type {
  ServerPingChannelDotsForServerRail,
  ServerPingKind,
} from '@/features/server-notifications/serverPing';
import type {
  DesktopStreamingPreferences,
  LiveKitNetworkStats,
  ParticipantAudioLevel,
  RemoteParticipantTrackInfo,
  VideoQualityPreset,
} from '@/composables/useLiveKitVoiceRoom';
import type {
  VcActivityPresenceKind,
  VcActivityUiState,
  YoutubePlaylistEntry,
} from '@/features/voice/vcActivityTypes';
import type {
  EchoCodenamesActivityV1,
  EchoCodenamesAffiliationV1,
  EchoCodenamesRoleAssignmentV1,
  EchoHangmanActivityV1,
  EchoSkrigglesActivityV1,
  EchoSkrigglesCanvasCmdV1,
  EchoSkrigglesCanvasSnapshotV1,
  EchoSkrigglesSettingsV1,
  EchoSkrigglesStrokeBatchV1,
  EchoTicTacToeActivityV1,
  EchoTicTacToeInviteV1,
  EchoYoutubePlaybackSyncV1,
} from '@/audio/voiceEchoLiveKitData';
import type { VcYoutubeRemotePlaybackState } from '@/features/voice/composables/useVcYoutubeWatchTogetherPlayer';
import type { ChannelCategory } from '@/composables/useChannels';
import type { DmMentionNotificationRow } from '@/features/dm/collectDmMentionNotifications';
import type { NotificationReadPreset } from '@/features/dm/filterDmMentionNotificationRows';
import type { EchoServerRoleDto } from '@/api/echo/types';
import type {
  CategorySettingsSnapshot,
  EchoPermissionEditorState,
  PermissionOverwriteRowDraft,
} from '@/features/channel-settings/types';
import type { EchoRealtimePort } from '@/services/realtime/echoRealtimePort';
import type { PreviewChannelPermission } from '@/domain/chatRolePreviewPermissions';
/** Payload emitted by the CreateChannelModal when the user confirms. */
export type CreateChannelModalSubmitPayload =
  | {
      kind: 'channel';
      name: string;
      type: 'text' | 'voice' | 'forum' | 'stage' | 'paper';
      categoryId: string;
      iconKey: string;
    }
  | { kind: 'category'; name: string };

/** Namespaced controller actions (stable surface for wiring tests and dev asserts). */
export type AppLayoutControllerActions = {
  message: {
    goToMessage: (channelId: string, messageId: string) => void;
  };
  navigation: {
    openDm: (userId: string) => void | Promise<void>;
  };
};

export interface AppLayoutControllerContext {
  // UI State / Layout
  DM_PANEL_WIDTH: number;
  isAuthModalOpen: Ref<boolean>;
  authModalInitialLoginEntry: Ref<'social' | 'echo'>;
  authModalPasskeyOnOpen: Ref<boolean>;
  authModalInitialTab: Ref<'login' | 'register'>;
  authModalInitialSubView: Ref<null | 'forgot'>;
  openAuthModal: (opts?: {
    entry?: 'social' | 'echo';
    passkey?: boolean;
    tab?: 'login' | 'register';
    forgot?: boolean;
  }) => void;
  isAddServerModalOpen: Ref<boolean>;
  addServerInitialView: Ref<'initial' | 'create' | 'join'>;
  isInviteModalOpen: Ref<boolean>;
  inviteModalVoiceChannelId: Ref<string | null>;
  inviteModalVoiceChannelName: Ref<string | null>;
  isSettingsModalOpen: Ref<boolean>;
  settingsModalInitialSection: Ref<SettingsSection | null>;
  settingsModalActiveSection: Ref<SettingsSection>;
  isServerSettingsModalOpen: Ref<boolean>;
  serverSettingsModalInitialSection: Ref<ServerSettingsSection | null>;
  serverSettingsModalActiveSection: Ref<ServerSettingsSection>;
  isMemberPopoutOpen: Ref<boolean>;
  isSelfProfilePopoutOpen: Ref<boolean>;
  isGroupDMModalOpen: Ref<boolean>;
  isGroupDMSettingsOpen: Ref<boolean>;
  groupDmSettingsInitialFocus: Ref<'name' | 'icon' | null>;
  activeGroupSettingsId: Ref<string | null>;
  activeRailTab: Ref<RailTab>;
  isDMPanelOpen: Ref<boolean>;
  isMoreServersPanelOpen: Ref<boolean>;
  isMoreServersCompact: Ref<boolean>;
  isMoreServersPinned: Ref<boolean>;
  selectedDMUserId: Ref<string | null>;
  dmActiveTab: Ref<DmSubView>;
  selectedMessageRequestId: Ref<string | null>;
  activeMemberProfile: Ref<MemberProfile | null>;
  profileNotes: Ref<Record<string, string>>;
  memberPopoutAnchor: Ref<PopoutAnchorRect | null>;
  selfProfileAnchor: Ref<PopoutAnchorRect | null>;
  isExpandedProfileModalOpen: Ref<boolean>;
  isExpandedProfileSidePanel: Ref<boolean>;
  isGroupOverviewOpen: Ref<boolean>;
  expandedProfile: Ref<ExpandedProfile | null>;
  customStatus: Ref<string>;
  currentVoiceChannelId: Ref<string | null>;
  currentVoiceChannelName: Ref<string>;
  vcMuted: Ref<boolean>;
  vcDeafened: Ref<boolean>;
  applyVcDeafened: (next: boolean) => void;
  vcVideo: Ref<boolean>;
  vcScreenshare: Ref<boolean>;
  isScreenSharePickerOpen: Ref<boolean>;
  isDesktopStreamingControlOpen: Ref<boolean>;
  desktopStreamingControlMode: Ref<'screen' | 'camera'>;
  desktopStreamingPreferences: Ref<DesktopStreamingPreferences>;
  fullscreenStreamParticipantId: Ref<string | null>;
  vcActivityUi: Ref<VcActivityUiState>;
  openVcActivityPicker: () => void;
  openVcActivityYoutubeBrowse: () => void;
  openVcActivityWordle: () => void;
  openVcActivityHangman: () => void;
  openVcActivitySkriggles: () => void;
  openVcActivityTicTacToe: () => void;
  vcHangmanActivity: ComputedRef<EchoHangmanActivityV1 | null>;
  hangmanRosterUserIds: ComputedRef<string[]>;
  vcSkrigglesActivity: ComputedRef<EchoSkrigglesActivityV1 | null>;
  skrigglesRosterUserIds: ComputedRef<string[]>;
  skrigglesCanvasEvents: ShallowRef<
    import('@/features/voice/skriggles/skrigglesVoiceSession').SkrigglesCanvasEvent[]
  >;
  commitSkrigglesWordChoice: (word: string) => void;
  submitSkrigglesGuess: (guess: string) => void;
  updateSkrigglesSettings: (settings: Partial<EchoSkrigglesSettingsV1>) => void;
  startSkrigglesGame: () => void;
  advanceSkrigglesRound: () => void;
  publishSkrigglesStrokeBatch: (batch: EchoSkrigglesStrokeBatchV1) => void;
  publishSkrigglesCanvasCmd: (cmd: EchoSkrigglesCanvasCmdV1) => void;
  publishSkrigglesCanvasSnapshot: (
    snapshot: EchoSkrigglesCanvasSnapshotV1,
  ) => void;
  tickSkrigglesTimers: () => void;
  vcTicTacToeActivity: ComputedRef<EchoTicTacToeActivityV1 | null>;
  vcTicTacToePendingInvite: ComputedRef<EchoTicTacToeInviteV1 | null>;
  commitVcHangmanWord: (raw: string) => string | null;
  requestVcHangmanGuessLetter: (letter: string) => void;
  requestVcHangmanNextRound: () => void;
  sendVcTicTacToeChallenge: (toUserId: string) => void;
  respondVcTicTacToeInvite: (accept: boolean) => void;
  dismissVcTicTacToeInvite: () => void;
  requestVcTicTacToeMove: (cellIndex: number) => void;
  requestVcTicTacToeRematch: () => void;
  vcCodenamesActivity: ComputedRef<EchoCodenamesActivityV1 | null>;
  codenamesRosterUserIds: ComputedRef<string[]>;
  vcCodenamesSpymasterKey: ComputedRef<EchoCodenamesAffiliationV1[] | null>;
  commitVcCodenamesDeal: () => string | null;
  requestVcCodenamesSetup: (
    assignments: EchoCodenamesRoleAssignmentV1[],
  ) => void;
  requestVcCodenamesClue: (word: string, number: number) => void;
  requestVcCodenamesReveal: (cardIndex: number) => void;
  requestVcCodenamesEndTurn: () => void;
  requestVcCodenamesNewGame: () => void;
  requestVcCodenamesPushKeyToOrchestrator: () => void;
  openVcActivityOpenGuessr: () => void;
  openVcActivitySkribblIo: () => void;
  openVcActivityGarticPhone: () => void;
  openVcActivityKrunker: () => void;
  openVcActivityCodenames: () => void;
  openVcActivityRichup: () => void;
  openVcActivityGooberDash: () => void;
  openVcActivitySmashKarts: () => void;
  openVcActivityClusterRush: () => void;
  setVcActivityYoutubeVideo: (
    videoId: string,
    meta?: Partial<
      Pick<YoutubePlaylistEntry, 'title' | 'channelTitle' | 'thumbnailUrl'>
    >,
  ) => void;
  setVcYoutubeBrowseOpen: (open: boolean) => void;
  addVcYoutubeToQueue: (entry: YoutubePlaylistEntry) => void;
  removeVcYoutubeFromQueue: (index: number) => void;
  moveVcYoutubeInQueue: (from: number, to: number) => void;
  playVcYoutubeAtIndex: (index: number) => void;
  playVcYoutubeNext: () => void;
  playVcYoutubePrevious: () => void;
  closeVcActivity: () => void;
  vcYoutubeRemotePlayback: ShallowRef<VcYoutubeRemotePlaybackState | null>;
  publishVcYoutubePlaybackSync: (sample: EchoYoutubePlaybackSyncV1) => void;
  vcYoutubePlaybackShouldPublish: ComputedRef<boolean>;
  handleScreenSharePickerConfirm: (opts: {
    quality: '1080p60' | '720p30' | '720p15' | 'auto';
    audio: boolean;
    contentHint: 'motion' | 'detail';
  }) => void;
  handleToggleScreenshare: () => void;
  handleStopScreenShare: () => void;
  openDesktopStreamingControl: (mode: 'screen' | 'camera') => void;
  closeDesktopStreamingControl: () => void;
  handleDesktopStreamingControlConfirm: (payload: {
    mode: 'screen' | 'camera';
    settings: DesktopStreamingPreferences;
  }) => void;
  getLocalScreenTrack: () => unknown;
  getLocalCameraTrack: () => unknown;
  getRemoteParticipantVolume: (userId: string) => number;
  setRemoteParticipantVolume: (userId: string, volumePercent: number) => void;
  groupDMs: Ref<
    Record<
      string,
      { id: string; name: string; memberIds: string[]; pfp?: string }
    >
  >;
  groupDMPreselectedIds: Ref<string[]>;
  groupDMLockedIds: Ref<string[]>;
  groupDmMaxMembers: ComputedRef<number>;
  dmPanelWidth: Ref<number>;
  onJoinVoice: (payload: { channelId: string; channelName: string }) => void;
  onJoinVoiceUi: (payload: { channelId: string; channelName: string }) => void;
  onLeaveVoice: () => void;
  onLeaveVoiceUi: () => void;
  toggleMoreServersPanel: () => void;
  startDmPanelResize: (event: MouseEvent) => void;
  resetDmPanelWidth: () => void;
  serverStore: ReturnType<typeof useServerStore>;
  workspace: ReturnType<typeof useEchoWorkspace>;
  authSession: ReturnType<typeof useAuthSessionStore>;
  isAuthenticated: ComputedRef<boolean>;
  currentUser: ComputedRef<
    { id: string; name?: string; pfp?: string; status?: string } | undefined
  >;
  workspaceReady: ComputedRef<boolean>;
  sessionEndedMessage: Ref<string | null>;
  discordBotExportReadyBanner: Ref<{ guildName: string } | null>;
  dismissDiscordBotExportReadyBanner: () => void;
  showWelcomeBackSlimBanner: ComputedRef<boolean>;
  welcomeBackExploreGate: ComputedRef<boolean>;
  /** Signed-in non-guest + empty public directory (Welcome back shows server CTAs instead of auth). */
  welcomeBackExploreMemberEmptyDirectory: ComputedRef<boolean>;
  /** Branded invite landing is active (unauthenticated + invite URL detected). */
  inviteLandingActive: ComputedRef<boolean>;
  inviteLandingPreview: Ref<
    import('@/api/echo/types').EchoInvitePreviewDto | null
  >;
  inviteLandingLoading: Ref<boolean>;
  inviteLandingError: Ref<string | null>;
  inviteLandingPersistBeforeOAuth: () => void;

  // Navigation / Surface
  mainSurface: ComputedRef<MainSurface>;
  activeChannelId: Ref<string>;
  activeChannel: ComputedRef<ChannelSummary | null>;
  activeChannelContext: ComputedRef<{
    channel: ChannelSummary;
    category: ChannelCategory;
  } | null>;
  effectiveActiveChannel: ComputedRef<ChannelSummary | null>;
  isExploreView: ComputedRef<boolean>;
  isInDMMode: ComputedRef<boolean>;
  isDmUiContext: ComputedRef<boolean>;
  isGroupDM: ComputedRef<boolean>;
  isInDMChat: ComputedRef<boolean>;
  dmPartnerUser: ComputedRef<{
    id: string;
    name: string;
    pfp: string;
    status?: string;
  } | null>;
  /** Live presence from socket + `/presence` batch; merge with row status in UI (see `selectPresence`). */
  presenceByUserId: Ref<Record<string, string>>;
  /** True when the user is currently on a mobile presence surface (wired from session store). */
  presenceMobileByUserId: Ref<Record<string, true>>;
  activeGroupDM: ComputedRef<{
    id: string;
    name: string;
    pfp: string;
    memberIds: string[];
  } | null>;
  activeGroupCallMembers: ComputedRef<
    { id: string; name: string; pfp: string; status?: string }[]
  >;
  shellNavState: () => NavState;
  dispatchNav: (action: NavAction) => void;
  openServerSurface: (serverId: string, channelId?: string | null) => void;
  selectServersTab: () => void;
  /** Switch to servers rail without resolving a preferred guild (mobile layer back). */
  selectServersRailOnly: () => void;
  selectExploreTab: () => void;
  selectDMTab: () => void;
  closeDMPanel: () => void;
  selectIncomingDmFromRail: (userId: string) => void;
  selectIncomingGroupDmFromRail: (channelId: string) => void;
  openDmInboxFromRailOverflow: () => void;
  handleGoToChannel: (channelId: string) => void;
  handleGoToMessage: (channelId: string, messageId: string) => void;
  appActionRegistry: AppActionRegistrySealed;
  appLayoutActions: AppLayoutControllerActions;
  chatMessageNavBridge: ChatMessageNavBridge;

  // Channel Tree / Modals
  rawCategoriesForServer: ComputedRef<ChannelCategory[]>;
  categoriesForServer: ComputedRef<ChannelCategory[]>;
  resolvePreviewChannelPermission: (
    channel: ChannelSummary | null | undefined,
    categoryDefaults:
      | Partial<Record<ChannelPermissionKey, boolean>>
      | undefined,
    permission: PreviewChannelPermission,
  ) => boolean;
  findChannelContextById: (
    channelId: string | null | undefined,
  ) => { channel: ChannelSummary; category: ChannelCategory } | null;
  getFirstTextChannelId: (
    cats: { name: string; channels: { id: string; type: string }[] }[],
  ) => string;
  watchActiveChannelWithServerChange: (
    id: Ref<string>,
    shouldPreserveChannel?: (channelId: string) => boolean,
  ) => void;
  isCreateChannelModalOpen: Ref<boolean>;
  createChannelInitialCategoryId: Ref<string | null>;
  isCreateCategoryModalOpen: Ref<boolean>;
  channelSettingsTarget: Ref<{
    serverId: string;
    channel: ChannelSummary;
    categoryId: string;
  } | null>;
  categorySettingsTarget: Ref<CategorySettingsSnapshot | null>;
  channelSettingsEchoPermissionEditor: Ref<EchoPermissionEditorState | null>;
  categorySettingsEchoPermissionEditor: Ref<EchoPermissionEditorState | null>;
  createChannelCategoryNames: ComputedRef<string[]>;
  createChannelCategoryOptions: ComputedRef<{ id: string; label: string }[]>;
  openCreateChannelModal: (categoryId: string | null) => void;
  openCreateCategoryModal: () => void;
  handleCreateChannelModalSubmit: (
    payload: CreateChannelModalSubmitPayload,
  ) => void;
  handleCreateChannelSubmit: (payload: {
    name: string;
    type: 'text' | 'voice' | 'forum' | 'stage' | 'paper';
    categoryId: string;
    iconKey: string;
  }) => void;
  handleCreateCategorySubmit: (payload: { name: string }) => void;
  openChannelSettings: (payload: {
    channel: ChannelSummary;
    categoryId: string;
  }) => void;
  onChannelSettingsModalOpenUpdate: (next: boolean) => void;
  handleChannelSettingsSave: (payload: {
    channelId: string;
    channelType: 'text' | 'voice' | 'forum' | 'stage' | 'paper';
    serverId: string;
    name: string;
    categoryId: string;
    iconKey: string;
    slowModeSeconds: number;
    userLimit: number;
    nsfw: boolean;
    messageHistoryAnchor: 'top' | 'bottom';
    bitrateBps?: number | null;
    voiceE2eeEnabled?: boolean;
    channelPermissions: ChannelPermissionsState;
    echoPermissionRows?: PermissionOverwriteRowDraft[];
    forumCreatorDefaultPerms?: ForumCreatorDefaultPerms;
    autoDeleteAfterSeconds?: number | null;
    autoDeleteSyncedToCategory?: boolean;
    messageFormatTemplate?: string;
    messageFormatHard?: boolean;
    paperCommentsEnabled?: boolean;
    paperShowAuthorGutter?: boolean;
  }) => void;
  channelSettingsCategoryPermissionDefaults: ComputedRef<Partial<
    Record<ChannelPermissionKey, boolean>
  > | null>;
  channelSettingsCategoryAutoDeleteAfterSeconds: ComputedRef<
    number | null | undefined
  >;
  openCategorySettings: (categoryId: string) => void;
  onCategorySettingsModalOpenUpdate: (next: boolean) => void;
  handleCategorySettingsSave: (payload: CategorySettingsSnapshot) => void;
  handleChannelDelete: () => void | Promise<void>;
  handleChannelReorder: (payload: {
    channelId: string;
    targetCategoryId: string | null;
    siblingIndex: number;
  }) => void | Promise<void>;
  handleCategoryReorder: (payload: {
    categoryId: string;
    siblingIndex: number;
  }) => void | Promise<void>;
  handleCategoryDelete: () => void;
  deleteChannelById: (channelId: string) => Promise<boolean>;
  deleteCategoryById: (categoryId: string) => Promise<boolean>;

  // DM State / Social
  echoDmPeerByChannelId: Ref<Map<string, string>>;
  echoDmThreadIds: Ref<Set<string>>;
  echoBlockedUserIds: Ref<Set<string>>;
  dmIncomingRailCluster: ComputedRef<{
    avatars: {
      kind: string;
      name: string;
      pfp: string;
      unreadCount: number;
      inCall?: boolean;
      [key: string]: unknown;
    }[];
    overflowCount: number;
    totalUnreadCount: number;
  }>;
  selectMessageRequest: (requestId: string) => void;
  ignoreMessageRequest: (requestId: string) => void;
  returnFromMessageRequests: () => void;
  dmMentionNotifications: ComputedRef<DmMentionNotificationRow[]>;
  /** Local read cursors for DM mention inbox preset filtering (All / Unread / Read). */
  dmNotificationReadStateByChannelId: ComputedRef<
    Readonly<Record<string, string | null>>
  >;
  /** Workspace channel tree — resolves guild placement for mention source chips. */
  mentionNotificationCategoriesByServer: ComputedRef<
    Readonly<Record<string, ChannelCategory[]>>
  >;
  mentionNotificationServers: ComputedRef<
    ReadonlyArray<{ id: string; name: string; imageUrl?: string }>
  >;
  dmNotificationsReadPreset: Ref<NotificationReadPreset>;
  dmNotificationsSourceKey: Ref<string>;
  onOpenMentionNotification: (row: DmMentionNotificationRow) => void;
  onMarkMentionNotificationRead: (
    row: DmMentionNotificationRow,
  ) => Promise<void>;
  acceptFriendRequest: (requestId: string) => void;
  declineFriendRequest: (requestId: string) => void;
  cancelFriendRequest: (userId: string) => void;
  sendFriendRequest: (userId: string) => void;
  handleDmMarkRead: (
    payload:
      | {
          kind: 'user';
          userId: string;
        }
      | {
          kind: 'group';
          channelId: string;
        },
  ) => void | Promise<void>;
  /** Client-only: hide a 1:1 from the DM list until they send a new message. */
  hideDmFromInboxUser: (peerUserId: string) => void;
  /** Client-only: hide a group thread from the DM list until new activity. */
  hideDmFromInboxGroup: (groupChannelId: string) => void;
  isDmInboxUserFavorite: (userId: string) => boolean;
  isDmInboxGroupFavorite: (channelId: string) => boolean;
  toggleFavoriteDmInbox: (
    payload:
      | { kind: 'user'; userId: string }
      | { kind: 'group'; channelId: string },
  ) => void;
  handleAcceptMessageRequest: (requestId: string) => void;
  dmGroupFriends: ComputedRef<
    { id: string; name: string; pfp: string; status?: string }[]
  >;
  dmInboxEntriesForPanel: ComputedRef<
    { id: string; name: string; pfp: string; [key: string]: unknown }[]
  >;
  /** Subset of inbox rows (user kind only); prefer {@link dmInboxEntriesForPanel} for the Messages list. */
  dmUsersForDmPanel: ComputedRef<
    { id: string; name: string; pfp: string; status?: string }[]
  >;
  groupDMListForPanel: ComputedRef<{ id: string; name: string; pfp: string }[]>;

  // RBAC / Caps
  echoRoleCatalog: Ref<EchoServerRoleDto[]>;
  rolePreview: Ref<RolePreviewState | null>;
  startRolePreview: (payload: RolePreviewState) => void;
  handleStartRolePreview: (payload: RolePreviewState) => void;
  clearRolePreview: () => void;
  refreshEchoRoleData: () => void;
  isRolePreviewActiveForServer: ComputedRef<boolean>;
  previewHasUiPermission: (permission: string) => boolean;
  previewCanModerateMembers: ComputedRef<boolean>;
  memberListResolveHighestRole: (
    userId: string,
  ) => { id: string; name: string; color: string } | undefined;
  memberListRoleManagement: ComputedRef<
    | {
        enabled: boolean;
        assignableRoles: {
          id: string;
          name: string;
          color: string;
          darkColor: string;
          lightColor: string;
          separateThemeColors: boolean;
          roleIconUrl: string | null;
          roleIconEmojiId: string | null;
          isEveryone: boolean;
          position: number;
          roleCategoryId: string | null;
          roleScope: string | undefined;
        }[];
        roleCategories: { id: string; name: string }[];
        canMutateMemberRole: (
          targetUserId: string,
          roleId: string,
          assign: boolean,
        ) => boolean;
        busy: boolean;
        resolveAssignedRoleIds: (userId: string) => string[];
        onToggleRole: (p: {
          targetUserId: string;
          roleId: string;
          assign: boolean;
        }) => void;
      }
    | undefined
  >;
  serverSettingsCanManageRoles: ComputedRef<boolean>;
  serverSettingsCanManageServer: ComputedRef<boolean>;
  canOpenServerSettings: ComputedRef<boolean>;
  canOpenServerSettingsForServer: (serverId: string) => boolean;
  canCreateChannels: ComputedRef<boolean>;
  canManageThisChannel: (channel: ChannelSummary) => boolean;
  echoCanCreateChannel: ComputedRef<boolean>;
  echoCanModerateMembers: ComputedRef<boolean>;
  echoCanKickMembers: ComputedRef<boolean>;
  echoCanBanMembers: ComputedRef<boolean>;
  echoCanTimeoutMembers: ComputedRef<boolean>;
  echoCanChangeNicknames: ComputedRef<boolean>;
  echoCanManageNicknames: ComputedRef<boolean>;
  echoCanManageMessages: ComputedRef<boolean>;
  echoCanCreateInvite: ComputedRef<boolean>;
  echoCapabilitiesForServerId: Ref<string | null>;
  isEchoRoleBootstrapLoading: ComputedRef<boolean>;
  liveChannelCapabilities: Ref<Record<string, unknown> | null>;

  // Lifecycle / Guest
  echoWorkspaceError: Ref<string | null>;
  hydrateEchoFromApi: () => Promise<void>;
  refreshEchoSocialFromApi: () => Promise<void>;
  handleServerDeleted: (serverId: string) => void;
  continueAsGuest: (captchaToken?: string) => Promise<void>;
  onGuestCaptchaVerified: (token: string) => void;
  openGuestUpgradeModal: () => void;
  onGuestAccountUpgraded: () => Promise<void>;
  guestCaptchaSiteKey: Ref<string>;
  isGuestDisplayNameModalOpen: Ref<boolean>;
  isGuestWelcomePrefsModalOpen: Ref<boolean>;
  isGuestUpgradeModalOpen: Ref<boolean>;
  isGuest: ComputedRef<boolean>;
  isGuestCaptchaModalOpen: Ref<boolean>;
  guestFriendsLocked: ComputedRef<boolean>;
  onEchoMessageFailedGuest: (ev: Event) => void;

  // Layout / Grid
  channelPanelCollapsed: Ref<boolean>;
  channelPanelBubbleMode: Ref<boolean>;
  memberPanelCollapsed: Ref<boolean>;
  /** Member list: include guest-role rows (persisted per user in layout prefs). */
  memberListShowGuests: Ref<boolean>;
  memberPanelAutoCollapseUserOverride: Ref<boolean>;
  markMemberPanelExpandedByUser: () => void;
  markMemberPanelCollapsedByUser: () => void;
  voiceSideChatCollapsed: Ref<boolean>;
  channelPanelWidth: Ref<number>;
  memberPanelWidth: Ref<number>;
  voiceSideChatWidth: Ref<number>;
  mainContentColumns: ComputedRef<string>;
  toggleChannelPanelBubbleMode: () => void;
  pfpBarExpanded: Ref<boolean>;
  startChannelResize: (event: MouseEvent) => void;
  startMemberResize: (event: MouseEvent) => void;
  startVoiceSideChatResize: (event: MouseEvent) => void;
  resetChannelWidth: () => void;
  resetMemberWidth: () => void;
  resetVoiceSideChatWidth: () => void;
  expandVoiceSideChat: () => void;
  toggleVoiceSideChat: () => void;
  voiceMobileSheetLevel: Ref<0 | 1 | 2>;
  bumpVoiceMobileChatFromCallScrollUp: () => void;
  bumpVoiceMobileChatFromCallScrollDown: () => void;
  narrowChannelPanelForActivityOverflowStep: () => boolean;
  appGridTemplateColumns: ComputedRef<string>;
  mainContentColumnsEffective: ComputedRef<string>;
  memberPanelCollapsedEffective: ComputedRef<boolean>;
  expandChannels: () => void;
  collapseMembers: () => void;
  expandMembers: () => void;
  /** Sub-800px compact swipe shell (mobile + tablet). */
  isCompactShell: Ref<boolean>;
  /** Tri-pane index in compact guild mode: 0 rail+channels, 1 chat, 2 members. */
  compactPagerPane: Ref<0 | 1 | 2>;
  /** Tri-pane: true when the guild channel stack column should show (pane 0 or explicit expand). */
  compactGuildTriPaneChannelPanelOpen: Ref<boolean>;
  /** Compact guild mobile: VC row opens this lobby instead of joining immediately. */
  guildMobileVcLobby: ShallowRef<{
    channelId: string;
    channelName: string;
  } | null>;
  openGuildMobileVcLobby: (payload: {
    channelId: string;
    channelName: string;
  }) => void;
  closeGuildMobileVcLobby: () => void;
  isServerEmptyOnboarding: ComputedRef<boolean>;
  MORE_SERVERS_COMPACT_WIDTH: number;
  MORE_SERVERS_PANEL_WIDTH: number;

  // Messages / History / Send
  activeChannelMessages: ComputedRef<MessageWithAuthor[]>;
  activeChannelMessagesMap: ComputedRef<Map<string, MessageWithAuthor>>;
  /** Linked Discord user id for twin ownership of Discord-import shadow messages. */
  linkedDiscordUserId: Ref<string | null>;
  /** Latest `/me/discord` response; used for profile import prompt suppression. */
  linkedDiscordState: Ref<Awaited<
    ReturnType<typeof import('@/api/meClient').fetchMeDiscord>
  > | null>;
  echoChannelHistory: ReturnType<typeof useEchoHistory>;
  sendMessage: EchoRealtimePort['sendMessage'];
  forwardModalOpen: Ref<boolean>;
  forwardPickerDestinations: ComputedRef<{
    dms: { channelId: string; label: string }[];
    servers: {
      id: string;
      name: string;
      textChannels: { id: string; name: string }[];
    }[];
  }>;
  forwardModalSourceSummary: ComputedRef<string>;
  openForwardMessagePicker: (
    message: MessageWithAuthor & { channelName?: string },
  ) => void;
  closeForwardMessagePicker: () => void;
  submitForwardedMessage: (targetChannelId: string) => void;
  socketSendMessage: EchoRealtimePort['sendMessage'];
  submitPollVote: (
    channelId: string,
    messageId: string,
    optionId: string,
  ) => Promise<ActionResult>;
  submitReactionToggle: (
    channelId: string,
    messageId: string,
    emoji: string,
    correlationId?: string,
    ctx?: { removing: boolean },
  ) => Promise<ActionResult>;
  submitPin: (
    channelId: string,
    messageId: string,
    correlationId?: string,
  ) => Promise<ActionResult>;
  submitUnpin: (
    channelId: string,
    messageId: string,
    correlationId?: string,
  ) => Promise<ActionResult>;
  submitMessageEdit: (
    channelId: string,
    messageId: string,
    body: {
      content: string;
      contentJson?: unknown;
      contentSchemaVersion?: number;
    },
    correlationId?: string,
  ) => Promise<ActionResult>;
  submitMessageDelete: (
    channelId: string,
    messageId: string,
    correlationId?: string,
  ) => Promise<ActionResult>;
  votePoll: (
    channelId: string,
    messageId: string,
    optionId: string,
    userId: string,
  ) => void;
  toggleReaction: (
    channelId: string,
    messageId: string,
    emoji: string,
    userId: string,
  ) => boolean | Promise<boolean>;
  topReactions: ComputedRef<ReactionFavorite[]>;
  recordReaction: (emoji: string) => void;
  removeReactionFavorite: (emoji: string) => void;
  selectDM: (userId: string) => void;
  updateCurrentUserStatus: (status: string) => void;
  handlePollVote: (messageId: string, optionId: string) => void | Promise<void>;
  handleReact: (messageId: string, emoji: string) => void | Promise<void>;
  deleteMessage: (messageId: string) => void;
  deleteMessageCore: (messageId: string) => void;
  editMessage: (
    messageId: string,
    content: string,
  ) => boolean | void | Promise<boolean | void>;
  handlePinMessage: (messageId: string) => void;
  handleUnpinMessage: (messageId: string) => void;
  pinMessage: (channelId: string, messageId: string) => void;
  unpinMessage: (channelId: string, messageId: string) => void;
  pinPreview: (msg: MessageWithAuthor) => string;
  pinnedMessageIdsForCurrentChannel: ComputedRef<string[]>;
  pinnedMessagesForDropdown: ComputedRef<
    {
      id?: string;
      content?: string;
      imageUrl?: string;
      videoUrl?: string;
      author?: { avatar?: string; name?: string };
    }[]
  >;

  // Voice / Calls
  onVcChatButtonClick: () => void;
  handleJoinVoice: (payload: {
    channelId: string;
    channelName: string;
  }) => void;
  handleLeaveVoice: () => void;
  handleChannelVoicePanelLeave: () => void | Promise<void>;
  handleActiveChannelChange: (channelId: string) => void;
  handleJoinVoiceIfAllowed: (payload: {
    channelId: string;
    channelName: string;
  }) => void;
  updateVcVideoIfAllowed: (enabled: boolean) => void;
  canJoinPreviewVoiceChannel: (channelId: string) => boolean;
  dmCallWithUserId: Ref<string | null>;
  /** True while DM call is waiting on LiveKit (connecting or no remote peers yet). */
  dmCallRinging: ComputedRef<boolean>;
  /** True while call invite/answer signaling is still `ringing` (before anyone has accepted). */
  dmCallAwaitingAccept: ComputedRef<boolean>;
  /** Amber / ringing-style chrome without implying ringtone (includes post–self-leave lobby). */
  dmCallRingUi: ComputedRef<boolean>;
  /** True after leaving LiveKit while the call session is still active for others. */
  dmCallLobbyAfterSelfLeave: Ref<boolean>;
  /** True when this client is being invited into a DM call and has not accepted yet. */
  dmCallIncoming: ComputedRef<boolean>;
  /** True during “no answer” exit animation before auto hangup. */
  dmCallRingRemoteVanishing: Ref<boolean>;
  dmCallMuted: Ref<boolean>;
  dmCallDeafened: Ref<boolean>;
  applyDmCallDeafened: (next: boolean) => void;
  toggleDmCallMuted: () => void;
  dmCallVideo: Ref<boolean>;
  dmCallScreenshare: Ref<boolean>;
  dmCallCallViewParticipants: ComputedRef<
    { id: string; name: string; pfp: string; status?: string }[]
  >;
  dmCallFullscreen: Ref<boolean>;
  dmCallQuarterView: Ref<boolean>;
  dmCallMatchesActiveChannel: ComputedRef<boolean>;
  activeDmThreadCallUi: ComputedRef<ActiveDmThreadCallUi | null>;
  startDmCall: () => void;
  startDmCallWithUserId: (userId: string | null) => void;
  startGroupCall: () => void;
  startGroupCallWithId: (groupId: string | null) => void;
  answerDmCall: () => void | Promise<void>;
  declineDmCall: () => void | Promise<void>;
  endDmCall: () => void | Promise<void>;
  leaveDmCallVoice: () => Promise<void>;
  rejoinDmCallVoice: () => void;
  dmCallGlassPeer: ComputedRef<{
    isGroup: boolean;
    id: string;
    name: string;
    pfp: string;
    status?: string;
  } | null>;
  dmCallVoiceStripThreadId: ComputedRef<string | null>;
  dmCallVoiceStripTitle: ComputedRef<string>;
  channelPanelVoiceChannelId: ComputedRef<string | null>;
  channelPanelVoiceChannelName: ComputedRef<string>;
  channelPanelVcMutedEffective: ComputedRef<boolean>;
  channelPanelVcDeafenedEffective: ComputedRef<boolean>;
  channelPanelVcVideoEffective: ComputedRef<boolean>;
  channelPanelVcScreenshareEffective: ComputedRef<boolean>;
  onChannelPanelVcMuted: (next: boolean) => void;
  onChannelPanelVcDeafened: (next: boolean) => void;
  onChannelPanelVcVideo: (next: boolean) => void;
  onChannelPanelVcScreenshare: (next: boolean) => void;
  onGuildChannelVcMuted: (next: boolean) => void;
  onGuildChannelVcDeafened: (next: boolean) => void;
  onGuildChannelVcVideo: (next: boolean) => void;
  onGuildChannelVcScreenshare: (next: boolean) => void;
  onDmCallVcMuted: (next: boolean) => void;
  onDmCallVcDeafened: (next: boolean) => void;
  onDmCallVcVideo: (next: boolean) => void;
  onDmCallVcScreenshare: (next: boolean) => void;
  callOverlay: ComputedRef<CallOverlayState>;

  // Moderation / Safety
  canModerateMemberInServer: (userId: string) => boolean;
  canVcModerateMember: (
    targetUserId: string,
    action:
      | 'serverMute'
      | 'serverDeafen'
      | 'disconnect'
      | 'move'
      | 'inviteToSpeak'
      | 'moveToAudience'
      | 'stopCamera'
      | 'stopScreenShare',
  ) => boolean;
  canModerateMemberActionInServer: (
    targetUserId: string,
    action: 'kick' | 'ban' | 'timeout',
  ) => boolean;
  canChangeMemberNicknameInServer: (targetUserId: string) => boolean;
  canModerateMessageAuthor: (message: MessageWithAuthor) => boolean;
  canOpenInviteForServer: (serverId: string) => boolean;
  canInviteToCurrentServer: ComputedRef<boolean>;
  moderationModalOpen: Ref<boolean>;
  moderationAction: Ref<'kick' | 'ban' | 'timeout' | 'untimeout' | null>;
  moderationTargetUserId: Ref<string | null>;
  moderationTargetUser: ComputedRef<{
    id: string;
    name: string;
    pfp: string;
  } | null>;
  handleModerateUser: (payload: {
    action: 'kick' | 'ban' | 'timeout';
    targetUserId: string;
    timeoutMinutes?: number;
  }) => void;
  onModerationModalConfirm: (
    payload?:
      | { timeoutMinutes: number }
      | {
          banDurationMinutes: number | null;
          reason: string;
          deleteRecentMessagesHours?: number;
        },
  ) => void;
  handleVcModerate: (payload: {
    action:
      | 'disconnect'
      | 'serverMute'
      | 'serverDeafen'
      | 'move'
      | 'inviteToSpeak'
      | 'moveToAudience'
      | 'stopCamera'
      | 'stopScreenShare';
    targetUserId: string;
    targetChannelId?: string;
    contextVoiceChannelId?: string;
  }) => void;
  handleUpdateCustomStatus: (next: string) => void;
  handleProfileBlockUser: (userId: string) => Promise<void>;
  handleProfileUnblockUser: (userId: string) => Promise<void>;
  handleProfileReportUser: (payload: {
    userId: string;
    reason?: string;
  }) => Promise<void>;
  isExpandedProfileTargetBlocked: ComputedRef<boolean>;
  isMemberPopoutTargetBlocked: ComputedRef<boolean>;
  handleChangeMemberNicknameFromMemberList: (
    targetUserId: string,
  ) => Promise<void>;
  isEchoUserFriend: (userId: string) => boolean;
  isEchoUserIncomingFriendRequest: (userId: string) => boolean;
  isEchoUserOutgoingFriendRequest: (userId: string) => boolean;
  isEchoUserBlocked: (userId: string) => boolean;

  // Search
  searchText: Ref<string>;
  filterChips: Ref<{ key: string; value: string; label?: string }[]>;
  allChannels: ComputedRef<{ id: string; name: string }[]>;
  isSearchActive: ComputedRef<boolean>;
  paginatedSearchResults: ComputedRef<MessageWithAuthor[]>;
  searchResultMessages: ComputedRef<MessageWithAuthor[]>;
  searchResultPage: Ref<number>;
  totalPages: ComputedRef<number>;
  goToSearchPage: (page: number) => void;
  addFilter: (
    key: 'in' | 'from' | 'mentions' | 'hasType',
    value: string | boolean,
  ) => void;
  removeFilter: (key: 'in' | 'from' | 'mentions' | 'hasType') => void;
  clearSearch: () => void;
  searchLoading: Ref<boolean>;
  searchError: Ref<string | null>;
  searchScopeHint: ComputedRef<string>;
  onSearchInput: (v: string) => void;

  // Invites / Servers
  selectedServer: ComputedRef<Server | null | undefined>;
  inviteLinkFromSelectedServer: ComputedRef<string>;
  inviteLinkFromApi: Ref<string>;
  inviteLinkLookupPending: Ref<boolean>;
  inviteLinkForServer: ComputedRef<string>;
  inviteApplicationsEnabled: ComputedRef<boolean>;
  inviteJoinLinksEnabled: ComputedRef<boolean>;
  inviteCanCreateDirectHexInvite: ComputedRef<boolean>;
  directHexInviteLink: Ref<string>;
  directHexInviteBusy: Ref<boolean>;
  createDirectHexInvite: () => Promise<void>;
  syncVanityAcrossServerLists: (serverId: string, vanityCode: string) => void;
  newlyCreatedServerId: Ref<string | null>;
  handleCreateServer: (payload: {
    name: string;
    importFromDiscord?: boolean;
    discordGuildId?: string;
    discordPostImportSyncAllChannels?: boolean;
    discordPostImportRecentMessages?: boolean;
    iconUrl?: string;
    iconFile?: File;
  }) => void;
  handleJoinDiscoverableServer: (payload: {
    id?: string;
    name: string;
    pfp: string;
    memberCount?: number;
  }) => void;
  handleJoinWithInviteLink: (raw: string) => void;
  handleInviteFriend: (
    userId: string,
    voiceChannelId?: string | null,
    voiceChannelName?: string | null,
  ) => void;
  inviteableFriends: ComputedRef<
    { id: string; name: string; pfp: string; status?: string }[]
  >;
  addServerJoinError: Ref<string>;
  addServerCreateBusy: Ref<boolean>;
  addServerJoinBusy: ComputedRef<boolean>;
  addServerJoinInvitePrefill: Ref<string>;
  exploreDirectoryJoinBusy: Ref<boolean>;
  openAddServerModal: (
    view?: 'initial' | 'create' | 'join',
    invitePrefill?: string,
  ) => void;
  openInviteModal: (serverId: string) => void;
  openServerSettings: (
    serverId: string,
    section?: ServerSettingsSection,
  ) => void;
  openServerSettingsIfAllowed: (serverId: string) => void;
  handleServerRailSettings: (serverId: string) => void;
  handleServerRailInvite: (serverId: string) => void;
  handleServerRailNotificationSettings: (serverId: string) => void;
  handleServerRailMarkRead: (serverId: string) => void;
  handleServerRailMarkAllRead: () => void | Promise<void>;
  handleDmRailMarkAllRead: () => void | Promise<void>;
  /** Marks the active Echo thread read (clears channel + server rail pings when API succeeds). */
  markActiveChannelAsRead: () => Promise<void>;
  /** Marks a single guild channel read from the channel list context menu. */
  handleChannelMarkRead: (channelId: string) => void | Promise<void>;
  handleServerRailLeave: (serverId: string) => void;
  openServerFromMore: (serverId: string) => void;
  openServerSettingsFromUrl: (serverId: string) => void;
  joinEchoServerWithInviteRaw: (raw: string) => void;
  reorderVisibleServers: (
    fromIndex: number,
    toIndex: number,
    overflowServerId?: string | null,
  ) => void;
  canDeleteCurrentServer: ComputedRef<boolean>;
  isLeaveServerModalOpen: Ref<boolean>;
  leaveServerModalVariant: Ref<'confirm' | 'ownerBlocked'>;
  leaveServerModalServerName: Ref<string>;
  confirmLeaveServerFromModal: () => void;
  onLeaveServerModalUpdate: (open: boolean) => void;
  isJoinServerConfirmModalOpen: Ref<boolean>;
  joinServerConfirmPreview: Ref<
    import('./useJoinServerConfirmModal').JoinServerConfirmPreview | null
  >;
  joinServerConfirmBusy: Ref<boolean>;
  confirmJoinServerFromModal: () => void;
  onJoinServerConfirmModalUpdate: (open: boolean) => void;
  isServerApplicationModalOpen: Ref<boolean>;
  serverApplicationPayload: Ref<
    import('./useServerApplicationModal').ServerApplicationModalPayload | null
  >;
  serverApplicationBusy: Ref<boolean>;
  onServerApplicationModalUpdate: (open: boolean) => void;
  confirmServerApplicationSubmittedFromModal: () => void;

  // Profiles
  openMemberProfile: (
    userId: string,
    anchorRect?: PopoutAnchorRect | null,
    opts?: { rolesPanel?: boolean },
  ) => void;
  openMemberProfileFromMemberColumn: (payload: {
    userId: string;
    anchorRect?: PopoutAnchorRect | null;
  }) => void;
  openProfileFromContextMenu: (userId: string) => void;
  openSelfProfile: (anchorRect?: PopoutAnchorRect | null) => void;
  openExpandedProfileFromMemberPopout: () => void;
  openExpandedProfileFromSelfPopout: () => void;
  onExpandedProfileModalUpdate: (next: boolean) => void;
  openExpandedProfilePanelForUserId: (userId: string) => void;
  openExtendedProfileModalForUserId: (userId: string) => void;
  /** Switches DM inline profile panel to the large `ExpandedProfileModal` for the same user. */
  expandDmProfileToFullModal: () => void;
  handleExpandedProfileOpenProfile: (
    userId: string,
    opts?: { skipInteractionGuard?: boolean },
  ) => void;
  openExpandedProfileDmFromComposable: (
    userId: string,
    onSelectDM: (id: string) => void | Promise<void>,
    onSetDmRail: () => void,
  ) => void;
  handleExpandedProfileOpenDM: (userId: string) => void;
  handleMemberPopoutQuickDm: (userId: string, text: string) => Promise<void>;
  handleExpandedProfileOpenServer: (serverId: string) => void;
  handleExpandedProfileSendFriendRequest: (userId: string) => void;
  handleExpandedProfileCancelOutgoingFriendRequest: (userId: string) => void;
  handleExpandedProfileAcceptIncomingFriendRequest: (userId: string) => void;
  handleExpandedProfileDeclineIncomingFriendRequest: (userId: string) => void;
  handleExpandedProfileRemoveFriend: (userId: string) => void | Promise<void>;
  isExpandedProfileFriend: ComputedRef<boolean>;
  isMemberPopoutFriend: ComputedRef<boolean>;
  isMemberPopoutCanSendFriendRequest: ComputedRef<boolean>;
  isExpandedProfileOutgoingRequest: ComputedRef<boolean>;
  expandedProfileNote: ComputedRef<string>;
  updateProfileNote: (userId: string | null, note: string) => void;
  handleExpandedProfileNoteFromLayout: (note: string) => void;
  memberListUsers: ComputedRef<
    { id: string; name: string; pfp: string; status?: string }[]
  >;
  /** Full server roster for Server Settings → Members (includes Discord import placeholders). */
  serverSettingsMemberUsers: ComputedRef<
    { id: string; name: string; pfp: string; status?: string }[]
  >;
  /** User directory for server channel list + VC participant rows (not DM panel list). */
  usersForChannelPanel: ComputedRef<
    { id: string; name: string; pfp: string; status?: string }[]
  >;
  /** `@` mention autocomplete: channel/DM participants only (not full workspace directory). */
  usersForMentionAutocomplete: ComputedRef<
    { id: string; name: string; pfp: string; status?: string }[]
  >;
  selfProfile: ComputedRef<MemberProfile | null>;
  memberPopoutOpenRolesPanel: Ref<boolean>;
  onMemberPopoutOpenUpdate: (next: boolean) => void;
  handleCallViewOpenProfile: (
    userId: string,
    anchorRect: PopoutAnchorRect | null,
  ) => void;
  activeMemberNote: ComputedRef<string>;
  activeVoiceChannelParticipants: ComputedRef<
    {
      id: string;
      name: string;
      pfp: string;
      muted: boolean;
      deafened: boolean;
      streaming: boolean;
      video: boolean;
      serverMuted: boolean;
      serverDeafened: boolean;
      speaking: boolean;
      audioLevel: number;
      activityPresence: VcActivityPresenceKind[];
      isVcActivityKing: boolean;
      cameraTrack?: unknown;
      screenTrack?: unknown;
      screenAudioTrack?: unknown;
    }[]
  >;
  getVcActivityPresenceForUser: (userId: string) => VcActivityPresenceKind[];
  getVcChannelActivityPresenceForChannel: (
    channelId: string,
  ) => VcActivityPresenceKind[];
  /** Echo user id hosting synced VC activity (YouTube / embeds); empty when idle. */
  effectiveVcActivityKingUserId: ComputedRef<string>;
  liveKitState: ComputedRef<'idle' | 'connecting' | 'connected' | 'error'>;
  liveKitNetworkStats: ComputedRef<LiveKitNetworkStats | null>;
  liveKitRoom: Ref<LKRoom | null>;
  speakingMap: ComputedRef<Record<string, ParticipantAudioLevel>>;
  localSpeaking: ComputedRef<boolean>;
  localAudioLevel: ComputedRef<number>;
  switchMicDevice: (deviceId: string) => void;
  switchSpeakerDevice: (deviceId: string) => void;
  setLkOutputVolume: (volume: number) => void;
  reapplyVoiceProcessing: () => Promise<void>;
  /** Settings mic listen-back: temporarily force LiveKit effective deafen. */
  setMicTestListenDeafen: (active: boolean) => void;
  vcRemoteParticipants: ComputedRef<Map<string, RemoteParticipantTrackInfo>>;
  vcMirrorCamera: Ref<boolean>;
  switchVcCamera: (deviceId: string) => void;
  setVcVideoQuality: (preset: VideoQualityPreset) => void;
  applyEchoPresenceFromSocket: (p: { userId: string; status: string }) => void;
  closePinsDropdown: () => void;
  exploreDiscoverableServers: Ref<
    {
      id?: string;
      name: string;
      pfp: string;
      banner?: string;
      description?: string;
      memberCount?: number;
      voiceParticipantCount?: number;
      lastVoiceActivityAt?: string;
      lastChatActivityAt?: string;
      createdAt?: string;
      allowGlobalGuests?: boolean;
    }[]
  >;
  getLatestDMUserId: () => string | null;
  goToPinnedMessage: (messageId: string) => void;
  handleCreateGroupDM: (payload: {
    name: string;
    memberIds: string[];
  }) => Promise<void>;
  handleKickGroupDmMember: (payload: {
    groupId: string;
    userId: string;
  }) => void | Promise<void>;
  handleLeaveGroupDm: (payload: { groupId: string }) => void | Promise<void>;
  handleSelectGroupDM: (groupId: string) => void;
  handleUpdateGroupFromSettings: (
    payload: { name: string; pfp: string },
    groupIdOverride?: string | null,
  ) => void;
  onRemoveGroupDmMember: (payload: { groupId: string; userId: string }) => void;
  onLeaveGroupDm: (payload: { groupId: string }) => void | Promise<void>;
  onOpenAddMembersToGroupDm: () => void;
  groupSettingsMembers: ComputedRef<
    { id: string; name: string; pfp: string }[]
  >;
  groupSettingsId: ComputedRef<string>;
  isViewingVoiceChannel: ComputedRef<boolean>;
  openGroupDMModal: (payload?: {
    targetGroupId?: string;
    preselectedIds?: string[];
    lockedIds?: string[];
  }) => void;
  openGroupOverviewPanel: (groupId: string) => void;
  openGroupSettingsFromHeader: (focus?: 'name' | 'icon') => void;
  togglePinsDropdown: () => void;

  // Settings
  openUserSettingsModal: (section?: SettingsSection) => void;
  openUserSettingsToDiscordFromAddServer: () => void;
  onUserSettingsModalUpdate: (next: boolean) => void;
  onServerSettingsModalUpdate: (next: boolean) => void;
  onSettingsModalActiveSectionUpdate: (section: SettingsSection) => void;
  onServerSettingsModalActiveSectionUpdate: (
    section: ServerSettingsSection,
  ) => void;

  // Misc
  ExploreView: Component;
  icons: Record<string, string>;
  getChannelIcon: (channel: ChannelSummary | null | undefined) => string;
  getChannelDisplayName: (name: string) => string;
  getServerChannelInfoForMainSurface: (channelId: string) => {
    type: 'text' | 'voice' | 'forum' | 'paper';
    parentChannelId?: string;
  } | null;
  showApiFetchErrorBanner: Ref<boolean>;
  isChannelPanelSwitchLoading: ComputedRef<boolean>;
  isMessageSurfaceSwitchLoading: ComputedRef<boolean>;
  isMemberSurfaceSwitchLoading: ComputedRef<boolean>;
  isServerNotificationSettingsOpen: Ref<boolean>;
  currentServerNotificationLevel: ComputedRef<EchoServerNotificationLevel | null>;
  openServerNotificationSettings: () => void;
  handleServerNotificationSave: (level: EchoServerNotificationLevel) => void;
  serverNotificationLevelsMap: ComputedRef<
    Record<string, EchoServerNotificationLevel>
  >;
  serverPingKindByServerId: ComputedRef<Record<string, ServerPingKind>>;
  serverPingBubbleByServerId: ComputedRef<
    Record<string, ServerPingBubbleDisplay>
  >;
  serverPingChannelDotsByServerId: ComputedRef<
    Record<string, ServerPingChannelDotsForServerRail>
  >;
  /** Guild servers with non-mention unread messages (compact rail dot). */
  serverUnreadActivityDotByServerId: ComputedRef<Record<string, true>>;
  /** Guild channels with unread messages for sidebar emphasis. */
  channelMissedActivityByChannelId: ComputedRef<Record<string, true>>;
  showNsfwChatGate: ComputedRef<boolean>;
  acknowledgeNsfwChannel: () => void;
  declineNsfwGate: () => void;
  isEchoGraphId: (id: string) => boolean;
  isPersistedEchoDmThread: (cid: string) => boolean;
  isPinsDropdownOpen: Ref<boolean>;
  pinsButtonRefDm: Ref<HTMLElement | null>;
  pinsButtonRefServer: Ref<HTMLElement | null>;
  pinsDropdownRect: Ref<DOMRect | null>;
  isServerUnread: (serverId: string) => boolean;
  isChannelActive: (channelId: string) => boolean;
  isMemberProfileOpen: ComputedRef<boolean>;
  onOpenCreateChannel: (serverId: string) => void;
  toggleChannelPanel: () => void;
  toggleMemberList: () => void;
  openDMPanel: () => void;
  memberListCollapsed: Ref<boolean>;
  memberListWidth: Ref<number>;
  memberProfileUserId: Ref<string | null>;
  membersForMemberList: ComputedRef<
    { id: string; name: string; pfp: string; status?: string }[]
  >;
  searchActiveTab: Ref<string>;
  searchFilter: Ref<Record<string, unknown>>;
  searchIsLoading: Ref<boolean>;
  searchResults: Ref<unknown[]>;
  searchStatus: Ref<string>;
  selectedServerId: ComputedRef<string | null>;
  servers: ComputedRef<
    { id: string; name: string; imageUrl: string; ownerId?: string }[]
  >;
  isSystemSettingsOpen: Ref<boolean>;
  isUserSettingsOpen: Ref<boolean>;
  isVcActive: ComputedRef<boolean>;
  isVcConnected: ComputedRef<boolean>;
  isVcConnecting: ComputedRef<boolean>;
  isVcDisconnecting: ComputedRef<boolean>;
  joinVoiceChannel: (channelId: string) => void;
  leaveVoiceChannel: () => void;
  hasGuildChannelChrome: ComputedRef<boolean>;
}
