<script setup lang="ts">
import AppLayoutLeftChrome from '@/features/layout/components/AppLayoutLeftChrome.vue';
import DesktopTitlebar from '@/components/DesktopTitlebar.vue';
import AppLayoutInfoBanners from '@/features/layout/components/AppLayoutInfoBanners.vue';
import AppLayoutGuildModals from '@/features/layout/components/AppLayoutGuildModals.vue';
import AppLayoutMembersColumn from '@/features/layout/components/AppLayoutMembersColumn.vue';
import AppLayoutModals from '@/features/layout/components/AppLayoutModals.vue';
import AppLayoutDialogHost from '@/features/layout/components/AppLayoutDialogHost.vue';
import AppLayoutChatSurface from '@/features/layout/components/AppLayoutChatSurface.vue';
import CompactDualPaneShell from '@/features/layout/components/CompactDualPaneShell.vue';
import CompactStackShellFrame from '@/features/layout/components/CompactStackShellFrame.vue';
import CompactTriPaneShell from '@/features/layout/components/CompactTriPaneShell.vue';
import { resolveEchoServerIdContainingChannel } from '@/features/voice/resolveEchoServerIdForGuildChannel';
import { ECHO_SCREEN_SHARE_USE_CONFIG_MODAL } from '@/config/screenShareUi';

/** Lazy: large style + copy surface; only mounted on welcome-back / empty-directory paths. */
const WelcomeBackExploreGate = defineAsyncComponent(
  () => import('@/features/layout/components/WelcomeBackExploreGate.vue'),
);
/** Lazy: outage UI; rarely shown vs main chat chrome. */
const ServerDownGate = defineAsyncComponent(
  () => import('@/features/layout/components/ServerDownGate.vue'),
);
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
const BugReportModal = defineAsyncComponent(
  () => import('@/components/BugReportModal.vue'),
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
import { AuthApiError, authResendVerification } from '@/api/authClient';
import { putGuildEventRsvp } from '@/services/http/echoServerEventsHttp';
import { resolveGuildEventLocation } from '@/features/server-events/resolveGuildEventLocation';
import { applyEchoShellPath } from '@/platform/desktopProductDeepLink';
import { hasPriorRegistration } from '@/utils/priorRegistration';
import {
  subscribePrimaryFlowFailures,
  primaryFlowFailureSuggestsBackendUnreachable,
  type PrimaryFlowFailureDetail,
} from '@/utils/primaryFlowFailure';
import { CHAT_MESSAGE_NAV_BRIDGE_KEY } from '@/features/navigation/chatMessageNavBridge';
import { subscribeUIErrors, type UIErrorSeverity } from '@/utils/uiErrorBus';
import {
  subscribeAppToasts,
  dispatchAppToast,
  dispatchAppToastDetail,
  ECHO_CHAT_COMPOSER_FOCUS_EVENT,
  type AppToastSeverity,
  type AppToastAction,
  type AppToastDetail,
} from '@/utils/controllerMissingAction';
import {
  registerEchoToastQuickReplySender,
  sendEchoToastQuickReply,
} from '@/features/layout/echoToastQuickReplyBridge';
import {
  EMAIL_VERIFICATION_DOWNTIME,
  EMAIL_VERIFICATION_DOWNTIME_TOAST,
} from '@/config/emailVerificationDowntime';
import { API_BASE } from '@/config';
import { safeImageUrl } from '@/utils/safeImageUrl';
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
import {
  bringMainWindowToForeground,
  downloadAndRelaunchDesktopUpdate,
  isDesktop,
} from '@/platform/desktopBridge';
import { useDesktopNativeAttention } from '@/composables/useDesktopNativeAttention';
import { useBrowserTabAttention } from '@/composables/useBrowserTabAttention';
import { useDesktopGlobalShortcutBringFront } from '@/platform/desktopGlobalShortcutBringFront';
import { useDesktopUpdateMonitor } from '@/composables/useDesktopUpdateMonitor';
import { useDesktopIncomingCallAttention } from '@/composables/useDesktopIncomingCallAttention';
import { useSimpleContextMenu } from '@/composables/useSimpleContextMenu';
import { useDesktopUpdateStore } from '@/stores/desktopUpdate';
import { useNotificationPreferencesStore } from '@/stores/notificationPreferences';
import { provideSpeakingState } from '@/composables/useSpeakingState';
import { ECHO_VOICE_PROCESSING_KEY } from '@/composables/voiceProcessingInjection';
import { watchBugHunterAppContext } from '@/composables/useBugHunterAppTrace';
import { useBugHunterStore } from '@/stores/bugHunter';
import { useThemeStore } from '@/stores/theme';
import { useCallRingtoneStore } from '@/stores/callRingtone';
import { useEchoSessionStore } from '@/stores/echoSession';
import {
  createForumPost as createForumPostOrchestration,
  fetchForumPosts as fetchForumPostsOrchestration,
  patchForumPost as patchForumPostOrchestration,
} from '@/services/orchestration/forumPosts';
import { findActionForKeyboardEvent } from '@/features/settings/keybindPreferences';
import {
  canOpenToastMessageContextMenu,
  resolveToastMessagePrimaryAction,
  shouldOpenToastMessageContextMenu,
} from '@/features/layout/composables/toastMessageContextMenu';
import {
  CALL_VIEW_FULLSCREEN_STREAM_ID_KEY,
  LAYOUT_CHAT_SURFACE_KEY,
  LAYOUT_GUILD_MODALS_KEY,
  LAYOUT_INFO_BANNERS_KEY,
  LAYOUT_LEFT_CHROME_KEY,
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
import { buildGuildEventActivityCardsFromMyRsvps } from '@/features/layout/buildGuildEventActivityCards';
import {
  COMPOSER_INSERT_USER_MENTION_KEY,
  type InsertUserMentionFn,
} from '@/features/chat/chatComposerContext';

/** Shared ref: ChatInput registers; CallView / channel VC menus / bubbles inject. */
const composerInsertUserMention = ref<InsertUserMentionFn | null>(null);
provide(COMPOSER_INSERT_USER_MENTION_KEY, composerInsertUserMention);

const {
  _DM_PANEL_WIDTH,
  ExploreView,
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
  memberPopoutOpenRolesPanel,
  memberPanelCollapsed,
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
  openGroupDMModal,
  openGroupOverviewPanel,
  openDmInboxFromRailOverflow,
  openGuestUpgradeModal,
  openGroupSettingsFromHeader,
  openMemberProfile,
  openMemberProfileFromMemberColumn,
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
  openVcActivityWordle,
  openVcActivityHangman,
  vcHangmanActivity,
  hangmanRosterUserIds,
  commitVcHangmanWord,
  requestVcHangmanGuessLetter,
  requestVcHangmanNextRound,
  openVcActivityOpenGuessr,
  openVcActivitySkribblIo,
  openVcActivityGarticPhone,
  openVcActivityKrunker,
  openVcActivityCodenames,
  openVcActivityRichup,
  openVcActivityGooberDash,
  openVcActivitySmashKarts,
  openVcActivityBasketballStars2026,
  openVcActivityClusterRush,
  setVcActivityYoutubeVideo,
  setVcActivityCodenamesRoomUrl,
  setVcYoutubeBrowseOpen,
  addVcYoutubeToQueue,
  removeVcYoutubeFromQueue,
  moveVcYoutubeInQueue,
  playVcYoutubeAtIndex,
  playVcYoutubeNext,
  playVcYoutubePrevious,
  closeVcActivity,
  vcYoutubeRemotePlayback,
  publishVcYoutubePlaybackSync,
  vcYoutubePlaybackShouldPublish,
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
  dmE2eeEnabled,
  enableActiveDmE2ee,
  isE2eeDevicesModalOpen,
  openE2eeDevicesModal,
  onE2eePairingImportSuccess,
} = useAppLayoutController();

const themeStore = useThemeStore();

// ─── Navigation announcer ────────────────────────────────────────────────────
// A single visually-hidden aria-live="polite" region that announces the active
// channel/server context whenever navigation changes.  Screen readers read it
// once focus moves naturally; it never steals focus.
const navAnnouncerText = ref('');
watch(
  [activeChannelId, selectedServer] as const,
  ([chanId, server]) => {
    const ch = (_activeChannel as ComputedRef<ChannelSummary | null>).value;
    const chanName = ch?.name ?? '';
    const serverName = server?.name ?? '';
    if (!chanId || !chanName) return;
    navAnnouncerText.value = serverName
      ? `${serverName}, ${chanName}`
      : chanName;
  },
  { flush: 'post' },
);
// ─────────────────────────────────────────────────────────────────────────────

/** Desktop-only: server/action rail along the top instead of the left column (settings preference). */
const actionRailTopLayout = computed(
  () => themeStore.actionRailPlacement === 'top' && !isCompactShell.value,
);

/** Two-row grid only when the horizontal strip is mounted (welcome-back omits it — see AppLayoutLeftChrome). */
const actionRailTopLayoutGrid = computed(
  () => actionRailTopLayout.value && !welcomeBackExploreGate.value,
);

const topRailSelectedOverflowServer = computed(() => {
  if (!actionRailTopLayout.value) return false;
  const selectedId = serverStore.selectedServerId?.trim() ?? '';
  if (!selectedId || selectedId === 'echo') return false;
  const visible = serverStore.visibleServers;
  return (
    !visible.some((s) => s.id === selectedId) &&
    serverStore.servers.some((s) => s.id === selectedId)
  );
});

watch(
  topRailSelectedOverflowServer,
  (isOverflowSelected) => {
    if (!isOverflowSelected) return;
    isMoreServersPanelOpen.value = true;
  },
  { immediate: true },
);

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
const memberListUsersResolved = computed(() =>
  isEchoServerRoleHierarchyPending.value ? [] : memberListUsers.value,
);
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
    unref(callOverlay).type !== 'dmCall',
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
const { myEventRsvps } = storeToRefs(echoSessionStore);
const guildEventActivityCards = computed<GuildEventActivityCard[]>(() =>
  buildGuildEventActivityCardsFromMyRsvps({
    rsvps: myEventRsvps.value,
    getChannelDisplayName,
  }),
);

function toastPlainGuildEventLocation(text: string, urls: readonly string[]) {
  const actions: AppToastAction[] = [
    {
      id: 'copy',
      label: 'Copy',
      kind: 'primary',
      run: () => {
        void navigator.clipboard?.writeText(text);
      },
    },
  ];
  const first = urls[0];
  if (first) {
    actions.push({
      id: 'open',
      label: 'Open link',
      run: () => {
        window.open(first, '_blank', 'noopener,noreferrer');
      },
    });
  }
  dispatchAppToastDetail({
    title: 'Event location',
    message: text.length > 720 ? `${text.slice(0, 720)}…` : text,
    subtitle: first,
    actions,
    severity: 'info',
    durationMs: 14_000,
  });
}

function navigateGuildEventOpenPayload(payload: {
  serverId: string;
  channelId?: string | null;
  customLocation?: string | null;
}) {
  const base = import.meta.env.BASE_URL || '/';
  const res = resolveGuildEventLocation({
    eventServerId: payload.serverId,
    channelId: payload.channelId,
    customLocation: payload.customLocation,
    base,
  });
  switch (res.kind) {
    case 'server_channel':
      openServerSurface(res.serverId, res.channelId);
      break;
    case 'shell_path': {
      const ok = applyEchoShellPath(res.pathWithSearch);
      if (!ok) {
        dispatchAppToastDetail({
          title: 'Open this location',
          message:
            'Finish loading Echo, then try again — or paste the link into your browser bar.',
          severity: 'warning',
        });
      }
      break;
    }
    case 'external':
      window.open(res.url, '_blank', 'noopener,noreferrer');
      break;
    case 'plain':
      toastPlainGuildEventLocation(res.text, res.detectedUrls);
      break;
    case 'fallback_server': {
      const cats = workspace.categoriesByServer.value[res.serverId] ?? [];
      let cid = '';
      outer: for (const cat of cats) {
        for (const ch of cat.channels ?? []) {
          if (ch.type === 'text') {
            cid = ch.id;
            break outer;
          }
        }
      }
      openServerSurface(res.serverId, cid || undefined);
      break;
    }
    default:
      break;
  }
}

function handleDmPanelJoinGuildVoiceActivity(payload: {
  serverId: string;
  channelId: string;
  channelName: string;
}) {
  isDMPanelOpen.value = false;
  openServerSurface(payload.serverId, payload.channelId);
  void nextTick(() => {
    if (isCompactShell.value && hasGuildChannelChrome.value) {
      openGuildMobileVcLobby({
        channelId: payload.channelId,
        channelName: payload.channelName,
      });
    } else {
      handleJoinVoiceIfAllowed({
        channelId: payload.channelId,
        channelName: payload.channelName,
      });
    }
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
  handleJoinVoiceIfAllowed({
    channelId: lobby.channelId,
    channelName: lobby.channelName,
  });
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

const guildMobileVoiceDockCanUseVideo = computed(
  () => !isRolePreviewActiveForServer.value || previewHasUiPermission('video'),
);

provide(LAYOUT_MEMBERS_COLUMN_KEY, {
  isVisible: membersColumnVisible,
  effectiveActiveChannel,
  searchText,
  filterChips,
  allChannels,
  users: computed(() => workspace.users.value),
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

const forumPostsByForumId = ref<Record<string, any[]>>({});
const forumPostsLoadingByForumId = ref<Record<string, boolean>>({});
const forumPostsErrorByForumId = ref<Record<string, string | null>>({});

async function refreshForumPosts(
  forumChannelId: string,
  opts?: {
    sort?: 'latest_activity' | 'creation_date';
    includeArchived?: boolean;
    limit?: number;
  },
): Promise<void> {
  const forumId = forumChannelId.trim();
  if (!forumId) return;
  const token = authSession.accessToken?.trim() ?? '';
  forumPostsLoadingByForumId.value = {
    ...forumPostsLoadingByForumId.value,
    [forumId]: true,
  };
  forumPostsErrorByForumId.value = {
    ...forumPostsErrorByForumId.value,
    [forumId]: null,
  };
  try {
    const rows = await fetchForumPostsOrchestration({
      token,
      forumChannelId: forumId,
      sort: opts?.sort ?? 'latest_activity',
      includeArchived: opts?.includeArchived ?? false,
      limit: opts?.limit ?? 100,
    });
    forumPostsByForumId.value = {
      ...forumPostsByForumId.value,
      [forumId]: rows,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    forumPostsErrorByForumId.value = {
      ...forumPostsErrorByForumId.value,
      [forumId]: msg,
    };
  } finally {
    forumPostsLoadingByForumId.value = {
      ...forumPostsLoadingByForumId.value,
      [forumId]: false,
    };
  }
}

async function createForumPost(payload: {
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
}): Promise<void> {
  const forumId = payload.forumChannelId.trim();
  if (!forumId) return;
  const token = authSession.accessToken?.trim() ?? '';
  try {
    const sid =
      serverStore.selectedServer?.id &&
      isEchoGraphId(serverStore.selectedServer.id)
        ? serverStore.selectedServer.id
        : null;
    const res = await createForumPostOrchestration({
      token,
      forumChannelId: forumId,
      refreshCategoriesForServerId: sid ?? undefined,
      body: {
        content: payload.content,
        ...(payload.tagIds ? { tagIds: payload.tagIds } : {}),
        ...(payload.mentions !== undefined
          ? { mentions: payload.mentions }
          : {}),
        ...(payload.imageUrl ? { imageUrl: payload.imageUrl } : {}),
        ...(payload.videoUrl ? { videoUrl: payload.videoUrl } : {}),
        ...(payload.gif ? { gif: true } : {}),
        ...(payload.imageSpoiler ? { imageSpoiler: true } : {}),
        ...(payload.poll !== undefined ? { poll: payload.poll } : {}),
        ...(payload.attachments !== undefined
          ? { attachments: payload.attachments }
          : {}),
        ...(payload.stickers !== undefined
          ? { stickers: payload.stickers }
          : {}),
        ...(payload.contentJson !== undefined
          ? { contentJson: payload.contentJson }
          : {}),
        ...(payload.contentSchemaVersion !== undefined
          ? { contentSchemaVersion: payload.contentSchemaVersion }
          : {}),
        ...(payload.messageFormatVersion !== undefined
          ? { messageFormatVersion: payload.messageFormatVersion }
          : {}),
      },
    });
    if (sid && res.refreshedCategories) {
      workspace.categoriesByServer.value = {
        ...workspace.categoriesByServer.value,
        [sid]: res.refreshedCategories,
      };
    }
    await refreshForumPosts(forumId);
    if (res.created.channelId) {
      if (res.created.messageId) {
        handleGoToMessage(res.created.channelId, res.created.messageId);
      } else {
        handleGoToChannel(res.created.channelId);
      }
    }
  } catch (e) {
    dispatchAppToast(
      e instanceof Error && e.message.trim()
        ? e.message.trim()
        : 'Failed to create forum post',
      'warning',
    );
  }
}

async function patchForumPost(payload: {
  postChannelId: string;
  pinned?: boolean;
  locked?: boolean;
  archivedAt?: string | null;
  tagIds?: unknown;
}): Promise<void> {
  const token = authSession.accessToken?.trim() ?? '';
  const postId = payload.postChannelId.trim();
  if (!postId) return;
  await patchForumPostOrchestration({
    token,
    postChannelId: postId,
    patch: {
      ...(payload.pinned !== undefined ? { pinned: payload.pinned } : {}),
      ...(payload.locked !== undefined ? { locked: payload.locked } : {}),
      ...(payload.archivedAt !== undefined
        ? { archivedAt: payload.archivedAt }
        : {}),
      ...(payload.tagIds !== undefined ? { tagIds: payload.tagIds } : {}),
    },
  });
}

watch(
  () => unref(mainSurface),
  (s) => {
    if (s?.type !== 'serverForum') return;
    void refreshForumPosts(s.forumChannelId);
  },
  { immediate: true },
);

const canManageForumPosts = computed(() => {
  const s = unref(mainSurface);
  if (s?.type !== 'serverForum') return false;
  const find = _findChannelContextById as (
    id: string | null | undefined,
  ) => { channel: ChannelSummary } | null | undefined;
  const ctx = find(s.forumChannelId);
  const forumCh = ctx?.channel;
  if (!forumCh) return false;
  return canManageThisChannel(forumCh);
});

/**
 * Explore uses one scroll surface (banners + content) so `main-content-area` stays a single grid row.
 * Welcome-back is still the explore surface — include it here; otherwise `auto` + `1fr` rows steal vertical space.
 */
const explorePageUnifiedScroll = computed(() => !!unref(isExploreView));

const compactExplorePane = ref<0 | 1>(0);

/** Guild text/voice/forum: use horizontal tri-pane under compact breakpoint. */
const useCompactTriPaneShell = computed(
  () =>
    unref(isCompactShell) &&
    unref(hasGuildChannelChrome) &&
    !explorePageUnifiedScroll.value,
);

const useCompactExploreShell = computed(
  () => unref(isCompactShell) && explorePageUnifiedScroll.value,
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

const compactDmPane = ref<0 | 1>(0);
watch(useCompactDmShell, (on) => {
  if (!on) return;
  compactDmPane.value = 0;
  if (!isDMPanelOpen.value) isDMPanelOpen.value = true;
});

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

provide(LAYOUT_CHAT_SURFACE_KEY, {
  dmSurfaceAdapter,
  profileSurfaceAdapter,
  chatHeaderAdapter,
  mainSurface,
  callOverlay,
  surfaceSwitchLoading: chatSurfaceSwitchLoading,
  dmThreadSwitchLoading: computed(() => !!unref(isOpeningDmThread)),
  channelPanelCollapsed,
  memberPanelCollapsed: memberPanelCollapsedEffective,
  memberPanelCollapsedRaw: memberPanelCollapsed,
  compactGuildTriPaneNav: useCompactTriPaneShell,
  isCompactShell,
  narrowChannelPanelForActivityOverflowStep,
  isDmUiContext,
  isInDMMode,
  isViewingVoiceChannel,
  startMemberResize,
  resetMemberWidth,
  effectiveActiveChannel,
  isInDMChat,
  dmE2eeEnabled,
  enableActiveDmE2ee,
  isE2eeDevicesModalOpen,
  openE2eeDevicesModal,
  onE2eePairingImportSuccess,
  dmCallMatchesActiveChannel,
  activeDmThreadCallUi,
  isExpandedProfileSidePanel,
  isExpandedProfileModalOpen,
  isGroupOverviewOpen,
  dmPartnerUser,
  openExpandedProfilePanelForUserId,
  handleExpandedProfileOpenProfile,
  isGroupDM,
  activeGroupDM,
  icons,
  dmActiveTab,
  getChannelIcon,
  getChannelDisplayName,
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
  currentUser,
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
  selectDM,
  acceptFriendRequest,
  declineFriendRequest,
  cancelFriendRequest,
  sendFriendRequest,
  ignoreMessageRequest,
  handleAcceptMessageRequest,
  returnFromMessageRequests,
  dmMentionNotifications,
  dmNotificationReadStateByChannelId,
  mentionNotificationCategoriesByServer,
  mentionNotificationServers,
  dmNotificationsReadPreset,
  dmNotificationsSourceKey,
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
  openVcActivityWordle,
  openVcActivityHangman,
  vcHangmanActivity,
  hangmanRosterUserIds,
  commitVcHangmanWord,
  requestVcHangmanGuessLetter,
  requestVcHangmanNextRound,
  openVcActivityOpenGuessr,
  openVcActivitySkribblIo,
  openVcActivityGarticPhone,
  openVcActivityKrunker,
  openVcActivityCodenames,
  openVcActivityRichup,
  openVcActivityGooberDash,
  openVcActivitySmashKarts,
  openVcActivityBasketballStars2026,
  openVcActivityClusterRush,
  setVcActivityYoutubeVideo,
  setVcActivityCodenamesRoomUrl,
  setVcYoutubeBrowseOpen,
  addVcYoutubeToQueue,
  removeVcYoutubeFromQueue,
  moveVcYoutubeInQueue,
  playVcYoutubeAtIndex,
  playVcYoutubeNext,
  playVcYoutubePrevious,
  closeVcActivity,
  vcYoutubeRemotePlayback,
  publishVcYoutubePlaybackSync,
  vcYoutubePlaybackShouldPublish,
  canShowDiscordChannelImport: serverSettingsCanManageServer,
  forumPostsByForumId,
  forumPostsLoadingByForumId,
  forumPostsErrorByForumId,
  refreshForumPosts,
  createForumPost,
  patchForumPost,
  canManageForumPosts,
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
  currentUser: computed(() =>
    isAuthenticated.value ? (unref(currentUser) ?? null) : null,
  ),
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
    unref(callOverlay).type !== 'dmCall',
);

const mainContentGridTemplateRows = computed(() =>
  explorePageUnifiedScroll.value ? 'minmax(0, 1fr)' : 'auto minmax(0, 1fr)',
);

const voiceParticipantsForFullscreenStream = computed(() => {
  if (callOverlay.value.type === 'dmCall' && dmCallWithUserId.value?.trim()) {
    return dmCallCallViewParticipants.value;
  }
  return activeVoiceChannelParticipants.value ?? [];
});

const fullscreenStreamTrack = computed(() => {
  const pid = fullscreenStreamParticipantId.value;
  if (!pid) return null;
  if (pid === currentUser.value?.id) {
    const screen = getLocalScreenTrack();
    if (screen) return screen;
    return getLocalCameraTrack();
  }
  const p = voiceParticipantsForFullscreenStream.value?.find(
    (participant: { id?: string }) => participant.id === pid,
  );
  return p?.screenTrack ?? p?.cameraTrack ?? null;
});

const fullscreenStreamAudioTrack = computed(() => {
  const pid = fullscreenStreamParticipantId.value;
  if (!pid || pid === currentUser.value?.id) return null;
  const p = voiceParticipantsForFullscreenStream.value?.find(
    (participant: { id?: string }) => participant.id === pid,
  );
  return p?.screenAudioTrack ?? null;
});

const fullscreenStreamName = computed(() => {
  const pid = fullscreenStreamParticipantId.value;
  if (!pid) return '';
  if (pid === currentUser.value?.id) return currentUser.value?.name ?? 'You';
  const p = voiceParticipantsForFullscreenStream.value?.find(
    (participant: { id?: string }) => participant.id === pid,
  );
  return p?.name ?? '';
});

const fullscreenStreamPfp = computed(() => {
  const pid = fullscreenStreamParticipantId.value;
  if (!pid) return '';
  if (pid === currentUser.value?.id) return currentUser.value?.pfp ?? '';
  const p = voiceParticipantsForFullscreenStream.value?.find(
    (participant: { id?: string }) => participant.id === pid,
  );
  return p?.pfp ?? '';
});

const fullscreenStreamIsScreenShare = computed(() => {
  const pid = fullscreenStreamParticipantId.value;
  if (!pid) return false;
  if (pid === currentUser.value?.id) return !!getLocalScreenTrack();
  const p = voiceParticipantsForFullscreenStream.value?.find(
    (participant: { id?: string }) => participant.id === pid,
  );
  return !!p?.screenTrack;
});

const FULLSCREEN_STREAM_LOST_CLEAR_MS = 160;

watch(
  fullscreenStreamTrack,
  (track) => {
    if (fullscreenStreamLostDefer != null) {
      clearTimeout(fullscreenStreamLostDefer);
      fullscreenStreamLostDefer = null;
    }
    if (!fullscreenStreamParticipantId.value) return;
    if (track) return;
    fullscreenStreamLostDefer = setTimeout(() => {
      fullscreenStreamLostDefer = null;
      if (fullscreenStreamParticipantId.value && !fullscreenStreamTrack.value) {
        fullscreenStreamParticipantId.value = null;
      }
    }, FULLSCREEN_STREAM_LOST_CLEAR_MS);
  },
  { flush: 'post' },
);

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

const dismissUnverifiedEmailBanner = ref(false);
const dismissGuestUpgradeBanner = ref(false);
const emailBannerResendBusy = ref(false);
const emailBannerResendMessage = ref<string | null>(null);
const emailBannerResendError = ref<string | null>(null);
const emailVerificationDowntimeNotified = ref(false);

watch(
  () => authSession.backendUser?.id,
  () => {
    dismissUnverifiedEmailBanner.value = false;
    dismissGuestUpgradeBanner.value = false;
    emailBannerResendMessage.value = null;
    emailBannerResendError.value = null;
    emailVerificationDowntimeNotified.value = false;
  },
);

watch(
  () => authSession.backendUser?.isGuest,
  (v) => {
    if (v !== true) dismissGuestUpgradeBanner.value = false;
  },
);

watch(
  () => authSession.backendUser?.emailVerified,
  (v) => {
    if (v) dismissUnverifiedEmailBanner.value = false;
    if (v) emailVerificationDowntimeNotified.value = false;
  },
);

const _showEmailVerificationFlashBanner = computed(
  () =>
    !!(
      emailVerificationFlash.value &&
      String(emailVerificationFlash.value).trim()
    ),
);

const showUnverifiedEmailBanner = computed(() => {
  if (EMAIL_VERIFICATION_DOWNTIME) return false;
  if (!isAuthenticated.value || dismissUnverifiedEmailBanner.value)
    return false;
  const u = authSession.backendUser;
  if (!u || u.isGuest) return false;
  const em = u.email?.trim();
  if (!em) return false;
  return u.emailVerified === false;
});

const shouldShowEmailVerificationDowntimeToast = computed(() => {
  if (!EMAIL_VERIFICATION_DOWNTIME) return false;
  if (!isAuthenticated.value) return false;
  if (echoSyncCapabilities.isMockDataMode) return false;
  const u = authSession.backendUser;
  if (!u || u.isGuest) return false;
  const em = u.email?.trim();
  if (!em) return false;
  return u.emailVerified === false;
});

watch(
  () => shouldShowEmailVerificationDowntimeToast.value,
  (show) => {
    if (!show || emailVerificationDowntimeNotified.value) return;
    emailVerificationDowntimeNotified.value = true;
    dispatchAppToastDetail(EMAIL_VERIFICATION_DOWNTIME_TOAST);
  },
  { immediate: true },
);

const showGuestUpgradeBanner = computed(() => {
  if (!isAuthenticated.value || dismissGuestUpgradeBanner.value) return false;
  return authSession.backendUser?.isGuest === true;
});

const showGuestOnboardingModal = computed(() => false);

const discordBotExportReadyGuildNameForBanner = computed(() => {
  const n = discordBotExportReadyBanner.value?.guildName?.trim();
  return n ? n : null;
});

useBrowserTabAttention();

if (isDesktop()) {
  useDesktopNativeAttention();
  useDesktopGlobalShortcutBringFront();
  useDesktopUpdateMonitor();
  useDesktopIncomingCallAttention(dmCallRingUi);
}

const desktopUpdateStore = useDesktopUpdateStore();
const desktopUpdateBannerVisible = computed(
  () => isDesktop() && Boolean(desktopUpdateStore.pendingVersion),
);

async function onDesktopUpdateBannerInstall() {
  if (!isDesktop()) return;
  try {
    await downloadAndRelaunchDesktopUpdate();
  } catch (e) {
    dispatchAppToast(
      e instanceof Error ? e.message : 'Update install failed.',
      'warning',
    );
  }
}

function onDesktopUpdateBannerDismiss() {
  desktopUpdateStore.clearPending();
}

/** Any HTTP response counts as reachable; probes use cookies like the rest of the app. */
async function verifyEchoApiReachableAfterHealthOk(): Promise<boolean> {
  try {
    const ts = Date.now();
    await fetch(
      `${API_BASE.replace(/\/$/, '')}/api/v1/auth/me?recoverProbe=${ts}`,
      {
        method: 'GET',
        credentials: 'include',
        cache: 'no-store',
      },
    );
    return true;
  } catch {
    return false;
  }
}

async function checkServerHealthNow() {
  serverHealthChecking.value = true;
  const wasDown = serverHealthDown.value;
  const checkedAt = Date.now();
  try {
    const res = await fetch(
      `${API_BASE.replace(/\/$/, '')}/api/v1/health?ts=${checkedAt}`,
      {
        method: 'GET',
        cache: 'no-store',
      },
    );
    serverHealthLastCheckedAtMs.value = checkedAt;
    if (res.ok) {
      const apiReachable = await verifyEchoApiReachableAfterHealthOk();
      if (!apiReachable) {
        serverHealthDown.value = true;
        if (!serverHealthOutageSinceMs.value) {
          serverHealthOutageSinceMs.value = checkedAt;
        }
        return;
      }
      serverHealthDown.value = false;
      serverHealthOutageSinceMs.value = null;
      primaryFlowFailureDetail.value = null;
      primaryFlowFailureBanner.value = null;
      if (wasDown) {
        triggerServerRecoveryReload();
      }
    } else {
      serverHealthDown.value = true;
      if (!serverHealthOutageSinceMs.value) {
        serverHealthOutageSinceMs.value = checkedAt;
      }
    }
  } catch {
    serverHealthLastCheckedAtMs.value = checkedAt;
    serverHealthDown.value = true;
    if (!serverHealthOutageSinceMs.value) {
      serverHealthOutageSinceMs.value = checkedAt;
    }
  } finally {
    serverHealthChecking.value = false;
  }
}

function clearServerHealthPolling() {
  if (serverHealthPollTimer != null) {
    clearInterval(serverHealthPollTimer);
    serverHealthPollTimer = null;
  }
}

const primaryFlowFailureBanner = ref<string | null>(null);
const primaryFlowFailureDetail = ref<PrimaryFlowFailureDetail | null>(null);
let unsubscribePrimaryFlowFailures: (() => void) | null = null;
let unsubscribeDesktopTray: (() => void) | undefined;

// --- Server health polling ---
// Activated when a primary-flow failure suggests the API is unreachable (session restore,
// realtime connect, workspace hydrate, etc.). The gate is shown once `/health` confirms down;
// recovery requires `/health` plus a reachable `/auth/me` before clearing signals / reload.
const serverHealthChecking = ref(false);
const serverHealthDown = ref(false);
/** Timestamp when the outage was first detected — drives the "downtime" counter in ServerDownGate. */
const serverHealthOutageSinceMs = ref<number | null>(null);
const serverHealthLastCheckedAtMs = ref<number | null>(null);
/** Prevents triggering a second reload if the health check races back while a reload is in flight. */
const serverHealthRecoveringReload = ref(false);
let serverHealthPollTimer: ReturnType<typeof setInterval> | null = null;

/** True when the latest primary-flow failure looks like backend/API unreachability. */
const likelyBackendDownPrimaryFlow = computed(() => {
  const d = primaryFlowFailureDetail.value;
  return d ? primaryFlowFailureSuggestsBackendUnreachable(d) : false;
});

const serverDownGateDetail = computed(() => {
  const b = primaryFlowFailureBanner.value?.trim();
  if (b) return b;
  const d = primaryFlowFailureDetail.value;
  if (!d) return null;
  const u = d.userMessage?.trim();
  return u || `Primary flow error — ${d.flow}: ${d.message}`;
});

/**
 * Full-screen downtime gate: confirmed `/health` outage plus a strong unreachability signal.
 * Not limited to the welcome-back explore surface (signed-in explore also used to hide the gate).
 */
const showServerDownGate = computed(
  () =>
    !echoSyncCapabilities.isMockDataMode &&
    likelyBackendDownPrimaryFlow.value &&
    serverHealthDown.value,
);

function triggerServerRecoveryReload() {
  if (serverHealthRecoveringReload.value) return;
  serverHealthRecoveringReload.value = true;
  // Throttle reloads to once per 30 s to avoid a reload loop when the service is flapping.
  try {
    const now = Date.now();
    const key = 'echo_server_recovery_reload_at';
    const prev = Number(window.sessionStorage.getItem(key) || '0');
    if (Number.isFinite(prev) && prev > 0 && now - prev < 30_000) {
      // Reload throttled — allow polling to continue so recovery can be detected later.
      serverHealthRecoveringReload.value = false;
      return;
    }
    window.sessionStorage.setItem(key, String(now));
  } catch {
    /* ignore storage availability issues */
  }
  clearServerHealthPolling();
  // Brief delay lets any in-flight Vue updates settle before the page reloads.
  window.setTimeout(() => {
    window.location.reload();
  }, 450);
}

watch(
  likelyBackendDownPrimaryFlow,
  (on) => {
    clearServerHealthPolling();
    if (!on) {
      // Primary flow recovered — reset all health state.
      serverHealthChecking.value = false;
      serverHealthDown.value = false;
      serverHealthOutageSinceMs.value = null;
      serverHealthLastCheckedAtMs.value = null;
      return;
    }
    // Poll every 5s; first check fires immediately.
    void checkServerHealthNow();
    serverHealthPollTimer = setInterval(() => {
      void checkServerHealthNow();
    }, 5000);
  },
  { immediate: true },
);

type UiErrorBannerState = {
  message: string;
  severity: UIErrorSeverity;
  retryAction?: () => void;
  /** Echo API error code when surfaced via `UIErrorBus` (e.g. `GUEST_FORBIDDEN`). */
  code?: string;
};

const uiErrorBanner = ref<UiErrorBannerState | null>(null);
const uiErrorRetryBusy = ref(false);
let uiErrorAutoDismissTimer: ReturnType<typeof setTimeout> | null = null;
const HEADER_INFO_AUTO_DISMISS_MS = 15_000;
let unsubscribeUiErrors: (() => void) | null = null;

type ActiveAppToast = AppToastDetail & {
  severity: AppToastSeverity;
  durationMs: number;
  actions: AppToastAction[];
  variant: 'default' | 'incoming_call' | 'incoming_chat_message';
  showAutoDismissProgress?: boolean;
};

const appToast = ref<ActiveAppToast | null>(null);
const toastQuickReplyText = ref('');
const appToastProgressEpoch = ref(0);
let appToastClearTimer: ReturnType<typeof setTimeout> | null = null;
const {
  menuOpen: appToastContextMenuOpen,
  menuRef: appToastContextMenuRef,
  menuPosition: appToastContextMenuPosition,
  openAtEvent: openAppToastContextMenuAtEvent,
  closeMenu: closeAppToastContextMenu,
} = useSimpleContextMenu();
/** Debounce closing fullscreen when the media track drops (avoid flicker on quick swaps). */
let fullscreenStreamLostDefer: ReturnType<typeof setTimeout> | null = null;
let unsubscribeAppToastsFn: (() => void) | null = null;

const appToastIsRich = computed(
  () =>
    appToast.value?.variant === 'incoming_call' ||
    appToast.value?.variant === 'incoming_chat_message',
);

const appToastProgressVisible = computed(() => {
  const t = appToast.value;
  return (
    !!t &&
    t.showAutoDismissProgress === true &&
    t.durationMs > 0 &&
    t.variant !== 'incoming_call' &&
    t.variant !== 'incoming_chat_message'
  );
});

const appToastContainerClass = computed(() => {
  const t = appToast.value;
  if (!t) return 'app-toast-glass';
  const severityClassByKey: Record<AppToastSeverity, string> = {
    success: 'app-toast-glass--success',
    info: 'app-toast-glass--info',
    warning: 'app-toast-glass--warning',
    error: 'app-toast-glass--error',
  };
  return [
    'app-toast-glass',
    'relative',
    severityClassByKey[t.severity],
    t.variant === 'incoming_call' ? 'app-toast-incoming-call' : '',
  ]
    .filter(Boolean)
    .join(' ');
});

const appToastLeadingIconSrc = computed(() => {
  const t = appToast.value;
  if (!t) return icons.more;
  const custom = t.leadingIconSrc?.trim();
  if (custom) return custom;
  if (t.variant === 'incoming_chat_message') return icons.messageFilled;
  switch (t.severity) {
    case 'success':
      return icons.friendAdded;
    case 'warning':
      return icons.notificationsOff;
    case 'error':
      return icons.banUser;
    case 'info':
    default:
      return icons.more;
  }
});

/** When the composer is focused, use a larger bottom inset so the toast clears the bar (still bottom-anchored). */
const chatComposerFocusedForToast = ref(false);

watch(appToast, (v) => {
  if (!v) {
    toastQuickReplyText.value = '';
    closeAppToastContextMenu();
  }
});

function onAppToastContextMenu(ev: MouseEvent) {
  const toast = appToast.value;
  if (!canOpenToastMessageContextMenu(toast)) return;
  if (!shouldOpenToastMessageContextMenu(ev)) return;
  void openAppToastContextMenuAtEvent(ev);
}

const hasAppToastPrimaryContextAction = computed(() => {
  const toast = appToast.value;
  if (!toast) return false;
  return resolveToastMessagePrimaryAction(toast.actions) != null;
});

function openMessageChannelFromToastContextMenu() {
  const toast = appToast.value;
  if (!toast) return;
  const action = resolveToastMessagePrimaryAction(toast.actions);
  if (!action) return;
  closeAppToastContextMenu();
  onAppToastAction(action);
}

function dismissToastFromContextMenu() {
  closeAppToastContextMenu();
  dismissAppToast();
}

function onChatComposerFocusForToast(e: Event) {
  const ce = e as CustomEvent<{ focused?: boolean }>;
  chatComposerFocusedForToast.value = ce.detail?.focused === true;
}

/**
 * Lift bottom-fixed toasts above the chat composer bar. Focus alone is not enough:
 * message notifications (`incoming_chat_message`) often fire while the composer
 * is visible but unfocused, which previously pinned the toast under the input strip.
 *
 * Any surface that pins a composer / bottom chrome (compact guild tri-pane, compact DMs,
 * desktop guild channel, desktop DM thread) needs the larger inset — otherwise success /
 * error toasts sit under the bar and read as “missing”.
 */
const appToastClearsBottomChrome = computed(() => {
  if (chatComposerFocusedForToast.value) return true;
  if (appToast.value?.variant === 'incoming_chat_message') return true;
  if (useCompactTriPaneShell.value) return true;
  if (useCompactDmShell.value) return true;
  if (unref(hasGuildChannelChrome)) return true;
  const surface = unref(mainSurface);
  return unref(isDmUiContext) && surface?.type === 'dmThread';
});

/** Pixels of layout viewport below the visual viewport (iOS keyboard / chrome). */
const visualViewportToastBottomExtraPx = ref(0);
let appToastViewportMetricsRaf = 0;

function syncAppToastVisualViewportBottomExtraNow() {
  if (typeof window === 'undefined' || !window.visualViewport) {
    visualViewportToastBottomExtraPx.value = 0;
    return;
  }
  const vv = window.visualViewport;
  const innerH = window.innerHeight;
  const gap = innerH - vv.offsetTop - vv.height;
  const raw = Math.max(0, Math.round(gap));
  /* Buggy `visualViewport` metrics (some WebViews / split layouts) can report a huge gap,
   * which blows up `bottom` + `max-height` and effectively hides the toast off-screen. */
  const cap = Math.min(Math.round(innerH * 0.55), 520);
  visualViewportToastBottomExtraPx.value = Math.min(raw, cap);
}

function scheduleAppToastVisualViewportBottomExtra() {
  if (typeof window === 'undefined') return;
  if (appToastViewportMetricsRaf !== 0) return;
  appToastViewportMetricsRaf = window.requestAnimationFrame(() => {
    appToastViewportMetricsRaf = 0;
    syncAppToastVisualViewportBottomExtraNow();
  });
}

function onAppToastVisualViewportChanged() {
  scheduleAppToastVisualViewportBottomExtra();
}

const appToastShellPositionStyle = computed(() => {
  const elevated = appToastClearsBottomChrome.value;
  const baseBottomCss = elevated
    ? 'max(8rem, calc(env(safe-area-inset-bottom, 0px) + 6rem))'
    : 'max(1rem, env(safe-area-inset-bottom, 0px))';
  const extra = visualViewportToastBottomExtraPx.value;
  const bottom =
    extra > 0 ? `calc(${baseBottomCss} + ${extra}px)` : baseBottomCss;
  /* Use dvh (not svh) so max-height tracks the same dynamic viewport that `position: fixed`
   * + `bottom` use on most engines; svh/dvh mismatch was letting the toast extend past the
   * visible fold while still honoring max-height math in the “wrong” viewport. */
  const maxH = elevated
    ? `min(90dvh, calc(100dvh - max(8rem, calc(env(safe-area-inset-bottom, 0px) + 6rem)) - ${extra}px - 1rem))`
    : `min(90dvh, calc(100dvh - max(1rem, env(safe-area-inset-bottom, 0px)) - ${extra}px - 1rem))`;
  return { bottom, maxHeight: maxH };
});

const appToastShellClass = computed(() => {
  /* Grid + minmax(0,1fr) guarantees the scroll row gets a definite bounded height under
   * max-height (flex-1 + h-0 alone could leave the scroll region at intrinsic height and
   * clip the quick-reply strip at the shell’s overflow:hidden edge). */
  const shell =
    'box-border grid min-h-0 grid-rows-[minmax(0,1fr)_auto] overflow-hidden overscroll-contain';
  return appToastIsRich.value
    ? `pointer-events-auto fixed left-1/2 z-[500] w-[min(26rem,calc(100vw-1rem))] -translate-x-1/2 rounded-xl px-3 py-2.5 text-[13px] shadow-2xl ${shell}`
    : `pointer-events-auto fixed left-1/2 z-[500] w-[min(24rem,calc(100vw-1rem))] -translate-x-1/2 rounded-xl px-2.5 py-2 text-[13px] shadow-2xl ${shell}`;
});

const callRingtoneStore = useCallRingtoneStore();
const { muted: ringtoneMuted } = storeToRefs(callRingtoneStore);

function isEditableEventTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  if (el.closest('[contenteditable="true"]')) return true;
  return ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName);
}

function onGlobalShortcutKeydown(e: KeyboardEvent) {
  if (e.defaultPrevented || e.isComposing) return;
  const action = findActionForKeyboardEvent(e);
  if (!action) return;
  if (isEditableEventTarget(e.target) && !action.startsWith('navigation.'))
    return;
  switch (action) {
    case 'voice.toggleMute':
      e.preventDefault();
      if (dmCallWithUserId.value) {
        toggleDmCallMuted();
      } else {
        onGuildChannelVcMuted(!channelPanelVcMutedEffective.value);
      }
      break;
    case 'voice.toggleDeafen':
      e.preventDefault();
      if (dmCallWithUserId.value) {
        applyDmCallDeafened(!dmCallDeafened.value);
      } else {
        onGuildChannelVcDeafened(!channelPanelVcDeafenedEffective.value);
      }
      break;
    case 'navigation.quickSwitcher':
    case 'navigation.openSearch':
      e.preventDefault();
      window.dispatchEvent(
        new CustomEvent('echo:focus-search', { detail: { selectAll: true } }),
      );
      break;
    case 'navigation.markChannelRead':
      e.preventDefault();
      void markActiveChannelAsRead();
      break;
    case 'navigation.selectRailServer1':
    case 'navigation.selectRailServer2':
    case 'navigation.selectRailServer3':
    case 'navigation.selectRailServer4':
    case 'navigation.selectRailServer5': {
      e.preventDefault();
      const slot =
        Number(action.slice('navigation.selectRailServer'.length)) - 1;
      const row = serverStore.visibleServers[slot];
      if (row?.id) openServerSurface(row.id);
      break;
    }
    default:
      break;
  }
}

function clearAppToastOnly() {
  if (appToastClearTimer != null) {
    clearTimeout(appToastClearTimer);
    appToastClearTimer = null;
  }
  appToast.value = null;
}

/** Dismiss control (e.g. ×). Incoming call: same as declining. */
function dismissAppToast() {
  const incomingCall = appToast.value?.variant === 'incoming_call';
  clearAppToastOnly();
  toastQuickReplyText.value = '';
  if (incomingCall) {
    void declineDmCall();
  }
}

function submitToastQuickReply() {
  const t = appToast.value;
  const cid = t?.quickReplyChannelId?.trim();
  if (!cid || t?.variant !== 'incoming_chat_message') return;
  const body = toastQuickReplyText.value.trim();
  if (!body) return;
  if (!sendEchoToastQuickReply(cid, body)) {
    dispatchAppToast('Could not send message.', 'warning');
    return;
  }
  toastQuickReplyText.value = '';
  clearAppToastOnly();
}

function onAppToastAction(action: AppToastAction) {
  try {
    action.run();
  } finally {
    if (action.keepOpen !== true) {
      clearAppToastOnly();
    }
  }
}

function incomingCallToastActionIconSrc(actionId: string): string {
  switch (actionId) {
    case 'answer':
      return icons.phoneCall;
    case 'decline':
      return icons.logOut;
    case 'mute_ringtone':
      return ringtoneMuted.value ? icons.volumeUp : icons.notificationsOff;
    default:
      return '';
  }
}

function incomingCallToastActionLabel(action: AppToastAction): string {
  if (action.id === 'mute_ringtone') {
    return ringtoneMuted.value ? 'Unmute' : 'Mute';
  }
  return action.label;
}

function incomingCallToastActionTitle(action: AppToastAction): string {
  if (action.id === 'mute_ringtone') {
    return ringtoneMuted.value ? 'Unmute ringtone' : 'Mute ringtone';
  }
  if (action.id === 'answer') return 'Answer call';
  if (action.id === 'decline') return 'Decline call';
  return action.label;
}

onMounted(() => {
  if (isDesktop()) {
    void import('@tauri-apps/api/event').then(({ listen }) => {
      void listen<{ action?: string }>('echo-desktop-tray', async (event) => {
        const action = event.payload?.action;
        await bringMainWindowToForeground();
        if (action === 'open-messages') {
          openDmInboxFromRailOverflow();
        } else if (action === 'open-notification-settings') {
          openUserSettingsModal('Notifications');
        } else if (action === 'toggle-desktop-alerts') {
          const np = useNotificationPreferencesStore();
          np.patch({ desktopAlerts: !np.settings.desktopAlerts });
        }
      }).then((unlisten) => {
        unsubscribeDesktopTray = unlisten;
      });
    });
  }

  unsubscribePrimaryFlowFailures = subscribePrimaryFlowFailures((d) => {
    primaryFlowFailureDetail.value = d;
    if (!d.suppressBanner) {
      const friendly = d.userMessage?.trim();
      primaryFlowFailureBanner.value = friendly
        ? friendly
        : `Primary flow error — ${d.flow}: ${d.message}`;
    }
  });
  unsubscribeUiErrors = subscribeUIErrors((d) => {
    if (uiErrorAutoDismissTimer != null) {
      clearTimeout(uiErrorAutoDismissTimer);
      uiErrorAutoDismissTimer = null;
    }
    uiErrorBanner.value = {
      message: d.userMessage,
      severity: d.severity,
      retryAction: d.retryAction,
      code: d.code,
    };
    uiErrorAutoDismissTimer = setTimeout(() => {
      uiErrorAutoDismissTimer = null;
      uiErrorBanner.value = null;
    }, HEADER_INFO_AUTO_DISMISS_MS);
  });
  unsubscribeAppToastsFn = subscribeAppToasts((d) => {
    const incomingActions = Array.isArray(d.actions) ? d.actions : [];
    const currentHasActions = !!appToast.value?.actions.length;
    const incomingHasActions = incomingActions.length > 0;
    // Keep the incoming-call toast visible until answered — do not let passive
    // toasts replace it. Other actionable toasts (e.g. E2EE device) auto-dismiss.
    if (
      appToast.value?.variant === 'incoming_call' &&
      currentHasActions &&
      !incomingHasActions &&
      (d.severity ?? 'info') !== 'warning'
    ) {
      return;
    }
    if (appToastClearTimer != null) clearTimeout(appToastClearTimer);
    const durationMs =
      typeof d.durationMs === 'number' && Number.isFinite(d.durationMs)
        ? Math.max(0, d.durationMs)
        : 3500;
    if (d.showAutoDismissProgress === true && durationMs > 0) {
      appToastProgressEpoch.value += 1;
    }
    appToast.value = {
      message: d.message,
      severity: d.severity ?? 'info',
      durationMs,
      actions: incomingActions,
      title: d.title,
      subtitle: d.subtitle,
      variant:
        d.variant === 'incoming_call'
          ? 'incoming_call'
          : d.variant === 'incoming_chat_message'
            ? 'incoming_chat_message'
            : 'default',
      leadingIconSrc: d.leadingIconSrc,
      imageUrl: d.imageUrl,
      badge: d.badge,
      quickReplyChannelId: d.quickReplyChannelId,
      showAutoDismissProgress: d.showAutoDismissProgress === true,
    };
    if (durationMs > 0) {
      appToastClearTimer = setTimeout(() => {
        appToastClearTimer = null;
        appToast.value = null;
      }, durationMs);
    }
  });
  window.addEventListener('keydown', onGlobalShortcutKeydown);
  window.addEventListener(
    ECHO_CHAT_COMPOSER_FOCUS_EVENT,
    onChatComposerFocusForToast,
  );

  syncAppToastVisualViewportBottomExtraNow();
  window.addEventListener('resize', onAppToastVisualViewportChanged);
  if (window.visualViewport) {
    const vv = window.visualViewport;
    vv.addEventListener('resize', onAppToastVisualViewportChanged);
    vv.addEventListener('scroll', onAppToastVisualViewportChanged);
  }

  void nextTick(() => {
    if (typeof ResizeObserver === 'undefined') return;
    const el = mainContentAreaEl.value;
    if (!el) return;
    memberPanelMainWidthObserver = new ResizeObserver(() => {
      maybeAutoCollapseMemberPanelForMainWidth();
      maybeAutoCollapseDmProfilePanelForMainWidth();
      maybeAutoOpenDmProfilePanel();
    });
    memberPanelMainWidthObserver.observe(el);
    maybeAutoCollapseMemberPanelForMainWidth();
    maybeAutoCollapseDmProfilePanelForMainWidth();
    maybeAutoOpenDmProfilePanel();
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
  clearServerHealthPolling();
  disposeAppLayoutSideEffects();
});

function dismissPrimaryFlowFailureBanner() {
  primaryFlowFailureBanner.value = null;
  primaryFlowFailureDetail.value = null;
}

function dismissUiErrorBanner() {
  if (uiErrorAutoDismissTimer != null) {
    clearTimeout(uiErrorAutoDismissTimer);
    uiErrorAutoDismissTimer = null;
  }
  uiErrorBanner.value = null;
}

async function onUiErrorRetry() {
  const act = uiErrorBanner.value?.retryAction;
  if (!act || uiErrorRetryBusy.value) return;
  if (uiErrorAutoDismissTimer != null) {
    clearTimeout(uiErrorAutoDismissTimer);
    uiErrorAutoDismissTimer = null;
  }
  uiErrorRetryBusy.value = true;
  try {
    await Promise.resolve(act());
  } finally {
    uiErrorRetryBusy.value = false;
  }
}

function onUiErrorCreateAccount() {
  openAuthModal({ tab: 'register' });
  dismissUiErrorBanner();
}

function dismissEmailVerificationFlash() {
  authSession.clearEmailVerificationFlash();
}

function dismissUnverifiedEmailBannerClick() {
  dismissUnverifiedEmailBanner.value = true;
  emailBannerResendMessage.value = null;
  emailBannerResendError.value = null;
}

function onGuestUpgradeBannerOpenSettings() {
  openUserSettingsModal('Account');
}

function dismissGuestUpgradeBannerClick() {
  dismissGuestUpgradeBanner.value = true;
}

function onUnverifiedEmailChangeEmail() {
  try {
    sessionStorage.setItem('echo_settings_change_email', '1');
  } catch {
    /* ignore */
  }
  openUserSettingsModal('Account');
}

async function onUnverifiedEmailResend() {
  if (EMAIL_VERIFICATION_DOWNTIME) {
    dispatchAppToastDetail(EMAIL_VERIFICATION_DOWNTIME_TOAST);
    return;
  }
  emailBannerResendMessage.value = null;
  emailBannerResendError.value = null;
  if (!authSession.isAuthenticated) return;
  emailBannerResendBusy.value = true;
  try {
    await authResendVerification();
    emailBannerResendMessage.value =
      'Check your inbox for a new verification link.';
  } catch (e) {
    if (
      e instanceof AuthApiError &&
      e.body.code === 'VERIFICATION_EMAIL_COOLDOWN'
    ) {
      emailBannerResendError.value =
        'Please wait before requesting another email.';
    } else if (e instanceof AuthApiError) {
      emailBannerResendError.value = e.message;
    } else {
      emailBannerResendError.value = 'Could not send email. Try again later.';
    }
  } finally {
    emailBannerResendBusy.value = false;
  }
}

function onGuestUpgradeSignInExisting() {
  isGuestUpgradeModalOpen.value = false;
  openAuthModal();
}

function onGuestUpgradeSignInFromSettings() {
  onUserSettingsModalUpdate(false);
  onGuestUpgradeSignInExisting();
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
    inviteModalVoiceChannelName.value =
      payload?.voiceChannelName?.trim() ?? null;
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
  hideServerRail: welcomeBackExploreGate,
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
  currentUserForServerList: computed(() =>
    isAuthenticated.value ? (currentUser.value ?? null) : null,
  ),
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
  mentionNotificationServers,
  isPersistedEchoDmThread,
  dmNotificationsReadPreset,
  dmNotificationsSourceKey,
  dmCallWithUserId,
  dmCallRinging,
  dmCallRingRemoteVanishing,
  phoneCallIcon: computed(() => icons.phoneCall),
  selectedServer: computed(() => selectedServer.value ?? null),
  categoriesForServer,
  activeChannelId,
  currentUser: computed(() => currentUser.value ?? undefined),
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
  vcActivityKingUserId: effectiveVcActivityKingUserId,
  openMemberProfile,
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
  onToggleDmPanel: selectDMTab,
  onSelectIncomingDm: selectIncomingDmFromRail,
  onSelectIncomingGroupDm: selectIncomingGroupDmFromRail,
  onOpenDmInboxOverflow: openDmInboxFromRailOverflow,
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
  onDmUpdateNotificationsReadPreset: (preset) => {
    dmNotificationsReadPreset.value = preset;
  },
  onDmUpdateNotificationsSourceKey: (key) => {
    dmNotificationsSourceKey.value = key;
  },
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
  onGuildEventRsvp: async (payload) => {
    try {
      /* Cookie session: bearer token is unused by `echoFetch` (see `transport.ts`). */
      await putGuildEventRsvp('', payload.serverId, payload.eventId, payload.status);
      await hydrateEchoFromApi();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      dispatchAppToastDetail({
        message: msg.includes('EVENT_FULL')
          ? 'This event is at capacity.'
          : 'Could not update RSVP. Try again.',
        durationMs: 4000,
      });
    }
  },
  onOpenGuildEventChannel: (payload) => {
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

/** Canonical teardown for bus subscriptions, toast timer, and member panel width observer. */
function disposeAppLayoutSideEffects() {
  unsubscribeDesktopTray?.();
  unsubscribeDesktopTray = undefined;
  registerEchoToastQuickReplySender(null);
  unsubscribePrimaryFlowFailures?.();
  unsubscribePrimaryFlowFailures = null;
  unsubscribeUiErrors?.();
  unsubscribeUiErrors = null;
  if (uiErrorAutoDismissTimer != null) {
    clearTimeout(uiErrorAutoDismissTimer);
    uiErrorAutoDismissTimer = null;
  }
  unsubscribeAppToastsFn?.();
  unsubscribeAppToastsFn = null;
  if (appToastClearTimer != null) clearTimeout(appToastClearTimer);
  appToastClearTimer = null;
  if (fullscreenStreamLostDefer != null) {
    clearTimeout(fullscreenStreamLostDefer);
    fullscreenStreamLostDefer = null;
  }
  memberPanelMainWidthObserver?.disconnect();
  memberPanelMainWidthObserver = null;
  window.removeEventListener('keydown', onGlobalShortcutKeydown);
  window.removeEventListener(
    ECHO_CHAT_COMPOSER_FOCUS_EVENT,
    onChatComposerFocusForToast,
  );
  if (appToastViewportMetricsRaf !== 0) {
    window.cancelAnimationFrame(appToastViewportMetricsRaf);
    appToastViewportMetricsRaf = 0;
  }
  window.removeEventListener('resize', onAppToastVisualViewportChanged);
  if (typeof window !== 'undefined' && window.visualViewport) {
    const vv = window.visualViewport;
    vv.removeEventListener('resize', onAppToastVisualViewportChanged);
    vv.removeEventListener('scroll', onAppToastVisualViewportChanged);
  }
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

const lastAutoOpenedDmProfileUserId = ref<string | null>(null);

function maybeAutoOpenDmProfilePanel() {
  if (!isInDMChat.value) {
    lastAutoOpenedDmProfileUserId.value = null;
    return;
  }
  if (dmCallFullscreen.value) return;
  if (isGroupDM.value) return;
  const userId = selectedDMUserId.value?.trim();
  if (!userId) return;
  if (lastAutoOpenedDmProfileUserId.value === userId) return;
  if (!canShowDmProfilePanelForWidth()) return;
  openExpandedProfilePanelForUserId(userId);
  lastAutoOpenedDmProfileUserId.value = userId;
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
      selectedDMUserId.value,
      isExpandedProfileModalOpen.value,
      isExpandedProfileSidePanel.value,
      isGroupOverviewOpen.value,
      isGroupDM.value,
    ] as const,
  () => {
    void nextTick(() => {
      if (isGroupDM.value) {
        lastAutoOpenedDmProfileUserId.value = null;
      }
      maybeAutoOpenDmProfilePanel();
      maybeAutoCollapseDmProfilePanelForMainWidth();
    });
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
    >Skip to messages</a>

    <!-- Navigation announcer: announces active channel/server context on navigation.
         sr-only ensures it is invisible but still read by screen readers. -->
    <div
      aria-live="polite"
      aria-atomic="true"
      class="sr-only"
    >{{ navAnnouncerText }}</div>

    <DesktopTitlebar v-if="isDesktop()" />
    <div
      v-if="desktopUpdateBannerVisible"
      class="flex shrink-0 items-center justify-between gap-3 border-b border-border bg-indigo-950/95 px-4 py-2.5 text-sm text-white"
      role="status"
    >
      <span class="min-w-0 font-medium">
        Echo update available:
        <span class="text-fg">{{ desktopUpdateStore.pendingVersion }}</span>
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
    <Teleport to="body">
      <div
        v-if="appToast"
        :class="[appToastShellClass, appToastContainerClass]"
        :style="appToastShellPositionStyle"
        role="status"
        @contextmenu="onAppToastContextMenu"
        @auxclick="onAppToastContextMenu"
      >
        <div
          class="min-h-0 min-w-0 overflow-x-hidden overflow-y-auto overscroll-contain [grid-row:1]"
        >
          <div class="app-toast-incoming-call__inner flex items-start gap-2.5">
            <div
              v-if="appToastIsRich"
              class="app-toast-incoming-call__avatar-col relative mt-0.5 h-11 w-11 shrink-0"
              aria-hidden="true"
            >
              <div
                v-if="appToast.imageUrl"
                class="app-toast-incoming-call__avatar-aura"
                :style="{
                  backgroundImage: `url(${safeImageUrl(appToast.imageUrl)})`,
                }"
              />
              <span
                class="app-toast-incoming-call__pulse pointer-events-none absolute inset-0 rounded-full"
              />
              <img
                v-if="appToast.imageUrl"
                class="relative z-[2] h-full w-full rounded-full object-cover shadow-md ring-1 ring-border"
                :src="safeImageUrl(appToast.imageUrl)"
                alt=""
              />
              <div
                v-else
                class="app-toast-incoming-call__avatar-fallback relative z-[2] flex h-full w-full items-center justify-center rounded-full bg-glass-2 text-base font-semibold text-white shadow-md ring-1 ring-border"
              >
                {{
                  (appToast.title || appToast.message || '?')
                    .trim()
                    .charAt(0) || '?'
                }}
              </div>
              <span
                v-if="appToast.badge"
                class="pointer-events-none absolute -bottom-0.5 -right-0.5 z-[3] flex min-h-[1.15rem] min-w-[1.15rem] items-center justify-center rounded-full border-2 border-[var(--echo-avatar-ring-bg)] bg-[#f23f42] px-1 text-[10px] font-bold leading-none text-white shadow-sm"
                >{{ appToast.badge }}</span
              >
            </div>
            <div class="min-w-0 flex-1">
              <p
                v-if="appToast.variant === 'incoming_call'"
                class="flex min-w-0 flex-wrap items-center gap-2 leading-snug text-lg font-semibold tracking-tight text-white"
              >
                <span
                  class="app-toast-incoming-call__waves shrink-0"
                  :class="{
                    'app-toast-incoming-call__waves--muted': ringtoneMuted,
                  }"
                  aria-hidden="true"
                >
                  <span class="app-toast-incoming-call__wave" />
                  <span class="app-toast-incoming-call__wave" />
                  <span class="app-toast-incoming-call__wave" />
                </span>
                <span
                  class="min-w-0 break-words text-fg max-sm:[overflow-wrap:anywhere]"
                >
                  {{ appToast.message
                  }}<template v-if="appToast.subtitle">
                    {{ ' ' + appToast.subtitle }}</template
                  >
                </span>
              </p>
              <template
                v-else-if="appToast.variant === 'incoming_chat_message'"
              >
                <p
                  class="min-w-0 truncate text-lg font-semibold leading-snug tracking-tight text-white max-sm:overflow-visible max-sm:whitespace-normal max-sm:break-words"
                >
                  {{ appToast.title }}
                </p>
                <p
                  v-if="appToast.subtitle"
                  class="mt-0.5 truncate text-xs font-medium leading-snug text-fg-soft max-sm:overflow-visible max-sm:whitespace-normal max-sm:break-words"
                >
                  {{ appToast.subtitle }}
                </p>
                <p
                  class="mt-2 line-clamp-3 text-sm leading-snug text-fg-soft [overflow-wrap:anywhere] max-sm:line-clamp-none max-sm:max-h-[min(12rem,42svh)] max-sm:overflow-y-auto max-sm:overscroll-y-contain"
                >
                  {{ appToast.message }}
                </p>
                <div
                  v-if="appToast.quickReplyChannelId?.trim()"
                  class="mt-2.5 flex w-full min-w-0 flex-nowrap items-stretch gap-1.5"
                >
                  <input
                    v-model="toastQuickReplyText"
                    type="text"
                    class="chat-focus-ring min-w-0 flex-1 rounded-md border border-border bg-scrim-1 px-2.5 py-1.5 text-[13px] text-fg placeholder:text-fg-subtle"
                    placeholder="Quick reply…"
                    maxlength="2000"
                    aria-label="Quick reply"
                    @keydown.enter.prevent="submitToastQuickReply"
                  />
                  <button
                    type="button"
                    class="chat-focus-ring shrink-0 rounded-md bg-emerald-500/90 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-400/95 disabled:cursor-not-allowed disabled:opacity-40"
                    :disabled="!toastQuickReplyText.trim()"
                    @click="submitToastQuickReply"
                  >
                    Send
                  </button>
                </div>
              </template>
              <template v-else>
                <div
                  class="app-toast-default-row flex min-w-0 items-start gap-2"
                >
                  <span
                    class="app-toast-default-row__icon flex h-7 w-7 shrink-0 items-center justify-center rounded-lg"
                    aria-hidden="true"
                  >
                    <img
                      :src="appToastLeadingIconSrc"
                      alt=""
                      class="h-4 w-4 opacity-95"
                    />
                  </span>
                  <span class="min-w-0 flex-1 pr-1">
                    <template v-if="appToast.title?.trim()">
                      <p
                        class="leading-snug text-[15px] font-semibold tracking-tight text-fg [overflow-wrap:anywhere] max-sm:break-words"
                      >
                        {{ appToast.title.trim() }}
                      </p>
                      <p
                        v-if="appToast.subtitle?.trim()"
                        class="mt-0.5 text-[12px] leading-snug text-fg-soft [overflow-wrap:anywhere] max-sm:break-words"
                      >
                        {{ appToast.subtitle.trim() }}
                      </p>
                      <p
                        class="mt-1.5 text-[13px] leading-relaxed text-fg [overflow-wrap:anywhere] max-sm:break-words"
                      >
                        {{ appToast.message }}
                      </p>
                    </template>
                    <template v-else>
                      <p
                        class="leading-snug font-medium text-fg [overflow-wrap:anywhere] max-sm:break-words"
                      >
                        {{ appToast.message }}
                      </p>
                      <p
                        v-if="appToast.subtitle"
                        class="mt-0.5 text-[11px] leading-snug text-fg-soft [overflow-wrap:anywhere] max-sm:break-words"
                      >
                        {{ appToast.subtitle }}
                      </p>
                    </template>
                  </span>
                </div>
              </template>
              <div
                v-if="appToast.actions.length"
                :class="
                  appToastIsRich
                    ? 'app-toast-incoming-call__actions mt-3 flex w-full min-w-0 flex-nowrap items-stretch gap-1.5'
                    : 'mt-2.5 flex w-full min-w-0 items-stretch gap-1.5 max-sm:mt-3 max-sm:flex-nowrap sm:flex-wrap sm:items-center'
                "
              >
                <button
                  v-for="action in appToast.actions"
                  :key="
                    action.id === 'mute_ringtone'
                      ? `${action.id}:${ringtoneMuted ? '1' : '0'}`
                      : action.id
                  "
                  type="button"
                  :class="[
                    'chat-focus-ring inline-flex items-center justify-center rounded-md font-semibold transition-[transform,background-color,box-shadow] duration-150',
                    'max-sm:min-w-0 max-sm:flex-1 max-sm:basis-0 max-sm:text-center max-sm:leading-tight max-sm:whitespace-normal',
                    appToastIsRich
                      ? 'min-w-0 flex-1 basis-0 gap-1.5 whitespace-nowrap px-2.5 py-2 text-xs leading-tight max-sm:gap-1 max-sm:px-2'
                      : 'gap-2 px-3.5 py-2 text-sm max-sm:px-2.5 max-sm:py-2 max-sm:text-xs',
                    appToastIsRich
                      ? action.kind === 'primary'
                        ? 'bg-emerald-500/90 text-white shadow-[0_4px_20px_rgba(16,185,129,0.35)] hover:scale-[1.02] hover:bg-emerald-400/95 active:scale-[0.98]'
                        : 'bg-glass-2 text-fg hover:scale-[1.02] hover:bg-glass-hover active:scale-[0.98]'
                      : action.kind === 'primary'
                        ? 'bg-emerald-500/88 text-white hover:bg-emerald-400/92'
                        : 'bg-glass-2 text-fg hover:bg-glass-hover',
                  ]"
                  :title="
                    appToast.variant === 'incoming_call'
                      ? incomingCallToastActionTitle(action)
                      : undefined
                  "
                  @click="onAppToastAction(action)"
                >
                  <img
                    v-if="
                      appToast.variant === 'incoming_call' &&
                      incomingCallToastActionIconSrc(action.id)
                    "
                    :src="incomingCallToastActionIconSrc(action.id)"
                    alt=""
                    :class="[
                      'shrink-0 brightness-0 invert opacity-90',
                      appToastIsRich ? 'h-3.5 w-3.5' : 'h-4 w-4',
                      action.kind === 'primary' ? 'opacity-95' : 'opacity-80',
                    ]"
                  />
                  {{
                    appToast.variant === 'incoming_call'
                      ? incomingCallToastActionLabel(action)
                      : action.label
                  }}
                </button>
              </div>
            </div>
            <button
              type="button"
              class="chat-focus-ring relative z-[2] inline-flex shrink-0 items-center justify-center rounded-md p-1 transition-colors hover:bg-glass-hover"
              :class="
                appToastIsRich
                  ? 'text-fg-subtle hover:text-fg-soft'
                  : 'text-muted hover:bg-overlay-subtle hover:text-foreground'
              "
              aria-label="Dismiss"
              @click="dismissAppToast"
            >
              <svg
                v-if="appToastIsRich"
                class="h-3.5 w-3.5"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                aria-hidden="true"
              >
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
              <svg
                v-else
                class="h-4 w-4 opacity-80"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                aria-hidden="true"
              >
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
        <div
          v-if="appToastProgressVisible"
          class="pointer-events-none mx-3 mb-1.5 mt-0.5 h-[3px] shrink-0 overflow-hidden rounded-full bg-glass-2/90 [grid-row:2]"
          aria-hidden="true"
        >
          <div
            :key="appToastProgressEpoch"
            class="app-toast-dismiss-progress-fill h-full w-full rounded-full bg-emerald-400/95"
            :style="{ animationDuration: `${appToast.durationMs}ms` }"
          />
        </div>
      </div>
    </Teleport>
    <Teleport to="body">
      <div
        v-if="
          appToast &&
          appToastContextMenuOpen &&
          appToast.variant === 'incoming_chat_message'
        "
        ref="appToastContextMenuRef"
        class="ellipsis-menu fixed z-[120] min-w-[180px] py-1"
        :style="{
          left: `${appToastContextMenuPosition.left}px`,
          top: `${appToastContextMenuPosition.top}px`,
        }"
        @mousedown.stop
        @contextmenu.prevent
      >
        <button
          v-if="hasAppToastPrimaryContextAction"
          type="button"
          class="chat-focus-ring flex w-full items-center gap-2 rounded-sm px-3 py-2 text-left text-sm text-foreground hover:bg-glass-hover"
          @click="openMessageChannelFromToastContextMenu"
        >
          Open conversation
        </button>
        <button
          type="button"
          class="chat-focus-ring flex w-full items-center gap-2 rounded-sm px-3 py-2 text-left text-sm text-fg-soft hover:bg-glass-hover"
          @click="dismissToastFromContextMenu"
        >
          Dismiss notification
        </button>
      </div>
    </Teleport>
    <template v-if="useCompactTriPaneShell">
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
            <template v-if="explorePageUnifiedScroll">
              <div
                class="col-span-full flex min-h-0 min-w-0 flex-col overflow-hidden"
              >
                <div
                  class="custom-scrollbar min-h-0 flex-1 overflow-x-hidden overflow-y-auto"
                >
                  <AppLayoutInfoBanners />
                  <ServerDownGate
                    v-if="showServerDownGate"
                    class="col-span-full min-h-full min-w-0 self-stretch"
                    :checking="serverHealthChecking"
                    :outage-since-ms="serverHealthOutageSinceMs"
                    :last-checked-at-ms="serverHealthLastCheckedAtMs"
                    :detail="serverDownGateDetail"
                    @retry="checkServerHealthNow"
                  />
                  <WelcomeBackExploreGate
                    v-else-if="welcomeBackExploreGate"
                    class="col-span-full min-h-full min-w-0 self-stretch"
                    :member-empty-directory="
                      welcomeBackExploreMemberEmptyDirectory
                    "
                    :show-mobile-back="isCompactShell"
                    @back="mobileShellGoBack"
                    @log-in-echo="openAuthModal({ entry: 'echo' })"
                    @create-account="openAuthModal({ tab: 'register' })"
                    @sign-in-passkey="
                      openAuthModal({ entry: 'social', passkey: true })
                    "
                    @create-server="openAddServerModal('create')"
                    @join-server="openAddServerModal('join')"
                  />
                  <ExploreView
                    v-else
                    class="w-full min-w-0"
                    :discoverable-servers="exploreDiscoverableServers"
                    :show-mobile-back="isCompactShell"
                    @back="mobileShellGoBack"
                    @create-server="openAddServerModal('create')"
                    @join-server="openAddServerModal('join')"
                    @join-suggested="handleJoinDiscoverableServer"
                  />
                </div>
              </div>
            </template>
            <template v-else>
              <AppLayoutInfoBanners />
              <ServerDownGate
                v-if="showServerDownGate"
                class="col-span-full min-h-full min-w-0 self-stretch"
                :checking="serverHealthChecking"
                :outage-since-ms="serverHealthOutageSinceMs"
                :last-checked-at-ms="serverHealthLastCheckedAtMs"
                :detail="serverDownGateDetail"
                @retry="checkServerHealthNow"
              />
              <WelcomeBackExploreGate
                v-else-if="welcomeBackExploreGate"
                class="col-span-full min-h-full min-w-0 self-stretch"
                :member-empty-directory="welcomeBackExploreMemberEmptyDirectory"
                :show-mobile-back="isCompactShell"
                @back="mobileShellGoBack"
                @log-in-echo="openAuthModal({ entry: 'echo' })"
                @create-account="openAuthModal({ tab: 'register' })"
                @sign-in-passkey="
                  openAuthModal({ entry: 'social', passkey: true })
                "
                @create-server="openAddServerModal('create')"
                @join-server="openAddServerModal('join')"
              />
              <AppLayoutChatSurface v-else />
            </template>
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
            <div
              class="col-span-full flex min-h-0 min-w-0 flex-col overflow-hidden"
            >
              <div
                class="custom-scrollbar min-h-0 flex-1 overflow-x-hidden overflow-y-auto"
              >
                <AppLayoutInfoBanners />
                <ServerDownGate
                  v-if="showServerDownGate"
                  class="col-span-full min-h-full min-w-0 self-stretch"
                  :checking="serverHealthChecking"
                  :outage-since-ms="serverHealthOutageSinceMs"
                  :last-checked-at-ms="serverHealthLastCheckedAtMs"
                  :detail="serverDownGateDetail"
                  @retry="checkServerHealthNow"
                />
                <WelcomeBackExploreGate
                  v-else-if="welcomeBackExploreGate"
                  class="col-span-full min-h-full min-w-0 self-stretch"
                  :member-empty-directory="
                    welcomeBackExploreMemberEmptyDirectory
                  "
                  :show-mobile-back="isCompactShell"
                  @back="mobileShellGoBack"
                  @log-in-echo="openAuthModal({ entry: 'echo' })"
                  @create-account="openAuthModal({ tab: 'register' })"
                  @sign-in-passkey="
                    openAuthModal({ entry: 'social', passkey: true })
                  "
                  @create-server="openAddServerModal('create')"
                  @join-server="openAddServerModal('join')"
                />
                <ExploreView
                  v-else
                  class="w-full min-w-0"
                  :discoverable-servers="exploreDiscoverableServers"
                  :show-mobile-back="isCompactShell"
                  @back="mobileShellGoBack"
                  @create-server="openAddServerModal('create')"
                  @join-server="openAddServerModal('join')"
                  @join-suggested="handleJoinDiscoverableServer"
                />
              </div>
            </div>
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
            <template v-if="explorePageUnifiedScroll">
              <div
                class="col-span-full flex min-h-0 min-w-0 flex-col overflow-hidden"
              >
                <div
                  class="custom-scrollbar min-h-0 flex-1 overflow-x-hidden overflow-y-auto"
                >
                  <AppLayoutInfoBanners />
                  <ServerDownGate
                    v-if="showServerDownGate"
                    class="col-span-full min-h-full min-w-0 self-stretch"
                    :checking="serverHealthChecking"
                    :outage-since-ms="serverHealthOutageSinceMs"
                    :last-checked-at-ms="serverHealthLastCheckedAtMs"
                    :detail="serverDownGateDetail"
                    @retry="checkServerHealthNow"
                  />
                  <WelcomeBackExploreGate
                    v-else-if="welcomeBackExploreGate"
                    class="col-span-full min-h-full min-w-0 self-stretch"
                    :member-empty-directory="
                      welcomeBackExploreMemberEmptyDirectory
                    "
                    :show-mobile-back="isCompactShell"
                    @back="mobileShellGoBack"
                    @log-in-echo="openAuthModal({ entry: 'echo' })"
                    @create-account="openAuthModal({ tab: 'register' })"
                    @sign-in-passkey="
                      openAuthModal({ entry: 'social', passkey: true })
                    "
                    @create-server="openAddServerModal('create')"
                    @join-server="openAddServerModal('join')"
                  />
                  <ExploreView
                    v-else
                    class="w-full min-w-0"
                    :discoverable-servers="exploreDiscoverableServers"
                    :show-mobile-back="isCompactShell"
                    @back="mobileShellGoBack"
                    @create-server="openAddServerModal('create')"
                    @join-server="openAddServerModal('join')"
                    @join-suggested="handleJoinDiscoverableServer"
                  />
                </div>
              </div>
            </template>
            <template v-else>
              <AppLayoutInfoBanners />
              <ServerDownGate
                v-if="showServerDownGate"
                class="col-span-full min-h-full min-w-0 self-stretch"
                :checking="serverHealthChecking"
                :outage-since-ms="serverHealthOutageSinceMs"
                :last-checked-at-ms="serverHealthLastCheckedAtMs"
                :detail="serverDownGateDetail"
                @retry="checkServerHealthNow"
              />
              <WelcomeBackExploreGate
                v-else-if="welcomeBackExploreGate"
                class="col-span-full min-h-full min-w-0 self-stretch"
                :member-empty-directory="welcomeBackExploreMemberEmptyDirectory"
                :show-mobile-back="isCompactShell"
                @back="mobileShellGoBack"
                @log-in-echo="openAuthModal({ entry: 'echo' })"
                @create-account="openAuthModal({ tab: 'register' })"
                @sign-in-passkey="
                  openAuthModal({ entry: 'social', passkey: true })
                "
                @create-server="openAddServerModal('create')"
                @join-server="openAddServerModal('join')"
              />
              <AppLayoutChatSurface v-else />
              <AppLayoutMembersColumn />
            </template>
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
          <template v-if="explorePageUnifiedScroll">
            <div
              class="col-span-full flex min-h-0 min-w-0 flex-col overflow-hidden"
            >
              <div
                class="custom-scrollbar min-h-0 flex-1 overflow-x-hidden overflow-y-auto"
              >
                <AppLayoutInfoBanners />
                <ServerDownGate
                  v-if="showServerDownGate"
                  class="col-span-full min-h-full min-w-0 self-stretch"
                  :checking="serverHealthChecking"
                  :outage-since-ms="serverHealthOutageSinceMs"
                  :last-checked-at-ms="serverHealthLastCheckedAtMs"
                  :detail="serverDownGateDetail"
                  @retry="checkServerHealthNow"
                />
                <WelcomeBackExploreGate
                  v-else-if="welcomeBackExploreGate"
                  class="col-span-full min-h-full min-w-0 self-stretch"
                  :member-empty-directory="
                    welcomeBackExploreMemberEmptyDirectory
                  "
                  :show-mobile-back="isCompactShell"
                  @back="mobileShellGoBack"
                  @log-in-echo="openAuthModal({ entry: 'echo' })"
                  @create-account="openAuthModal({ tab: 'register' })"
                  @sign-in-passkey="
                    openAuthModal({ entry: 'social', passkey: true })
                  "
                  @create-server="openAddServerModal('create')"
                  @join-server="openAddServerModal('join')"
                />
                <ExploreView
                  v-else
                  class="w-full min-w-0"
                  :discoverable-servers="exploreDiscoverableServers"
                  :show-mobile-back="isCompactShell"
                  @back="mobileShellGoBack"
                  @create-server="openAddServerModal('create')"
                  @join-server="openAddServerModal('join')"
                  @join-suggested="handleJoinDiscoverableServer"
                />
              </div>
            </div>
          </template>
          <template v-else>
            <AppLayoutInfoBanners />
            <ServerDownGate
              v-if="showServerDownGate"
              class="col-span-full min-h-full min-w-0 self-stretch"
              :checking="serverHealthChecking"
              :outage-since-ms="serverHealthOutageSinceMs"
              :last-checked-at-ms="serverHealthLastCheckedAtMs"
              :detail="serverDownGateDetail"
              @retry="checkServerHealthNow"
            />
            <WelcomeBackExploreGate
              v-else-if="welcomeBackExploreGate"
              class="col-span-full min-h-full min-w-0 self-stretch"
              :member-empty-directory="welcomeBackExploreMemberEmptyDirectory"
              :show-mobile-back="isCompactShell"
              @back="mobileShellGoBack"
              @log-in-echo="openAuthModal({ entry: 'echo' })"
              @create-account="openAuthModal({ tab: 'register' })"
              @sign-in-passkey="
                openAuthModal({ entry: 'social', passkey: true })
              "
              @create-server="openAddServerModal('create')"
              @join-server="openAddServerModal('join')"
            />
            <AppLayoutChatSurface v-else />
            <AppLayoutMembersColumn />
          </template>
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
        <template v-if="explorePageUnifiedScroll">
          <div
            class="col-span-full flex min-h-0 min-w-0 flex-col overflow-hidden"
          >
            <div
              class="custom-scrollbar min-h-0 flex-1 overflow-x-hidden overflow-y-auto"
            >
              <AppLayoutInfoBanners />
              <ServerDownGate
                v-if="showServerDownGate"
                class="col-span-full min-h-full min-w-0 self-stretch"
                :checking="serverHealthChecking"
                :outage-since-ms="serverHealthOutageSinceMs"
                :last-checked-at-ms="serverHealthLastCheckedAtMs"
                :detail="serverDownGateDetail"
                @retry="checkServerHealthNow"
              />
              <WelcomeBackExploreGate
                v-else-if="welcomeBackExploreGate"
                class="col-span-full min-h-full min-w-0 self-stretch"
                :member-empty-directory="welcomeBackExploreMemberEmptyDirectory"
                :show-mobile-back="isCompactShell"
                @back="mobileShellGoBack"
                @log-in-echo="openAuthModal({ entry: 'echo' })"
                @create-account="openAuthModal({ tab: 'register' })"
                @sign-in-passkey="
                  openAuthModal({ entry: 'social', passkey: true })
                "
                @create-server="openAddServerModal('create')"
                @join-server="openAddServerModal('join')"
              />
              <ExploreView
                v-else
                class="w-full min-w-0"
                :discoverable-servers="exploreDiscoverableServers"
                :show-mobile-back="isCompactShell"
                @back="mobileShellGoBack"
                @create-server="openAddServerModal('create')"
                @join-server="openAddServerModal('join')"
                @join-suggested="handleJoinDiscoverableServer"
              />
            </div>
          </div>
        </template>
        <template v-else>
          <AppLayoutInfoBanners />
          <ServerDownGate
            v-if="showServerDownGate"
            class="col-span-full min-h-full min-w-0 self-stretch"
            :checking="serverHealthChecking"
            :outage-since-ms="serverHealthOutageSinceMs"
            :last-checked-at-ms="serverHealthLastCheckedAtMs"
            :detail="serverDownGateDetail"
            @retry="checkServerHealthNow"
          />
          <WelcomeBackExploreGate
            v-else-if="welcomeBackExploreGate"
            class="col-span-full min-h-full min-w-0 self-stretch"
            :member-empty-directory="welcomeBackExploreMemberEmptyDirectory"
            :show-mobile-back="isCompactShell"
            @back="mobileShellGoBack"
            @log-in-echo="openAuthModal({ entry: 'echo' })"
            @create-account="openAuthModal({ tab: 'register' })"
            @sign-in-passkey="openAuthModal({ entry: 'social', passkey: true })"
            @create-server="openAddServerModal('create')"
            @join-server="openAddServerModal('join')"
          />
          <AppLayoutChatSurface v-else />
          <AppLayoutMembersColumn />
        </template>
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
      @update:model-value="() => {}"
    />
    <GuestCaptchaModal
      v-if="isGuestCaptchaModalOpen"
      v-model="isGuestCaptchaModalOpen"
      :site-key="guestCaptchaSiteKey"
      @verified="onGuestCaptchaVerified"
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

.app-toast-incoming-call {
  color: color-mix(in srgb, white 96%, black 4%);
}

.app-toast-glass {
  border: 1px solid transparent;
  background: linear-gradient(
    165deg,
    color-mix(in srgb, white 9%, transparent) 0%,
    color-mix(in srgb, black 60%, transparent) 46%,
    color-mix(in srgb, black 80%, transparent) 100%
  );
  backdrop-filter: blur(20px) saturate(1.15);
  -webkit-backdrop-filter: blur(20px) saturate(1.15);
  box-shadow:
    0 12px 28px color-mix(in srgb, black 48%, transparent),
    0 0 0 1px color-mix(in srgb, white 5%, transparent);
}

.app-toast-glass--warning {
  border-color: transparent;
  background: linear-gradient(
    168deg,
    color-mix(in srgb, salmon 20%, transparent) 0%,
    color-mix(in srgb, black 58%, transparent) 52%,
    color-mix(in srgb, black 80%, transparent) 100%
  );
  box-shadow:
    0 12px 30px color-mix(in srgb, black 52%, transparent),
    0 0 0 1px color-mix(in srgb, salmon 24%, transparent);
}

.app-toast-glass--success {
  border-color: transparent;
  background: linear-gradient(
    168deg,
    color-mix(in srgb, #34d399 22%, transparent) 0%,
    color-mix(in srgb, black 56%, transparent) 50%,
    color-mix(in srgb, black 80%, transparent) 100%
  );
  box-shadow:
    0 12px 30px color-mix(in srgb, black 50%, transparent),
    0 0 0 1px color-mix(in srgb, #34d399 28%, transparent);
}

.app-toast-dismiss-progress-fill {
  transform-origin: left center;
  animation-name: app-toast-dismiss-progress;
  animation-timing-function: linear;
  animation-fill-mode: forwards;
}

@keyframes app-toast-dismiss-progress {
  from {
    transform: scaleX(1);
  }
  to {
    transform: scaleX(0);
  }
}

.app-toast-default-row__icon {
  background: color-mix(in srgb, white 8%, transparent);
  box-shadow: none;
}

.app-toast-default-row__icon img {
  filter: var(--app-toast-icon-filter, invert(1));
}

.app-toast-incoming-call__avatar-col {
  width: 2.5rem;
  height: 2.5rem;
}

.app-toast-incoming-call {
  background: linear-gradient(
    145deg,
    color-mix(in srgb, white 10%, transparent) 0%,
    color-mix(in srgb, black 54%, transparent) 44%,
    color-mix(in srgb, black 76%, transparent) 100%
  );
  backdrop-filter: blur(22px);
  -webkit-backdrop-filter: blur(22px);
  box-shadow:
    0 14px 34px color-mix(in srgb, black 48%, transparent),
    0 0 0 1px color-mix(in srgb, white 5%, transparent);
}

.app-toast-incoming-call__inner {
  position: relative;
}

.app-toast-incoming-call__avatar-aura {
  position: absolute;
  inset: -4px;
  z-index: 0;
  border-radius: 9999px;
  background-size: cover;
  background-position: center;
  filter: blur(8px) saturate(1.25);
  opacity: 0.5;
  pointer-events: none;
  mask-image: radial-gradient(
    circle closest-side at 50% 50%,
    transparent 52%,
    black 78%
  );
  -webkit-mask-image: radial-gradient(
    circle closest-side at 50% 50%,
    transparent 52%,
    black 78%
  );
}

.app-toast-incoming-call__pulse {
  z-index: 1;
  animation: app-toast-incoming-ring 1.8s ease-out infinite;
}

.app-toast-incoming-call__waves {
  display: inline-flex;
  height: 12px;
  align-items: flex-end;
  gap: 2px;
}

.app-toast-incoming-call__waves--muted .app-toast-incoming-call__wave {
  animation: none;
  opacity: 0.28;
  transform: scaleY(0.35);
}

.app-toast-incoming-call__wave {
  display: block;
  width: 2px;
  border-radius: 999px;
  background: color-mix(in srgb, white 42%, transparent);
  transform-origin: center bottom;
  animation: app-toast-incoming-wave 0.85s ease-in-out infinite;
}

[data-theme='light'] .app-toast-incoming-call .text-white {
  color: var(--text);
}

[data-theme='light'] .app-toast-incoming-call .app-toast-incoming-call__wave {
  background: color-mix(in srgb, var(--accent) 55%, transparent);
}

[data-theme='light'] .app-toast-incoming-call input {
  background: color-mix(in srgb, white 88%, transparent);
  border-color: color-mix(in srgb, var(--border) 86%, white 14%);
  color: var(--text);
}

[data-theme='light'] .app-toast-incoming-call input::placeholder {
  color: var(--muted);
}

[data-theme='light'] .app-toast-incoming-call__actions button {
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--border) 84%, white 16%);
}

.app-toast-incoming-call__wave:nth-child(1) {
  height: 5px;
  animation-delay: 0ms;
}

.app-toast-incoming-call__wave:nth-child(2) {
  height: 8px;
  animation-delay: 120ms;
}

.app-toast-incoming-call__wave:nth-child(3) {
  height: 12px;
  animation-delay: 240ms;
}

[data-theme='light'] .app-toast-glass {
  border: 1px solid transparent;
  background: linear-gradient(
    165deg,
    color-mix(in srgb, white 94%, var(--surface) 6%) 0%,
    color-mix(in srgb, white 88%, var(--surface) 12%) 48%,
    color-mix(in srgb, white 84%, var(--surface) 16%) 100%
  );
  box-shadow:
    0 10px 24px color-mix(in srgb, black 10%, transparent),
    0 0 0 1px color-mix(in srgb, var(--border) 42%, transparent);
}

[data-theme='light'] .app-toast-glass--warning {
  background: linear-gradient(
    166deg,
    color-mix(in srgb, #ffb07a 28%, white 72%) 0%,
    color-mix(in srgb, #ffa86f 14%, white 86%) 100%
  );
  box-shadow:
    0 10px 24px color-mix(in srgb, black 11%, transparent),
    0 0 0 1px color-mix(in srgb, #f28b5f 38%, transparent);
}

[data-theme='light'] .app-toast-glass--success {
  background: linear-gradient(
    166deg,
    color-mix(in srgb, #6ee7b7 22%, white 78%) 0%,
    color-mix(in srgb, #d1fae5 12%, white 88%) 100%
  );
  box-shadow:
    0 10px 24px color-mix(in srgb, black 10%, transparent),
    0 0 0 1px color-mix(in srgb, #34d399 42%, transparent);
}

[data-theme='light'] .app-toast-incoming-call {
  color: var(--text);
  background: linear-gradient(
    145deg,
    color-mix(in srgb, white 94%, var(--surface) 6%) 0%,
    color-mix(in srgb, white 86%, var(--surface) 14%) 100%
  );
}

[data-theme='light'] .app-toast-default-row__icon {
  background: color-mix(in srgb, var(--surface) 92%, var(--text) 8%);
  box-shadow: none;
}

[data-theme='light'] .app-toast-default-row__icon img {
  filter: none;
}

[data-theme='light'] .app-toast-incoming-call input[aria-label='Quick reply'] {
  border-color: color-mix(in srgb, var(--border) 85%, transparent);
  background: color-mix(in srgb, white 92%, var(--surface) 8%);
  color: var(--text);
}

[data-theme='light']
  .app-toast-incoming-call
  input[aria-label='Quick reply']::placeholder {
  color: var(--text-muted);
}

[data-theme='light'] .app-toast-incoming-call button {
  box-shadow: none;
}

@keyframes app-toast-incoming-ring {
  0% {
    transform: scale(1);
    box-shadow: 0 0 0 0 color-mix(in srgb, mediumseagreen 28%, transparent);
    opacity: 0.75;
  }
  70% {
    transform: scale(1.05);
    box-shadow: 0 0 0 5px color-mix(in srgb, mediumseagreen 0%, transparent);
    opacity: 0.28;
  }
  100% {
    transform: scale(1.06);
    box-shadow: 0 0 0 0 color-mix(in srgb, mediumseagreen 0%, transparent);
    opacity: 0;
  }
}

@keyframes app-toast-incoming-wave {
  0%,
  100% {
    transform: scaleY(0.35);
    opacity: 0.55;
  }
  50% {
    transform: scaleY(1);
    opacity: 1;
  }
}
</style>
