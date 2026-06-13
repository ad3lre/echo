<script setup lang="ts">
import AppLayoutLeftChrome from '@/features/layout/components/AppLayoutLeftChrome.vue';
import DesktopTitlebar from '@/components/DesktopTitlebar.vue';
import AppLayoutGuildModals from '@/features/layout/components/AppLayoutGuildModals.vue';
import AppLayoutMembersColumn from '@/features/layout/components/AppLayoutMembersColumn.vue';
import AppLayoutModals from '@/features/layout/components/AppLayoutModals.vue';
import AppLayoutDialogHost from '@/features/layout/components/AppLayoutDialogHost.vue';
import AppLayoutMainSurface from '@/features/layout/components/AppLayoutMainSurface.vue';
import RealtimeConnectionBanner from '@/features/layout/components/RealtimeConnectionBanner.vue';
import CompactDualPaneShell from '@/features/layout/components/CompactDualPaneShell.vue';
import CompactStackShellFrame from '@/features/layout/components/CompactStackShellFrame.vue';
import CompactTriPaneShell from '@/features/layout/components/CompactTriPaneShell.vue';
import CompactGuildSplitShell from '@/features/layout/components/CompactGuildSplitShell.vue';
import { resolveEchoServerIdContainingChannel } from '@/features/voice/resolveEchoServerIdForGuildChannel';
import { ECHO_SCREEN_SHARE_USE_CONFIG_MODAL } from '@/config/screenShareUi';

const GuildMobileVoiceLobbySheet = defineAsyncComponent(
  () => import('@/features/voice/components/GuildMobileVoiceLobbySheet.vue'),
);
const GuildMobileVoiceDock = defineAsyncComponent(
  () => import('@/features/voice/components/GuildMobileVoiceDock.vue'),
);
const GuestDisplayNameModal = defineAsyncComponent(
  () => import('@/components/GuestDisplayNameModal.vue'),
);
const GuestWelcomePreferencesModal = defineAsyncComponent(
  () => import('@/components/GuestWelcomePreferencesModal.vue'),
);
const GuestOnboardingModal = defineAsyncComponent(
  () => import('@/components/GuestOnboardingModal.vue'),
);
const GuestCaptchaModal = defineAsyncComponent(
  () => import('@/components/GuestCaptchaModal.vue'),
);
const UnverifiedEmailModal = defineAsyncComponent(
  () => import('@/components/UnverifiedEmailModal.vue'),
);
const BugReportModal = defineAsyncComponent(
  () => import('@/components/BugReportModal.vue'),
);
const ReportModal = defineAsyncComponent(
  () => import('@/components/ReportModal.vue'),
);

const ScreenSharePickerModal = defineAsyncComponent(
  () => import('@/components/ScreenSharePickerModal.vue'),
);
const DesktopStreamingControlModal = defineAsyncComponent(
  () => import('@/components/DesktopStreamingControlModal.vue'),
);
const FullscreenStreamOverlay = defineAsyncComponent(
  () => import('@/components/FullscreenStreamOverlay.vue'),
);
const ForwardMessageModal = defineAsyncComponent(
  () => import('@/features/chat/components/ForwardMessageModal.vue'),
);
const DiscordProfileImportPromptModal = defineAsyncComponent(
  () => import('@/components/DiscordProfileImportPromptModal.vue'),
);

import {
  computed,
  defineAsyncComponent,
  nextTick,
  onMounted,
  onUnmounted,
  provide,
  ref,
  unref,
  watch,
  type ComputedRef,
} from 'vue';
import { storeToRefs } from 'pinia';
import { useAppLayoutController } from '@/features/layout/composables/useAppLayoutController';
import { useMobileShellNavigation } from '@/features/layout/composables/useMobileShellNavigation';
import {
  createChatPermissions,
  provideChatPermissions,
} from '@/composables/useChatPermissions';
import { hasPriorRegistration } from '@/utils/priorRegistration';
import { CHAT_MESSAGE_NAV_BRIDGE_KEY } from '@/features/navigation/chatMessageNavBridge';
import {
  dispatchAppToast,
  dispatchAppToastDetail,
} from '@/utils/controllerMissingAction';
import { echoChatBottomChromeInsetPx } from '@/features/layout/echoChatBottomChromeInset';
import { resolveCallTileAvatarUrl } from '@/utils/avatarDisplay';
import { memberPanelDiag } from '@/utils/memberPanelDiag';
import { channelPanelDiag } from '@/utils/channelPanelDiag';
import { layoutHyperLog } from '@/utils/layoutHyperLog';
import {
  hasImportedDiscordProfileFields,
  isDiscordProfileImportPromptDone,
  shouldOfferDiscordProfileImport,
} from '@/features/discord/discordProfileImportFlow';
import { echoSyncCapabilities } from '@/platform/syncCapabilities';
import { isDesktop } from '@/platform/desktopBridge';
import { provideSpeakingState } from '@/composables/useSpeakingState';
import { ECHO_VOICE_PROCESSING_KEY } from '@/composables/voiceProcessingInjection';
import { watchBugHunterAppContext } from '@/composables/useBugHunterAppTrace';
import { useBugHunterStore } from '@/stores/bugHunter';
import { useThemeStore } from '@/stores/theme';
import { useEchoSessionStore } from '@/stores/echoSession';
import AppToastShell from '@/features/layout/components/AppToastShell.vue';
import type { AppToastLayoutContext } from '@/features/layout/composables/useAppToastController';
import {
  CALL_VIEW_FULLSCREEN_STREAM_ID_KEY,
  LAYOUT_CHAT_SURFACE_KEY,
  LAYOUT_GUILD_MODALS_KEY,
  LAYOUT_INFO_BANNERS_KEY,
  LAYOUT_LEFT_CHROME_KEY,
  LAYOUT_MAIN_SURFACE_KEY,
  LAYOUT_MEMBERS_COLUMN_KEY,
  LAYOUT_MOBILE_SHELL_NAV_KEY,
  LAYOUT_MODALS_KEY,
  LAYOUT_SERVER_RAIL_ACTIONS_KEY,
} from '@/features/layout/layoutInjectionKeys';
import type { ChannelSummary } from '@shared/types';
import type {
  GuildVoiceActivityCard,
  GuildEventActivityCard,
} from '@/features/layout/appLayoutLeftChromeProps';
import { buildGuildVoiceActivityCardsForJoinedServers } from '@/features/layout/buildGuildVoiceActivityCards';
import {
  applyVcActivityUiPhase,
  waitForLiveKitConnected,
} from '@/features/voice/vcActivityJoin';
import type { VcActivityUiPhase } from '@/features/voice/vcActivityTypes';
import { buildGuildEventActivityCardsFromMyRsvps } from '@/features/layout/buildGuildEventActivityCards';
import {
  COMPOSER_INSERT_USER_MENTION_KEY,
  type InsertUserMentionFn,
} from '@/features/chat/chatComposerContext';
import { useAppLayoutShellNavigationChrome } from '@/features/layout/composables/useAppLayoutShellNavigationChrome';
import { useAppLayoutPlatformLifecycle } from '@/features/layout/composables/useAppLayoutPlatformLifecycle';
import { useAppLayoutGlobalShortcuts } from '@/features/layout/composables/useAppLayoutGlobalShortcuts';
import { useGuildEventDetailModalController } from '@/features/layout/composables/useGuildEventDetailModalController';
import { useForumPostsController } from '@/features/layout/composables/useForumPostsController';
import { useFullscreenStreamOverlay } from '@/features/layout/composables/useFullscreenStreamOverlay';
import { useAppLayoutBannerNotices } from '@/features/layout/composables/useAppLayoutBannerNotices';

/** Shared ref: ChatInput registers; CallView / channel VC menus / bubbles inject. */
const composerInsertUserMention = ref<InsertUserMentionFn | null>(null);
provide(COMPOSER_INSERT_USER_MENTION_KEY, composerInsertUserMention);

const {
  _DM_PANEL_WIDTH,
  _MORE_SERVERS_COMPACT_WIDTH,
  _MORE_SERVERS_PANEL_WIDTH,
  acceptFriendRequest,
  _activeChannel,
  _activeChannelContext,
  activeChannelId,
  activeChannelMessagesMap,
  linkedDiscordUserId,
  linkedDiscordState,
  dmSurfaceAdapter,
  profileSurfaceAdapter,
  chatHeaderAdapter,
  activeGroupCallMembers,
  activeGroupDM,
  activeGroupSettingsId,
  activeMemberNote,
  activeMemberProfile,
  activeRailTab,
  activeVoiceChannelParticipants,
  getVcActivityPresenceForUser,
  getVcChannelActivityPresenceForChannel,
  effectiveVcActivityKingUserId,
  liveKitState,
  liveKitNetworkStats,
  liveKitRoom,
  vcRemoteParticipants,
  vcMirrorCamera,
  switchVcCamera,
  setVcVideoQuality,
  speakingMap,
  localSpeaking,
  localAudioLevel,
  _switchMicDevice,
  _switchSpeakerDevice,
  _setLkOutputVolume,
  addFilter,
  addServerInitialView,
  addServerCreateBusy,
  addServerJoinBusy,
  addServerJoinInvitePrefill,
  exploreDirectoryJoinBusy,
  addServerJoinError,
  allChannels,
  appGridTemplateColumns,
  _applyEchoPresenceFromSocket,
  authSession,
  callOverlay,
  canCreateChannels,
  canManageThisChannel,
  canDeleteCurrentServer,
  canInviteToCurrentServer,
  canOpenInviteForServer,
  canJoinPreviewVoiceChannel,
  canModerateMemberInServer,
  canVcModerateMember,
  canModerateMemberActionInServer,
  canChangeMemberNicknameInServer,
  canModerateMessageAuthor,
  canOpenServerSettings,
  canOpenServerSettingsForServer,
  cancelFriendRequest,
  categoriesForServer,
  categorySettingsTarget,
  chatMessageNavBridge,
  categorySettingsEchoPermissionEditor,
  channelPanelCollapsed,
  channelPanelBubbleMode,
  toggleChannelPanelBubbleMode,
  _channelPanelWidth,
  channelSettingsCategoryPermissionDefaults,
  channelSettingsCategoryAutoDeleteAfterSeconds,
  channelSettingsEchoPermissionEditor,
  channelSettingsTarget,
  clearRolePreview,
  clearSearch,
  closeDMPanel,
  compactPagerPane,
  compactGuildTriPaneChannelPanelOpen,
  guildMobileVcLobby,
  openGuildMobileVcLobby,
  closeGuildMobileVcLobby,
  confirmLeaveServerFromModal,
  confirmJoinServerFromModal,
  isJoinServerConfirmModalOpen,
  joinServerConfirmPreview,
  joinServerConfirmBusy,
  onJoinServerConfirmModalUpdate,
  isServerApplicationModalOpen,
  serverApplicationPayload,
  serverApplicationBusy,
  onServerApplicationModalUpdate,
  confirmServerApplicationSubmittedFromModal,
  _continueAsGuest,
  closePinsDropdown,
  createChannelCategoryNames,
  createChannelCategoryOptions,
  createChannelInitialCategoryId,
  currentServerNotificationLevel,
  currentUser,
  currentVoiceChannelId,
  _currentVoiceChannelName,
  channelPanelVoiceChannelId,
  channelPanelVoiceChannelName,
  channelPanelVcMutedEffective,
  channelPanelVcDeafenedEffective,
  channelPanelVcVideoEffective,
  channelPanelVcScreenshareEffective,
  onChannelPanelVcMuted,
  onChannelPanelVcDeafened,
  onChannelPanelVcVideo,
  onChannelPanelVcScreenshare,
  onGuildChannelVcMuted,
  onGuildChannelVcDeafened,
  _onGuildChannelVcVideo,
  _onGuildChannelVcScreenshare,
  _onDmCallVcMuted,
  _onDmCallVcDeafened,
  onDmCallVcVideo,
  onDmCallVcScreenshare,
  handleChannelVoicePanelLeave,
  customStatus,
  declineFriendRequest,
  deleteMessage,
  _deleteMessageCore,
  dmActiveTab,
  dmIncomingRailCluster,
  dmCallDeafened,
  applyDmCallDeafened,
  toggleDmCallMuted,
  dmCallFullscreen,
  dmCallMuted,
  _dmCallQuarterView,
  dmCallMatchesActiveChannel,
  activeDmThreadCallUi,
  dmCallVideo,
  dmCallScreenshare,
  dmCallCallViewParticipants,
  dmCallWithUserId,
  dmCallRinging,
  dmCallAwaitingAccept,
  dmCallRingUi,
  dmCallLobbyAfterSelfLeave,
  dmCallIncoming,
  dmCallRingRemoteVanishing,
  _dmCallGlassPeer,
  dmGroupFriends,
  _dmPanelWidth,
  dmPartnerUser,
  dmInboxEntriesForPanel,
  echoDmPeerByChannelId,
  _echoCanCreateChannel,
  _echoCanCreateInvite,
  _echoCanManageMessages,
  _echoCanModerateMembers,
  echoCapabilitiesForServerId,
  isEchoRoleBootstrapLoading,
  echoChannelHistory,
  _echoRoleCatalog,
  echoWorkspaceError,
  editMessage,
  effectiveActiveChannel,
  endDmCall,
  leaveDmCallVoice,
  rejoinDmCallVoice,
  answerDmCall,
  declineDmCall,
  expandChannels,
  collapseMembers,
  expandMembers,
  expandVoiceSideChat,
  toggleVoiceSideChat,
  voiceMobileSheetLevel,
  bumpVoiceMobileChatFromCallScrollUp,
  bumpVoiceMobileChatFromCallScrollDown,
  narrowChannelPanelForActivityOverflowStep,
  expandedProfile,
  expandedProfileNote,
  exploreDiscoverableServers,
  filterChips,
  _findChannelContextById,
  getChannelDisplayName,
  getChannelIcon,
  _getFirstTextChannelId,
  _getLatestDMUserId,
  _getServerChannelInfoForMainSurface,
  goToPinnedMessage,
  goToSearchPage,
  groupDMLockedIds,
  groupDMPreselectedIds,
  groupDmMaxMembers,
  groupDMs,
  guestFriendsLocked,
  handleActiveChannelChange,
  handleCallViewOpenProfile,
  handleCategoryDelete,
  handleCategoryReorder,
  handleCategorySettingsSave,
  handleChannelDelete,
  handleChannelReorder,
  deleteChannelById,
  deleteCategoryById,
  handleChannelSettingsSave,
  handleCreateCategorySubmit,
  handleCreateChannelModalSubmit,
  _handleCreateChannelSubmit,
  handleCreateGroupDM,
  handleKickGroupDmMember,
  handleLeaveGroupDm,
  handleCreateServer,
  handleExpandedProfileNoteFromLayout,
  expandDmProfileToFullModal,
  handleExpandedProfileOpenDM,
  handleMemberPopoutQuickDm,
  handleExpandedProfileOpenProfile,
  handleExpandedProfileOpenServer,
  handleExpandedProfileRemoveFriend,
  handleExpandedProfileSendFriendRequest,
  handleExpandedProfileCancelOutgoingFriendRequest,
  handleExpandedProfileAcceptIncomingFriendRequest,
  handleExpandedProfileDeclineIncomingFriendRequest,
  handleProfileBlockUser,
  handleProfileUnblockUser,
  handleProfileReportUser,
  handleGoToChannel,
  handleGoToMessage,
  handleInviteFriend,
  handleJoinDiscoverableServer,
  _handleJoinVoice,
  handleJoinVoiceIfAllowed,
  handleJoinWithInviteLink,
  _handleLeaveVoice,
  handleModerateUser,
  handleChangeMemberNicknameFromMemberList,
  handlePinMessage,
  handlePollVote,
  handleReact,
  handleAcceptMessageRequest,
  handleDmMarkRead,
  hideDmFromInboxUser,
  hideDmFromInboxGroup,
  isDmInboxUserFavorite,
  isDmInboxGroupFavorite,
  toggleFavoriteDmInbox,
  handleSelectGroupDM,
  handleServerDeleted,
  handleServerNotificationSave,
  handleServerRailInvite,
  handleServerRailLeave,
  handleServerRailMarkRead,
  handleServerRailMarkAllRead,
  handleDmRailMarkAllRead,
  handleChannelMarkRead,
  handleServerRailNotificationSettings,
  handleServerRailSettings,
  handleStartRolePreview,
  markActiveChannelAsRead,
  handleUnpinMessage,
  showNsfwChatGate,
  acknowledgeNsfwChannel,
  declineNsfwGate,
  handleUpdateCustomStatus,
  handleUpdateGroupFromSettings,
  onRemoveGroupDmMember,
  onLeaveGroupDm,
  onOpenAddMembersToGroupDm,
  handleVcModerate,
  hasGuildChannelChrome,
  hydrateEchoFromApi,
  ignoreMessageRequest,
  icons,
  inviteLinkForServer,
  inviteLinkLookupPending,
  inviteApplicationsEnabled,
  inviteJoinLinksEnabled,
  inviteCanCreateDirectHexInvite,
  directHexInviteLink,
  directHexInviteBusy,
  createDirectHexInvite,
  _inviteLinkFromApi,
  _inviteLinkFromSelectedServer,
  inviteableFriends,
  isAddServerModalOpen,
  isAuthModalOpen,
  authModalInitialLoginEntry,
  authModalPasskeyOnOpen,
  authModalInitialTab,
  authModalInitialSubView,
  openAuthModal,
  isAuthenticated,
  isCompactShell,
  isCompactGuildSplitShell,
  isCreateCategoryModalOpen,
  isCreateChannelModalOpen,
  isDMPanelOpen,
  isDmUiContext,
  isEchoGraphId,
  isExpandedProfileFriend,
  isExpandedProfileOutgoingRequest,
  isExpandedProfileTargetBlocked,
  isExpandedProfileModalOpen,
  isExpandedProfileSidePanel,
  isExploreView,
  isGroupDM,
  isGroupDMModalOpen,
  isGroupDMSettingsOpen,
  groupDmSettingsInitialFocus,
  groupSettingsId,
  groupSettingsMembers,
  isGroupOverviewOpen,
  isGuestDisplayNameModalOpen,
  isGuestWelcomePrefsModalOpen,
  isGuestUpgradeModalOpen,
  isGuestCaptchaModalOpen,
  guestCaptchaSiteKey,
  isInDMChat,
  isInDMMode,
  isInviteModalOpen,
  inviteModalVoiceChannelId,
  inviteModalVoiceChannelName,
  isLeaveServerModalOpen,
  isMemberPopoutOpen,
  isMemberPopoutFriend,
  isMemberPopoutCanSendFriendRequest,
  isMemberPopoutTargetBlocked,
  isMoreServersCompact,
  isMoreServersPanelOpen,
  isMoreServersPinned,
  isOpeningDmThread,
  isChannelPanelSwitchLoading,
  isGuildShellSettling,
  isMessageSurfaceSwitchLoading,
  isMemberSurfaceSwitchLoading,
  isPinsDropdownOpen,
  isRolePreviewActiveForServer,
  _isSearchActive,
  isSelfProfilePopoutOpen,
  isServerEmptyOnboarding,
  isServerNotificationSettingsOpen,
  isServerSettingsModalOpen,
  isSettingsModalOpen,
  settingsModalInitialSection,
  serverSettingsModalInitialSection,
  isViewingVoiceChannel,
  _joinEchoServerWithInviteRaw,
  leaveServerModalServerName,
  leaveServerModalVariant,
  liveChannelCapabilities,
  _mainContentColumns,
  mainContentColumnsEffective,
  mainSurface,
  memberListResolveHighestRole,
  memberListRoleManagement,
  memberListUsers,
  serverSettingsMemberUsers,
  usersForChannelPanel,
  usersForMentionAutocomplete,
  rolesForMentionAutocomplete,
  memberPopoutOpenRolesPanel,
  memberPanelCollapsed,
  memberListShowGuests,
  memberPanelAutoCollapseUserOverride,
  markMemberPanelExpandedByUser,
  markMemberPanelCollapsedByUser,
  memberPanelCollapsedEffective,
  memberPanelWidth,
  memberPopoutAnchor,
  workspace,
  moderationAction,
  moderationModalOpen,
  moderationTargetUser,
  _moderationTargetUserId,
  onCategorySettingsModalOpenUpdate,
  onChannelSettingsModalOpenUpdate,
  onExpandedProfileModalUpdate,
  _onJoinVoice,
  _onJoinVoiceUi,
  onLeaveServerModalUpdate,
  _onLeaveVoice,
  _onLeaveVoiceUi,
  onModerationModalConfirm,
  onMemberPopoutOpenUpdate,
  onGuestAccountUpgraded,
  onGuestCaptchaVerified,
  onSearchInput,
  onUserSettingsModalUpdate,
  onServerSettingsModalUpdate,
  onSettingsModalActiveSectionUpdate,
  onServerSettingsModalActiveSectionUpdate,
  onVcChatButtonClick,
  openAddServerModal,
  openCategorySettings,
  openChannelSettings,
  openCreateCategoryModal,
  openCreateChannelModal,
  _openExpandedProfileDmFromComposable,
  openExpandedProfileFromMemberPopout,
  openExpandedProfileFromSelfPopout,
  openExpandedProfilePanelForUserId,
  openExtendedProfileModalForUserId,
  openGroupDMModal,
  openGroupOverviewPanel,
  openDmInboxFromRailOverflow,
  openGuestUpgradeModal,
  openGroupSettingsFromHeader,
  openMemberProfile,
  openMemberProfileFromMemberColumn,
  openProfileFromContextMenu,
  openSelfProfile,
  openServerFromMore,
  openServerSurface,
  openServerNotificationSettings,
  openServerSettingsIfAllowed,
  openUserSettingsModal,
  openUserSettingsToDiscordFromAddServer,
  paginatedSearchResults,
  _pinMessage,
  pinPreview,
  presenceByUserId,
  presenceMobileByUserId,
  pinnedMessageIdsForCurrentChannel,
  pinnedMessagesForDropdown,
  pinsButtonRefDm,
  pinsButtonRefServer,
  pinsDropdownRect,
  _previewCanModerateMembers,
  previewHasUiPermission,
  _profileNotes,
  rawCategoriesForServer,
  _recordReaction,
  refreshEchoRoleData,
  reorderVisibleServers,
  reapplyVoiceProcessing,
  setMicTestListenDeafen,
  removeFilter,
  resetChannelWidth,
  resetDmPanelWidth,
  resetMemberWidth,
  resetVoiceSideChatWidth,
  _resolvePreviewChannelPermission,
  returnFromMessageRequests,
  dmMentionNotifications,
  mentionNotificationHydrationLoading,
  resolveDmMentionNotificationChannelLabel,
  resolveDmMentionNotificationAuthorName,
  resolveDmMentionNotificationRowPreview,
  dmNotificationReadStateByChannelId,
  mentionNotificationCategoriesByServer,
  mentionNotificationServers,
  dmNotificationsReadPreset,
  dmNotificationsSourceKey,
  onOpenMentionNotification,
  onMarkMentionNotificationRead,
  isPersistedEchoDmThread,
  rolePreview,
  searchError,
  searchLoading,
  searchResultMessages,
  searchResultPage,
  searchScopeHint,
  searchText,
  selectDM,
  selectDMTab,
  selectIncomingDmFromRail,
  selectIncomingGroupDmFromRail,
  selectExploreTab,
  selectMessageRequest,
  selectServersTab,
  selectServersRailOnly,
  selectedDMUserId,
  selectedMessageRequestId,
  selectedServer,
  selfProfile,
  selfProfileAnchor,
  sendFriendRequest,
  sendMessage,
  forwardModalOpen,
  forwardPickerDestinations,
  forwardModalSourceSummary,
  openForwardMessagePicker,
  closeForwardMessagePicker,
  submitForwardedMessage,
  serverNotificationLevelsMap,
  serverPingKindByServerId,
  serverPingBubbleByServerId,
  serverPingChannelDotsByServerId,
  serverUnreadActivityDotByServerId,
  channelMissedActivityByChannelId,
  serverSettingsCanManageRoles,
  serverSettingsCanManageServer,
  serverStore,
  sessionEndedMessage,
  discordBotExportReadyBanner,
  dismissDiscordBotExportReadyBanner,
  _shellNavState,
  showApiFetchErrorBanner,
  showWelcomeBackSlimBanner,
  _socketSendMessage,
  startChannelResize,
  startDmCall,
  _startDmCallWithUserId,
  startDmPanelResize,
  startGroupCall,
  _startGroupCallWithId,
  startMemberResize,
  _startRolePreview,
  startVoiceSideChatResize,
  _syncVanityAcrossServerLists,
  toggleMoreServersPanel,
  togglePinsDropdown,
  _toggleReaction,
  topReactions,
  removeReactionFavorite,
  totalPages,
  _unpinMessage,
  updateCurrentUserStatus,
  updateProfileNote,
  _updateVcVideoIfAllowed,
  _vcDeafened,
  _applyVcDeafened,
  _vcMuted,
  _vcScreenshare,
  _vcVideo,
  isScreenSharePickerOpen,
  isDesktopStreamingControlOpen,
  desktopStreamingControlMode,
  desktopStreamingPreferences,
  fullscreenStreamParticipantId,
  vcActivityUi,
  openVcActivityPicker,
  openVcActivityYoutubeBrowse,
  openVcActivityWatchTogether,
  openVcActivityWordle,
  openVcActivityHangman,
  openVcActivitySkriggles,
  openVcActivityTicTacToe,
  vcHangmanActivity,
  hangmanRosterUserIds,
  commitVcHangmanWord,
  requestVcHangmanGuessLetter,
  requestVcHangmanNextRound,
  vcSkrigglesActivity,
  skrigglesRosterUserIds,
  skrigglesCanvasEvents,
  commitSkrigglesWordChoice,
  submitSkrigglesGuess,
  updateSkrigglesSettings,
  startSkrigglesGame,
  advanceSkrigglesRound,
  publishSkrigglesStrokeBatch,
  publishSkrigglesCanvasCmd,
  publishSkrigglesCanvasSnapshot,
  tickSkrigglesTimers,
  vcTicTacToeActivity,
  vcTicTacToePendingInvite,
  sendVcTicTacToeChallenge,
  respondVcTicTacToeInvite,
  dismissVcTicTacToeInvite,
  requestVcTicTacToeMove,
  requestVcTicTacToeRematch,
  vcCodenamesActivity,
  codenamesRosterUserIds,
  vcCodenamesSpymasterKey,
  commitVcCodenamesDeal,
  requestVcCodenamesSetup,
  requestVcCodenamesClue,
  requestVcCodenamesReveal,
  requestVcCodenamesEndTurn,
  requestVcCodenamesNewGame,
  requestVcCodenamesPushKeyToOrchestrator,
  openVcActivityOpenGuessr,
  openVcActivitySkribblIo,
  openVcActivityGarticPhone,
  openVcActivityKrunker,
  openVcActivityCodenames,
  openVcActivityRichup,
  openVcActivityGooberDash,
  openVcActivitySmashKarts,
  openVcActivityClusterRush,
  setVcActivityYoutubeVideo,
  setVcYoutubeBrowseOpen,
  addVcYoutubeToQueue,
  removeVcYoutubeFromQueue,
  moveVcYoutubeInQueue,
  playVcYoutubeAtIndex,
  playVcYoutubeNext,
  playVcYoutubePrevious,
  setWatchTogetherLobbyRole,
  ensureWatchTogetherSessionId,
  patchWatchTogetherUi,
  setWatchTogetherBrowseOpen,
  startWatchTogetherSession,
  playWatchTogetherAtIndex,
  closeVcActivity,
  vcYoutubeRemotePlayback,
  publishVcYoutubePlaybackSync,
  vcYoutubePlaybackShouldPublish,
  vcWatchTogetherRemotePlayback,
  publishVcWatchTogetherPlaybackSync,
  vcWatchTogetherPlaybackShouldPublish,
  handleScreenSharePickerConfirm,
  handleDesktopStreamingControlConfirm,
  _handleToggleScreenshare,
  _handleStopScreenShare,
  getLocalScreenTrack,
  getLocalCameraTrack,
  getRemoteParticipantVolume,
  setRemoteParticipantVolume,
  voiceSideChatCollapsed,
  voiceSideChatWidth,
  _votePoll,
  _watchActiveChannelWithServerChange,
  welcomeBackExploreGate,
  welcomeBackExploreMemberEmptyDirectory,
  inviteLandingActive,
  inviteLandingPreview,
  inviteLandingLoading,
  inviteLandingError,
  inviteLandingPersistBeforeOAuth,
} = useAppLayoutController();

/* Info-banner notices (email verification / guest upgrade / Discord export).
 * Placed before the LAYOUT_MODALS_KEY provide because onGuestUpgradeSignInFromSettings
 * is consumed there; see useAppLayoutBannerNotices. */
const {
  emailBannerResendBusy,
  emailBannerResendMessage,
  emailBannerResendError,
  showUnverifiedEmailBanner,
  showUnverifiedEmailModal,
  showGuestUpgradeBanner,
  showGuestOnboardingModal,
  discordBotExportReadyGuildNameForBanner,
  dismissEmailVerificationFlash,
  dismissUnverifiedEmailBannerClick,
  onUnverifiedEmailModalUpdate,
  onGuestUpgradeBannerOpenSettings,
  dismissGuestUpgradeBannerClick,
  onUnverifiedEmailChangeEmail,
  onUnverifiedEmailResend,
  onGuestUpgradeSignInFromSettings,
  onGuestOnboardingSignInExisting,
} = useAppLayoutBannerNotices({
  authSession,
  isAuthenticated,
  isCompactShell,
  isGuestUpgradeModalOpen,
  isAuthModalOpen,
  discordBotExportReadyBanner,
  openAuthModal,
  openUserSettingsModal,
  onUserSettingsModalUpdate,
});

function onJoinServerFromShell(inviteLink?: string) {
  openAddServerModal('join', inviteLink);
}

const themeStore = useThemeStore();

/** Desktop-only: server/action rail along the top instead of the left column (settings preference). */
const actionRailTopLayout = computed(
  () => themeStore.actionRailPlacement === 'top' && !isCompactShell.value,
);

/** Two-row grid only when the horizontal strip is mounted (welcome-back / invite landing omits it). */
const actionRailTopLayoutGrid = computed(
  () =>
    actionRailTopLayout.value &&
    !welcomeBackExploreGate.value &&
    !inviteLandingActive.value,
);

const { navAnnouncerText, topRailSelectedOverflowServer } =
  useAppLayoutShellNavigationChrome({
    activeChannelId,
    selectedServer,
    activeChannel: _activeChannel as ComputedRef<ChannelSummary | null>,
    isMoreServersPanelOpen,
    actionRailTopLayout,
    serverStore,
  });

/** Echo: Server Settings → Structure (same gate as sidebar channel/category drag). */
const serverSettingsGuildStructureEnabled = computed(() => {
  const s = unref(selectedServer);
  if (!s || s.id === 'echo') return false;
  if (!isEchoGraphId(s.id)) return false;
  return unref(canCreateChannels);
});

/** Keep Message visible in expanded profile even in the open 1:1 DM (compact header actions). */
const expandedProfileHideOpenDmButton = computed(() => false);

const isEchoServerRoleHierarchyPending = computed(() => {
  const sid = serverStore.selectedServer?.id;
  return (
    !!sid &&
    sid !== 'echo' &&
    isEchoGraphId(sid) &&
    isEchoRoleBootstrapLoading.value
  );
});
/** Keep populated rows during role-hierarchy refresh — MemberList shows skeletons only on first load. */
const memberListUsersResolved = computed(() => memberListUsers.value);
const serverSettingsMemberUsersResolved = computed(() =>
  isEchoServerRoleHierarchyPending.value ? [] : serverSettingsMemberUsers.value,
);
const memberListResolveHighestRoleResolved = computed(() =>
  isEchoServerRoleHierarchyPending.value
    ? undefined
    : memberListResolveHighestRole,
);
const serverVoiceSurfaceActive = computed(
  () => unref(callOverlay).type === 'serverVoice',
);

const membersColumnVisible = computed(
  () =>
    !unref(isExploreView) &&
    !unref(memberPanelCollapsedEffective) &&
    !unref(isDmUiContext) &&
    !unref(isServerEmptyOnboarding) &&
    !unref(isViewingVoiceChannel) &&
    unref(callOverlay).type !== 'dmCall' &&
    unref(mainSurface).type !== 'serverPaper',
);

const membersColumnEchoSectionOrdering = computed(
  () =>
    !!serverStore.selectedServer?.id &&
    serverStore.selectedServer.id !== 'echo' &&
    isEchoGraphId(serverStore.selectedServer.id) &&
    unref(echoCapabilitiesForServerId) === serverStore.selectedServer.id,
);

const membersColumnListLoading = computed(
  () =>
    isEchoServerRoleHierarchyPending.value ||
    unref(isMemberSurfaceSwitchLoading),
);

const serverActiveVoiceByServerId = computed<Record<string, boolean>>(() => {
  const out: Record<string, boolean> = {};
  const categoriesByServer = workspace.categoriesByServer.value as Record<
    string,
    { channels?: { type?: string; voiceParticipantIds?: string[] }[] }[]
  >;
  for (const [serverId, categories] of Object.entries(
    categoriesByServer ?? {},
  )) {
    const hasActiveVoice = (categories ?? []).some((category) =>
      (category.channels ?? []).some(
        (channel) =>
          channel.type === 'voice' &&
          (channel.voiceParticipantIds?.length ?? 0) > 0,
      ),
    );
    if (hasActiveVoice) out[serverId] = true;
  }
  return out;
});

/** Active guild voice rows across all joined servers (DM panel live strip). */
const guildVoiceActivityCards = computed<GuildVoiceActivityCard[]>(() =>
  buildGuildVoiceActivityCardsForJoinedServers({
    joinedServers: serverStore.servers,
    categoriesByServer: workspace.categoriesByServer.value as Readonly<
      Record<
        string,
        | Array<{
            channels?: Array<
              ChannelSummary & { voiceParticipantIds?: string[] }
            >;
          }>
        | undefined
      >
    >,
    roster: workspace.users.value,
    getChannelDisplayName,
    resolveCallTileAvatarUrl,
  }),
);

const echoSessionStore = useEchoSessionStore();
const { myEventRsvps, upcomingEventsByServerId } =
  storeToRefs(echoSessionStore);
const guildEventActivityCards = computed<GuildEventActivityCard[]>(() =>
  buildGuildEventActivityCardsFromMyRsvps({
    rsvps: myEventRsvps.value,
    getChannelDisplayName,
  }),
);

/* ===== Event detail modal: see useGuildEventDetailModalController ===== */
const {
  isEventDetailModalOpen,
  eventDetailView,
  openGuildEventDetail,
  closeGuildEventDetailModal,
  submitGuildEventRsvp,
  navigateGuildEventOpenPayload,
} = useGuildEventDetailModalController({
  myEventRsvps,
  upcomingEventsByServerId,
  serverStore,
  workspace,
  hydrateEchoFromApi,
  openServerSurface,
  isDMPanelOpen,
});

const pendingVcActivityPhaseAfterJoin = ref<VcActivityUiPhase | null>(null);

const vcActivityPhaseOpeners = {
  openVcActivityPicker,
  openVcActivityYoutubeBrowse,
  openVcActivityWatchTogether,
  openVcActivityWordle,
  openVcActivityHangman,
  openVcActivitySkriggles,
  openVcActivityTicTacToe,
  openVcActivityOpenGuessr,
  openVcActivitySkribblIo,
  openVcActivityGarticPhone,
  openVcActivityKrunker,
  openVcActivityCodenames,
  openVcActivityRichup,
  openVcActivityGooberDash,
  openVcActivitySmashKarts,
  openVcActivityClusterRush,
  closeVcActivity,
};

async function followPendingVcActivityAfterJoin(
  channelId: string,
): Promise<void> {
  const phase = pendingVcActivityPhaseAfterJoin.value;
  pendingVcActivityPhaseAfterJoin.value = null;
  if (!phase || phase === 'closed' || phase === 'pick') return;
  const targetId = channelId.trim();
  if (currentVoiceChannelId.value?.trim() !== targetId) return;
  if (liveKitState.value !== 'connected') {
    await waitForLiveKitConnected(liveKitState);
  }
  applyVcActivityUiPhase(phase, vcActivityPhaseOpeners);
}

function handleDmPanelJoinGuildVoiceActivity(payload: {
  serverId: string;
  channelId: string;
  channelName: string;
  activityPhase?: VcActivityUiPhase | null;
}) {
  const phase = payload.activityPhase ?? null;
  pendingVcActivityPhaseAfterJoin.value =
    phase && phase !== 'closed' && phase !== 'pick' ? phase : null;
  isDMPanelOpen.value = false;
  openServerSurface(payload.serverId, payload.channelId);
  void nextTick(async () => {
    if (isCompactShell.value && hasGuildChannelChrome.value) {
      openGuildMobileVcLobby({
        channelId: payload.channelId,
        channelName: payload.channelName,
      });
      return;
    }
    await handleJoinVoiceIfAllowed({
      channelId: payload.channelId,
      channelName: payload.channelName,
    });
    await followPendingVcActivityAfterJoin(payload.channelId);
  });
}

const guildMobileVcLobbyParticipants = computed(() => {
  const lobby = guildMobileVcLobby.value;
  if (!lobby) return [] as { id: string; name: string; pfp: string }[];
  const uid = lobby.channelId.trim();
  for (const cat of categoriesForServer.value) {
    for (const ch of cat.channels ?? []) {
      if (ch.id !== uid || ch.type !== 'voice') continue;
      const ids = ch.voiceParticipantIds ?? [];
      return ids.map((id: string) => {
        const u = workspace.users.value.find((x) => x.id === id);
        return {
          id,
          name: u?.name?.trim() || 'Member',
          pfp: u?.pfp ?? '',
        };
      });
    }
  }
  return [];
});

const showGuildMobileVoiceDock = computed(
  () =>
    !!(
      isCompactShell.value &&
      !isDmUiContext.value &&
      currentVoiceChannelId.value?.trim()
    ),
);

const hideChannelPanelVoiceChromeEffective = computed(() =>
  Boolean(showGuildMobileVoiceDock.value),
);

const voiceMobileDockReservePxComputed = computed(() =>
  showGuildMobileVoiceDock.value ? 120 : 0,
);

const mainContentVcDockBottomPadClass = computed(() =>
  showGuildMobileVoiceDock.value ? 'pb-[7.5rem]' : '',
);

function handleGuildMobileVcLobbyJoin() {
  const lobby = guildMobileVcLobby.value;
  if (!lobby) return;
  closeGuildMobileVcLobby();
  void (async () => {
    await handleJoinVoiceIfAllowed({
      channelId: lobby.channelId,
      channelName: lobby.channelName,
    });
    await followPendingVcActivityAfterJoin(lobby.channelId);
  })();
}

function handleGuildMobileVcLobbyChat() {
  const lobby = guildMobileVcLobby.value;
  if (!lobby) return;
  handleActiveChannelChange(lobby.channelId);
  expandVoiceSideChat();
  // Mobile lobby CTA should open side chat at full height immediately.
  if (isCompactShell.value && hasGuildChannelChrome.value) {
    voiceMobileSheetLevel.value = 2;
  }
  closeGuildMobileVcLobby();
  if (isCompactShell.value && hasGuildChannelChrome.value) {
    compactPagerPane.value = 1;
  }
}

function handleGuildMobileVcLobbyOpenAudioSettings() {
  closeGuildMobileVcLobby();
  openUserSettingsModal('Voice & Video');
}

const guildMobileVoiceDockCanUseVideo = computed(() => {
  if (isRolePreviewActiveForServer.value && !previewHasUiPermission('video')) {
    return false;
  }
  const ch = effectiveActiveChannel.value;
  const uid = currentUser.value?.id;
  if (ch?.type === 'stage' && uid) {
    return !!ch.voiceStageSpeakerByUserId?.[uid];
  }
  return true;
});

provide(LAYOUT_MEMBERS_COLUMN_KEY, {
  isVisible: membersColumnVisible,
  effectiveActiveChannel,
  searchText,
  filterChips,
  allChannels,
  users: usersForMentionAutocomplete,
  paginatedSearchResults,
  searchResultMessagesCount: computed(() => searchResultMessages.value.length),
  searchResultPage,
  totalPages,
  selectedServerName: computed(() => unref(selectedServer)?.name ?? ''),
  memberListUsers: memberListUsersResolved,
  presenceMobileByUserId,
  selectedServerId: computed(
    () => serverStore.selectedServerId ?? unref(selectedServer)?.id ?? 'echo',
  ),
  serverOwnerId: computed(() => {
    const id = unref(selectedServer)?.ownerId?.trim();
    return id || null;
  }),
  memberPanelCollapsed,
  memberListShowGuests,
  onUpdateMemberListShowGuests: (show: boolean) => {
    memberListShowGuests.value = show;
  },
  onSearchInput,
  addFilter,
  removeFilter,
  clearSearch,
  goToSearchPage,
  handleGoToMessage,
  searchLoading,
  searchError,
  searchScopeHint,
  onUpdateMemberPanelCollapsed: (next: boolean) => {
    memberPanelCollapsed.value = next;
    if (next) {
      markMemberPanelCollapsedByUser();
    } else {
      markMemberPanelExpandedByUser();
    }
    if (
      next &&
      isCompactShell.value &&
      hasGuildChannelChrome.value &&
      compactPagerPane.value === 2
    ) {
      compactPagerPane.value = 1;
    }
  },
  compactGuildMembersPaneFocused: computed(
    () =>
      isCompactShell.value &&
      hasGuildChannelChrome.value &&
      compactPagerPane.value === 2,
  ),
  onOpenMemberProfile: (
    payload: Parameters<typeof openMemberProfileFromMemberColumn>[0],
  ) => openMemberProfileFromMemberColumn(payload),
  currentUserId: computed(() => unref(currentUser)?.id),
  canModerateMemberUser: canModerateMemberInServer,
  canModerateMemberAction: canModerateMemberActionInServer,
  onModerateMemberUser: handleModerateUser,
  canChangeMemberNickname: canChangeMemberNicknameInServer,
  onChangeMemberNickname: handleChangeMemberNicknameFromMemberList,
  onMessageMemberUser: selectDM,
  resolveHighestRole: memberListResolveHighestRoleResolved,
  roleManagement: memberListRoleManagement,
  memberListLoading: membersColumnListLoading,
  echoMemberSectionOrdering: membersColumnEchoSectionOrdering,
});

watch(
  () => ({
    membersColumnVisible: membersColumnVisible.value,
    resolvedMemberCount: memberListUsersResolved.value.length,
    rawMemberCount: memberListUsers.value.length,
    roleHierarchyPending: isEchoServerRoleHierarchyPending.value,
    echoCapabilitiesForServerId: echoCapabilitiesForServerId.value,
    selectedServerId: serverStore.selectedServer?.id ?? null,
    isExploreView: unref(isExploreView),
    memberPanelCollapsedEffective: unref(memberPanelCollapsedEffective),
    memberPanelCollapsedRaw: unref(memberPanelCollapsed),
    isDmUiContext: unref(isDmUiContext),
    isServerEmptyOnboarding: unref(isServerEmptyOnboarding),
    isViewingVoiceChannel: unref(isViewingVoiceChannel),
    serverVoiceSurfaceActive: serverVoiceSurfaceActive.value,
    callOverlayType: unref(callOverlay).type,
    isMemberSurfaceSwitchLoading: unref(isMemberSurfaceSwitchLoading),
    membersColumnListLoading: membersColumnListLoading.value,
    effectiveActiveChannelId: effectiveActiveChannel.value?.id ?? null,
    serverMemberIdsLen:
      workspace.serverMemberIds.value[serverStore.selectedServer?.id ?? '']
        ?.length ?? null,
  }),
  (v) => {
    memberPanelDiag('AppLayout:gates', v as Record<string, unknown>);
  },
  { flush: 'post' },
);

const chatSurfaceSwitchLoading = computed(
  () => !!unref(isMessageSurfaceSwitchLoading) || !!unref(isOpeningDmThread),
);

/* ===== Forum posts: see useForumPostsController ===== */
const {
  forumPostsByForumId,
  forumPostsLoadingByForumId,
  forumPostsErrorByForumId,
  refreshForumPosts,
  createForumPost,
  patchForumPost,
  canManageForumPosts,
} = useForumPostsController({
  authSession,
  serverStore,
  workspace,
  mainSurface,
  isEchoGraphId,
  canManageThisChannel,
  findChannelContextById: _findChannelContextById as (
    id: string | null | undefined,
  ) => { channel: ChannelSummary } | null | undefined,
  handleGoToChannel,
  handleGoToMessage,
});

/**
 * Explore uses one scroll surface (banners + content) so `main-content-area` stays a single grid row.
 * Welcome-back is still the explore surface — include it here; otherwise `auto` + `1fr` rows steal vertical space.
 */
const explorePageUnifiedScroll = computed(() => !!unref(isExploreView));

const compactExplorePane = ref<0 | 1>(0);

/** Compact tablet: rail + fixed-width channel column + chat visible together. */
const useCompactGuildSplitShell = computed(
  () =>
    unref(isCompactShell) &&
    unref(hasGuildChannelChrome) &&
    !explorePageUnifiedScroll.value &&
    unref(isCompactGuildSplitShell),
);

/** Guild text/voice/forum: horizontal tri-pane swipe on narrow compact phones. */
const useCompactTriPaneShell = computed(
  () =>
    unref(isCompactShell) &&
    unref(hasGuildChannelChrome) &&
    !explorePageUnifiedScroll.value &&
    !useCompactGuildSplitShell.value,
);

const useCompactExploreShell = computed(
  () =>
    unref(isCompactShell) &&
    explorePageUnifiedScroll.value &&
    !welcomeBackExploreGate.value &&
    !inviteLandingActive.value,
);

/** Compact non–guild-chrome surfaces (explore, DM, onboarding, welcome gate). */
/** Compact DMs: full chat by default; swipe to reveal rail + DM list. */
const useCompactDmShell = computed(
  () =>
    unref(isCompactShell) &&
    unref(isDmUiContext) &&
    !useCompactTriPaneShell.value &&
    !useCompactExploreShell.value,
);

const useCompactStackShell = computed(
  () =>
    unref(isCompactShell) &&
    !useCompactDmShell.value &&
    !useCompactTriPaneShell.value &&
    !useCompactExploreShell.value,
);

watch(useCompactExploreShell, (on) => {
  if (on) compactExplorePane.value = 0;
});

const compactDmPane = ref<0 | 1>(1);

/** Compact DM shell: pane 1 = action rail + inbox list (Discord-style); pane 0 = chat thread. */
function showCompactDmRailPane() {
  if (isCompactShell.value) compactDmPane.value = 1;
}

function handleSelectDmTab() {
  selectDMTab();
  showCompactDmRailPane();
}

function handleOpenDmInboxFromRailOverflow() {
  openDmInboxFromRailOverflow();
  showCompactDmRailPane();
}

watch(useCompactDmShell, (on) => {
  if (!on) return;
  compactDmPane.value = 1;
  if (!isDMPanelOpen.value) isDMPanelOpen.value = true;
});

/** Any path that opens DM chrome on compact (controller toasts, deep links, etc.). */
watch(
  () =>
    [isCompactShell.value, activeRailTab.value, isDMPanelOpen.value] as const,
  ([compact, rail, dmOpen], prev) => {
    if (!compact || rail !== 'dm' || !dmOpen) return;
    if (!prev) return;
    const [, prevRail, prevOpen] = prev;
    if (prevRail !== 'dm' || !prevOpen) showCompactDmRailPane();
  },
);

const isDmThreadSurface = computed(
  () => unref(isDmUiContext) && unref(mainSurface)?.type === 'dmThread',
);

const appToastLayoutContext: AppToastLayoutContext = {
  echoChatBottomChromeInsetPx,
  useCompactTriPaneShell,
  useCompactGuildSplitShell,
  useCompactDmShell,
  hasGuildChannelChrome,
  isDmUiContext,
  activeChannelId,
  isDmThreadSurface,
  findChannelFormat: (channelId) => {
    const find = _findChannelContextById as (
      id: string | null | undefined,
    ) => { channel: ChannelSummary } | null | undefined;
    const ctx = find(channelId);
    const ch = ctx?.channel;
    if (!ch) return null;
    return {
      messageFormatTemplate: ch.messageFormatTemplate,
      messageFormatHard: ch.messageFormatHard === true,
    };
  },
  declineIncomingCall: declineDmCall,
};

watch(
  () =>
    [
      useCompactDmShell.value,
      unref(mainSurface)?.type ?? null,
      unref(activeChannelId),
    ] as const,
  (next, prev) => {
    if (!next[0]) return;
    if (!prev) return;
    /** Entering DM shell from servers/explore should land on rail + list, not auto-slide to chat. */
    if (!prev[0]) return;
    const surfaceChanged = next[1] !== prev[1];
    const channelChanged = next[2] !== prev[2];
    if (surfaceChanged || channelChanged) compactDmPane.value = 0;
  },
);

function openChannelPaneFromHeader() {
  if (useCompactDmShell.value) {
    compactDmPane.value = 1;
    return;
  }
  expandChannels();
}

/** compact: jump to the guild + channel list with this VC selected (from VC title / strip / activity header). */
function focusGuildVoiceChannelInSidebar() {
  const cid = currentVoiceChannelId.value?.trim();
  if (!cid) return;
  const sid = resolveEchoServerIdContainingChannel(
    cid,
    workspace.categoriesByServer.value,
  );
  if (sid && sid !== 'echo') {
    openServerSurface(sid, cid);
    openChannelPaneFromHeader();
    return;
  }
}

const { mobileShellGoBack } = useMobileShellNavigation({
  isCompactShell,
  useCompactTriPaneShell,
  useCompactGuildSplitShell,
  memberPanelCollapsed,
  useCompactExploreShell,
  useCompactDmShell,
  useCompactStackShell,
  isExploreView,
  compactPagerPane,
  compactExplorePane,
  compactDmPane,
  compactGuildTriPaneChannelPanelOpen,
  selectServersRailOnly,
  closeDMPanel,
});

provide(LAYOUT_MOBILE_SHELL_NAV_KEY, { mobileShellGoBack });

watch(
  () => {
    const cats = rawCategoriesForServer.value as
      | { channels?: unknown[] }[]
      | undefined;
    let rawChannelCount = 0;
    if (Array.isArray(cats)) {
      for (const c of cats) {
        rawChannelCount += Array.isArray(c?.channels) ? c.channels.length : 0;
      }
    }
    const pane = unref(compactPagerPane);
    return {
      isCompactShell: unref(isCompactShell),
      useCompactTriPaneShell: useCompactTriPaneShell.value,
      useCompactExploreShell: useCompactExploreShell.value,
      useCompactDmShell: useCompactDmShell.value,
      useCompactStackShell: useCompactStackShell.value,
      compactPagerPane: pane,
      compactPagerSurface:
        pane === 0 ? 'left_channels' : pane === 1 ? 'chat' : 'members',
      categoriesLen: cats?.length ?? 0,
      rawChannelCount,
      exploreUnifiedScroll: explorePageUnifiedScroll.value,
      isExploreView: unref(isExploreView),
      isDmUiContext: unref(isDmUiContext),
      isServerEmptyOnboarding: unref(isServerEmptyOnboarding),
      channelPanelCollapsed: unref(channelPanelCollapsed),
    };
  },
  (v) => {
    channelPanelDiag('AppLayout:compactShell', v as Record<string, unknown>);
  },
  { flush: 'post' },
);

const friendshipKnown = computed(
  () =>
    echoSyncCapabilities.isMockDataMode ||
    workspace.socialGraphStatus.value === 'ready',
);

/** DM/group call thread not focused — mirror CallView speaking ring on rail PFP. */
const railProfileDmCallAwaySpeaking = computed(() => {
  if (callOverlay.value.type !== 'dmCall') return false;
  if (!dmCallWithUserId.value?.trim()) return false;
  if (dmCallMatchesActiveChannel.value === true) return false;
  if (dmCallMuted.value || dmCallDeafened.value) return false;
  return localSpeaking.value;
});

/** Guild VC connected but UI is another server, Explore, or DMs — same ring while mic is hot. */
const railProfileGuildVcAwaySpeaking = computed(() => {
  const vid = currentVoiceChannelId.value?.trim();
  if (!vid) return false;
  if (
    channelPanelVcMutedEffective.value ||
    channelPanelVcDeafenedEffective.value
  )
    return false;
  if (!localSpeaking.value) return false;
  if (unref(isDmUiContext)) return true;
  if (unref(isExploreView)) return true;
  const find = _findChannelContextById as (
    id: string | null | undefined,
  ) => { channel: ChannelSummary } | null | undefined;
  const ch = find(vid)?.channel;
  if (ch?.type === 'voice') return false;
  // Voice channel not in the selected server's tree means the user navigated away.
  return true;
});

const railProfileAwaySelfSpeaking = computed(
  () =>
    railProfileDmCallAwaySpeaking.value || railProfileGuildVcAwaySpeaking.value,
);

const chatSurfaceCurrentUser = computed(() => currentUser.value ?? null);
const chatSurfaceGetChannelDisplayName = (name?: string) =>
  getChannelDisplayName(name ?? '');
const modalsCurrentUser = computed(() =>
  isAuthenticated.value ? (currentUser.value ?? null) : null,
);
const leftChromeCurrentUserForServerList = computed(() =>
  isAuthenticated.value ? (currentUser.value ?? null) : null,
);
const leftChromeCurrentUser = computed(() => currentUser.value);

provide(LAYOUT_CHAT_SURFACE_KEY, {
  dmSurfaceAdapter,
  profileSurfaceAdapter,
  chatHeaderAdapter,
  mainSurface,
  callOverlay,
  surfaceSwitchLoading: chatSurfaceSwitchLoading,
  guildShellSettling: isGuildShellSettling,
  dmThreadSwitchLoading: computed(() => !!unref(isOpeningDmThread)),
  channelPanelCollapsed,
  memberPanelCollapsed: memberPanelCollapsedEffective,
  memberPanelCollapsedRaw: memberPanelCollapsed,
  compactGuildTriPaneNav: useCompactTriPaneShell,
  compactGuildSplitNav: useCompactGuildSplitShell,
  isCompactShell,
  narrowChannelPanelForActivityOverflowStep,
  isDmUiContext,
  isInDMMode,
  isViewingVoiceChannel,
  startMemberResize,
  resetMemberWidth,
  effectiveActiveChannel,
  liveChannelCapabilities,
  isInDMChat,
  dmCallMatchesActiveChannel,
  activeDmThreadCallUi,
  isExpandedProfileSidePanel,
  isExpandedProfileModalOpen,
  isGroupOverviewOpen,
  dmPartnerUser,
  openExpandedProfilePanelForUserId,
  openExtendedProfileModalForUserId,
  handleExpandedProfileOpenProfile,
  isGroupDM,
  activeGroupDM,
  icons,
  dmActiveTab,
  getChannelIcon,
  getChannelDisplayName: chatSurfaceGetChannelDisplayName,
  togglePinsDropdown,
  expandChannels: openChannelPaneFromHeader,
  collapseMembers,
  expandMembers,
  isRolePreviewActiveForServer,
  rolePreview,
  clearRolePreview,
  memberPanelWidth,
  searchText,
  filterChips,
  allChannels,
  users: computed(() => workspace.users.value),
  usersForMentionAutocomplete,
  rolesForMentionAutocomplete,
  paginatedSearchResults,
  searchResultMessagesCount: computed(() => searchResultMessages.value.length),
  searchResultPage,
  totalPages,
  selectedServerName: computed(() => unref(selectedServer)?.name ?? ''),
  onSearchInput,
  addFilter,
  removeFilter,
  clearSearch,
  goToSearchPage,
  handleGoToMessage,
  searchLoading,
  searchError,
  searchScopeHint,
  dmCallWithUserId,
  dmCallRinging,
  dmCallAwaitingAccept,
  dmCallRingUi,
  dmCallLobbyAfterSelfLeave,
  dmCallIncoming,
  dmCallRingRemoteVanishing,
  endDmCall,
  leaveDmCallVoice,
  rejoinDmCallVoice,
  answerDmCall,
  declineDmCall,
  startDmCall,
  isPinsDropdownOpen,
  pinsButtonRefDm,
  pinsButtonRefServer,
  openGroupDMModal,
  startGroupCall,
  openGroupOverviewPanel: ((gid?: string) =>
    openGroupOverviewPanel(gid ?? '')) as (groupId?: string) => void,
  activeGroupCallMembers,
  currentUser: chatSurfaceCurrentUser,
  linkedDiscordUserId,
  dmCallVideo,
  dmCallScreenshare,
  dmCallMuted,
  dmCallDeafened,
  vcMuted: channelPanelVcMutedEffective,
  vcDeafened: channelPanelVcDeafenedEffective,
  vcVideo: channelPanelVcVideoEffective,
  vcScreenshare: channelPanelVcScreenshareEffective,
  onToggleDmCallVideo: () => onDmCallVcVideo(!unref(dmCallVideo)),
  onToggleDmCallScreenshare: () =>
    onDmCallVcScreenshare(!unref(dmCallScreenshare)),
  onToggleDmCallMuted: toggleDmCallMuted,
  onToggleDmCallDeafened: () => applyDmCallDeafened(!unref(dmCallDeafened)),
  onGuildChannelVcMuted,
  onGuildChannelVcDeafened,
  onGuildChannelVcVideo: (next: boolean) => {
    (_onGuildChannelVcVideo as (next: boolean) => void)(next);
  },
  onGuildChannelVcScreenshare: (next: boolean) => {
    (_onGuildChannelVcScreenshare as (next: boolean) => void)(next);
  },
  handleChannelVoicePanelLeave,
  onSetDmCallFullscreen: (next: boolean) => {
    dmCallFullscreen.value = next;
  },
  dmCallCallViewParticipants,
  pinsDropdownRect,
  pinnedMessagesForDropdown,
  pinPreview,
  presenceByUserId,
  presenceMobileByUserId,
  closePinsDropdown,
  goToPinnedMessage,
  activeVoiceChannelParticipants,
  selectedServerId: computed(
    () => serverStore.selectedServerId ?? unref(selectedServer)?.id ?? 'echo',
  ),
  activeChannelMessagesMap,
  sendMessage,
  onRequestForward: openForwardMessagePicker,
  voiceSideChatCollapsed,
  voiceSideChatWidth,
  startVoiceSideChatResize,
  resetVoiceSideChatWidth,
  expandVoiceSideChat,
  toggleVoiceSideChat,
  voiceMobileSheetLevel,
  bumpVoiceMobileChatFromCallScrollUp,
  bumpVoiceMobileChatFromCallScrollDown,
  voiceMobileDockReservePx: voiceMobileDockReservePxComputed,
  currentVoiceChannelId,
  handleCallViewOpenProfile,
  canModerateVcParticipant: canModerateMemberInServer,
  canVcModerateParticipantAction: canVcModerateMember,
  handleVcModerate,
  handlePollVote,
  editMessage,
  deleteMessage,
  handleReact,
  topReactions,
  removeReactionFavorite,
  handleGoToChannel,
  openServerSurfaceForChannel: (channelId: string) => {
    const cid = channelId.trim();
    if (!cid) return;
    const sid = resolveEchoServerIdContainingChannel(
      cid,
      workspace.categoriesByServer.value,
    );
    if (sid && sid !== 'echo') {
      openServerSurface(sid, cid);
      return;
    }
    handleGoToChannel(cid);
  },
  focusGuildVoiceChannelInSidebar,
  openMemberProfile,
  openProfileFromContextMenu,
  canModerateAuthor: canModerateMessageAuthor,
  handleModerateUser,
  isDMPanelOpen,
  friendIds: computed(() => workspace.friendIds.value),
  friendIdsByUserId: computed(() => workspace.friendIdsByUserId.value),
  friendRequestsIncoming: computed(
    () => workspace.friendRequestsIncoming.value,
  ),
  friendRequestsOutgoing: computed(
    () => workspace.friendRequestsOutgoing.value,
  ),
  blockedUserIds: computed(() => workspace.blockedUserIds.value),
  selectedDMUserId,
  messageRequests: computed(() => workspace.messageRequests.value),
  selectedMessageRequestId,
  messages: computed(() => workspace.messages.value),
  echoDmPeerByChannelId: computed(() => echoDmPeerByChannelId.value),
  selectDM,
  acceptFriendRequest,
  declineFriendRequest,
  cancelFriendRequest,
  sendFriendRequest,
  ignoreMessageRequest,
  handleAcceptMessageRequest,
  returnFromMessageRequests,
  dmMentionNotifications,
  mentionNotificationHydrationLoading,
  resolveDmMentionNotificationChannelLabel,
  resolveDmMentionNotificationAuthorName,
  resolveDmMentionNotificationRowPreview,
  dmNotificationReadStateByChannelId,
  mentionNotificationCategoriesByServer,
  mentionNotificationServers,
  dmNotificationsReadPreset,
  dmNotificationsSourceKey,
  onUpdateDmNotificationsReadPreset: (preset: 'all' | 'unread' | 'read') => {
    dmNotificationsReadPreset.value = preset;
  },
  onUpdateDmNotificationsSourceKey: (key: string) => {
    dmNotificationsSourceKey.value = key;
  },
  onOpenMentionNotification,
  onMarkMentionNotificationRead,
  isPersistedEchoDmThread,
  dmCallFullscreen,
  pinnedMessageIdsForCurrentChannel,
  handlePinMessage,
  handleUnpinMessage,
  expandedProfile,
  isExpandedProfileFriend,
  isExpandedProfileOutgoingRequest,
  friendshipKnown,
  expandedProfileNote,
  onUpdateExpandedProfileNote: handleExpandedProfileNoteFromLayout,
  onExpandedProfileModalUpdate,
  handleExpandedProfileOpenServer,
  expandDmProfileToFullModal,
  handleExpandedProfileOpenDM,
  handleExpandedProfileSendFriendRequest,
  handleExpandedProfileCancelOutgoingFriendRequest,
  handleExpandedProfileAcceptIncomingFriendRequest,
  handleExpandedProfileDeclineIncomingFriendRequest,
  handleExpandedProfileRemoveFriend,
  isExpandedProfileTargetBlocked,
  guestFriendsLocked,
  handleProfileBlockUser,
  handleProfileUnblockUser,
  handleProfileReportUser,
  onCloseGroupOverview: () => {
    isGroupOverviewOpen.value = false;
  },
  handleKickGroupDmMember,
  handleLeaveGroupDm,
  openGroupSettingsFromHeader,
  resolveAuthorRole: memberListResolveHighestRole,
  showNsfwChatGate,
  acknowledgeNsfwChannel,
  declineNsfwGate,
  onOpenExplore: selectExploreTab,
  remoteParticipants: vcRemoteParticipants,
  lkRoom: liveKitRoom,
  mirrorLocalCamera: vcMirrorCamera,
  getLocalScreenTrack,
  getLocalCameraTrack,
  getRemoteParticipantVolume,
  setRemoteParticipantVolume,
  onRequestFullscreenStream: (pid: string) => {
    closeVcActivity();
    fullscreenStreamParticipantId.value = pid;
  },
  fullscreenStreamParticipantId,
  vcActivityUi,
  openVcActivityPicker,
  openVcActivityYoutubeBrowse,
  openVcActivityWatchTogether,
  openVcActivityWordle,
  openVcActivityHangman,
  openVcActivitySkriggles,
  openVcActivityTicTacToe,
  vcHangmanActivity,
  hangmanRosterUserIds,
  commitVcHangmanWord,
  requestVcHangmanGuessLetter,
  requestVcHangmanNextRound,
  vcSkrigglesActivity,
  skrigglesRosterUserIds,
  skrigglesCanvasEvents,
  commitSkrigglesWordChoice,
  submitSkrigglesGuess,
  updateSkrigglesSettings,
  startSkrigglesGame,
  advanceSkrigglesRound,
  publishSkrigglesStrokeBatch,
  publishSkrigglesCanvasCmd,
  publishSkrigglesCanvasSnapshot,
  tickSkrigglesTimers,
  vcTicTacToeActivity,
  vcTicTacToePendingInvite,
  sendVcTicTacToeChallenge,
  respondVcTicTacToeInvite,
  dismissVcTicTacToeInvite,
  requestVcTicTacToeMove,
  requestVcTicTacToeRematch,
  vcCodenamesActivity,
  codenamesRosterUserIds,
  vcCodenamesSpymasterKey,
  commitVcCodenamesDeal,
  requestVcCodenamesSetup,
  requestVcCodenamesClue,
  requestVcCodenamesReveal,
  requestVcCodenamesEndTurn,
  requestVcCodenamesNewGame,
  requestVcCodenamesPushKeyToOrchestrator,
  openVcActivityOpenGuessr,
  openVcActivitySkribblIo,
  openVcActivityGarticPhone,
  openVcActivityKrunker,
  openVcActivityCodenames,
  openVcActivityRichup,
  openVcActivityGooberDash,
  openVcActivitySmashKarts,
  openVcActivityClusterRush,
  setVcActivityYoutubeVideo,
  setVcYoutubeBrowseOpen,
  addVcYoutubeToQueue,
  removeVcYoutubeFromQueue,
  moveVcYoutubeInQueue,
  playVcYoutubeAtIndex,
  playVcYoutubeNext,
  playVcYoutubePrevious,
  setWatchTogetherLobbyRole,
  ensureWatchTogetherSessionId,
  patchWatchTogetherUi,
  setWatchTogetherBrowseOpen,
  startWatchTogetherSession,
  playWatchTogetherAtIndex,
  closeVcActivity,
  vcYoutubeRemotePlayback,
  publishVcYoutubePlaybackSync,
  vcYoutubePlaybackShouldPublish,
  vcWatchTogetherRemotePlayback,
  publishVcWatchTogetherPlaybackSync,
  vcWatchTogetherPlaybackShouldPublish,
  effectiveVcActivityKingUserId,
  canShowDiscordChannelImport: serverSettingsCanManageServer,
  forumPostsByForumId,
  forumPostsLoadingByForumId,
  forumPostsErrorByForumId,
  refreshForumPosts,
  createForumPost,
  patchForumPost,
  canManageForumPosts,
  openChannelSettings,
  findChannelContextById: _findChannelContextById as (
    channelId: string,
  ) => { channel: ChannelSummary; categoryId: string } | null,
});

const modalsGroupSettingsName = computed(() => {
  const gid = unref(activeGroupSettingsId);
  const gdm = unref(groupDMs) as Record<string, { name: string }> | undefined;
  if (gid && gdm && gdm[gid]) return gdm[gid].name;
  return unref(effectiveActiveChannel)?.name ?? '';
});

const modalsGroupSettingsPfp = computed(() => {
  const gid = unref(activeGroupSettingsId);
  const gdm = unref(groupDMs) as Record<string, { pfp?: string }> | undefined;
  if (gid && gdm && gdm[gid]) return gdm[gid].pfp ?? '';
  return unref(activeGroupDM)?.pfp ?? '';
});

const moderationCanPurgeBanMessages = computed(() => {
  const s = unref(selectedServer);
  if (!s?.id || !isEchoGraphId(s.id)) return false;
  return (
    unref(echoCapabilitiesForServerId) === s.id &&
    unref(_echoCanManageMessages) === true
  );
});

provide(LAYOUT_MODALS_KEY, {
  profileSurfaceAdapter,
  currentUser: modalsCurrentUser,
  onOpenSettingsFromProfileBar: openUserSettingsModal,
  isAuthModalOpen,
  authModalInitialLoginEntry,
  authModalPasskeyOnOpen,
  authModalInitialTab,
  authModalInitialSubView,
  onUpdateAuthModal: (next: boolean) => {
    isAuthModalOpen.value = next;
  },
  isAddServerModalOpen,
  addServerInitialView,
  canImportDiscord: true,
  discoverableServers: exploreDiscoverableServers,
  onUpdateAddServerModal: (next: boolean) => {
    isAddServerModalOpen.value = next;
  },
  onRequestDiscordLinkFromAddServer: openUserSettingsToDiscordFromAddServer,
  onCreateServer: handleCreateServer,
  onJoinDiscoverableServer: handleJoinDiscoverableServer,
  onJoinWithInviteLink: handleJoinWithInviteLink,
  addServerJoinError,
  addServerCreateBusy,
  addServerJoinBusy,
  addServerJoinInvitePrefill,
  exploreDirectoryJoinBusy,
  isInviteModalOpen,
  selectedServerName: computed(
    () => unref(selectedServer)?.name ?? 'this server',
  ),
  inviteLink: inviteLinkForServer,
  inviteLinkLookupPending,
  inviteApplicationsEnabled,
  inviteJoinLinksEnabled,
  inviteCanCreateDirectHexInvite,
  inviteDirectHexInviteLink: directHexInviteLink,
  inviteDirectHexInviteBusy: directHexInviteBusy,
  onCreateInviteDirectHex: createDirectHexInvite,
  inviteModalVoiceChannelId,
  inviteModalVoiceChannelName,
  inviteableFriends,
  onUpdateInviteModal: (next: boolean) => {
    isInviteModalOpen.value = next;
  },
  onInviteFriend: handleInviteFriend,
  isServerSettingsModalOpen,
  selectedServerForSettings: computed(() => {
    const s = unref(selectedServer);
    return s && s.id !== 'echo' ? s : null;
  }),
  memberListUsers,
  serverSettingsMemberUsers: serverSettingsMemberUsersResolved,
  resolveMemberHighestRole: memberListResolveHighestRole,
  canModerateMemberAction: canModerateMemberActionInServer,
  onRequestModerateMember: handleModerateUser,
  onUpdateServerSettingsModal: onServerSettingsModalUpdate,
  serverSettingsModalInitialSection,
  onUpdateServerSettingsModalActiveSection:
    onServerSettingsModalActiveSectionUpdate,
  serverSettingsCanManageRoles,
  serverSettingsCanManageServer,
  deleteServerEnabled: canDeleteCurrentServer,
  onEchoWorkspaceRefresh: () => void hydrateEchoFromApi(),
  onEchoRoleCatalogRefresh: () => void refreshEchoRoleData(),
  onServerDeleted: handleServerDeleted,
  onPreviewRoleFromSettings: handleStartRolePreview,
  serverSettingsGuildStructureEnabled,
  serverSettingsStructureCategories: categoriesForServer,
  serverSettingsOnChannelReorder: handleChannelReorder,
  serverSettingsOnCategoryReorder: handleCategoryReorder,
  serverSettingsIsDiscordImportedServer: computed(() => {
    const s = unref(selectedServer) as { discordGuildId?: string } | undefined;
    return !!s?.discordGuildId?.trim();
  }),
  isGroupDmSettingsOpen: isGroupDMSettingsOpen,
  groupDmSettingsInitialFocus,
  groupSettingsId,
  groupSettingsName: modalsGroupSettingsName,
  groupSettingsPfp: modalsGroupSettingsPfp,
  groupSettingsMembers,
  onUpdateGroupDmSettingsOpen: (next: boolean) => {
    isGroupDMSettingsOpen.value = next;
    if (!next) groupDmSettingsInitialFocus.value = null;
  },
  onUpdateGroupFromSettings: handleUpdateGroupFromSettings,
  onRemoveGroupDmMember,
  onLeaveGroupDm: handleLeaveGroupDm,
  onOpenAddMembersToGroupDm,
  isGroupDmModalOpen: isGroupDMModalOpen,
  dmGroupFriends,
  groupDmPreselectedIds: groupDMPreselectedIds,
  groupDmLockedIds: groupDMLockedIds,
  groupDmMaxMembers: groupDmMaxMembers,
  onUpdateGroupDmModal: (next: boolean) => {
    isGroupDMModalOpen.value = next;
  },
  onCreateGroupDm: handleCreateGroupDM,
  isSettingsModalOpen,
  settingsModalInitialSection,
  onUpdateSettingsModal: onUserSettingsModalUpdate,
  onUpdateSettingsModalActiveSection: onSettingsModalActiveSectionUpdate,
  onSettingsGuestUpgraded: () => void onGuestAccountUpgraded(),
  onSettingsGuestSignInExisting: onGuestUpgradeSignInFromSettings,
  isDmUiContext,
  isMemberPopoutOpen,
  isMemberPopoutFriend,
  isMemberPopoutCanSendFriendRequest,
  activeMemberProfile,
  memberPopoutAnchor,
  activeMemberNote,
  memberListRoleManagement,
  memberPopoutOpenRolesPanel,
  onUpdateMemberPopoutOpen: onMemberPopoutOpenUpdate,
  onUpdateMemberNote: (note: string) =>
    updateProfileNote(unref(activeMemberProfile)?.id ?? null, note),
  onOpenExpandedProfileFromMemberPopout: openExpandedProfileFromMemberPopout,
  onMemberPopoutQuickDm: (p: { userId: string; text: string }) =>
    void handleMemberPopoutQuickDm(p.userId, p.text),
  onMemberPopoutOpenDm: (userId: string) =>
    void handleExpandedProfileOpenDM(userId),
  onMemberPopoutSendFriendRequest: handleExpandedProfileSendFriendRequest,
  isSelfProfilePopoutOpen,
  selfProfile,
  selfProfileAnchor,
  customStatus,
  onUpdateSelfProfilePopoutOpen: (next: boolean) => {
    isSelfProfilePopoutOpen.value = next;
  },
  onUpdateCustomStatus: handleUpdateCustomStatus,
  onUpdateCurrentUserStatus: updateCurrentUserStatus,
  onOpenExpandedProfileFromSelfPopout: openExpandedProfileFromSelfPopout,
  isExpandedProfileSidePanel,
  isExpandedProfileModalOpen,
  expandedProfilePresenceByUserId: presenceByUserId,
  expandedProfilePresenceMobileByUserId: presenceMobileByUserId,
  expandedProfile,
  isExpandedProfileFriend,
  isExpandedProfileOutgoingRequest,
  friendshipKnown,
  friendIds: computed(() => workspace.friendIds.value),
  friendIdsByUserId: computed(() => workspace.friendIdsByUserId.value),
  friendRequestsIncoming: computed(
    () => workspace.friendRequestsIncoming.value,
  ),
  friendRequestsOutgoing: computed(
    () => workspace.friendRequestsOutgoing.value,
  ),
  blockedUserIds: computed(() => workspace.blockedUserIds.value),
  expandedProfileNote,
  onUpdateExpandedProfileNote: handleExpandedProfileNoteFromLayout,
  onExpandedProfileModalUpdate,
  onOpenEditProfileFromExpandedProfile: () => {
    onExpandedProfileModalUpdate(false);
    openUserSettingsModal('Profile');
  },
  onExpandedProfileOpenServer: handleExpandedProfileOpenServer,
  onExpandedProfileOpenProfile: handleExpandedProfileOpenProfile,
  onExpandedProfileOpenDm: handleExpandedProfileOpenDM,
  onExpandedProfileSendFriendRequest: handleExpandedProfileSendFriendRequest,
  onExpandedProfileCancelOutgoingFriendRequest:
    handleExpandedProfileCancelOutgoingFriendRequest,
  onExpandedProfileAcceptIncomingFriendRequest:
    handleExpandedProfileAcceptIncomingFriendRequest as unknown as (
      userId: string,
    ) => void,
  onExpandedProfileDeclineIncomingFriendRequest:
    handleExpandedProfileDeclineIncomingFriendRequest as unknown as (
      userId: string,
    ) => void,
  onExpandedProfileRemoveFriend: handleExpandedProfileRemoveFriend,
  isExpandedProfileTargetBlocked,
  guestFriendsLocked,
  expandedProfileHideOpenDmButton,
  isMemberPopoutTargetBlocked,
  currentUserIdForProfiles: computed(() => unref(currentUser)?.id),
  onProfileBlockUser: handleProfileBlockUser,
  onProfileUnblockUser: handleProfileUnblockUser,
  onProfileReportUser: handleProfileReportUser,
  moderationModalOpen,
  moderationAction,
  moderationTargetUser,
  moderationServerName: computed(() => unref(selectedServer)?.name ?? 'Server'),
  moderationCanPurgeBanMessages,
  onUpdateModerationModalOpen: (v: boolean) => {
    moderationModalOpen.value = v;
  },
  onModerationModalConfirm,
  isLeaveServerModalOpen,
  leaveServerModalVariant,
  leaveServerModalServerName,
  onUpdateLeaveServerModal: onLeaveServerModalUpdate,
  onLeaveServerModalConfirm: confirmLeaveServerFromModal,
  isJoinServerConfirmModalOpen,
  joinServerConfirmPreview,
  joinServerConfirmBusy,
  onUpdateJoinServerConfirmModal: onJoinServerConfirmModalUpdate,
  onJoinServerConfirmModalConfirm: confirmJoinServerFromModal,
  isServerApplicationModalOpen,
  serverApplicationPayload,
  serverApplicationBusy,
  onUpdateServerApplicationModal: onServerApplicationModalUpdate,
  onServerApplicationModalSubmitted: confirmServerApplicationSubmittedFromModal,
  isEventDetailModalOpen,
  eventDetailView,
  onUpdateEventDetailModal: (next: boolean) => {
    if (next) {
      isEventDetailModalOpen.value = true;
      return;
    }
    closeGuildEventDetailModal();
  },
  onEventDetailRsvp: (payload: { status: 'going' | 'declined' }) => {
    const ev = eventDetailView.value;
    if (!ev) return;
    void submitGuildEventRsvp({
      serverId: ev.serverId,
      eventId: ev.eventId,
      status: payload.status,
      closeDetailOnDecline: payload.status === 'declined',
    });
  },
  onEventDetailOpenLocation: () => {
    const ev = eventDetailView.value;
    if (!ev) return;
    closeGuildEventDetailModal();
    isDMPanelOpen.value = false;
    navigateGuildEventOpenPayload({
      serverId: ev.serverId,
      channelId: ev.channelId,
      customLocation: ev.customLocation,
    });
  },
});

provide(CALL_VIEW_FULLSCREEN_STREAM_ID_KEY, fullscreenStreamParticipantId);

watchBugHunterAppContext(
  computed(() => serverStore.selectedServerId ?? undefined),
  activeChannelId,
);

const bugHunterStore = useBugHunterStore();
const { bugHunterEnabled } = storeToRefs(bugHunterStore);
/** Bug Hunter is device-local; guests and full accounts both need the rail button when enabled. */
const showBugHunterOnRail = computed(
  () => isAuthenticated.value && bugHunterEnabled.value,
);
const isBugReportModalOpen = ref(false);

const mainContentAreaGridColumns = computed(() => {
  if (unref(isCompactShell)) return 'minmax(0, 1fr)';
  // Keep grid tracks aligned with whether the members column actually mounts
  // (`AppLayoutMembersColumn` is `v-if="isVisible"`). Otherwise we reserve a
  // second track (e.g. 340px) with nothing in it.
  if (!membersColumnVisible.value) return 'minmax(0, 1fr)';
  return mainContentColumnsEffective.value;
});

const compactMembersSurfaceVisible = computed(
  () =>
    !unref(isExploreView) &&
    !unref(isDmUiContext) &&
    !unref(isServerEmptyOnboarding) &&
    !unref(isViewingVoiceChannel) &&
    unref(callOverlay).type !== 'dmCall' &&
    unref(mainSurface).type !== 'serverPaper',
);

const mainContentGridTemplateRows = computed(() =>
  explorePageUnifiedScroll.value ? 'minmax(0, 1fr)' : 'auto minmax(0, 1fr)',
);

/* ===== Fullscreen stream overlay: see useFullscreenStreamOverlay ===== */
const {
  fullscreenStreamTrack,
  fullscreenStreamAudioTrack,
  fullscreenStreamName,
  fullscreenStreamPfp,
  fullscreenStreamIsScreenShare,
} = useFullscreenStreamOverlay({
  fullscreenStreamParticipantId,
  callOverlay,
  dmCallWithUserId,
  dmCallCallViewParticipants,
  activeVoiceChannelParticipants,
  currentUser,
  getLocalScreenTrack,
  getLocalCameraTrack,
});

provide(CHAT_MESSAGE_NAV_BRIDGE_KEY, chatMessageNavBridge);
provide('echoChannelHistory', echoChannelHistory);
provide('joinEchoServerWithInvite', _joinEchoServerWithInviteRaw);
provide(ECHO_VOICE_PROCESSING_KEY, {
  reapplyVoiceProcessing,
  setVcVideoQuality,
  setMicTestListenDeafen,
});

provideSpeakingState({
  speakingMap,
  localSpeaking,
  localAudioLevel,
  localUserId: computed(() => currentUser.value?.id ?? null),
});

provideChatPermissions(
  createChatPermissions({
    activeChannelId,
    activeChannel: effectiveActiveChannel,
    rawCategories: rawCategoriesForServer,
    rolePreview,
    selectedServerId: computed(() => serverStore.selectedServerId ?? undefined),
    isRolePreviewActiveForServer,
    isInDMMode,
    isGroupDM,
    liveChannelCapabilities,
  }),
);

provide(LAYOUT_SERVER_RAIL_ACTIONS_KEY, {
  handleServerRailSettings,
  handleServerRailInvite,
  handleServerRailNotificationSettings,
  handleServerRailMarkRead,
  handleServerRailMarkAllRead,
  handleDmRailMarkAllRead,
  handleServerRailLeave,
  openServerFromMore,
});

const { emailVerificationFlash } = storeToRefs(authSession);

const showDiscordProfileImportPrompt = ref(false);

watch(
  () => ({
    authed: authSession.isAuthenticated,
    guest: authSession.backendUser?.isGuest,
    user: authSession.backendUser,
    discord: linkedDiscordUserId.value,
    discordState: linkedDiscordState.value,
  }),
  (s) => {
    if (
      !s.authed ||
      s.guest ||
      echoSyncCapabilities.isMockDataMode ||
      isDiscordProfileImportPromptDone() ||
      !s.discord
    ) {
      showDiscordProfileImportPrompt.value = false;
      return;
    }
    if (hasImportedDiscordProfileFields(s.user, s.discordState)) {
      showDiscordProfileImportPrompt.value = false;
      return;
    }
    if (!shouldOfferDiscordProfileImport(s.user)) {
      showDiscordProfileImportPrompt.value = false;
      return;
    }
    showDiscordProfileImportPrompt.value = true;
  },
  { immediate: true },
);

const {
  desktopUpdateBannerVisible,
  desktopUpdatePendingVersion,
  onDesktopUpdateBannerInstall,
  onDesktopUpdateBannerDismiss,
  primaryFlowFailureBanner,
  showServerDownGate,
  serverDownGateBind,
  uiErrorBanner,
  uiErrorRetryBusy,
  dismissPrimaryFlowFailureBanner,
  dismissUiErrorBanner,
  onUiErrorRetry,
  checkServerHealthNow,
} = useAppLayoutPlatformLifecycle({
  dmCallRingUi,
  openDmInboxFromRailOverflow,
  openUserSettingsModal,
});

/* Main-surface gate stack (outage / invite landing / welcome-back / explore vs chat).
 * Consumed by AppLayoutMainSurface across every shell variant. */
provide(LAYOUT_MAIN_SURFACE_KEY, {
  explorePageUnifiedScroll,
  showServerDownGate,
  serverDownGateBind,
  checkServerHealthNow,
  inviteLandingActive,
  inviteLandingPreview,
  inviteLandingLoading,
  inviteLandingError,
  inviteLandingPersistBeforeOAuth,
  isCompactShell,
  mobileShellGoBack,
  openAuthModal,
  welcomeBackExploreGate,
  welcomeBackExploreMemberEmptyDirectory,
  openAddServerModal,
  onJoinServerFromShell,
  exploreDiscoverableServers,
  exploreDirectoryJoinBusy,
  handleJoinDiscoverableServer,
});

// Global shell keyboard shortcuts (voice mute/deafen, search, mark-read, rail 1–5).
// Owns its own window keydown listener; see useAppLayoutGlobalShortcuts.
useAppLayoutGlobalShortcuts({
  dmCallWithUserId,
  dmCallDeafened,
  channelPanelVcMutedEffective,
  channelPanelVcDeafenedEffective,
  serverStore,
  toggleDmCallMuted,
  applyDmCallDeafened,
  onGuildChannelVcMuted,
  onGuildChannelVcDeafened,
  markActiveChannelAsRead,
  openServerSurface,
});

onMounted(() => {
  void nextTick(() => {
    if (typeof ResizeObserver === 'undefined') return;
    const el = mainContentAreaEl.value;
    if (!el) return;
    memberPanelMainWidthObserver = new ResizeObserver(() => {
      maybeAutoCollapseMemberPanelForMainWidth();
      maybeAutoCollapseDmProfilePanelForMainWidth();
    });
    memberPanelMainWidthObserver.observe(el);
    maybeAutoCollapseMemberPanelForMainWidth();
    maybeAutoCollapseDmProfilePanelForMainWidth();
  });

  void nextTick(() => {
    try {
      // Legacy flag: new Discord users land on a guest session; onboarding modal
      // will appear automatically for all guests, so we just clear this key.
      if (sessionStorage.getItem('echo_discord_guest_signup') === '1') {
        sessionStorage.removeItem('echo_discord_guest_signup');
      }
    } catch {
      /* ignore */
    }
  });
});

onUnmounted(() => {
  disposeAppLayoutSideEffects();
});

function onUiErrorCreateAccount() {
  openAuthModal({ tab: 'register' });
  dismissUiErrorBanner();
}

const sessionReturningUserHint = computed(
  () => !!sessionEndedMessage.value && hasPriorRegistration(),
);

provide(LAYOUT_INFO_BANNERS_KEY, {
  showApiFetchErrorBanner,
  apiErrorText: computed(() => workspace.apiError.value),
  sessionEndedMessage,
  sessionReturningUserHint,
  isMockDataMode: false,
  echoWorkspaceError,
  showWelcomeBackHint: showWelcomeBackSlimBanner,
  emailVerificationFlash,
  showUnverifiedEmailBanner,
  showGuestUpgradeBanner,
  emailBannerResendBusy,
  emailBannerResendMessage,
  emailBannerResendError,
  discordBotExportReadyGuildName: discordBotExportReadyGuildNameForBanner,
  primaryFlowFailureBanner,
  suppressPrimaryFlowFailureBanner: showServerDownGate,
  uiErrorMessage: computed(() => uiErrorBanner.value?.message ?? null),
  uiErrorSeverity: computed(() => uiErrorBanner.value?.severity ?? 'error'),
  uiErrorShowRetry: computed(() => !!uiErrorBanner.value?.retryAction),
  uiErrorShowCreateAccount: computed(() => {
    const b = uiErrorBanner.value;
    if (!b?.message) return false;
    return (
      b.code === 'GUEST_FORBIDDEN' ||
      b.message.includes('Create an account to use this feature')
    );
  }),
  uiErrorRetryBusy,
  onSessionSignIn: () => openAuthModal(),
  onSessionDismiss: () => authSession.clearSessionEndedMessage(),
  onWelcomeBackSignIn: () => openAuthModal(),
  onWelcomeBackContinueGuest: () => {},
  onEmailVerificationFlashDismiss: dismissEmailVerificationFlash,
  onGuestUpgradeOpenSettings: onGuestUpgradeBannerOpenSettings,
  onGuestUpgradeDismiss: dismissGuestUpgradeBannerClick,
  onUnverifiedEmailDismiss: dismissUnverifiedEmailBannerClick,
  onUnverifiedEmailResend: onUnverifiedEmailResend,
  onUnverifiedEmailChangeEmail: onUnverifiedEmailChangeEmail,
  onDiscordBotExportReadyDismiss: dismissDiscordBotExportReadyBanner,
  onPrimaryFlowFailureDismiss: dismissPrimaryFlowFailureBanner,
  onUiErrorDismiss: dismissUiErrorBanner,
  onUiErrorRetry: onUiErrorRetry,
  onUiErrorCreateAccount,
});

provide(LAYOUT_GUILD_MODALS_KEY, {
  isCreateChannelModalOpen,
  isCreateCategoryModalOpen,
  channelSettingsOpen: computed(() => channelSettingsTarget.value !== null),
  categorySettingsOpen: computed(() => categorySettingsTarget.value !== null),
  isServerNotificationSettingsOpen,
  serverName: computed(() => selectedServer.value?.name ?? ''),
  createChannelCategoryOptions,
  createChannelInitialCategoryId,
  createChannelServerId: computed(() => selectedServer.value?.id ?? null),
  createChannelCategoryNames,
  channelSettingsTarget,
  categorySettingsTarget,
  channelSettingsCategoryPermissionDefaults,
  channelSettingsCategoryAutoDeleteAfterSeconds,
  channelSettingsEchoPermissionEditor,
  categorySettingsEchoPermissionEditor,
  currentServerNotificationLevel,
  isDiscordImportedServer: computed(() => {
    const s = selectedServer.value as { discordGuildId?: string } | undefined;
    return !!s?.discordGuildId?.trim();
  }),
  onUpdateIsCreateChannelModalOpen: (v: boolean) => {
    isCreateChannelModalOpen.value = v;
  },
  onUpdateIsCreateCategoryModalOpen: (v: boolean) => {
    isCreateCategoryModalOpen.value = v;
  },
  onUpdateChannelSettingsOpen: onChannelSettingsModalOpenUpdate,
  onUpdateCategorySettingsOpen: onCategorySettingsModalOpenUpdate,
  onUpdateIsServerNotificationSettingsOpen: (v: boolean) => {
    isServerNotificationSettingsOpen.value = v;
  },
  onCreateChannelSubmit: handleCreateChannelModalSubmit,
  onCreateCategorySubmit: handleCreateCategorySubmit,
  onChannelSettingsSave: handleChannelSettingsSave,
  onChannelSettingsDelete: handleChannelDelete,
  onCategorySettingsSave: handleCategorySettingsSave,
  onCategorySettingsDelete: handleCategoryDelete,
  onServerNotificationSave: handleServerNotificationSave,
});

function handleChannelInviteRequest(payload?: {
  voiceChannelId: string;
  voiceChannelName?: string;
}) {
  const sid = unref(selectedServer)?.id?.trim();
  if (!sid) {
    dispatchAppToast('Select a server before inviting people.', 'warning');
    return;
  }
  if (!canInviteToCurrentServer.value) {
    dispatchAppToast(
      'You don’t have permission to invite people to this server.',
      'warning',
    );
    return;
  }
  if (
    inviteModalVoiceChannelId == null ||
    inviteModalVoiceChannelName == null ||
    isInviteModalOpen == null
  ) {
    dispatchAppToast(
      'Invite is unavailable. Refresh and try again.',
      'warning',
    );
    return;
  }
  const vid = payload?.voiceChannelId?.trim();
  if (vid) {
    inviteModalVoiceChannelId.value = vid;
    const providedName = payload?.voiceChannelName?.trim() ?? '';
    inviteModalVoiceChannelName.value =
      providedName || inviteModalVoiceChannelName.value;
  } else {
    inviteModalVoiceChannelId.value = null;
    inviteModalVoiceChannelName.value = null;
  }
  isInviteModalOpen.value = true;
}

/** Fallback when `fireChannelDelete*` emits (inject missing); mirrors injected handlers. */
function onChannelPanelDeleteChannel(payload: { channelId: string }) {
  void deleteChannelById(payload.channelId);
}
function onChannelPanelDeleteCategory(payload: { categoryId: string }) {
  void deleteCategoryById(payload.categoryId);
}

/**
 * Left-chrome injection context: server rail, DM panel, channel panel, and voice chrome.
 * Consumed by AppLeftChrome and its sub-components via inject(LAYOUT_LEFT_CHROME_KEY).
 * Keep prop names stable — changes here require matching updates in appLayoutLeftChromeProps.ts.
 */
provide(LAYOUT_LEFT_CHROME_KEY, {
  hideServerRail: computed(
    () => welcomeBackExploreGate.value || inviteLandingActive.value,
  ),
  isAuthenticated,
  guestFriendsLocked,
  activeRailTab,
  compactGuildTriPaneChannelPanelOpen,
  mobileVoiceChannelTapOpensLobby: computed(
    () =>
      !!(
        isCompactShell.value &&
        !isDmUiContext.value &&
        hasGuildChannelChrome.value
      ),
  ),
  voiceLobbyChannelId: computed(
    () => guildMobileVcLobby.value?.channelId ?? null,
  ),
  channelPanelCollapsed,
  channelPanelBubbleMode,
  memberPanelCollapsed: memberPanelCollapsedEffective,
  memberPanelCollapsedRaw: memberPanelCollapsed,
  isDmUiContext,
  isServerEmptyOnboarding,
  isExploreView,
  inDmMode: isInDMMode,
  dmPanelOpen: isDMPanelOpen,
  channelPanelLoading: isChannelPanelSwitchLoading,
  currentUserForServerList: leftChromeCurrentUserForServerList,
  presenceByUserId,
  presenceMobileByUserId,
  serverNotificationLevelsMap,
  serverPingKindsMap: serverPingKindByServerId,
  serverPingBubblesMap: serverPingBubbleByServerId,
  serverPingChannelDotsMap: serverPingChannelDotsByServerId,
  serverUnreadActivityDotMap: serverUnreadActivityDotByServerId,
  channelMissedActivityByChannelId,
  serverActiveVoiceByServerId,
  guildVoiceActivityCards,
  guildEventActivityCards,
  guildVoiceActivityCurrentVoiceChannelId: channelPanelVoiceChannelId,
  canOpenServerSettingsForServer,
  canOpenInviteForServer,
  reorderVisibleServers,
  isMoreServersPanelOpen,
  isMoreServersCompact,
  isMoreServersPinned,
  dmActiveTab,
  dmIncomingRailCluster,
  dmInboxEntries: dmInboxEntriesForPanel,
  echoPeerByChannelId: computed(() => echoDmPeerByChannelId.value),
  usersForChannelPanel,
  currentUserId: computed(() => currentUser.value?.id ?? ''),
  selectedDmUserId: selectedDMUserId,
  selectedGroupDmChannelId: computed(() => activeGroupDM.value?.id ?? null),
  selectedMessageRequestId,
  friendIds: computed(() => workspace.friendIds.value),
  messageRequests: computed(() => workspace.messageRequests.value),
  friendRequestsIncoming: computed(
    () => workspace.friendRequestsIncoming.value,
  ),
  friendRequestsOutgoing: computed(
    () => workspace.friendRequestsOutgoing.value,
  ),
  dmMentionNotifications,
  dmNotificationReadStateByChannelId,
  mentionNotificationCategoriesByServer,
  isPersistedEchoDmThread,
  dmCallWithUserId,
  dmCallRinging,
  dmCallRingRemoteVanishing,
  phoneCallIcon: computed(() => icons.phoneCall),
  selectedServer: computed(() => selectedServer.value ?? null),
  categoriesForServer,
  activeChannelId,
  currentUser: leftChromeCurrentUser,
  guildVoiceChannelId: channelPanelVoiceChannelId,
  guildVoiceChannelName: channelPanelVoiceChannelName,
  focusGuildVoiceChannelInSidebar,
  liveKitState,
  liveKitNetworkStats,
  liveKitRoom,
  getRemoteParticipantVolume,
  setRemoteParticipantVolume,
  vcMicInputLevel: localAudioLevel,
  onSwitchCamera: switchVcCamera,
  voiceSessionParticipants: activeVoiceChannelParticipants,
  getVcActivityPresence: getVcActivityPresenceForUser,
  getVcChannelActivityPresence: getVcChannelActivityPresenceForChannel,
  vcActivityKingUserId: effectiveVcActivityKingUserId,
  openMemberProfile,
  openProfileFromContextMenu,
  activeMemberProfileId: computed(() => activeMemberProfile.value?.id ?? null),
  guildVcMuted: channelPanelVcMutedEffective,
  guildVcDeafened: channelPanelVcDeafenedEffective,
  guildVcVideo: channelPanelVcVideoEffective,
  guildVcScreenshare: channelPanelVcScreenshareEffective,
  canUseVideo: computed(
    () =>
      !isRolePreviewActiveForServer.value || previewHasUiPermission('video'),
  ),
  canJoinPreviewVoiceChannel,
  voiceSideChatCollapsed,
  canCreateChannels,
  canManageThisChannel,
  startChannelResize,
  resetChannelWidth,
  showServerSettingsMenuItem: canOpenServerSettings,
  canInviteToCurrentServer,
  canModerateMemberInServer,
  canVcModerateMember,
  handleModerateUser,
  handleChannelReorder,
  handleCategoryReorder,
  handleVcModerate,
  selectDmUser: selectDM,
  bugHunterEnabled: showBugHunterOnRail,
  railProfileAwaySelfSpeaking,
  onSelectServers: selectServersTab,
  onSelectServer: openServerSurface,
  onToggleExplore: selectExploreTab,
  onToggleDmPanel: handleSelectDmTab,
  onSelectIncomingDm: selectIncomingDmFromRail,
  onSelectIncomingGroupDm: selectIncomingGroupDmFromRail,
  onOpenDmInboxOverflow: handleOpenDmInboxFromRailOverflow,
  onToggleMoreServers: toggleMoreServersPanel,
  onExpandChannels: expandChannels,
  onToggleChannelPanelBubbleMode: toggleChannelPanelBubbleMode,
  onExpandMembers: expandMembers,
  onOpenSelfProfile: openSelfProfile,
  onOpenBugReport: () => {
    isBugReportModalOpen.value = true;
  },
  onOpenSettings: () => openUserSettingsModal(),
  onOpenAuth: () => openAuthModal(),
  onMoreServersClose: () => {
    isMoreServersPanelOpen.value = false;
  },
  onMoreServersSetCompact: (v: boolean) => {
    isMoreServersCompact.value = v;
  },
  onMoreServersTogglePinned: () => {
    isMoreServersPinned.value = !isMoreServersPinned.value;
  },
  onDmClose: () => {
    isDMPanelOpen.value = false;
  },
  onDmPanelJoinGuildVoiceActivity: handleDmPanelJoinGuildVoiceActivity,
  onDmUpdateActiveTab: (tab) => {
    dmActiveTab.value = tab;
  },
  onDmSelectDm: selectDM,
  onDmSelectGroup: handleSelectGroupDM,
  onDmSelectMessageRequest: (requestId: string | null) => {
    if (requestId != null) selectMessageRequest(requestId);
  },
  onDmIgnoreRequest: ignoreMessageRequest,
  onDmAcceptFriendRequest: acceptFriendRequest,
  onDmDeclineFriendRequest: declineFriendRequest,
  onDmCancelFriendRequest: cancelFriendRequest,
  onDmSendFriendRequest: sendFriendRequest,
  onDmMarkRead: handleDmMarkRead,
  onDmHideFromInbox: (
    payload:
      | { kind: 'user'; userId: string }
      | { kind: 'group'; channelId: string },
  ) => {
    if (payload.kind === 'user') {
      hideDmFromInboxUser(payload.userId);
    } else {
      hideDmFromInboxGroup(payload.channelId);
    }
  },
  isDmInboxUserFavorite,
  isDmInboxGroupFavorite,
  onDmToggleFavoriteInbox: toggleFavoriteDmInbox,
  onDmRequestUpgrade: openGuestUpgradeModal,
  onDmPanelResizeStart: startDmPanelResize,
  onDmPanelResizeReset: resetDmPanelWidth,
  onChannelUpdateActiveId: (channelId: string) => {
    handleActiveChannelChange(channelId);
    if (isCompactShell.value && hasGuildChannelChrome.value) {
      compactPagerPane.value = 1;
    }
  },
  onChannelUpdateCollapsed: (v: boolean) => {
    channelPanelCollapsed.value = v;
  },
  onChannelUpdateVcMuted: onChannelPanelVcMuted,
  onChannelUpdateVcDeafened: onChannelPanelVcDeafened,
  onChannelUpdateVcVideo: onChannelPanelVcVideo,
  onChannelUpdateVcScreenshare: onChannelPanelVcScreenshare,
  onChannelJoinVoice: handleJoinVoiceIfAllowed,
  onChannelOpenVoiceLobby: openGuildMobileVcLobby,
  onChannelLeaveVoice: handleChannelVoicePanelLeave,
  onChannelInvite: handleChannelInviteRequest,
  onChannelOpenServerSettings: () => {
    openServerSettingsIfAllowed(unref(selectedServer)?.id ?? '');
  },
  onChannelToggleSideChat: onVcChatButtonClick,
  onChannelOpenCreateChannel: (id: string | null) => openCreateChannelModal(id),
  onChannelOpenCreateCategory: openCreateCategoryModal,
  onChannelQuickCreateSubmit: handleCreateChannelModalSubmit,
  onChannelOpenChannelSettings: openChannelSettings,
  onChannelOpenCategorySettings: openCategorySettings,
  onChannelDeleteChannel: async ({ channelId }) => {
    await deleteChannelById(channelId);
  },
  onChannelDeleteCategory: async ({ categoryId }) => {
    await deleteCategoryById(categoryId);
  },
  onChannelOpenNotificationSettings: openServerNotificationSettings,
  onChannelOpenVoiceAudioSettings: () => openUserSettingsModal('Voice & Video'),
  onChannelLeaveServer: handleServerRailLeave,
  onChannelMarkRead: (channelId: string) => {
    void handleChannelMarkRead(channelId);
  },
  onGuildEventRsvp: submitGuildEventRsvp,
  onOpenGuildEventDetail: openGuildEventDetail,
  onUpdateDmNotificationsReadPreset: (preset) => {
    dmNotificationsReadPreset.value = preset;
  },
  onUpdateDmNotificationsSourceKey: (key) => {
    dmNotificationsSourceKey.value = key;
  },
  onOpenGuildEventChannel: (payload) => {
    // Clicking an event card from the DM list navigates the server surface
    // underneath; close the DM panel so the destination is actually visible
    // (parity with handleDmPanelJoinGuildVoiceActivity). No-op when the panel
    // is already closed, e.g. the in-server events carousel.
    isDMPanelOpen.value = false;
    navigateGuildEventOpenPayload({
      serverId: payload.serverId,
      channelId: payload.channelId,
      customLocation: payload.customLocation,
    });
  },
  /** Mobile dock replaces in-list VC transport while connected. */
  hideChannelPanelVoiceChrome: hideChannelPanelVoiceChromeEffective,
});

/** Collapse members when the main grid column cannot fit chat + member list (viewport MQ alone misses split layouts). */
const MEMBER_PANEL_MIN_CHAT_BODY_PX = 520;
/** Keep DM chat comfortable; profile panel is secondary. */
const DM_PROFILE_PANEL_WIDTH_PX = 360;
const DM_PROFILE_MIN_CHAT_BODY_PX = 760;
const mainContentAreaEl = ref<HTMLElement | null>(null);
let memberPanelMainWidthObserver: ResizeObserver | null = null;

function snapshotMainContentAreaLayout(): Record<string, unknown> {
  const el = mainContentAreaEl.value;
  if (!el) return { mainContent: null };
  const r = el.getBoundingClientRect();
  let gridCols = '';
  let gridRows = '';
  try {
    const cs = window.getComputedStyle(el);
    gridCols = cs.gridTemplateColumns;
    gridRows = cs.gridTemplateRows;
  } catch {
    /* ignore */
  }
  return {
    mainContent: {
      x: Math.round(r.x),
      y: Math.round(r.y),
      w: Math.round(r.width),
      h: Math.round(r.height),
      clientW: el.clientWidth,
      clientH: el.clientHeight,
      gridTemplateColumns: gridCols,
      gridTemplateRows: gridRows,
    },
  };
}

watch(
  () => ({
    compactShell: unref(isCompactShell),
    triPane: useCompactTriPaneShell.value,
    stackShell: useCompactStackShell.value,
    pager: unref(compactPagerPane),
    pagerSurface:
      unref(compactPagerPane) === 0
        ? 'left_channels'
        : unref(compactPagerPane) === 1
          ? 'chat'
          : 'members',
    appGridCols: unref(appGridTemplateColumns),
    mainAreaCols: mainContentAreaGridColumns.value,
    mainAreaRows: mainContentGridTemplateRows.value,
    membersGate: membersColumnVisible.value,
    memberPanelW: unref(memberPanelWidth),
    channelPanelW: unref(_channelPanelWidth),
    memberCollapsedEff: unref(memberPanelCollapsedEffective),
    roleHierarchyPending: isEchoServerRoleHierarchyPending.value,
    resolvedMembersLen: memberListUsersResolved.value.length,
    rawMembersLen: memberListUsers.value.length,
  }),
  () => {
    void nextTick(() => {
      layoutHyperLog('AppLayout:layoutSnapshot', {
        ...snapshotMainContentAreaLayout(),
        vvW: typeof window !== 'undefined' ? window.innerWidth : null,
        vvH: typeof window !== 'undefined' ? window.innerHeight : null,
        dpr: typeof window !== 'undefined' ? window.devicePixelRatio : null,
      });
    });
  },
  { flush: 'post' },
);

/** Canonical teardown for bus subscriptions and member panel width observer. */
function disposeAppLayoutSideEffects() {
  memberPanelMainWidthObserver?.disconnect();
  memberPanelMainWidthObserver = null;
}

function maybeAutoCollapseMemberPanelForMainWidth() {
  if (unref(isCompactShell)) return;
  if (
    unref(isExploreView) ||
    unref(isDmUiContext) ||
    unref(isServerEmptyOnboarding)
  ) {
    return;
  }
  if (unref(isViewingVoiceChannel)) return;
  if (unref(callOverlay).type === 'dmCall') return;
  if (memberPanelCollapsed.value) return;
  if (memberPanelAutoCollapseUserOverride.value) return;
  const el = mainContentAreaEl.value;
  if (!el) return;
  const w = el.clientWidth;
  if (w <= 0) return;
  const minTotal = memberPanelWidth.value + MEMBER_PANEL_MIN_CHAT_BODY_PX;
  if (w < minTotal) {
    memberPanelDiag('autoCollapseWidth', {
      mainContentWidth: w,
      minTotal,
      memberPanelWidth: memberPanelWidth.value,
      MEMBER_PANEL_MIN_CHAT_BODY_PX,
    });
    memberPanelCollapsed.value = true;
  }
}

function canShowDmProfilePanelForWidth() {
  const width =
    mainContentAreaEl.value?.clientWidth ??
    (typeof window !== 'undefined' ? window.innerWidth : 0);
  if (width <= 0) return false;
  return width >= DM_PROFILE_PANEL_WIDTH_PX + DM_PROFILE_MIN_CHAT_BODY_PX;
}

function maybeAutoCollapseDmProfilePanelForMainWidth() {
  if (!isInDMChat.value) return;
  const profilePanelOpen =
    isExpandedProfileModalOpen.value &&
    (isExpandedProfileSidePanel.value || isGroupOverviewOpen.value);
  if (!profilePanelOpen) return;
  if (canShowDmProfilePanelForWidth()) return;
  if (
    expandedProfile.value &&
    isExpandedProfileSidePanel.value &&
    !isGroupOverviewOpen.value
  ) {
    expandDmProfileToFullModal();
    return;
  }
  isExpandedProfileModalOpen.value = false;
  isExpandedProfileSidePanel.value = false;
  isGroupOverviewOpen.value = false;
  expandedProfile.value = null;
}

function collapseDmProfileOverviewForDmCallFullscreen() {
  if (!isExpandedProfileModalOpen.value && !isGroupOverviewOpen.value) return;
  isExpandedProfileModalOpen.value = false;
  isExpandedProfileSidePanel.value = false;
  isGroupOverviewOpen.value = false;
  expandedProfile.value = null;
}

watch(dmCallFullscreen, (fullscreen) => {
  if (!fullscreen) return;
  collapseDmProfileOverviewForDmCallFullscreen();
});

watch([memberPanelCollapsed, memberPanelWidth], () => {
  if (memberPanelCollapsed.value) return;
  void nextTick(maybeAutoCollapseMemberPanelForMainWidth);
});

watch(
  () =>
    [
      isInDMChat.value,
      isExpandedProfileModalOpen.value,
      isExpandedProfileSidePanel.value,
      isGroupOverviewOpen.value,
    ] as const,
  () => {
    void nextTick(maybeAutoCollapseDmProfilePanelForMainWidth);
  },
  { flush: 'post' },
);
</script>

<template>
  <div
    class="echo-shell-root relative m-0 flex h-full w-full min-h-0 min-w-0 flex-col overflow-hidden p-0 text-foreground"
    :class="{ 'echo-shell-root--desktop': isDesktop() }"
  >
    <!-- Skip link: allows screen reader + keyboard users to jump past navigation chrome. -->
    <a
      href="#echo-main-content"
      class="echo-skip-link sr-only focus:not-sr-only"
      >Skip to messages</a
    >

    <!-- Navigation announcer: announces active channel/server context on navigation.
         sr-only ensures it is invisible but still read by screen readers. -->
    <div aria-live="polite" aria-atomic="true" class="sr-only">
      {{ navAnnouncerText }}
    </div>

    <!-- Single app-wide realtime status pill (Paper uses PaperConnectionBanner instead). -->
    <RealtimeConnectionBanner
      v-if="unref(mainSurface).type !== 'serverPaper'"
    />

    <DesktopTitlebar v-if="isDesktop()" />
    <div
      v-if="desktopUpdateBannerVisible"
      class="flex shrink-0 items-center justify-between gap-3 border-b border-border bg-indigo-950/95 px-4 py-2.5 text-sm text-white"
      role="status"
    >
      <span class="min-w-0 font-medium">
        Echo update available:
        <span class="text-fg">{{ desktopUpdatePendingVersion }}</span>
      </span>
      <span class="flex shrink-0 items-center gap-2">
        <button
          type="button"
          class="rounded-lg bg-glass-3 px-3 py-1.5 text-xs font-semibold hover:bg-glass-active"
          @click="onDesktopUpdateBannerDismiss"
        >
          Dismiss
        </button>
        <button
          type="button"
          class="rounded-lg bg-white px-3 py-1.5 text-xs font-semibold text-indigo-950 hover:bg-glass-active"
          @click="onDesktopUpdateBannerInstall"
        >
          Install and restart
        </button>
      </span>
    </div>
    <AppToastShell :layout-context="appToastLayoutContext" />

    <template v-if="useCompactGuildSplitShell">
      <CompactGuildSplitShell class="relative min-h-0 flex-1">
        <template #left>
          <AppLayoutLeftChrome
            chrome-wrap="stack"
            :action-rail-top-layout="actionRailTopLayout"
            :compact-guild-split-nav="true"
            @channel-invite="handleChannelInviteRequest"
            @channel-delete-channel="onChannelPanelDeleteChannel"
            @channel-delete-category="onChannelPanelDeleteCategory"
          />
        </template>
        <template #chat>
          <div
            ref="mainContentAreaEl"
            class="main-content-area relative grid min-h-0 min-w-0 flex-1 overflow-hidden"
            :class="[
              {
                'main-content-area--explore':
                  isExploreView || isServerEmptyOnboarding,
              },
              mainContentVcDockBottomPadClass,
            ]"
            :style="{
              gridTemplateRows: mainContentGridTemplateRows,
              gridTemplateColumns: mainContentAreaGridColumns,
            }"
          >
            <AppLayoutMainSurface surface="chat" />
          </div>
        </template>
        <template #members-overlay>
          <div
            v-if="membersColumnVisible"
            class="pointer-events-auto absolute inset-y-0 right-0 z-30 flex w-[min(18rem,42vw)] min-w-[14rem] max-w-[20rem] flex-col border-l border-border bg-[var(--bg)] shadow-xl"
          >
            <AppLayoutMembersColumn />
          </div>
        </template>
      </CompactGuildSplitShell>
      <AppLayoutGuildModals />
    </template>
    <template v-else-if="useCompactTriPaneShell">
      <CompactTriPaneShell
        v-model="compactPagerPane"
        class="relative min-h-0 flex-1"
      >
        <template #left>
          <AppLayoutLeftChrome
            chrome-wrap="stack"
            :action-rail-top-layout="actionRailTopLayout"
            :compact-tri-pane-guild-nav="true"
            @channel-invite="handleChannelInviteRequest"
            @channel-delete-channel="onChannelPanelDeleteChannel"
            @channel-delete-category="onChannelPanelDeleteCategory"
          />
        </template>
        <template #chat>
          <div
            ref="mainContentAreaEl"
            class="main-content-area relative grid min-h-0 min-w-0 flex-1 overflow-hidden"
            :class="[
              {
                'main-content-area--explore':
                  isExploreView || isServerEmptyOnboarding,
              },
              mainContentVcDockBottomPadClass,
            ]"
            :style="{
              gridTemplateRows: mainContentGridTemplateRows,
              gridTemplateColumns: mainContentAreaGridColumns,
            }"
          >
            <AppLayoutMainSurface />
          </div>
        </template>
        <template #members>
          <AppLayoutMembersColumn
            :visibility-override="compactMembersSurfaceVisible"
          />
        </template>
      </CompactTriPaneShell>
      <AppLayoutGuildModals />
    </template>
    <template v-else-if="useCompactExploreShell">
      <CompactDualPaneShell
        v-model="compactExplorePane"
        class="relative min-h-0 flex-1"
      >
        <template #main>
          <div
            ref="mainContentAreaEl"
            class="main-content-area main-content-area--explore relative grid min-h-0 min-w-0 flex-1 overflow-hidden"
            :class="mainContentVcDockBottomPadClass"
            :style="{
              gridTemplateRows: mainContentGridTemplateRows,
              gridTemplateColumns: mainContentAreaGridColumns,
            }"
          >
            <AppLayoutMainSurface surface="explore" />
          </div>
        </template>
        <template #rail>
          <AppLayoutLeftChrome
            chrome-wrap="stack"
            :action-rail-top-layout="actionRailTopLayout"
            @channel-invite="handleChannelInviteRequest"
            @channel-delete-channel="onChannelPanelDeleteChannel"
            @channel-delete-category="onChannelPanelDeleteCategory"
          />
        </template>
      </CompactDualPaneShell>
      <AppLayoutGuildModals />
    </template>
    <template v-else-if="useCompactDmShell">
      <CompactDualPaneShell
        v-model="compactDmPane"
        class="relative min-h-0 flex-1"
      >
        <template #main>
          <div
            ref="mainContentAreaEl"
            class="main-content-area relative grid min-h-0 min-w-0 flex-1 overflow-hidden"
            :class="[
              {
                'main-content-area--explore':
                  isExploreView || isServerEmptyOnboarding,
              },
              mainContentVcDockBottomPadClass,
            ]"
            :style="{
              gridTemplateRows: mainContentGridTemplateRows,
              gridTemplateColumns: mainContentAreaGridColumns,
            }"
          >
            <AppLayoutMainSurface members-column />
          </div>
        </template>
        <template #rail>
          <AppLayoutLeftChrome
            chrome-wrap="stack"
            :action-rail-top-layout="actionRailTopLayout"
            @channel-invite="handleChannelInviteRequest"
            @channel-delete-channel="onChannelPanelDeleteChannel"
            @channel-delete-category="onChannelPanelDeleteCategory"
          />
        </template>
      </CompactDualPaneShell>
      <AppLayoutGuildModals />
    </template>
    <template v-else-if="useCompactStackShell">
      <CompactStackShellFrame>
        <AppLayoutLeftChrome
          chrome-wrap="stack"
          :action-rail-top-layout="actionRailTopLayout"
          @channel-invite="handleChannelInviteRequest"
          @channel-delete-channel="onChannelPanelDeleteChannel"
          @channel-delete-category="onChannelPanelDeleteCategory"
        />
        <div
          ref="mainContentAreaEl"
          class="main-content-area relative grid min-h-0 min-w-0 flex-1 overflow-hidden"
          :class="[
            {
              'main-content-area--explore':
                isExploreView || isServerEmptyOnboarding,
            },
            mainContentVcDockBottomPadClass,
          ]"
          :style="{
            gridTemplateRows: mainContentGridTemplateRows,
            gridTemplateColumns: mainContentAreaGridColumns,
          }"
        >
          <AppLayoutMainSurface members-column />
        </div>
      </CompactStackShellFrame>
      <AppLayoutGuildModals />
    </template>
    <div
      v-else
      data-cy="app-layout"
      class="app-layout relative grid h-full min-h-0 w-full min-w-0 flex-1 overflow-hidden"
      :class="{ 'app-layout--action-rail-top': actionRailTopLayoutGrid }"
      :style="{
        gridTemplateColumns: appGridTemplateColumns,
        gridTemplateRows: actionRailTopLayoutGrid
          ? 'auto minmax(0, 1fr)'
          : 'minmax(0, 1fr)',
      }"
    >
      <AppLayoutLeftChrome
        :action-rail-top-layout="actionRailTopLayout"
        @channel-invite="handleChannelInviteRequest"
        @channel-delete-channel="onChannelPanelDeleteChannel"
        @channel-delete-category="onChannelPanelDeleteCategory"
      />
      <AppLayoutGuildModals />
      <main
        id="echo-main-content"
        ref="mainContentAreaEl"
        class="main-content-area relative grid min-h-0 min-w-0 overflow-hidden"
        :class="[
          {
            'main-content-area--explore':
              isExploreView || isServerEmptyOnboarding,
          },
          mainContentVcDockBottomPadClass,
        ]"
        :style="{
          gridTemplateRows: mainContentGridTemplateRows,
          gridTemplateColumns: mainContentAreaGridColumns,
        }"
      >
        <AppLayoutMainSurface members-column />
      </main>
    </div>

    <GuildMobileVoiceLobbySheet
      :open="!!guildMobileVcLobby"
      :channel-name="guildMobileVcLobby?.channelName ?? ''"
      :participants="guildMobileVcLobbyParticipants"
      :server-owner-id="selectedServer?.ownerId ?? null"
      :is-muted="channelPanelVcMutedEffective"
      :can-join="
        guildMobileVcLobby
          ? canJoinPreviewVoiceChannel(guildMobileVcLobby.channelId)
          : false
      "
      @close="closeGuildMobileVcLobby"
      @join="handleGuildMobileVcLobbyJoin"
      @chat="handleGuildMobileVcLobbyChat"
      @toggle-mute="onChannelPanelVcMuted"
      @open-audio-settings="handleGuildMobileVcLobbyOpenAudioSettings"
    />
    <GuildMobileVoiceDock
      v-if="showGuildMobileVoiceDock"
      :live-kit-state="liveKitState"
      :vc-muted="channelPanelVcMutedEffective"
      :vc-deafened="channelPanelVcDeafenedEffective"
      :vc-video="channelPanelVcVideoEffective"
      :vc-screenshare="channelPanelVcScreenshareEffective"
      :can-use-video="guildMobileVoiceDockCanUseVideo"
      :voice-side-chat-collapsed="voiceSideChatCollapsed"
      :on-toggle-muted="onChannelPanelVcMuted"
      :on-toggle-deafened="onChannelPanelVcDeafened"
      :on-toggle-video="onChannelPanelVcVideo"
      :on-toggle-screenshare="onChannelPanelVcScreenshare"
      :on-open-voice-settings="handleGuildMobileVcLobbyOpenAudioSettings"
      :on-toggle-voice-chat="onVcChatButtonClick"
      :on-leave-voice="handleChannelVoicePanelLeave"
    />

    <AppLayoutModals />
    <AppLayoutDialogHost />

    <ForwardMessageModal
      v-if="forwardModalOpen"
      :open="forwardModalOpen"
      :source-summary="forwardModalSourceSummary"
      :destinations="forwardPickerDestinations"
      @close="closeForwardMessagePicker"
      @select="submitForwardedMessage"
    />
    <BugReportModal
      v-if="isBugReportModalOpen"
      v-model="isBugReportModalOpen"
    />
    <ReportModal />

    <GuestDisplayNameModal
      v-if="isGuestDisplayNameModalOpen"
      v-model="isGuestDisplayNameModalOpen"
    />
    <GuestWelcomePreferencesModal
      v-if="isGuestWelcomePrefsModalOpen"
      v-model="isGuestWelcomePrefsModalOpen"
    />
    <GuestOnboardingModal
      v-if="showGuestOnboardingModal"
      :model-value="showGuestOnboardingModal"
      @upgraded="() => void onGuestAccountUpgraded()"
      @sign-in-existing="onGuestOnboardingSignInExisting"
      @update:model-value="() => {}"
    />
    <GuestCaptchaModal
      v-if="isGuestCaptchaModalOpen"
      v-model="isGuestCaptchaModalOpen"
      :site-key="guestCaptchaSiteKey"
      @verified="onGuestCaptchaVerified"
    />

    <UnverifiedEmailModal
      v-if="showUnverifiedEmailModal"
      :model-value="showUnverifiedEmailModal"
      :resend-busy="emailBannerResendBusy"
      :resend-message="emailBannerResendMessage"
      :resend-error="emailBannerResendError"
      @update:model-value="onUnverifiedEmailModalUpdate"
      @resend="onUnverifiedEmailResend"
      @change-email="onUnverifiedEmailChangeEmail"
    />

    <DiscordProfileImportPromptModal v-model="showDiscordProfileImportPrompt" />

    <ScreenSharePickerModal
      v-if="ECHO_SCREEN_SHARE_USE_CONFIG_MODAL"
      v-model="isScreenSharePickerOpen"
      @confirm="handleScreenSharePickerConfirm"
    />
    <DesktopStreamingControlModal
      v-if="isDesktop()"
      v-model="isDesktopStreamingControlOpen"
      :mode="desktopStreamingControlMode"
      :settings="desktopStreamingPreferences"
      @confirm="handleDesktopStreamingControlConfirm"
    />

    <FullscreenStreamOverlay
      v-if="fullscreenStreamParticipantId"
      :model-value="!!fullscreenStreamParticipantId"
      :track="fullscreenStreamTrack"
      :audio-track="fullscreenStreamAudioTrack"
      :participant-name="fullscreenStreamName"
      :participant-pfp="fullscreenStreamPfp"
      :participant-id="fullscreenStreamParticipantId"
      :is-local="fullscreenStreamParticipantId === currentUser?.id"
      :is-screen-share="fullscreenStreamIsScreenShare"
      :remote-stream-volume-control="
        !!fullscreenStreamParticipantId &&
        fullscreenStreamParticipantId !== currentUser?.id
      "
      :remote-stream-volume-percent="
        fullscreenStreamParticipantId &&
        fullscreenStreamParticipantId !== currentUser?.id
          ? getRemoteParticipantVolume(fullscreenStreamParticipantId)
          : 100
      "
      @update:model-value="
        (v) => {
          if (!v) fullscreenStreamParticipantId = null;
        }
      "
      @remote-stream-volume-change="
        (v) => {
          const id = fullscreenStreamParticipantId;
          if (!id) return;
          setRemoteParticipantVolume(id, v);
        }
      "
    />
  </div>
</template>

<style lang="scss">
@use '@/features/layout/styles/appLayout.scss';
</style>
