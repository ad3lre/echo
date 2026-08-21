<script setup lang="ts">
import AppLayoutLeftChrome from '@/features/layout/components/AppLayoutLeftChrome.vue';
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
import CompactPhoneTabShell from '@/features/layout/components/CompactPhoneTabShell.vue';
import MobileHomeSurface from '@/features/layout/components/mobile/MobileHomeSurface.vue';
import MobileServersSurface from '@/features/layout/components/mobile/MobileServersSurface.vue';
import { ECHO_SCREEN_SHARE_USE_CONFIG_MODAL } from '@/config/screenShareUi';

const GuildMobileVoiceLobbySheet = defineAsyncComponent(
  () => import('@/features/voice/components/GuildMobileVoiceLobbySheet.vue'),
);
const GuildMobileVoiceDock = defineAsyncComponent(
  () => import('@/features/voice/components/GuildMobileVoiceDock.vue'),
);
const GuestDisplayNameModal = defineAsyncComponent(
  () => import('@/features/auth/components/GuestDisplayNameModal.vue'),
);
const GuestWelcomePreferencesModal = defineAsyncComponent(
  () => import('@/features/auth/components/GuestWelcomePreferencesModal.vue'),
);
const GuestOnboardingModal = defineAsyncComponent(
  () => import('@/features/auth/components/GuestOnboardingModal.vue'),
);
const GuestCaptchaModal = defineAsyncComponent(
  () => import('@/features/auth/components/GuestCaptchaModal.vue'),
);
const UnverifiedEmailModal = defineAsyncComponent(
  () => import('@/features/auth/components/UnverifiedEmailModal.vue'),
);
const BugReportModal = defineAsyncComponent(
  () => import('@/features/safety/components/BugReportModal.vue'),
);
const ReportModal = defineAsyncComponent(
  () => import('@/features/safety/components/ReportModal.vue'),
);

const ScreenSharePickerModal = defineAsyncComponent(
  () => import('@/features/voice/components/ScreenSharePickerModal.vue'),
);
const FullscreenStreamOverlay = defineAsyncComponent(
  () => import('@/features/voice/components/FullscreenStreamOverlay.vue'),
);
const ForwardMessageModal = defineAsyncComponent(
  () => import('@/features/chat/components/ForwardMessageModal.vue'),
);
const DiscordProfileImportPromptModal = defineAsyncComponent(
  () => import('@/features/discord/DiscordProfileImportPromptModal.vue'),
);
/** Lazy: outage overlay; teleported above shell so layout keeps rendering underneath. */
const ServerDownGate = defineAsyncComponent(
  () => import('@/features/layout/components/ServerDownGate.vue'),
);

import {
  computed,
  defineAsyncComponent,
  provide,
  ref,
  unref,
  type ComputedRef,
} from 'vue';
import { storeToRefs } from 'pinia';
import { useAppLayoutController } from '@/features/layout/composables/controller/useAppLayoutController';
import { isDesktop } from '@/platform/desktopBridge';
import { reloadEchoApp } from '@/platform/reloadEchoApp';
import { echoSyncCapabilities } from '@/platform/syncCapabilities';
import { watchBugHunterAppContext } from '@/features/layout/composables/shell/useBugHunterAppTrace';
import { useBugHunterStore } from '@/features/layout/bugHunter';
import { useThemeStore } from '@/features/settings/themeStore';
import AppToastShell from '@/features/layout/components/AppToastShell.vue';
import { CALL_VIEW_FULLSCREEN_STREAM_ID_KEY } from '@/features/layout/layoutInjectionKeys';
import type { ChannelSummary } from '@shared/types';
import type { ChannelCategory } from '@/features/layout/channels/useChannels';
import type { AppLayoutChatSurfaceVoiceActivitySlice } from '@/features/layout/composables/voice/appLayoutChatSurfaceVoiceActivitySlice';
import {
  COMPOSER_INSERT_USER_MENTION_KEY,
  type InsertUserMentionFn,
} from '@/features/chat/chatComposerContext';
import { useAppLayoutShellNavigationChrome } from '@/features/layout/composables/shell/useAppLayoutShellNavigationChrome';
import { useAppLayoutPlatformLifecycle } from '@/features/layout/composables/controller/useAppLayoutPlatformLifecycle';
import { useAppLayoutGlobalShortcuts } from '@/features/layout/composables/shell/useAppLayoutGlobalShortcuts';
import { useGuildEventDetailModalController } from '@/features/layout/composables/server/useGuildEventDetailModalController';
import { useFullscreenStreamOverlay } from '@/features/layout/composables/voice/useFullscreenStreamOverlay';
import { useAppLayoutBannerNotices } from '@/features/layout/composables/moderation/useAppLayoutBannerNotices';
import { useAppLayoutCompactShellModes } from '@/features/layout/composables/shell/useAppLayoutCompactShellModes';
import { useAppLayoutPhoneBottomTab } from '@/features/layout/composables/shell/useAppLayoutPhoneBottomTab';
import { useAppLayoutMembersAndActivity } from '@/features/layout/composables/members/useAppLayoutMembersAndActivity';
import { useAppLayoutGuildMobileVoiceChrome } from '@/features/layout/composables/voice/useAppLayoutGuildMobileVoiceChrome';
import { useAppLayoutLeftChromeProvide } from '@/features/layout/composables/shell/useAppLayoutLeftChromeProvide';
import { useAppLayoutMainWidthCollapse } from '@/features/layout/composables/shell/useAppLayoutMainWidthCollapse';
import { useAppLayoutCompactShellNavigation } from '@/features/layout/composables/shell/useAppLayoutCompactShellNavigation';
import { useAppLayoutChatSurfaceProvide } from '@/features/layout/composables/messaging/useAppLayoutChatSurfaceProvide';
import { useAppLayoutModalsProvide } from '@/features/layout/composables/controller/useAppLayoutModalsProvide';
import { useAppLayoutMembersColumnProvide } from '@/features/layout/composables/members/useAppLayoutMembersColumnProvide';
import { useAppLayoutCoreShellProvide } from '@/features/layout/composables/shell/useAppLayoutCoreShellProvide';
import { useAppLayoutInfoBannersProvide } from '@/features/layout/composables/moderation/useAppLayoutInfoBannersProvide';
import { useAppLayoutGuildModalsProvide } from '@/features/layout/composables/server/useAppLayoutGuildModalsProvide';

/** Shared ref: ChatInput registers; CallView / channel VC menus / bubbles inject. */
const composerInsertUserMention = ref<InsertUserMentionFn | null>(null);
provide(COMPOSER_INSERT_USER_MENTION_KEY, composerInsertUserMention);

const layoutController = useAppLayoutController();
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
  channelPanelWidth,
  channelSettingsCategoryPermissionDefaults,
  channelSettingsCategoryAutoDeleteAfterSeconds,
  channelSettingsEchoPermissionEditor,
  channelSettingsTarget,
  clearRolePreview,
  clearSearch,
  closeDMPanel,
  clearPhoneHomeDmThread,
  compactPagerPane,
  compactGuildTriPaneChannelPanelOpen,
  isCompactPhoneShell,
  useCompactPhoneTabShell,
  mobileBottomTab,
  mobileHomeStack,
  mobileServersStack,
  mobileChannelSheetOpen,
  mobileMembersOverlayOpen,
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
  isChannelTreeLoadedForSelectedServer,
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
  handleMinimizeVoiceView,
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

const {
  isEchoServerRoleHierarchyPending,
  memberListUsersResolved,
  serverSettingsMemberUsersResolved,
  memberListResolveHighestRoleResolved,
  serverVoiceSurfaceActive,
  membersColumnVisible,
  membersColumnEchoSectionOrdering,
  membersColumnListLoading,
  serverActiveVoiceByServerId,
  guildVoiceActivityCards,
  guildEventActivityCards,
  myEventRsvps,
  upcomingEventsByServerId,
} = useAppLayoutMembersAndActivity({
  useCompactPhoneTabShell,
  isExploreView,
  memberPanelCollapsedEffective,
  isDmUiContext,
  isServerEmptyOnboarding,
  isViewingVoiceChannel,
  callOverlay,
  mainSurface,
  isEchoGraphId,
  isEchoRoleBootstrapLoading,
  echoCapabilitiesForServerId,
  isMemberSurfaceSwitchLoading,
  memberListUsers,
  serverSettingsMemberUsers,
  memberListResolveHighestRole,
  selectedServerId: () => serverStore.selectedServer?.id,
  joinedServers: serverStore.servers,
  categoriesByServer: workspace.categoriesByServer,
  rosterUsers: workspace.users,
  getChannelDisplayName,
});

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

const {
  handleDmPanelJoinGuildVoiceActivity,
  guildMobileVcLobbyParticipants,
  guildMobileVoiceConnected,
  showGuildMobileVoiceDock,
  hideChannelPanelVoiceChromeEffective,
  voiceMobileDockReservePxComputed,
  mainContentVcDockBottomPadClass,
  handleGuildMobileVcLobbyJoin,
  handleGuildMobileVcLobbyChat,
  handleGuildMobileVcLobbyOpenAudioSettings,
  guildMobileVoiceDockCanUseVideo,
} = useAppLayoutGuildMobileVoiceChrome({
  isCompactShell,
  hasGuildChannelChrome,
  isDmUiContext,
  useCompactPhoneTabShell,
  isViewingVoiceChannel,
  isDMPanelOpen,
  currentVoiceChannelId,
  liveKitState,
  guildMobileVcLobby,
  categoriesForServer,
  workspaceUsers: workspace.users,
  voiceSideChatCollapsed,
  isSettingsModalOpen,
  isServerSettingsModalOpen,
  forwardModalOpen,
  vcActivityPhase: computed(() => vcActivityUi.value.phase),
  mobileChannelSheetOpen,
  mobileMembersOverlayOpen,
  isMemberPopoutOpen,
  isSelfProfilePopoutOpen,
  voiceMobileSheetLevel,
  compactPagerPane,
  mobileBottomTab,
  mobileServersStack,
  isRolePreviewActiveForServer,
  previewHasUiPermission,
  effectiveActiveChannel,
  currentUserId: () => currentUser.value?.id,
  openServerSurface,
  openGuildMobileVcLobby,
  closeGuildMobileVcLobby,
  handleJoinVoiceIfAllowed,
  handleActiveChannelChange,
  expandVoiceSideChat,
  openUserSettingsModal,
  vcActivityPhaseOpeners: {
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
  },
});

useAppLayoutMembersColumnProvide({
  membersColumnVisible,
  effectiveActiveChannel,
  searchText,
  filterChips,
  allChannels,
  usersForMentionAutocomplete,
  paginatedSearchResults,
  searchResultMessages,
  searchResultPage,
  totalPages,
  selectedServer,
  serverStore,
  memberListUsersResolved,
  memberListUsers,
  presenceMobileByUserId,
  memberPanelCollapsed,
  memberListShowGuests,
  onSearchInput,
  addFilter,
  removeFilter,
  clearSearch,
  goToSearchPage,
  handleGoToMessage,
  searchLoading,
  searchError,
  searchScopeHint,
  markMemberPanelCollapsedByUser,
  markMemberPanelExpandedByUser,
  isCompactShell,
  hasGuildChannelChrome,
  compactPagerPane,
  openMemberProfileFromMemberColumn,
  currentUser,
  canModerateMemberInServer,
  canModerateMemberActionInServer,
  handleModerateUser,
  canChangeMemberNicknameInServer,
  handleChangeMemberNicknameFromMemberList,
  selectDM,
  memberListResolveHighestRoleResolved,
  memberListRoleManagement,
  membersColumnListLoading,
  membersColumnEchoSectionOrdering,
  isEchoServerRoleHierarchyPending,
  echoCapabilitiesForServerId,
  isExploreView,
  memberPanelCollapsedEffective,
  isDmUiContext,
  isServerEmptyOnboarding,
  isViewingVoiceChannel,
  serverVoiceSurfaceActive,
  callOverlay,
  isMemberSurfaceSwitchLoading,
  workspaceServerMemberIds: workspace.serverMemberIds,
});

const {
  explorePageUnifiedScroll,
  compactExplorePane,
  useCompactGuildSplitShell,
  useCompactTriPaneShell,
  useCompactExploreShell,
  useCompactDmShell,
  useCompactStackShell,
  compactDmPane,
  handleSelectDmTab,
  handleOpenDmInboxFromRailOverflow,
  isDmThreadSurface,
  isPhoneHomeThreadStack,
} = useAppLayoutCompactShellModes({
  isCompactShell,
  hasGuildChannelChrome,
  isCompactGuildSplitShell,
  useCompactPhoneTabShell,
  isExploreView,
  isDmUiContext,
  welcomeBackExploreGate,
  inviteLandingActive,
  isDMPanelOpen,
  activeRailTab,
  mainSurface,
  activeChannelId,
  selectDMTab,
  openDmInboxFromRailOverflow,
});

const {
  phoneDmUnreadTotal,
  phoneServersHasActivity,
  phoneExploreHasActivity,
  showPhoneBottomTabBar,
} = useAppLayoutPhoneBottomTab({
  useCompactPhoneTabShell,
  isDmThreadSurface,
  isPhoneHomeThreadStack,
  activeRailTab,
  activeChannelId,
  selectedServerId: () => selectedServer.value?.id,
  mobileBottomTab,
  mobileHomeStack,
  mobileServersStack,
  mobileChannelSheetOpen,
  mobileMembersOverlayOpen,
  memberPanelCollapsed,
  isDMPanelOpen,
  inviteLandingActive,
  welcomeBackExploreGate,
  showWelcomeBackSlimBanner,
  dmIncomingRailCluster,
  serverPingBubbleByServerId,
  serverUnreadActivityDotByServerId,
  serverActiveVoiceByServerId,
  handleSelectDmTab,
  selectServersTab,
  selectExploreTab,
});

const {
  appToastLayoutContext,
  openChannelPaneFromHeader,
  focusGuildVoiceChannelInSidebar,
  mobileShellGoBack,
} = useAppLayoutCompactShellNavigation({
  useCompactTriPaneShell,
  useCompactGuildSplitShell,
  useCompactDmShell,
  useCompactExploreShell,
  useCompactStackShell,
  useCompactPhoneTabShell,
  hasGuildChannelChrome,
  isDmUiContext,
  isCompactShell,
  isExploreView,
  isServerEmptyOnboarding,
  activeChannelId,
  isDmThreadSurface,
  findChannelContextById: _findChannelContextById as (
    id: string | null | undefined,
  ) => { channel: ChannelSummary } | null | undefined,
  declineDmCall,
  mobileBottomTab,
  mobileChannelSheetOpen,
  compactDmPane,
  expandChannels,
  currentVoiceChannelId,
  categoriesByServer: workspace.categoriesByServer,
  openServerSurface,
  memberPanelCollapsed,
  compactPagerPane,
  compactExplorePane,
  compactGuildTriPaneChannelPanelOpen,
  mobileHomeStack,
  mobileServersStack,
  mobileMembersOverlayOpen,
  selectServersRailOnly,
  closeDMPanel,
  clearPhoneHomeDmThread,
  rawCategoriesForServer,
  explorePageUnifiedScroll,
  channelPanelCollapsed,
});

const friendshipKnown = computed(
  () =>
    echoSyncCapabilities.isMockDataMode ||
    workspace.socialGraphStatus.value === 'ready',
);

useAppLayoutChatSurfaceProvide({
  voiceActivity: layoutController as AppLayoutChatSurfaceVoiceActivitySlice,
  workspace,
  authSession,
  serverStore,
  isEchoGraphId,
  canManageThisChannel,
  findChannelContextById: _findChannelContextById as (
    channelId: string | null | undefined,
  ) => { channel: ChannelSummary; category: ChannelCategory } | null,
  dmSurfaceAdapter,
  profileSurfaceAdapter,
  chatHeaderAdapter,
  mainSurface,
  callOverlay,
  isMessageSurfaceSwitchLoading,
  isOpeningDmThread,
  isGuildShellSettling,
  channelPanelCollapsed,
  memberPanelCollapsedEffective,
  memberPanelCollapsed,
  useCompactTriPaneShell,
  useCompactGuildSplitShell,
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
  getChannelDisplayName,
  togglePinsDropdown,
  openChannelPaneFromHeader,
  handleMinimizeVoiceView,
  collapseMembers,
  expandMembers,
  isRolePreviewActiveForServer,
  rolePreview,
  clearRolePreview,
  memberPanelWidth,
  searchText,
  filterChips,
  allChannels,
  usersForMentionAutocomplete,
  rolesForMentionAutocomplete,
  paginatedSearchResults,
  searchResultMessages,
  searchResultPage,
  totalPages,
  selectedServer,
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
  openGroupOverviewPanel,
  activeGroupCallMembers,
  currentUser,
  linkedDiscordUserId,
  dmCallVideo,
  dmCallScreenshare,
  dmCallMuted,
  dmCallDeafened,
  channelPanelVcMutedEffective,
  channelPanelVcDeafenedEffective,
  channelPanelVcVideoEffective,
  channelPanelVcScreenshareEffective,
  onDmCallVcVideo,
  onDmCallVcScreenshare,
  toggleDmCallMuted,
  applyDmCallDeafened,
  onGuildChannelVcMuted,
  onGuildChannelVcDeafened,
  onGuildChannelVcVideo: layoutController.onGuildChannelVcVideo,
  onGuildChannelVcScreenshare: layoutController.onGuildChannelVcScreenshare,
  handleChannelVoicePanelLeave,
  dmCallFullscreen,
  dmCallCallViewParticipants,
  pinsDropdownRect,
  pinnedMessagesForDropdown,
  pinPreview,
  presenceByUserId,
  presenceMobileByUserId,
  closePinsDropdown,
  goToPinnedMessage,
  activeVoiceChannelParticipants,
  activeChannelMessagesMap,
  sendMessage,
  openForwardMessagePicker,
  voiceSideChatCollapsed,
  voiceSideChatWidth,
  startVoiceSideChatResize,
  resetVoiceSideChatWidth,
  expandVoiceSideChat,
  toggleVoiceSideChat,
  voiceMobileSheetLevel,
  bumpVoiceMobileChatFromCallScrollUp,
  bumpVoiceMobileChatFromCallScrollDown,
  voiceMobileDockReservePxComputed,
  currentVoiceChannelId,
  handleCallViewOpenProfile,
  canModerateMemberInServer,
  canVcModerateMember,
  handleVcModerate,
  handlePollVote,
  editMessage,
  deleteMessage,
  handleReact,
  topReactions,
  removeReactionFavorite,
  handleGoToChannel,
  openServerSurface,
  focusGuildVoiceChannelInSidebar,
  openMemberProfile,
  openProfileFromContextMenu,
  canModerateMessageAuthor,
  handleModerateUser,
  isDMPanelOpen,
  selectedDMUserId,
  selectedMessageRequestId,
  echoDmPeerByChannelId,
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
  onOpenMentionNotification,
  onMarkMentionNotificationRead,
  isPersistedEchoDmThread,
  pinnedMessageIdsForCurrentChannel,
  handlePinMessage,
  handleUnpinMessage,
  expandedProfile,
  isExpandedProfileFriend,
  isExpandedProfileOutgoingRequest,
  friendshipKnown,
  expandedProfileNote,
  handleExpandedProfileNoteFromLayout,
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
  handleKickGroupDmMember,
  handleLeaveGroupDm,
  openGroupSettingsFromHeader,
  memberListResolveHighestRole,
  showNsfwChatGate,
  acknowledgeNsfwChannel,
  declineNsfwGate,
  selectExploreTab,
  vcRemoteParticipants,
  liveKitRoom,
  vcMirrorCamera,
  getLocalScreenTrack,
  getLocalCameraTrack,
  getRemoteParticipantVolume,
  setRemoteParticipantVolume,
  fullscreenStreamParticipantId,
  vcActivityUi,
  effectiveVcActivityKingUserId,
  serverSettingsCanManageServer,
  openChannelSettings,
});

useAppLayoutModalsProvide({
  profileSurfaceAdapter,
  currentUser,
  isAuthenticated,
  openUserSettingsModal,
  isAuthModalOpen,
  authModalInitialLoginEntry,
  authModalPasskeyOnOpen,
  authModalInitialTab,
  authModalInitialSubView,
  isAddServerModalOpen,
  addServerInitialView,
  exploreDiscoverableServers,
  openUserSettingsToDiscordFromAddServer,
  handleCreateServer,
  handleJoinDiscoverableServer,
  handleJoinWithInviteLink,
  addServerJoinError,
  addServerCreateBusy,
  addServerJoinBusy,
  addServerJoinInvitePrefill,
  exploreDirectoryJoinBusy,
  isInviteModalOpen,
  selectedServer,
  inviteLinkForServer,
  inviteLinkLookupPending,
  inviteApplicationsEnabled,
  inviteJoinLinksEnabled,
  inviteCanCreateDirectHexInvite,
  directHexInviteLink,
  directHexInviteBusy,
  createDirectHexInvite,
  inviteModalVoiceChannelId,
  inviteModalVoiceChannelName,
  inviteableFriends,
  handleInviteFriend,
  isServerSettingsModalOpen,
  memberListUsers,
  serverSettingsMemberUsersResolved,
  memberListResolveHighestRole,
  canModerateMemberActionInServer,
  handleModerateUser,
  onServerSettingsModalUpdate,
  serverSettingsModalInitialSection,
  onServerSettingsModalActiveSectionUpdate,
  serverSettingsCanManageRoles,
  serverSettingsCanManageServer,
  canDeleteCurrentServer,
  hydrateEchoFromApi,
  refreshEchoRoleData,
  handleServerDeleted,
  handleStartRolePreview,
  isEchoGraphId,
  canCreateChannels,
  categoriesForServer,
  handleChannelReorder,
  handleCategoryReorder,
  isGroupDMSettingsOpen,
  groupDmSettingsInitialFocus,
  groupSettingsId,
  activeGroupSettingsId: layoutController.activeGroupSettingsId,
  groupDMs: layoutController.groupDMs,
  effectiveActiveChannel,
  activeGroupDM,
  groupSettingsMembers,
  handleUpdateGroupFromSettings,
  onRemoveGroupDmMember,
  handleLeaveGroupDm,
  onOpenAddMembersToGroupDm,
  isGroupDMModalOpen,
  dmGroupFriends,
  groupDMPreselectedIds,
  groupDMLockedIds,
  groupDmMaxMembers,
  handleCreateGroupDM,
  isSettingsModalOpen,
  settingsModalInitialSection,
  onUserSettingsModalUpdate,
  onSettingsModalActiveSectionUpdate,
  onGuestAccountUpgraded,
  onGuestUpgradeSignInFromSettings,
  isDmUiContext,
  isMemberPopoutOpen,
  isMemberPopoutFriend,
  isMemberPopoutCanSendFriendRequest,
  activeMemberProfile,
  memberPopoutAnchor,
  activeMemberNote,
  memberListRoleManagement,
  memberPopoutOpenRolesPanel,
  onMemberPopoutOpenUpdate,
  updateProfileNote,
  openExpandedProfileFromMemberPopout,
  handleMemberPopoutQuickDm,
  handleExpandedProfileOpenDM,
  handleExpandedProfileSendFriendRequest,
  isSelfProfilePopoutOpen,
  selfProfile,
  selfProfileAnchor,
  customStatus,
  handleUpdateCustomStatus,
  updateCurrentUserStatus,
  openExpandedProfileFromSelfPopout,
  isExpandedProfileSidePanel,
  isExpandedProfileModalOpen,
  presenceByUserId,
  presenceMobileByUserId,
  expandedProfile,
  isExpandedProfileFriend,
  isExpandedProfileOutgoingRequest,
  friendshipKnown,
  workspace,
  expandedProfileNote,
  handleExpandedProfileNoteFromLayout,
  onExpandedProfileModalUpdate,
  handleExpandedProfileOpenServer,
  handleExpandedProfileOpenProfile,
  handleExpandedProfileCancelOutgoingFriendRequest,
  handleExpandedProfileAcceptIncomingFriendRequest,
  handleExpandedProfileDeclineIncomingFriendRequest,
  handleExpandedProfileRemoveFriend,
  isExpandedProfileTargetBlocked,
  guestFriendsLocked,
  isMemberPopoutTargetBlocked,
  handleProfileBlockUser,
  handleProfileUnblockUser,
  handleProfileReportUser,
  moderationModalOpen,
  moderationAction,
  moderationTargetUser,
  echoCapabilitiesForServerId,
  echoCanManageMessages: layoutController.echoCanManageMessages,
  onModerationModalConfirm,
  isLeaveServerModalOpen,
  leaveServerModalVariant,
  leaveServerModalServerName,
  onLeaveServerModalUpdate,
  confirmLeaveServerFromModal,
  isJoinServerConfirmModalOpen,
  joinServerConfirmPreview,
  joinServerConfirmBusy,
  onJoinServerConfirmModalUpdate,
  confirmJoinServerFromModal,
  isServerApplicationModalOpen,
  serverApplicationPayload,
  serverApplicationBusy,
  onServerApplicationModalUpdate,
  confirmServerApplicationSubmittedFromModal,
  isEventDetailModalOpen,
  eventDetailView,
  closeGuildEventDetailModal,
  submitGuildEventRsvp,
  navigateGuildEventOpenPayload,
  isDMPanelOpen,
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

const { showDiscordProfileImportPrompt } = useAppLayoutCoreShellProvide({
  chatMessageNavBridge,
  echoChannelHistory,
  joinEchoServerWithInvite: _joinEchoServerWithInviteRaw,
  reapplyVoiceProcessing,
  setVcVideoQuality,
  setMicTestListenDeafen,
  speakingMap,
  localSpeaking,
  localAudioLevel,
  currentUser,
  activeChannelId,
  effectiveActiveChannel,
  rawCategoriesForServer,
  rolePreview,
  selectedServerId: computed(() => serverStore.selectedServerId ?? undefined),
  isRolePreviewActiveForServer,
  isInDMMode,
  isGroupDM,
  liveChannelCapabilities,
  railActions: {
    handleServerRailSettings,
    handleServerRailInvite,
    handleServerRailNotificationSettings,
    handleServerRailMarkRead,
    handleServerRailMarkAllRead,
    handleDmRailMarkAllRead,
    handleServerRailLeave,
    openServerFromMore,
  },
  authSession,
  linkedDiscordUserId,
  linkedDiscordState,
  layoutMainSurface: {
    explorePageUnifiedScroll,
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
    exploreDiscoverableServers,
    exploreDirectoryJoinBusy,
    handleJoinDiscoverableServer,
  },
});

const {
  primaryFlowFailureBanner,
  showServerDownGate,
  serverDownGateBind,
  uiErrorBanner,
  uiErrorRetryBusy,
  dismissPrimaryFlowFailureBanner,
  dismissUiErrorBanner,
  onUiErrorRetry,
  checkServerHealthNow,
} = useAppLayoutPlatformLifecycle();

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

const { emailVerificationFlash } = storeToRefs(authSession);

useAppLayoutInfoBannersProvide({
  showApiFetchErrorBanner,
  apiErrorText: workspace.apiError,
  sessionEndedMessage,
  echoWorkspaceError,
  showWelcomeBackSlimBanner,
  emailVerificationFlash,
  showUnverifiedEmailBanner,
  showGuestUpgradeBanner,
  emailBannerResendBusy,
  emailBannerResendMessage,
  emailBannerResendError,
  discordBotExportReadyGuildName: discordBotExportReadyGuildNameForBanner,
  primaryFlowFailureBanner,
  showServerDownGate,
  uiErrorBanner,
  uiErrorRetryBusy,
  openAuthModal,
  clearSessionEndedMessage: () => authSession.clearSessionEndedMessage(),
  dismissEmailVerificationFlash,
  onGuestUpgradeOpenSettings: onGuestUpgradeBannerOpenSettings,
  onGuestUpgradeDismiss: dismissGuestUpgradeBannerClick,
  onUnverifiedEmailDismiss: dismissUnverifiedEmailBannerClick,
  onUnverifiedEmailResend,
  onUnverifiedEmailChangeEmail,
  onDiscordBotExportReadyDismiss: dismissDiscordBotExportReadyBanner,
  onPrimaryFlowFailureDismiss: dismissPrimaryFlowFailureBanner,
  onUiErrorDismiss: dismissUiErrorBanner,
  onUiErrorRetry,
});

useAppLayoutGuildModalsProvide({
  isCreateChannelModalOpen,
  isCreateCategoryModalOpen,
  channelSettingsTarget,
  categorySettingsTarget,
  isServerNotificationSettingsOpen,
  selectedServer,
  createChannelCategoryOptions,
  createChannelInitialCategoryId,
  createChannelCategoryNames,
  channelSettingsCategoryPermissionDefaults,
  channelSettingsCategoryAutoDeleteAfterSeconds,
  channelSettingsEchoPermissionEditor,
  categorySettingsEchoPermissionEditor,
  currentServerNotificationLevel,
  onChannelSettingsModalOpenUpdate,
  onCategorySettingsModalOpenUpdate,
  handleCreateChannelModalSubmit,
  handleCreateCategorySubmit,
  handleChannelSettingsSave,
  handleChannelDelete,
  handleCategorySettingsSave,
  handleCategoryDelete,
  handleServerNotificationSave,
});

const {
  handleChannelInviteRequest,
  onChannelPanelDeleteChannel,
  onChannelPanelDeleteCategory,
} = useAppLayoutLeftChromeProvide({
  welcomeBackExploreGate,
  inviteLandingActive,
  isCompactShell,
  hasGuildChannelChrome,
  isDmUiContext,
  guildMobileVcLobby,
  isAuthenticated,
  currentUser,
  echoDmPeerByChannelId,
  activeGroupDM,
  friendIds: computed(() => workspace.friendIds.value),
  messageRequests: computed(() => workspace.messageRequests.value),
  friendRequestsIncoming: computed(
    () => workspace.friendRequestsIncoming.value,
  ),
  friendRequestsOutgoing: computed(
    () => workspace.friendRequestsOutgoing.value,
  ),
  icons,
  selectedServer,
  activeMemberProfile,
  isRolePreviewActiveForServer,
  previewHasUiPermission,
  guestFriendsLocked,
  activeRailTab,
  compactGuildTriPaneChannelPanelOpen,
  channelPanelCollapsed,
  channelPanelBubbleMode,
  memberPanelCollapsedEffective,
  memberPanelCollapsed,
  isServerEmptyOnboarding,
  isExploreView,
  isInDMMode,
  isDMPanelOpen,
  isChannelPanelSwitchLoading,
  isChannelTreeLoadedForSelectedServer,
  presenceByUserId,
  presenceMobileByUserId,
  serverNotificationLevelsMap,
  serverPingKindByServerId,
  serverPingBubbleByServerId,
  serverPingChannelDotsByServerId,
  serverUnreadActivityDotByServerId,
  channelMissedActivityByChannelId,
  serverActiveVoiceByServerId,
  guildVoiceActivityCards,
  guildEventActivityCards,
  channelPanelVoiceChannelId,
  canOpenServerSettingsForServer,
  canOpenInviteForServer,
  reorderVisibleServers,
  isMoreServersPanelOpen,
  isMoreServersCompact,
  isMoreServersPinned,
  dmActiveTab,
  dmIncomingRailCluster,
  dmInboxEntriesForPanel,
  usersForChannelPanel,
  selectedDMUserId,
  selectedMessageRequestId,
  dmMentionNotifications,
  dmNotificationReadStateByChannelId,
  mentionNotificationCategoriesByServer,
  mentionNotificationServers,
  dmNotificationsReadPreset,
  dmNotificationsSourceKey,
  isPersistedEchoDmThread,
  dmCallWithUserId,
  dmCallRinging,
  dmCallRingRemoteVanishing,
  categoriesForServer,
  activeChannelId,
  channelPanelVoiceChannelName,
  liveKitState,
  liveKitNetworkStats,
  liveKitRoom,
  getRemoteParticipantVolume,
  setRemoteParticipantVolume,
  localAudioLevel,
  switchVcCamera,
  activeVoiceChannelParticipants,
  getVcActivityPresenceForUser,
  getVcChannelActivityPresenceForChannel,
  effectiveVcActivityKingUserId,
  openMemberProfile,
  openProfileFromContextMenu,
  channelPanelVcMutedEffective,
  channelPanelVcDeafenedEffective,
  channelPanelVcVideoEffective,
  channelPanelVcScreenshareEffective,
  canJoinPreviewVoiceChannel,
  voiceSideChatCollapsed,
  canCreateChannels,
  canManageThisChannel,
  startChannelResize,
  resetChannelWidth,
  canOpenServerSettings,
  canInviteToCurrentServer,
  canModerateMemberInServer,
  canVcModerateMember,
  handleModerateUser,
  handleChannelReorder,
  handleCategoryReorder,
  handleVcModerate,
  selectDM,
  isDmInboxUserFavorite,
  isDmInboxGroupFavorite,
  hideChannelPanelVoiceChromeEffective,
  focusGuildVoiceChannelInSidebar,
  showBugHunterOnRail,
  isBugReportModalOpen,
  openUserSettingsModal,
  openAuthModal,
  selectServersTab,
  openServerSurface,
  selectExploreTab,
  handleSelectDmTab,
  selectIncomingDmFromRail,
  selectIncomingGroupDmFromRail,
  handleOpenDmInboxFromRailOverflow,
  toggleMoreServersPanel,
  expandChannels,
  toggleChannelPanelBubbleMode,
  expandMembers,
  openSelfProfile,
  clearPhoneHomeDmThread,
  handleDmPanelJoinGuildVoiceActivity,
  handleSelectGroupDM,
  selectMessageRequest,
  ignoreMessageRequest,
  acceptFriendRequest,
  declineFriendRequest,
  cancelFriendRequest,
  sendFriendRequest,
  handleDmMarkRead,
  hideDmFromInboxUser,
  hideDmFromInboxGroup,
  toggleFavoriteDmInbox,
  openGuestUpgradeModal,
  startDmPanelResize,
  resetDmPanelWidth,
  handleActiveChannelChange,
  useCompactPhoneTabShell,
  mobileChannelSheetOpen,
  mobileServersStack,
  mobileBottomTab,
  compactPagerPane,
  onChannelPanelVcMuted,
  onChannelPanelVcDeafened,
  onChannelPanelVcVideo,
  onChannelPanelVcScreenshare,
  handleJoinVoiceIfAllowed,
  openGuildMobileVcLobby,
  handleChannelVoicePanelLeave,
  openServerSettingsIfAllowed,
  onVcChatButtonClick,
  openCreateChannelModal,
  openCreateCategoryModal,
  handleCreateChannelModalSubmit,
  openChannelSettings,
  openCategorySettings,
  deleteChannelById,
  deleteCategoryById,
  openServerNotificationSettings,
  handleServerRailLeave,
  handleChannelMarkRead,
  submitGuildEventRsvp,
  openGuildEventDetail,
  navigateGuildEventOpenPayload,
  inviteModalVoiceChannelId,
  inviteModalVoiceChannelName,
  isInviteModalOpen,
  callOverlay,
  dmCallMatchesActiveChannel,
  dmCallMuted,
  dmCallDeafened,
  localSpeaking,
  currentVoiceChannelId,
  findChannelContextById: _findChannelContextById as (
    id: string | null | undefined,
  ) => { channel: ChannelSummary } | null | undefined,
});

const { mainContentAreaEl } = useAppLayoutMainWidthCollapse({
  isCompactShell,
  isExploreView,
  isDmUiContext,
  isServerEmptyOnboarding,
  isViewingVoiceChannel,
  callOverlay,
  memberPanelCollapsed,
  memberPanelWidth,
  memberPanelAutoCollapseUserOverride,
  isInDMChat,
  isExpandedProfileModalOpen,
  isExpandedProfileSidePanel,
  isGroupOverviewOpen,
  expandedProfile,
  expandDmProfileToFullModal,
  dmCallFullscreen,
  useCompactTriPaneShell,
  useCompactStackShell,
  compactPagerPane,
  appGridTemplateColumns,
  mainContentAreaGridColumns,
  mainContentGridTemplateRows,
  membersColumnVisible,
  memberPanelCollapsedEffective,
  isEchoServerRoleHierarchyPending,
  memberListUsersResolved,
  memberListUsers,
  channelPanelCollapsed,
  channelPanelWidth,
});
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

    <AppToastShell :layout-context="appToastLayoutContext" />

    <template v-if="useCompactGuildSplitShell">
      <CompactGuildSplitShell class="relative min-h-0 flex-1">
        <template #left>
          <AppLayoutLeftChrome
            chrome-wrap="stack"
            :action-rail-top-layout="actionRailTopLayout"
            :compact-guild-split-nav="true"
            @channel-invite="handleChannelInviteRequest"
            @channel-open-notification-settings="openServerNotificationSettings"
            @channel-open-server-settings="
              () => openServerSettingsIfAllowed(unref(selectedServer)?.id ?? '')
            "
            @channel-open-voice-audio-settings="
              () => openUserSettingsModal('Voice & Video')
            "
            @expand-channels="expandChannels"
            @expand-members="expandMembers"
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
    <template v-else-if="useCompactPhoneTabShell">
      <CompactPhoneTabShell
        v-model="mobileBottomTab"
        class="relative min-h-0 flex-1"
        :show-bar="showPhoneBottomTabBar"
        :dm-unread-total="phoneDmUnreadTotal"
        :servers-has-activity="phoneServersHasActivity"
        :explore-has-activity="phoneExploreHasActivity"
      >
        <MobileHomeSurface
          v-if="mobileBottomTab === 'home'"
          v-model:stack="mobileHomeStack"
        >
          <template #thread>
            <div
              ref="mainContentAreaEl"
              class="main-content-area relative grid min-h-0 min-w-0 flex-1 overflow-hidden"
              :class="mainContentVcDockBottomPadClass"
              :style="{
                gridTemplateRows: mainContentGridTemplateRows,
                gridTemplateColumns: mainContentAreaGridColumns,
              }"
            >
              <AppLayoutMainSurface />
            </div>
          </template>
        </MobileHomeSurface>
        <MobileServersSurface
          v-else-if="mobileBottomTab === 'servers'"
          v-model:stack="mobileServersStack"
          v-model:channel-sheet-open="mobileChannelSheetOpen"
          v-model:members-visible="mobileMembersOverlayOpen"
        >
          <template #guild-main>
            <div
              ref="mainContentAreaEl"
              class="main-content-area relative grid min-h-0 min-w-0 flex-1 overflow-hidden"
              :class="mainContentVcDockBottomPadClass"
              :style="{
                gridTemplateRows: mainContentGridTemplateRows,
                gridTemplateColumns: mainContentAreaGridColumns,
              }"
            >
              <AppLayoutMainSurface />
            </div>
          </template>
        </MobileServersSurface>
        <div
          v-else
          class="flex h-full min-h-0 min-w-0 flex-col overflow-hidden"
        >
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
        </div>
      </CompactPhoneTabShell>
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
            @channel-open-notification-settings="openServerNotificationSettings"
            @channel-open-server-settings="
              () => openServerSettingsIfAllowed(unref(selectedServer)?.id ?? '')
            "
            @channel-open-voice-audio-settings="
              () => openUserSettingsModal('Voice & Video')
            "
            @expand-channels="expandChannels"
            @expand-members="expandMembers"
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
            @channel-open-notification-settings="openServerNotificationSettings"
            @channel-open-server-settings="
              () => openServerSettingsIfAllowed(unref(selectedServer)?.id ?? '')
            "
            @channel-open-voice-audio-settings="
              () => openUserSettingsModal('Voice & Video')
            "
            @expand-channels="expandChannels"
            @expand-members="expandMembers"
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
            @channel-open-notification-settings="openServerNotificationSettings"
            @channel-open-server-settings="
              () => openServerSettingsIfAllowed(unref(selectedServer)?.id ?? '')
            "
            @channel-open-voice-audio-settings="
              () => openUserSettingsModal('Voice & Video')
            "
            @expand-channels="expandChannels"
            @expand-members="expandMembers"
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
          @channel-open-notification-settings="openServerNotificationSettings"
          @channel-open-server-settings="
            () => openServerSettingsIfAllowed(unref(selectedServer)?.id ?? '')
          "
          @channel-open-voice-audio-settings="
            () => openUserSettingsModal('Voice & Video')
          "
          @expand-channels="expandChannels"
          @expand-members="expandMembers"
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
        @channel-open-notification-settings="openServerNotificationSettings"
        @channel-open-server-settings="
          () => openServerSettingsIfAllowed(unref(selectedServer)?.id ?? '')
        "
        @channel-open-voice-audio-settings="
          () => openUserSettingsModal('Voice & Video')
        "
        @expand-channels="expandChannels"
        @expand-members="expandMembers"
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
      :stack-above-bottom-tab="useCompactPhoneTabShell"
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
    <ServerDownGate
      v-if="showServerDownGate"
      v-bind="serverDownGateBind"
      @retry="checkServerHealthNow"
      @refresh="reloadEchoApp"
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
