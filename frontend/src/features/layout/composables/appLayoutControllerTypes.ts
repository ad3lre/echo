import type { ComputedRef, Ref, ShallowRef } from 'vue';
import type { SettingsSection } from '@/features/settings/types';
import type { ServerSettingsSection } from '@/features/server-settings/types';
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
import type { ChannelSummary, MessageWithAuthor } from '@shared/types';
import type {
  PopoutAnchorRect,
  MemberProfile,
  ExpandedProfile,
} from '@/utils/memberProfiles';
import type { useEchoHistory } from '@/composables/useEchoHistory';
import type { ActionResult } from '@/types/actionResult';
import type { ReactionFavorite } from '@/composables/useReactionFavorites';
import type { ActiveDmThreadCallUi } from '@/features/layout/dmThreadCallUi';
import type { ServerPingBubbleDisplay } from '@shared/attentionPing';
import type {
  ServerPingChannelDotsForServerRail,
  ServerPingKind,
} from '@/features/server-notifications/serverPing';
import type { DesktopStreamingPreferences } from '@/composables/useLiveKitVoiceRoom';
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
  EchoTicTacToeActivityV1,
  EchoTicTacToeInviteV1,
  EchoYoutubePlaybackSyncV1,
} from '@/audio/voiceEchoLiveKitData';
import type { VcYoutubeRemotePlaybackState } from '@/features/voice/composables/useVcYoutubeWatchTogetherPlayer';
import type { ChannelCategory } from '@/composables/useChannels';
import type { DmMentionNotificationRow } from '@/features/dm/collectDmMentionNotifications';
import type { NotificationReadPreset } from '@/features/dm/filterDmMentionNotificationRows';

/** Namespaced controller actions (stable surface for wiring tests and dev asserts). */
export type AppLayoutControllerActions = {
  message: {
    goToMessage: (channelId: string, messageId: string) => void;
  };
  navigation: {
    openDm: (userId: string) => void | Promise<any>;
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
  openVcActivityTicTacToe: () => void;
  vcHangmanActivity: ComputedRef<EchoHangmanActivityV1 | null>;
  hangmanRosterUserIds: ComputedRef<string[]>;
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
  openVcActivityBasketballStars2026: () => void;
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
  getLocalScreenTrack: () => any;
  getLocalCameraTrack: () => any;
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
  currentUser: ComputedRef<any>;
  workspaceReady: ComputedRef<boolean>;
  sessionEndedMessage: Ref<string | null>;
  discordBotExportReadyBanner: Ref<{ guildName: string } | null>;
  dismissDiscordBotExportReadyBanner: () => void;
  showWelcomeBackSlimBanner: ComputedRef<boolean>;
  welcomeBackExploreGate: ComputedRef<boolean>;
  /** Signed-in non-guest + empty public directory (Welcome back shows server CTAs instead of auth). */
  welcomeBackExploreMemberEmptyDirectory: ComputedRef<boolean>;

  // Navigation / Surface
  mainSurface: ComputedRef<MainSurface>;
  activeChannelId: Ref<string>;
  activeChannel: ComputedRef<ChannelSummary | null>;
  activeChannelContext: ComputedRef<any>;
  effectiveActiveChannel: ComputedRef<any>;
  isExploreView: ComputedRef<boolean>;
  isInDMMode: ComputedRef<boolean>;
  isDmUiContext: ComputedRef<boolean>;
  isGroupDM: ComputedRef<boolean>;
  isInDMChat: ComputedRef<boolean>;
  dmPartnerUser: ComputedRef<any>;
  /** Live presence from socket + `/presence` batch; merge with row status in UI (see `selectPresence`). */
  presenceByUserId: Ref<Record<string, string>>;
  /** True when the user is currently on a mobile presence surface (wired from session store). */
  presenceMobileByUserId: Ref<Record<string, true>>;
  activeGroupDM: ComputedRef<any>;
  activeGroupCallMembers: ComputedRef<any[]>;
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
  rawCategoriesForServer: ComputedRef<any[]>;
  categoriesForServer: ComputedRef<any[]>;
  resolvePreviewChannelPermission: any;
  findChannelContextById: (channelId: string | null | undefined) => any;
  getFirstTextChannelId: (cats: any[]) => string;
  watchActiveChannelWithServerChange: (
    id: Ref<string>,
    shouldPreserveChannel?: (channelId: string) => boolean,
  ) => void;
  isCreateChannelModalOpen: Ref<boolean>;
  createChannelInitialCategoryId: Ref<string | null>;
  isCreateCategoryModalOpen: Ref<boolean>;
  channelSettingsTarget: Ref<any>;
  categorySettingsTarget: Ref<any>;
  channelSettingsEchoPermissionEditor: Ref<any>;
  categorySettingsEchoPermissionEditor: Ref<any>;
  createChannelCategoryNames: ComputedRef<string[]>;
  createChannelCategoryOptions: ComputedRef<any[]>;
  openCreateChannelModal: (categoryId: string | null) => void;
  openCreateCategoryModal: () => void;
  handleCreateChannelModalSubmit: (payload: any) => void;
  handleCreateChannelSubmit: (payload: any) => void;
  handleCreateCategorySubmit: (payload: any) => void;
  openChannelSettings: (payload: {
    channel: ChannelSummary;
    categoryId: string;
  }) => void;
  onChannelSettingsModalOpenUpdate: (next: boolean) => void;
  handleChannelSettingsSave: (payload: any) => void;
  channelSettingsCategoryPermissionDefaults: ComputedRef<any>;
  channelSettingsCategoryAutoDeleteAfterSeconds: ComputedRef<
    number | null | undefined
  >;
  openCategorySettings: (categoryId: string) => void;
  onCategorySettingsModalOpenUpdate: (next: boolean) => void;
  handleCategorySettingsSave: (payload: any) => void;
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
    avatars: any[];
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
  dmGroupFriends: ComputedRef<any[]>;
  dmInboxEntriesForPanel: ComputedRef<any[]>;
  /** Subset of inbox rows (user kind only); prefer {@link dmInboxEntriesForPanel} for the Messages list. */
  dmUsersForDmPanel: ComputedRef<any[]>;
  groupDMListForPanel: ComputedRef<any[]>;

  // RBAC / Caps
  echoRoleCatalog: Ref<any[]>;
  rolePreview: Ref<any>;
  startRolePreview: (payload: any) => void;
  handleStartRolePreview: (payload: any) => void;
  clearRolePreview: () => void;
  refreshEchoRoleData: () => void;
  isRolePreviewActiveForServer: ComputedRef<boolean>;
  previewHasUiPermission: (permission: string) => boolean;
  previewCanModerateMembers: ComputedRef<boolean>;
  memberListResolveHighestRole: (userId: string) => any;
  memberListRoleManagement: ComputedRef<any>;
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
  liveChannelCapabilities: Ref<any>;

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
  sendMessage: any;
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
  socketSendMessage: any;
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
      contentJson?: any;
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
  pinPreview: (msg: any) => string;
  pinnedMessageIdsForCurrentChannel: ComputedRef<string[]>;
  pinnedMessagesForDropdown: ComputedRef<any[]>;

  // Voice / Calls
  onVcChatButtonClick: () => void;
  handleJoinVoice: (payload: any) => void;
  handleLeaveVoice: () => void;
  handleChannelVoicePanelLeave: () => void | Promise<void>;
  handleActiveChannelChange: (channelId: string) => void;
  handleJoinVoiceIfAllowed: (payload: any) => void;
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
  dmCallCallViewParticipants: ComputedRef<any[]>;
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
  callOverlay: ComputedRef<any>;

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
  canModerateMessageAuthor: (message: any) => boolean;
  canOpenInviteForServer: (serverId: string) => boolean;
  canInviteToCurrentServer: ComputedRef<boolean>;
  moderationModalOpen: Ref<boolean>;
  moderationAction: Ref<any>;
  moderationTargetUserId: Ref<string | null>;
  moderationTargetUser: ComputedRef<any>;
  handleModerateUser: (payload: {
    action: 'kick' | 'ban' | 'timeout';
    targetUserId: string;
    timeoutMinutes?: number;
  }) => void;
  onModerationModalConfirm: (payload: any) => void;
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
  handleProfileReportUser: (payload: any) => Promise<void>;
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
  filterChips: Ref<any[]>;
  allChannels: ComputedRef<any[]>;
  isSearchActive: ComputedRef<boolean>;
  paginatedSearchResults: ComputedRef<any[]>;
  searchResultMessages: ComputedRef<any[]>;
  searchResultPage: Ref<number>;
  totalPages: ComputedRef<number>;
  goToSearchPage: (page: number) => void;
  addFilter: (key: any, value: any) => void;
  removeFilter: (filter: any) => void;
  clearSearch: () => void;
  searchLoading: Ref<boolean>;
  searchError: Ref<string | null>;
  searchScopeHint: ComputedRef<string>;
  onSearchInput: (v: string) => void;

  // Invites / Servers
  selectedServer: ComputedRef<any>;
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
  handleCreateServer: (payload: any) => void;
  handleJoinDiscoverableServer: (payload: any) => void;
  handleJoinWithInviteLink: (raw: string) => void;
  handleInviteFriend: (
    userId: string,
    voiceChannelId?: string | null,
    voiceChannelName?: string | null,
  ) => void;
  inviteableFriends: ComputedRef<any[]>;
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
  openMemberProfileFromMemberColumn: (payload: any) => void;
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
    onSelectDM: (id: string) => void | Promise<any>,
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
  memberListUsers: ComputedRef<any[]>;
  /** Full server roster for Server Settings → Members (includes Discord import placeholders). */
  serverSettingsMemberUsers: ComputedRef<any[]>;
  /** User directory for server channel list + VC participant rows (not DM panel list). */
  usersForChannelPanel: ComputedRef<any[]>;
  /** `@` mention autocomplete: channel/DM participants only (not full workspace directory). */
  usersForMentionAutocomplete: ComputedRef<any[]>;
  selfProfile: ComputedRef<any>;
  memberPopoutOpenRolesPanel: Ref<boolean>;
  onMemberPopoutOpenUpdate: (next: boolean) => void;
  handleCallViewOpenProfile: (
    userId: string,
    anchorRect: PopoutAnchorRect | null,
  ) => void;
  activeMemberNote: ComputedRef<string>;
  activeVoiceChannelParticipants: Ref<any>;
  getVcActivityPresenceForUser: (userId: string) => VcActivityPresenceKind[];
  getVcChannelActivityPresenceForChannel: (
    channelId: string,
  ) => VcActivityPresenceKind[];
  /** Echo user id hosting synced VC activity (YouTube / embeds); empty when idle. */
  effectiveVcActivityKingUserId: ComputedRef<string>;
  liveKitState: ComputedRef<'idle' | 'connecting' | 'connected' | 'error'>;
  liveKitNetworkStats: ComputedRef<any>;
  liveKitRoom: any;
  speakingMap: ComputedRef<Record<string, any>>;
  localSpeaking: ComputedRef<boolean>;
  localAudioLevel: ComputedRef<number>;
  switchMicDevice: (deviceId: string) => void;
  switchSpeakerDevice: (deviceId: string) => void;
  setLkOutputVolume: (volume: number) => void;
  reapplyVoiceProcessing: () => Promise<void>;
  /** Settings mic listen-back: temporarily force LiveKit effective deafen. */
  setMicTestListenDeafen: (active: boolean) => void;
  vcRemoteParticipants: any;
  vcMirrorCamera: any;
  switchVcCamera: (deviceId: string) => void;
  setVcVideoQuality: (preset: any) => void;
  applyEchoPresenceFromSocket: (p: { userId: string; status: string }) => void;
  closePinsDropdown: () => void;
  exploreDiscoverableServers: Ref<any[]>;
  getLatestDMUserId: () => string | null;
  goToPinnedMessage: (messageId: string) => void;
  handleCreateGroupDM: (payload: any) => Promise<void>;
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
  openGroupDMModal: (payload?: any) => void;
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
  ExploreView: any;
  icons: any;
  getChannelIcon: any;
  getChannelDisplayName: any;
  getServerChannelInfoForMainSurface: (channelId: string) => {
    type: 'text' | 'voice' | 'forum' | 'paper';
    parentChannelId?: string;
  } | null;
  showApiFetchErrorBanner: Ref<boolean>;
  isChannelPanelSwitchLoading: ComputedRef<boolean>;
  isMessageSurfaceSwitchLoading: ComputedRef<boolean>;
  isMemberSurfaceSwitchLoading: ComputedRef<boolean>;
  isServerNotificationSettingsOpen: Ref<boolean>;
  currentServerNotificationLevel: ComputedRef<any>;
  openServerNotificationSettings: () => void;
  handleServerNotificationSave: (level: any) => void;
  serverNotificationLevelsMap: ComputedRef<any>;
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
  pinsButtonRefDm: Ref<any>;
  pinsButtonRefServer: Ref<any>;
  pinsDropdownRect: Ref<any>;
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
  membersForMemberList: ComputedRef<any[]>;
  searchActiveTab: Ref<string>;
  searchFilter: Ref<any>;
  searchIsLoading: Ref<boolean>;
  searchResults: Ref<any[]>;
  searchStatus: Ref<string>;
  selectedServerId: ComputedRef<string | null>;
  servers: ComputedRef<any[]>;
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
