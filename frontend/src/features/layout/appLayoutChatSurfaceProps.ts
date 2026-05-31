import type { MainSurface, DmSubView } from '@/features/layout/mainSurface';
import type { CallOverlayState } from '@/features/layout/callOverlay';
import type { ChannelSummary, MessageWithAuthor } from '@shared/types';
import type { FilterChip, FilterKey, HasType } from '@/composables/useSearch';
import type { UserForAuthor } from '@/features/chat/chatMessageTypes';
import type { ExpandedProfile, MemberRole } from '@/utils/memberProfiles';
import type { ReactionFavorite } from '@/composables/useReactionFavorites';
import type { OpenGroupDmModalPayload } from '@/features/layout/composables/useAppLayoutGroupDm';
import type { ActiveDmThreadCallUi } from '@/features/layout/dmThreadCallUi';
import type {
  ChatHeaderAdapter,
  DmSurfaceAdapter,
  ProfileSurfaceAdapter,
} from '@/features/layout/regionAdapters';
import type { ChannelCategory } from '@/composables/useChannels';
import type { EchoChannelCapabilitiesDto } from '@/api/echo/types';
import type { ComputedRef, ShallowRef } from 'vue';
import type {
  VcActivityUiState,
  YoutubePlaylistEntry,
} from '@/features/voice/vcActivityTypes';
import type {
  EchoHangmanActivityV1,
  EchoCodenamesActivityV1,
  EchoCodenamesAffiliationV1,
  EchoCodenamesRoleAssignmentV1,
  EchoTicTacToeActivityV1,
  EchoTicTacToeInviteV1,
  EchoYoutubePlaybackSyncV1,
} from '@/audio/voiceEchoLiveKitData';
import type { VcYoutubeRemotePlaybackState } from '@/features/voice/composables/useVcYoutubeWatchTogetherPlayer';

/**
 * Props / inject bundle for [`AppLayoutChatSurface.vue`](./components/AppLayoutChatSurface.vue).
 * Narrow types gradually; many handlers stay `any` to match the prior `defineProps([...])` surface.
 */
export type AppLayoutChatSurfaceProps = {
  dmSurfaceAdapter?: DmSurfaceAdapter;
  profileSurfaceAdapter?: ProfileSurfaceAdapter;
  chatHeaderAdapter?: ChatHeaderAdapter;
  mainSurface: MainSurface;
  callOverlay: CallOverlayState;
  surfaceSwitchLoading: boolean;
  dmThreadSwitchLoading: boolean;
  channelPanelCollapsed: boolean;
  /** Layout/search: true when the member column is hidden (user collapsed or NSFW gate). */
  memberPanelCollapsed: boolean;
  /** User preference only — false while NSFW gate hides members without user collapsing. */
  memberPanelCollapsedRaw: boolean;
  /**
   * Sub-800px guild tri-pane: channels/members live in horizontal pager panes, not grid
   * columns. When true, chat header + server rail should always offer channel/member jumps
   * even if `channelPanelCollapsed` / `memberPanelCollapsed` are false (desktop defaults).
   */
  compactGuildTriPaneNav: boolean;
  /** Sub-800px shell: single-column layout; channel column width is not in play. */
  isCompactShell: boolean;
  /**
   * Desktop grid: shrinks the resizable channel column by one step when VC activity
   * content still overflows vertically, to give the activity column more width.
   */
  narrowChannelPanelForActivityOverflowStep: () => boolean;
  isDmUiContext: boolean;
  isInDMMode: boolean;
  isViewingVoiceChannel: boolean;
  startMemberResize: (e: MouseEvent) => void;
  resetMemberWidth: () => void;
  effectiveActiveChannel: ChannelSummary | null;
  liveChannelCapabilities?: EchoChannelCapabilitiesDto | null;
  isInDMChat: boolean;
  activeDmThreadCallUi: ActiveDmThreadCallUi | null;
  /** Kept for DM section/body flow; header ownership now uses `activeDmThreadCallUi`. */
  dmCallMatchesActiveChannel: boolean;
  isExpandedProfileSidePanel: boolean;
  isExpandedProfileModalOpen: boolean;
  isGroupOverviewOpen: boolean;
  dmPartnerUser: unknown;
  /** Echo session live presence map — merged with DM partner row in the chat header. */
  presenceByUserId: Record<string, string | undefined>;
  presenceMobileByUserId?: Record<string, true>;
  openExpandedProfilePanelForUserId: (userId: string) => void;
  openExtendedProfileModalForUserId: (userId: string) => void;
  /** Opens centered expanded profile (not DM rail side panel). */
  handleExpandedProfileOpenProfile: (userId: string) => void;
  isGroupDM: boolean;
  activeGroupDM: unknown;
  icons: Record<string, string>;
  dmActiveTab: DmSubView;
  getChannelIcon: (channel: ChannelSummary) => string;
  getChannelDisplayName: (name?: string) => string;
  togglePinsDropdown: (...args: unknown[]) => unknown;
  expandChannels: () => void;
  collapseMembers: () => void;
  expandMembers: () => void;
  memberPanelWidth: number;
  searchText: string;
  filterChips: FilterChip[];
  allChannels: Array<{ id: string; name: string }>;
  users: UserForAuthor[];
  /** Scoped list for `@` autocomplete in the composer (omit only in tests/storybook). */
  usersForMentionAutocomplete: UserForAuthor[];
  paginatedSearchResults: (MessageWithAuthor & { channelName?: string })[];
  searchResultMessagesCount: number;
  searchResultPage: number;
  totalPages: number;
  selectedServerName: string;
  onSearchInput: (v: string) => void;
  addFilter: (key: FilterKey, value: string | boolean | HasType) => void;
  removeFilter: (key: FilterKey) => void;
  clearSearch: () => void;
  goToSearchPage: (page: number) => void;
  handleGoToMessage: (channelId: string, messageId: string) => void;
  searchLoading: boolean;
  searchError: string | null;
  searchScopeHint: string;
  isRolePreviewActiveForServer: boolean;
  rolePreview: unknown;
  clearRolePreview: () => void;
  dmCallWithUserId: string | null;
  dmCallRinging: boolean;
  dmCallAwaitingAccept: boolean;
  dmCallRingUi: boolean;
  dmCallLobbyAfterSelfLeave: boolean;
  dmCallIncoming: boolean;
  dmCallRingRemoteVanishing: boolean;
  endDmCall: () => void;
  leaveDmCallVoice: () => void | Promise<void>;
  rejoinDmCallVoice: () => void;
  answerDmCall: () => void;
  declineDmCall: () => void;
  startDmCall: () => void;
  isPinsDropdownOpen: boolean;
  pinsButtonRefDm: unknown;
  pinsButtonRefServer: unknown;
  openGroupDMModal: (payload?: OpenGroupDmModalPayload) => void;
  startGroupCall: () => void;
  openGroupOverviewPanel: (groupId?: string) => void;
  activeGroupCallMembers: unknown[];
  currentUser: {
    id?: string;
    name?: string;
    pfp?: string;
    isGuest?: boolean;
  } | null;
  /** From GET /me/discord — enables twin ownership of Discord-import shadow messages. */
  linkedDiscordUserId?: string | null;
  dmCallVideo: boolean;
  dmCallScreenshare: boolean;
  dmCallMuted: boolean;
  dmCallDeafened: boolean;
  vcMuted: boolean;
  vcDeafened: boolean;
  vcVideo: boolean;
  vcScreenshare: boolean;
  onToggleDmCallVideo: () => void;
  onToggleDmCallScreenshare: () => void;
  onToggleDmCallMuted: () => void;
  onToggleDmCallDeafened: () => void;
  onGuildChannelVcMuted: (next: boolean) => void;
  onGuildChannelVcDeafened: (next: boolean) => void;
  onGuildChannelVcVideo: (next: boolean) => void;
  onGuildChannelVcScreenshare: (next: boolean) => void;
  handleChannelVoicePanelLeave: () => void | Promise<void>;
  onSetDmCallFullscreen: (next: boolean) => void;
  dmCallCallViewParticipants: unknown[];
  pinsDropdownRect: unknown;
  pinnedMessagesForDropdown: unknown[];
  pinPreview: unknown;
  closePinsDropdown: () => void;
  goToPinnedMessage: unknown;
  activeVoiceChannelParticipants: unknown[];
  selectedServerId: string;
  activeChannelMessagesMap: Map<string, unknown>;
  sendMessage: unknown;
  onRequestForward: unknown;
  voiceSideChatCollapsed: boolean;
  voiceSideChatWidth: number;
  startVoiceSideChatResize: unknown;
  resetVoiceSideChatWidth: unknown;
  expandVoiceSideChat: unknown;
  toggleVoiceSideChat: () => void;
  /** Compact guild mobile: 0 hidden, 1 half-height sheet, 2 near-full sheet. */
  voiceMobileSheetLevel: number;
  bumpVoiceMobileChatFromCallScrollUp: () => void;
  bumpVoiceMobileChatFromCallScrollDown: () => void;
  /** Fixed dock inset for compact guild VC controls (px). */
  voiceMobileDockReservePx?: number;
  /** Connected guild voice channel id (null when not in VC). */
  currentVoiceChannelId: string | null;
  handleCallViewOpenProfile: unknown;
  canModerateVcParticipant: unknown;
  canVcModerateParticipantAction: unknown;
  handleVcModerate: unknown;
  handlePollVote: unknown;
  editMessage: unknown;
  deleteMessage: unknown;
  handleReact: unknown;
  topReactions: ReactionFavorite[];
  removeReactionFavorite?: (emoji: string) => void;
  handleGoToChannel: unknown;
  /** Open the owning guild and focus this channel when channel id may belong to another server. */
  openServerSurfaceForChannel: unknown;
  /** Guild VC: open owning server, select this voice channel in the sidebar, expand channel list. */
  focusGuildVoiceChannelInSidebar: () => void;
  showNsfwChatGate: boolean;
  acknowledgeNsfwChannel: unknown;
  declineNsfwGate: unknown;
  openMemberProfile: unknown;
  openProfileFromContextMenu?: (userId: string) => void;
  canModerateAuthor: unknown;
  handleModerateUser: unknown;
  isDMPanelOpen: boolean;
  friendIds: string[];
  friendIdsByUserId: Record<string, string[]>;
  friendRequestsIncoming: unknown[];
  friendRequestsOutgoing: unknown[];
  blockedUserIds: string[];
  selectedDMUserId: string | null;
  messageRequests: unknown[];
  selectedMessageRequestId: string | null;
  messages: Record<string, unknown>;
  echoDmPeerByChannelId?: ReadonlyMap<string, string>;
  selectDM: unknown;
  acceptFriendRequest: unknown;
  declineFriendRequest: unknown;
  cancelFriendRequest: unknown;
  sendFriendRequest: unknown;
  ignoreMessageRequest: unknown;
  handleAcceptMessageRequest: unknown;
  returnFromMessageRequests: unknown;
  dmMentionNotifications: unknown[];
  mentionNotificationHydrationLoading: boolean;
  resolveDmMentionNotificationChannelLabel: (channelId: string) => string;
  resolveDmMentionNotificationAuthorName: (
    row: import('@/features/dm/collectDmMentionNotifications').DmMentionNotificationRow,
  ) => string;
  resolveDmMentionNotificationRowPreview: (
    row: import('@/features/dm/collectDmMentionNotifications').DmMentionNotificationRow,
  ) => string;
  /** Per-channel read cursors (Echo attention) for mention inbox read/unread filters. */
  dmNotificationReadStateByChannelId: Readonly<Record<string, string | null>>;
  mentionNotificationCategoriesByServer: Readonly<
    Record<string, ChannelCategory[]>
  >;
  mentionNotificationServers: ReadonlyArray<{
    id: string;
    name: string;
    imageUrl?: string;
  }>;
  dmNotificationsReadPreset: 'all' | 'unread' | 'read';
  dmNotificationsSourceKey: string;
  onUpdateDmNotificationsReadPreset: unknown;
  onUpdateDmNotificationsSourceKey: unknown;
  isPersistedEchoDmThread: (channelId: string) => boolean;
  onOpenMentionNotification: unknown;
  onMarkMentionNotificationRead: unknown;
  dmCallFullscreen: boolean;
  pinnedMessageIdsForCurrentChannel: string[];
  handlePinMessage: unknown;
  handleUnpinMessage: unknown;
  expandedProfile: ExpandedProfile | null;
  isExpandedProfileFriend: boolean;
  isExpandedProfileOutgoingRequest: boolean;
  /** When false, friendship state is not yet authoritative (avoid showing wrong actions). */
  friendshipKnown: boolean;
  expandedProfileNote: string;
  onUpdateExpandedProfileNote: unknown;
  onExpandedProfileModalUpdate: unknown;
  handleExpandedProfileOpenServer: unknown;
  expandDmProfileToFullModal: unknown;
  handleExpandedProfileOpenDM: unknown;
  handleExpandedProfileSendFriendRequest: unknown;
  handleExpandedProfileCancelOutgoingFriendRequest: unknown;
  handleExpandedProfileAcceptIncomingFriendRequest: unknown;
  handleExpandedProfileDeclineIncomingFriendRequest: unknown;
  handleExpandedProfileRemoveFriend: unknown;
  isExpandedProfileTargetBlocked: boolean;
  guestFriendsLocked: boolean;
  handleProfileBlockUser: unknown;
  handleProfileUnblockUser: unknown;
  handleProfileReportUser: unknown;
  onCloseGroupOverview: () => void;
  handleKickGroupDmMember: (payload: {
    groupId: string;
    userId: string;
  }) => void | Promise<void>;
  handleLeaveGroupDm: (payload: { groupId: string }) => void | Promise<void>;
  openGroupSettingsFromHeader: unknown;
  resolveAuthorRole: (userId: string) => MemberRole | null | undefined;
  onOpenExplore: unknown;
  remoteParticipants: unknown;
  lkRoom: unknown;
  mirrorLocalCamera: boolean;
  getLocalScreenTrack: unknown;
  getLocalCameraTrack: unknown;
  getRemoteParticipantVolume: (userId: string) => number;
  setRemoteParticipantVolume: (userId: string, volumePercent: number) => void;
  onRequestFullscreenStream: (participantId: string) => void;
  /** Active fullscreen stream overlay participant (null when closed). */
  fullscreenStreamParticipantId: string | null;
  /** Guild VC activities (YouTube watch-together, etc.) — fullscreen in the voice column. */
  vcActivityUi: VcActivityUiState;
  openVcActivityPicker: () => void;
  openVcActivityYoutubeBrowse: () => void;
  openVcActivityWordle: () => void;
  openVcActivityHangman: () => void;
  openVcActivitySkriggles: () => void;
  openVcActivityTicTacToe: () => void;
  vcHangmanActivity: ComputedRef<EchoHangmanActivityV1 | null>;
  hangmanRosterUserIds: ComputedRef<string[]>;
  commitVcHangmanWord: (raw: string) => string | null;
  requestVcHangmanGuessLetter: (letter: string) => void;
  requestVcHangmanNextRound: () => void;
  vcSkrigglesActivity: ComputedRef<
    import('@/audio/voiceEchoLiveKitData').EchoSkrigglesActivityV1 | null
  >;
  skrigglesRosterUserIds: ComputedRef<string[]>;
  skrigglesCanvasEvents: ShallowRef<
    import('@/features/voice/skriggles/skrigglesVoiceSession').SkrigglesCanvasEvent[]
  >;
  commitSkrigglesWordChoice: (word: string) => void;
  submitSkrigglesGuess: (guess: string) => void;
  updateSkrigglesSettings: (
    settings: Partial<
      import('@/audio/voiceEchoLiveKitData').EchoSkrigglesSettingsV1
    >,
  ) => void;
  startSkrigglesGame: () => void;
  advanceSkrigglesRound: () => void;
  publishSkrigglesStrokeBatch: (
    batch: import('@/audio/voiceEchoLiveKitData').EchoSkrigglesStrokeBatchV1,
  ) => void;
  publishSkrigglesCanvasCmd: (
    cmd: import('@/audio/voiceEchoLiveKitData').EchoSkrigglesCanvasCmdV1,
  ) => void;
  publishSkrigglesCanvasSnapshot: (
    snapshot: import('@/audio/voiceEchoLiveKitData').EchoSkrigglesCanvasSnapshotV1,
  ) => void;
  tickSkrigglesTimers: () => void;
  vcTicTacToeActivity: ComputedRef<EchoTicTacToeActivityV1 | null>;
  vcTicTacToePendingInvite: ComputedRef<EchoTicTacToeInviteV1 | null>;
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
  canShowDiscordChannelImport: boolean;
  forumPostsByForumId: Record<string, unknown[]>;
  forumPostsLoadingByForumId: Record<string, boolean>;
  forumPostsErrorByForumId: Record<string, string | null>;
  refreshForumPosts: (
    forumChannelId: string,
    opts?: {
      sort?: 'latest_activity' | 'creation_date';
      includeArchived?: boolean;
      limit?: number;
    },
  ) => void | Promise<void>;
  createForumPost: (payload: {
    forumChannelId: string;
    content: string;
    tagIds?: string[];
    mentions?: unknown;
    imageUrl?: string;
    videoUrl?: string;
    gif?: boolean;
    imageSpoiler?: boolean;
    poll?: unknown;
    attachments?: unknown;
    stickers?: unknown;
    contentJson?: unknown;
    contentSchemaVersion?: number;
    messageFormatVersion?: number;
  }) => void | Promise<void>;
  patchForumPost: (payload: {
    postChannelId: string;
    pinned?: boolean;
    locked?: boolean;
    archivedAt?: string | null;
    tagIds?: unknown;
  }) => void | Promise<void>;
  /** MANAGE_CHANNELS (or equivalent) on the parent forum channel — lock/archive forum posts. */
  canManageForumPosts: boolean;
  openChannelSettings?: (payload: {
    channel: ChannelSummary;
    categoryId: string;
  }) => void;
  findChannelContextById?: (channelId: string) => {
    channel: ChannelSummary;
    categoryId: string;
  } | null;
};

/** Keys merged in `AppLayoutChatSurface` inject-or-props `chatCtx` (search UI still prefers `APP_LAYOUT_SEARCH_PANEL_KEY`). */
export const CHAT_SURFACE_INJECT_KEYS = [
  'dmSurfaceAdapter',
  'profileSurfaceAdapter',
  'chatHeaderAdapter',
  'mainSurface',
  'callOverlay',
  'surfaceSwitchLoading',
  'dmThreadSwitchLoading',
  'channelPanelCollapsed',
  'memberPanelCollapsed',
  'memberPanelCollapsedRaw',
  'compactGuildTriPaneNav',
  'isCompactShell',
  'narrowChannelPanelForActivityOverflowStep',
  'isDmUiContext',
  'isInDMMode',
  'isViewingVoiceChannel',
  'startMemberResize',
  'resetMemberWidth',
  'effectiveActiveChannel',
  'liveChannelCapabilities',
  'isInDMChat',
  'activeDmThreadCallUi',
  'dmCallMatchesActiveChannel',
  'isExpandedProfileSidePanel',
  'isExpandedProfileModalOpen',
  'isGroupOverviewOpen',
  'dmPartnerUser',
  'presenceByUserId',
  'presenceMobileByUserId',
  'openExpandedProfilePanelForUserId',
  'openExtendedProfileModalForUserId',
  'handleExpandedProfileOpenProfile',
  'isGroupDM',
  'activeGroupDM',
  'icons',
  'dmActiveTab',
  'getChannelIcon',
  'getChannelDisplayName',
  'togglePinsDropdown',
  'expandChannels',
  'collapseMembers',
  'expandMembers',
  'memberPanelWidth',
  'searchText',
  'filterChips',
  'allChannels',
  'users',
  'usersForMentionAutocomplete',
  'paginatedSearchResults',
  'searchResultMessagesCount',
  'searchResultPage',
  'totalPages',
  'selectedServerName',
  'onSearchInput',
  'addFilter',
  'removeFilter',
  'clearSearch',
  'goToSearchPage',
  'handleGoToMessage',
  'searchLoading',
  'searchError',
  'searchScopeHint',
  'isRolePreviewActiveForServer',
  'rolePreview',
  'clearRolePreview',
  'dmCallWithUserId',
  'dmCallRinging',
  'dmCallAwaitingAccept',
  'dmCallRingUi',
  'dmCallLobbyAfterSelfLeave',
  'dmCallIncoming',
  'dmCallRingRemoteVanishing',
  'endDmCall',
  'leaveDmCallVoice',
  'rejoinDmCallVoice',
  'answerDmCall',
  'declineDmCall',
  'startDmCall',
  'isPinsDropdownOpen',
  'pinsButtonRefDm',
  'pinsButtonRefServer',
  'openGroupDMModal',
  'startGroupCall',
  'openGroupOverviewPanel',
  'activeGroupCallMembers',
  'currentUser',
  'linkedDiscordUserId',
  'dmCallVideo',
  'dmCallScreenshare',
  'dmCallMuted',
  'dmCallDeafened',
  'vcMuted',
  'vcDeafened',
  'vcVideo',
  'vcScreenshare',
  'onToggleDmCallVideo',
  'onToggleDmCallScreenshare',
  'onToggleDmCallMuted',
  'onToggleDmCallDeafened',
  'onGuildChannelVcMuted',
  'onGuildChannelVcDeafened',
  'onGuildChannelVcVideo',
  'onGuildChannelVcScreenshare',
  'handleChannelVoicePanelLeave',
  'onSetDmCallFullscreen',
  'dmCallCallViewParticipants',
  'pinsDropdownRect',
  'pinnedMessagesForDropdown',
  'pinPreview',
  'closePinsDropdown',
  'goToPinnedMessage',
  'activeVoiceChannelParticipants',
  'selectedServerId',
  'activeChannelMessagesMap',
  'sendMessage',
  'onRequestForward',
  'voiceSideChatCollapsed',
  'voiceSideChatWidth',
  'startVoiceSideChatResize',
  'resetVoiceSideChatWidth',
  'expandVoiceSideChat',
  'toggleVoiceSideChat',
  'voiceMobileSheetLevel',
  'bumpVoiceMobileChatFromCallScrollUp',
  'bumpVoiceMobileChatFromCallScrollDown',
  'voiceMobileDockReservePx',
  'currentVoiceChannelId',
  'handleCallViewOpenProfile',
  'canModerateVcParticipant',
  'canVcModerateParticipantAction',
  'handleVcModerate',
  'handlePollVote',
  'editMessage',
  'deleteMessage',
  'handleReact',
  'topReactions',
  'removeReactionFavorite',
  'handleGoToChannel',
  'openServerSurfaceForChannel',
  'focusGuildVoiceChannelInSidebar',
  'showNsfwChatGate',
  'acknowledgeNsfwChannel',
  'declineNsfwGate',
  'openMemberProfile',
  'openProfileFromContextMenu',
  'canModerateAuthor',
  'handleModerateUser',
  'isDMPanelOpen',
  'friendIds',
  'friendIdsByUserId',
  'friendRequestsIncoming',
  'friendRequestsOutgoing',
  'blockedUserIds',
  'selectedDMUserId',
  'messageRequests',
  'selectedMessageRequestId',
  'messages',
  'echoDmPeerByChannelId',
  'selectDM',
  'acceptFriendRequest',
  'declineFriendRequest',
  'cancelFriendRequest',
  'sendFriendRequest',
  'ignoreMessageRequest',
  'handleAcceptMessageRequest',
  'returnFromMessageRequests',
  'dmMentionNotifications',
  'mentionNotificationHydrationLoading',
  'resolveDmMentionNotificationChannelLabel',
  'resolveDmMentionNotificationAuthorName',
  'resolveDmMentionNotificationRowPreview',
  'dmNotificationReadStateByChannelId',
  'mentionNotificationCategoriesByServer',
  'mentionNotificationServers',
  'dmNotificationsReadPreset',
  'dmNotificationsSourceKey',
  'onUpdateDmNotificationsReadPreset',
  'onUpdateDmNotificationsSourceKey',
  'isPersistedEchoDmThread',
  'onOpenMentionNotification',
  'onMarkMentionNotificationRead',
  'dmCallFullscreen',
  'pinnedMessageIdsForCurrentChannel',
  'handlePinMessage',
  'handleUnpinMessage',
  'expandedProfile',
  'isExpandedProfileFriend',
  'isExpandedProfileOutgoingRequest',
  'friendshipKnown',
  'expandedProfileNote',
  'onUpdateExpandedProfileNote',
  'onExpandedProfileModalUpdate',
  'handleExpandedProfileOpenServer',
  'handleExpandedProfileOpenProfile',
  'expandDmProfileToFullModal',
  'handleExpandedProfileOpenDM',
  'handleExpandedProfileSendFriendRequest',
  'handleExpandedProfileCancelOutgoingFriendRequest',
  'handleExpandedProfileAcceptIncomingFriendRequest',
  'handleExpandedProfileDeclineIncomingFriendRequest',
  'handleExpandedProfileRemoveFriend',
  'isExpandedProfileTargetBlocked',
  'guestFriendsLocked',
  'handleProfileBlockUser',
  'handleProfileUnblockUser',
  'handleProfileReportUser',
  'onCloseGroupOverview',
  'handleKickGroupDmMember',
  'handleLeaveGroupDm',
  'openGroupSettingsFromHeader',
  'resolveAuthorRole',
  'onOpenExplore',
  'remoteParticipants',
  'lkRoom',
  'mirrorLocalCamera',
  'getLocalScreenTrack',
  'getLocalCameraTrack',
  'onRequestFullscreenStream',
  'fullscreenStreamParticipantId',
  'vcActivityUi',
  'openVcActivityPicker',
  'openVcActivityYoutubeBrowse',
  'openVcActivityWordle',
  'openVcActivityHangman',
  'openVcActivitySkriggles',
  'openVcActivityTicTacToe',
  'vcHangmanActivity',
  'hangmanRosterUserIds',
  'commitVcHangmanWord',
  'requestVcHangmanGuessLetter',
  'requestVcHangmanNextRound',
  'vcSkrigglesActivity',
  'skrigglesRosterUserIds',
  'skrigglesCanvasEvents',
  'commitSkrigglesWordChoice',
  'submitSkrigglesGuess',
  'updateSkrigglesSettings',
  'startSkrigglesGame',
  'advanceSkrigglesRound',
  'publishSkrigglesStrokeBatch',
  'publishSkrigglesCanvasCmd',
  'publishSkrigglesCanvasSnapshot',
  'tickSkrigglesTimers',
  'vcTicTacToeActivity',
  'vcTicTacToePendingInvite',
  'sendVcTicTacToeChallenge',
  'respondVcTicTacToeInvite',
  'dismissVcTicTacToeInvite',
  'requestVcTicTacToeMove',
  'requestVcTicTacToeRematch',
  'vcCodenamesActivity',
  'codenamesRosterUserIds',
  'vcCodenamesSpymasterKey',
  'commitVcCodenamesDeal',
  'requestVcCodenamesSetup',
  'requestVcCodenamesClue',
  'requestVcCodenamesReveal',
  'requestVcCodenamesEndTurn',
  'requestVcCodenamesNewGame',
  'requestVcCodenamesPushKeyToOrchestrator',
  'openVcActivityOpenGuessr',
  'openVcActivitySkribblIo',
  'openVcActivityGarticPhone',
  'openVcActivityKrunker',
  'openVcActivityCodenames',
  'openVcActivityRichup',
  'openVcActivityGooberDash',
  'openVcActivitySmashKarts',
  'openVcActivityClusterRush',
  'setVcActivityYoutubeVideo',
  'setVcYoutubeBrowseOpen',
  'addVcYoutubeToQueue',
  'removeVcYoutubeFromQueue',
  'moveVcYoutubeInQueue',
  'playVcYoutubeAtIndex',
  'playVcYoutubeNext',
  'playVcYoutubePrevious',
  'closeVcActivity',
  'vcYoutubeRemotePlayback',
  'publishVcYoutubePlaybackSync',
  'vcYoutubePlaybackShouldPublish',
  'canShowDiscordChannelImport',
  'forumPostsByForumId',
  'forumPostsLoadingByForumId',
  'forumPostsErrorByForumId',
  'refreshForumPosts',
  'createForumPost',
  'patchForumPost',
  'canManageForumPosts',
  'openChannelSettings',
  'findChannelContextById',
] as const satisfies ReadonlyArray<keyof AppLayoutChatSurfaceProps>;
