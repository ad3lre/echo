import {
  computed,
  defineAsyncComponent,
  inject,
  nextTick,
  ref,
  shallowRef,
  watch,
  type Ref,
} from 'vue';
import { useEchoWorkspace } from '@/composables/useEchoWorkspace';
import { useEchoHistory } from '@/composables/useEchoHistory';
import { useChatMessages } from '@/composables/useChatMessages';
import { useMessageReactions } from '@/composables/useMessageReactions';
// Sub-composables
import { useAppLayoutRealtimeSocketBinding } from './useAppLayoutRealtimeSocketBinding';
import { useAppLayoutRailLoadingDerived } from './useAppLayoutRailLoadingDerived';
import { isGuildChannelTreeLoaded } from './guildShellSettling';
import { useAppLayoutChannelManageCapabilities } from './useAppLayoutChannelManageCapabilities';
// `voiceMlsSession` pulls in the ts-mls crypto stack; it is dynamically imported
// at the voice-event handler below so it stays off the first-paint AppLayout chunk.
import { useGuildChannelModals } from './useGuildChannelModals';
import { useEchoWorkspaceLifecycle } from './useEchoWorkspaceLifecycle';
import { useEchoPresenceSync } from '@/services/orchestration/useEchoPresenceSync';
import { useGuildModeration } from './useGuildModeration';
import { useDmSocialActions } from '@/features/dm/composables/useDmSocialActions';
import { useAppLayoutDmRailUnread } from '@/services/orchestration/useAppLayoutDmRailUnread';
import { useAppLayoutLiveChannelCaps } from './useAppLayoutLiveChannelCaps';
import { useAppLayoutNsfwGate } from './useAppLayoutNsfwGate';
import { useAppLayoutPinsIntegration } from './useAppLayoutPinsIntegration';
import { useAppLayoutBootstrap } from './useAppLayoutBootstrap';
import { useAppLayoutGridChrome } from './useAppLayoutGridChrome';
import { useAppLayoutWelcomeBack } from './useAppLayoutWelcomeBack';
import { useInviteLandingFlow } from './useInviteLandingFlow';
import { useAppLayoutServerNotifications } from './useAppLayoutServerNotifications';
import { useAppLayoutServerPingIndicators } from './useAppLayoutServerPingIndicators';
import { useAppLayoutServerRailActions } from './useAppLayoutServerRailActions';
import { useAppLayoutGuestSession } from './useAppLayoutGuestSession';
import { useAppLayoutChatSound } from './useAppLayoutChatSound';
import { useAppLayoutMarkRead } from './useAppLayoutMarkRead';
import { useAppLayoutLeaveServerModal } from './useAppLayoutLeaveServerModal';
import { createOpenEchoGroupDmOnServerInvoker } from '@/features/dm/openEchoGroupDmOnServer';
import { createEchoDmActivityHandler } from '@/features/dm/createEchoDmActivityHandler';
import { createHandleAcceptMessageRequestOpener } from '@/features/dm/createHandleAcceptMessageRequestOpener';
import { createLatestDmInboxTargetForRailResolver } from '@/features/dm/createLatestDmInboxTargetForRailResolver';
import { createStableGoToMessageDelegate } from '@/features/layout/actions/appActionRegistry';
import {
  isAppNavPath,
  parseAppPathname,
} from '@/features/layout/urlNavigation';

import { getChannelDisplayName } from '@/assets/icons';

import { createSubmitPinToggle } from './useAppLayoutSubmitPinToggle';
import { useAppLayoutVoiceContextExpose } from './useAppLayoutVoiceContextExpose';
import { useMockDataModeOffComputed } from './useMockDataModeOffComputed';
import { useAppLayoutMainSurfaceDmFlags } from './useAppLayoutMainSurfaceDmFlags';
import { useDmCallWithUserIdShellLogMirror } from './useDmCallWithUserIdShellLogMirror';
import { updateChannelMessageInBucket } from '@/services/realtime/channelMessageAuthority';
import { useAppLayoutRealtimeHostWiring } from './useAppLayoutRealtimeHostWiring';
import { createVoidingInvoker } from './createVoidingInvoker';
import { createNavigateToChannelActiveOnly } from './createNavigateToChannelActiveOnly';
import { createPinToggleHandlers } from './createPinToggleHandlers';
import { useCanDeleteCurrentEchoServerComputed } from './useCanDeleteCurrentEchoServerComputed';
import { useDmAttentionUnreadMapForPanelComputed } from './useDmAttentionUnreadMapForPanelComputed';
import { useServerNotificationLevelsMapComputed } from './useServerNotificationLevelsMapComputed';
import { createChatSoundMemberRoleIdsGetter } from '@/features/layout/createChatSoundMemberRoleIdsGetter';
import { useLiveChannelCapabilitiesRefreshKey } from './useLiveChannelCapabilitiesRefreshKey';
import { filterPublicExploreDirectoryRows } from '@/services/domain/exploreDirectoryRows';
import { postEchoLeaveServer } from '@/api/echoClient';
import { reportPrimaryFlowFailure } from '@/utils/primaryFlowFailure';
import { dispatchAppToast } from '@/utils/controllerMissingAction';
import { registerEchoToastQuickReplySender } from '@/features/layout/echoToastQuickReplyBridge';
import { useAppLayoutDmThreadInboxSort } from './useAppLayoutDmThreadInboxSort';
import {
  createAppLayoutIsViewingConversationChannel,
  createAppLayoutOpenConversationChannel,
} from './useAppLayoutToastDmNavigation';
import { createAppLayoutReactionSocketFallback } from './useAppLayoutReactionSocketFallback';
import {
  createAppLayoutApplyRealtimeAuthorHint,
  createAppLayoutEnsureReplyTargetMessage,
} from './useAppLayoutRealtimeAuthorHints';
import {
  createAppLayoutVoiceE2eeEpochSupersededHandler,
  createAppLayoutVoiceMlsMessageHandler,
} from './useAppLayoutRealtimeE2eeCallbacks';
import {
  createAppLayoutToggleMemberList,
  useAppLayoutCompactShellExpand,
} from './useAppLayoutCompactShellExpand';
import { hasActivePhoneGuildChannel } from '@/features/layout/phoneShellOverlayState';

import type { WireAppLayoutDmAndShellResult } from './wireAppLayoutDmAndShell';

export type WireAppLayoutVoiceAndRealtimeResult = ReturnType<
  typeof wireAppLayoutVoiceAndRealtime
>;

export function wireAppLayoutVoiceAndRealtime(
  phase1: WireAppLayoutDmAndShellResult,
) {
  const {
    _isOpeningDmThread,
    actionRailTopLayout,
    actionRegistryRef,
    activeChannelContext,
    activeChannelId,
    activeGroupSettingsId,
    activeMemberProfile,
    activeRailTab,
    addServerInitialView,
    addVcYoutubeToQueue,
    applyVcDeafened,
    applyVcYoutubeWatchTogetherRemote,
    applyVcYoutubeWatchTogetherRemoteOnVoice,
    authModalInitialLoginEntry,
    authModalInitialSubView,
    authModalInitialTab,
    authModalPasskeyOnOpen,
    authSession,
    authStateGeneration,
    beginVcActivitySessionChannelLayout,
    bumpVoiceMobileChatFromCallScrollDown,
    bumpVoiceMobileChatFromCallScrollUp,
    callVoice,
    categoriesForServer,
    channelAttentionByChannelId,
    channelIconResolver,
    channelPanelBubbleMode,
    channelPanelCollapsed,
    channelPanelWidth,
    channelTree,
    chatMessageNavBridge,
    closeDMPanel,
    closeGuildMobileVcLobby,
    closeVcActivity,
    compactGuildTriPaneChannelPanelOpen,
    compactPagerPane,
    isCompactPhoneShell,
    mobileBottomTab,
    mobileChannelSheetOpen,
    mobileHomeStack,
    mobileMembersOverlayOpen,
    mobileServersStack,
    createDirectHexInvite,
    currentUser,
    currentUserComputed,
    currentUserIdForSocket,
    currentVoiceChannelId,
    currentVoiceChannelName,
    customStatus,
    desktopStreamingControlMode,
    devModeIdsEnabled,
    devSettings,
    directHexInviteBusy,
    directHexInviteLink,
    discordOnlineByUserId,
    dispatchNav,
    dmActiveTab,
    dmAttentionByChannelId,
    dmCallWithUserIdForShellLog,
    dmPanelWidth,
    echoAttention,
    echoBlockedUserIds,
    echoCanContext,
    echoDmActiveCallParticipantUserIdsByChannelId,
    echoDmLastActivityAtMsByChannelId,
    echoDmLastActivityIdByChannelId,
    echoDmPeerByChannelId,
    echoDmState,
    echoDmThreadIds,
    echoSession,
    effectiveActiveChannel,
    endVcActivitySessionChannelLayout,
    expandVoiceSideChat,
    expandedProfile,
    expandedProfileTargetUserId,
    favoriteDmInboxStore,
    findChannelContextById,
    friendshipQueries,
    fullscreenStreamParticipantId,
    getFirstTextChannelId,
    getLatestDmInboxTargetForRailRef,
    getLatestDmPeerUserIdForRail,
    getServerChannelInfoForMainSurface,
    groupDMLockedIds,
    groupDMPreselectedIds,
    groupDMs,
    groupDmMaxMembers,
    groupDmSettingsInitialFocus,
    guildMobileVcLobby,
    handleActiveChannelChangeNavigation,
    hasGuildChannelChrome,
    hiddenDmInboxStore,
    immediateShellSwitchPending,
    inviteApplicationsEnabled,
    inviteCanCreateDirectHexInvite,
    inviteJoinLinksEnabled,
    inviteLandingActiveComputed,
    inviteLandingActiveRef,
    inviteLinkForServer,
    inviteLinkFromApi,
    inviteLinkFromSelectedServer,
    inviteLinkLookupPending,
    inviteModalVoiceChannelId,
    inviteModalVoiceChannelName,
    isAddServerModalOpen,
    isAuthModalOpen,
    isAuthenticatedComputed,
    isChannelActive,
    isCompactGuildSplitShell,
    isCompactShell,
    isDMPanelOpen,
    isDesktopStreamingControlOpen,
    isDmUiContext,
    isEchoUserBlocked,
    isExpandedProfileModalOpen,
    isExpandedProfileSidePanel,
    isGroupDMModalOpen,
    isGroupDMSettingsOpen,
    isGroupOverviewOpen,
    isGuestComputed,
    isGuildShellSettledForSwitchPending,
    isInviteModalOpen,
    isKnownDmChannelId,
    isMemberPopoutOpen,
    isMoreServersCompact,
    isMoreServersPanelOpen,
    isMoreServersPinned,
    isPersistedEchoDmThread,
    isScreenSharePickerOpen,
    isSelfProfilePopoutOpen,
    isServerEmptyOnboarding,
    isServerSettingsModalOpen,
    isSettingsModalOpen,
    isSystemSettingsOpen,
    isViewingVoiceChannel,
    lastOnlineAtByUserId,
    layoutDims,
    leaveDmUiIfViewingUser,
    linkedDiscordState,
    linkedDiscordUserId,
    mainContentColumns,
    mainSurface,
    markMemberPanelCollapsedByUser,
    markMemberPanelExpandedByUser,
    memberListShowGuests,
    memberPanelAutoCollapseUserOverride,
    memberPanelCollapsed,
    memberPanelWidth,
    memberPopoutAnchor,
    memberPopoutOpenRolesPanel,
    mergeEchoBlockedFromApi,
    mergeEchoDmThread,
    mergeEchoDmThreadFromRealtime,
    mergeEchoDmThreadsFromApi,
    micTestListenDeafenActive,
    moveVcYoutubeInQueue,
    narrowChannelPanelForActivityOverflowStep,
    navTraceId,
    navigateToDmForAnswerRef,
    newlyCreatedServerId,
    onJoinVoice,
    onLeaveVoice,
    onSelectDmUser,
    openAuthModal,
    openDmInboxFromRailOverflow,
    openGuestUpgradeForDmRef,
    openGuildMobileVcLobby,
    openServerSettingsFromUrl,
    openServerSurface,
    openUserSettingsToDiscordFromAddServer,
    openVcActivityClusterRush,
    openVcActivityClusterRushOnVoice,
    openVcActivityCodenames,
    openVcActivityCodenamesOnVoice,
    openVcActivityGarticPhone,
    openVcActivityGarticPhoneOnVoice,
    openVcActivityGooberDash,
    openVcActivityGooberDashOnVoice,
    openVcActivityHangman,
    openVcActivityHangmanOnVoice,
    openVcActivityKrunker,
    openVcActivityKrunkerOnVoice,
    openVcActivityOpenGuessr,
    openVcActivityOpenGuessrOnVoice,
    openVcActivityPicker,
    openVcActivityPickerOnVoice,
    openVcActivityRichup,
    openVcActivityRichupOnVoice,
    openVcActivitySkribblIo,
    openVcActivitySkribblIoOnVoice,
    openVcActivitySkriggles,
    openVcActivitySkrigglesOnVoice,
    openVcActivitySmashKarts,
    openVcActivitySmashKartsOnVoice,
    openVcActivityTicTacToe,
    openVcActivityTicTacToeOnVoice,
    openVcActivityWordle,
    openVcActivityWordleOnVoice,
    openVcActivityYoutubeBrowse,
    openVcActivityYoutubeBrowseOnVoice,
    openVcActivityWatchTogether,
    openVcActivityWatchTogetherOnVoice,
    pfpBarExpanded,
    platform,
    playVcYoutubeAtIndex,
    playVcYoutubeNext,
    playVcYoutubePrevious,
    presenceByUserId,
    presenceMobileByUserId,
    profileNotes,
    rawCategoriesForServer,
    readStateByChannelId,
    removeVcYoutubeFromQueue,
    resetChannelWidth,
    resetDmPanelWidth,
    resetMemberWidth,
    resetVoiceSideChatWidth,
    resolveMemberHighestRole,
    resolvePreviewChannelPermission,
    rolePreviewState,
    roleUi,
    sealWithGroupDmAndNavigation,
    selectDMTab,
    selectDmUser,
    selectExploreTab,
    selectGroupDmForIncomingRail,
    selectIncomingDmFromRail,
    selectIncomingGroupDmFromRail,
    selectServerViaStore,
    selectServersRailOnly,
    selectServersTab,
    selectedDMUserId,
    selectedMessageRequestId,
    selectedServerEcho,
    selectedServerIdRef,
    selectedServerInvite,
    selectedServerRef,
    selectedServerView,
    selfProfile,
    selfProfileAnchor,
    serverAttentionByServerId,
    serverNotificationLevelByServerId,
    serverRowsRef,
    serverSettingsModalActiveSection,
    serverSettingsModalInitialSection,
    serverStore,
    sessionEndedMessage,
    setMicTestListenDeafen,
    setVcActivityYoutubeVideo,
    setVcYoutubeBrowseOpen,
    setWatchTogetherBrowseOpen,
    setWatchTogetherLobbyRole,
    startWatchTogetherSession,
    ensureWatchTogetherSessionId,
    patchWatchTogetherUi,
    playWatchTogetherAtIndex,
    settingsModalActiveSection,
    settingsModalInitialSection,
    shellNavState,
    showApiFetchErrorBanner,
    startChannelResize,
    startDmPanelResize,
    startMemberResize,
    startVoiceSideChatResize,
    suspiciousEmptyWorkspace,
    syncVanityAcrossServerLists,
    themeStore,
    toggleChannelPanelBubbleMode,
    toggleMoreServersPanelChrome,
    toggleVoiceSideChat,
    uiState,
    vcActivityUi,
    vcDeafened,
    vcMuted,
    vcScreenshare,
    vcVideo,
    voiceChannelForParticipants,
    voiceMobileSheetLevel,
    voiceSideChatCollapsed,
    voiceSideChatWidth,
    watchActiveChannelWithServerChange,
    wireMessageGoToMessage,
    workspace,
    workspaceMembersByServer,
  } = phase1;

  const {
    assignHydrateEchoFromApi,
    wireDmCallSocketSubmitters,
    dmCallWithUserId,
    dmCallFullscreen,
    dmCallMuted,
    dmCallDeafened,
    dmCallVideo,
    dmCallScreenshare,
    dmCallMutedBeforeDeafen: _dmCallMutedBeforeDeafen,
    dmLiveKitJoinChannelId: _dmLiveKitJoinChannelId,
    dmCallSignal: _dmCallSignal,
    dmCallInviteSentChannelId: _dmCallInviteSentChannelId,
    applyDmCallDeafened,
    toggleDmCallMuted,
    dmPartnerUser,
    activeGroupId,
    activeGroupDM,
    activeGroupCallMembersVisible,
    dmPartnerUserIdForGroupDm,
    dmVoiceJoinTargetId: _dmVoiceJoinTargetId,
    dmCallMatchesActiveChannel,
    activeDmThreadCallUi,
    dmCallGlassPeer,
    callOverlay,
    isDmVoiceCallUi: _isDmVoiceCallUi,
    startDmCall,
    startDmCallWithUserId,
    startGroupCall,
    startGroupCallWithId,
    handleEchoDmCall,
    endDmCall,
    leaveDmCallVoice,
    rejoinDmCallVoice,
    reconnectGuildVoiceAfterE2eeRotation,
    answerDmCall,
    declineDmCall,
    dmCallQuarterView,
    dmCallCallViewParticipants,
    dmCallRinging,
    dmCallAwaitingAccept,
    dmCallRingUi,
    dmCallLobbyAfterSelfLeave,
    dmCallIncoming,
    dmCallRingRemoteVanishing,
    joinVoiceSession: _joinVoiceSession,
    leaveVoiceSession,
    getVcActivityPresenceForUser,
    getVcChannelActivityPresenceForChannel,
    vcHangmanActivity,
    hangmanRosterUserIds,
    vcSkrigglesActivity,
    skrigglesRosterUserIds,
    skrigglesCanvasEvents,
    vcCodenamesActivity,
    codenamesRosterUserIds,
    vcCodenamesSpymasterKey,
    commitVcHangmanWord,
    requestVcHangmanGuessLetter,
    requestVcHangmanNextRound,
    wordlineView,
    submitWordlineGuess,
    setWordlineMode,
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
    commitVcCodenamesDeal,
    requestVcCodenamesSetup,
    requestVcCodenamesClue,
    requestVcCodenamesReveal,
    requestVcCodenamesEndTurn,
    requestVcCodenamesNewGame,
    requestVcCodenamesPushKeyToOrchestrator,
    activeVoiceChannelParticipants,
    liveKitState,
    liveKitNetworkStats,
    liveKitRoom,
    liveKitVoiceApi: _liveKitVoiceApi,
    vcRemoteParticipants,
    speakingMap,
    localSpeaking,
    localAudioLevel,
    switchMicDevice,
    switchSpeakerDevice,
    setLkOutputVolume,
    setLkInputVolume: _setLkInputVolume,
    reapplyVoiceProcessing,
    switchVcCamera,
    setVcVideoQuality,
    startVcScreenShare,
    startDesktopScreenShare,
    startDesktopCameraStream,
    onDesktopCameraStarted,
    stopVcScreenShare,
    desktopStreamingPreferences,
    setDesktopStreamingPreferences,
    getVcLocalScreenTrack,
    getVcLocalCameraTrack,
    vcMirrorCamera,
    vcYoutubeRemotePlayback,
    publishVcYoutubePlaybackSync,
    vcYoutubePlaybackShouldPublish,
    vcWatchTogetherRemotePlayback,
    publishVcWatchTogetherPlaybackSync,
    vcWatchTogetherPlaybackShouldPublish,
    effectiveVcActivityKingUserId,
    syncLiveKitAudioFromUiStores: _syncLiveKitAudioFromUiStores,
    dmCallVoiceStripThreadId,
    dmCallVoiceStripTitle,
    onGuildChannelVcMuted,
    onGuildChannelVcDeafened,
    onGuildChannelVcVideo,
    onGuildChannelVcScreenshare,
    onDmCallVcMuted,
    onDmCallVcDeafened,
    onDmCallVcVideo,
    onDmCallVcScreenshare,
    channelPanelVoiceTransportUsesDmCall: _channelPanelVoiceTransportUsesDmCall,
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
    handleJoinVoiceNavigation,
    handleLeaveVoiceNavigation,
    handleChannelVoicePanelLeave,
    canJoinPreviewVoiceChannel,
    onVcChatButtonClickNavigation,
    handleMinimizeVoiceViewNavigation,
  } = callVoice;

  function getRemoteParticipantVolume(userId: string): number {
    return _liveKitVoiceApi?.getRemoteParticipantVolume(userId) ?? 100;
  }
  function setRemoteParticipantVolume(
    userId: string,
    volumePercent: number,
  ): void {
    _liveKitVoiceApi?.setRemoteParticipantVolume(userId, volumePercent);
  }

  const {
    isVcActive,
    isVcConnected,
    isVcConnecting,
    isVcDisconnecting,
    joinVoiceChannel,
    leaveVoiceChannel,
  } = useAppLayoutVoiceContextExpose({
    liveKitState,
    findChannelContextById,
    handleJoinVoiceNavigation,
    handleLeaveVoiceNavigation,
  });

  useDmCallWithUserIdShellLogMirror(
    dmCallWithUserId,
    dmCallWithUserIdForShellLog,
  );

  const {
    isInDmThreadOrIdleMainSurface,
    isInDMMode: isInDMModeComputed,
    isGroupDM: isGroupDMComputed,
  } = useAppLayoutMainSurfaceDmFlags({
    mainSurface,
    activeRailTab,
    activeGroupDM,
  });

  const handleGoToChannel = createNavigateToChannelActiveOnly(activeChannelId);

  const { syncEchoPresenceFromApi, applyEchoPresenceFromSocket } =
    useEchoPresenceSync({
      serverStore,
      authSession,
      workspace,
      workspaceMembersByServer,
    });

  const echoLifecycle = useEchoWorkspaceLifecycle({
    serverStore,
    authSession,
    workspace,
    activeChannelId,
    activeRailTab,
    isServerSettingsModalOpen,
    refreshEchoRoleData: roleUi.refreshEchoRoleData,
    getFirstTextChannelId,
    syncEchoPresenceFromApi,
    mergeEchoDmThreadsFromApi,
    mergeEchoBlockedFromApi,
    dmCallWithUserId,
    echoDmThreadIds,
  });

  const {
    hydrateEchoFromApi,
    refreshEchoSocialFromApi,
    handleServerDeleted,
    echoWorkspaceError,
  } = echoLifecycle;

  assignHydrateEchoFromApi(hydrateEchoFromApi);

  useAppLayoutDmThreadInboxSort({
    authSession,
    activeRailTab,
    isDMPanelOpen,
    dmActiveTab,
    mergeEchoDmThreadsFromApi,
  });

  const openGroupDmOnServerImpl = createOpenEchoGroupDmOnServerInvoker({
    getIsAuthenticated: () => authSession.isAuthenticated,
    getAccessToken: () => authSession.accessToken,
    hydrateEchoFromApi,
  });

  const guestSession = useAppLayoutGuestSession({
    serverStore,
    workspace,
    authSession,
    activeRailTab,
    isAuthModalOpen,
    hydrateEchoFromApi,
  });

  const {
    isGuestDisplayNameModalOpen,
    isGuestWelcomePrefsModalOpen,
    isGuestUpgradeModalOpen,
    isGuestCaptchaModalOpen,
    guestCaptchaSiteKey,
    guestFriendsLocked,
    continueAsGuest,
    onGuestCaptchaVerified,
    openGuestUpgradeModal,
    onGuestAccountUpgraded: hydrateAfterGuestAccountUpgrade,
    onEchoMessageFailedGuest,
  } = guestSession;

  openGuestUpgradeForDmRef.value = openGuestUpgradeModal;

  useAppLayoutBootstrap({
    serverStore,
    workspace,
    activeRailTab,
    isMoreServersPinned,
    isMoreServersPanelOpen,
    isMemberPopoutOpen,
    isSelfProfilePopoutOpen,
    activeChannelId,
    getFirstTextChannelId,
    echoDmThreadIds,
    dmCallWithUserId: dmCallWithUserIdForShellLog,
    onEchoMessageFailedGuest,
    openAuthModal,
  });

  const channelModals = useGuildChannelModals({
    authSession,
    workspace,
    selectedServer: selectedServerEcho,
    categoriesForServer,
    activeChannelId,
    activeRailTab,
    getFirstTextChannelId,
    hydrateWorkspace: hydrateEchoFromApi,
  });

  const {
    isCreateChannelModalOpen,
    createChannelInitialCategoryId,
    isCreateCategoryModalOpen,
    channelSettingsTarget,
    categorySettingsTarget,
    channelSettingsEchoPermissionEditor,
    categorySettingsEchoPermissionEditor,
    createChannelCategoryNames,
    createChannelCategoryOptions,
    openCreateChannelModal,
    openCreateCategoryModal,
    handleCreateChannelModalSubmit,
    handleCreateChannelSubmit,
    handleCreateCategorySubmit,
    openChannelSettings,
    onChannelSettingsModalOpenUpdate,
    handleChannelSettingsSave,
    channelSettingsCategoryPermissionDefaults,
    channelSettingsCategoryAutoDeleteAfterSeconds,
    openCategorySettings,
    onCategorySettingsModalOpenUpdate,
    handleCategorySettingsSave,
    handleChannelDelete,
    handleChannelReorder,
    handleCategoryReorder,
    handleCategoryDelete,
    deleteChannelById,
    deleteCategoryById,
  } = channelModals;

  watch(
    () =>
      [
        activeRailTab.value,
        serverStore.selectedServerId,
        activeChannelId.value,
      ] as const,
    (next, prev) => {
      if (!prev) return;
      const [rail, serverId, channelId] = next;
      const [prevRail, prevServerId, prevChannelId] = prev;
      if (
        rail === prevRail &&
        serverId === prevServerId &&
        channelId === prevChannelId
      ) {
        return;
      }
      if (rail !== prevRail) {
        isSettingsModalOpen.value = false;
        settingsModalInitialSection.value = null;
      }
      if (
        rail !== prevRail ||
        serverId !== prevServerId ||
        channelId !== prevChannelId
      ) {
        isServerSettingsModalOpen.value = false;
        serverSettingsModalInitialSection.value = null;
      }
    },
  );

  const { canCreateChannels, canManageThisChannel } =
    useAppLayoutChannelManageCapabilities({
      selectedServerEcho,
      isAuthenticated: () => authSession.isAuthenticated,
      echoCanCreateChannel: echoCanContext.echoCanCreateChannel,
    });

  watchActiveChannelWithServerChange(activeChannelId, (channelId) => {
    // DM surfaces can briefly precede thread hydration (especially on mobile).
    // Never rewrite active DM targets to a guild fallback during that window.
    if (isDmUiContext.value || isInDMModeComputed.value) return true;
    if (isKnownDmChannelId(channelId)) return true;
    /** Preserve guild deep-link targets until the channel tree confirms the id (hydrate race). */
    if (typeof window !== 'undefined') {
      const base = import.meta.env.BASE_URL;
      if (isAppNavPath(window.location.pathname, base)) {
        const parsed = parseAppPathname(window.location.pathname, base);
        if (parsed.kind === 'guild' && parsed.channelId === channelId) {
          return true;
        }
      }
    }
    return false;
  });

  const handleEchoDmActivity = createEchoDmActivityHandler({
    mergeEchoDmThreadFromRealtime,
  });

  /**
   * Server-driven inbox sort-key update for activity that has no message/call payload
   * (e.g. friend accepted between the pair). Merging the thread row pulls in the fresh
   * `lastActivityAt` so the inbox reorders without waiting for a `/dm/threads` refresh.
   */
  const handleEchoDmThreadActivity = (
    payload: import('@shared/types').EchoDmThreadActivityEvent,
  ) => {
    mergeEchoDmThreadFromRealtime(payload.thread);
  };

  const applyRealtimeAuthorHint = createAppLayoutApplyRealtimeAuthorHint({
    workspace,
    echoSession,
  });

  const echoChannelHistory = useEchoHistory(activeChannelId, {
    echoDmThreadIds,
    echoDmPeerByChannelId,
  });

  const ensureReplyTargetMessage = createAppLayoutEnsureReplyTargetMessage({
    echoChannelHistory,
  });

  const {
    isServerRailFastSwitchPending,
    isGuildShellSettling,
    isChannelPanelSwitchLoading,
    isMessageSurfaceSwitchLoading,
  } = useAppLayoutRailLoadingDerived({
    immediateShellSwitchPending,
    activeRailTab,
    serverStore,
    workspace,
    activeChannelId,
    suspiciousEmptyWorkspace,
  });

  const isChannelTreeLoadedForSelectedServer = computed(() => {
    const sid = serverStore.selectedServerId?.trim();
    if (!sid || sid === 'echo') return true;
    return isGuildChannelTreeLoaded(workspace.categoriesByServer.value, sid);
  });

  const dmUnreadByChannelIdForPanel = useDmAttentionUnreadMapForPanelComputed({
    dmAttentionByChannelId,
    messagesByChannelId: workspace.messages,
    readStateByChannelId,
    selfUserId: currentUserIdForSocket,
    isDmChannelId: (channelId) => isKnownDmChannelId(channelId),
  });

  getLatestDmInboxTargetForRailRef.value =
    createLatestDmInboxTargetForRailResolver({
      selfId: currentUserIdForSocket,
      users: workspace.users,
      groupDMs,
      messages: workspace.messages,
      echoPeerByChannelId: echoDmPeerByChannelId,
      echoDmLastActivityAtMsByChannelId,
      selectedDMUserId,
      activeChannelId,
      dmUnreadByChannelIdForPanel,
      hidden: hiddenDmInboxStore,
      favorite: favoriteDmInboxStore,
    });

  const dmRailUnread = useAppLayoutDmRailUnread({
    workspace,
    authSession,
    activeChannelId,
    activeDmPeerUserId: selectedDMUserId,
    dmAttentionByChannelId,
    dmUnreadCountByChannelId: dmUnreadByChannelIdForPanel,
    lastActivityAtMsByChannelId: echoDmLastActivityAtMsByChannelId,
    echoDmPeerByChannelId,
    groupDMs,
    isDmChannelId: (channelId) => isKnownDmChannelId(channelId),
    isHiddenDmUser: (userId) => hiddenDmInboxStore.isUserHidden(userId),
    isHiddenDmGroup: (channelId) => hiddenDmInboxStore.isGroupHidden(channelId),
    activeCallUserIds: computed(() => {
      const ids = new Set<string>();
      const selfId = authSession.backendUser?.id?.trim() ?? '';
      const peerId = dmCallWithUserId.value?.trim();
      // Group call targets use the group thread id — those belong in `activeCallGroupIds` only.
      if (peerId && !groupDMs.value[peerId]) ids.add(peerId);
      for (const [
        channelId,
        participantUserIds,
      ] of echoDmActiveCallParticipantUserIdsByChannelId.value) {
        if (groupDMs.value[channelId]) continue;
        if (!participantUserIds.some((id) => id !== selfId)) continue;
        const persistedPeerId = echoDmPeerByChannelId.value
          .get(channelId)
          ?.trim();
        if (persistedPeerId) ids.add(persistedPeerId);
      }
      return ids;
    }),
    activeCallGroupIds: computed(() => {
      const ids = new Set<string>();
      const onlyWhenCall = dmCallWithUserId.value?.trim();
      if (onlyWhenCall && groupDMs.value[onlyWhenCall]) ids.add(onlyWhenCall);
      for (const [
        channelId,
        participantUserIds,
      ] of echoDmActiveCallParticipantUserIdsByChannelId.value) {
        if (!groupDMs.value[channelId]) continue;
        if (participantUserIds.length <= 0) continue;
        ids.add(channelId);
      }
      return ids;
    }),
  });
  const { dmIncomingRailCluster } = dmRailUnread;
  const liveChannelCapabilitiesRefreshKey =
    useLiveChannelCapabilitiesRefreshKey();

  const liveCaps = useAppLayoutLiveChannelCaps({
    authSession,
    activeChannelId,
    refreshKey: liveChannelCapabilitiesRefreshKey,
  });
  const { liveChannelCapabilities } = liveCaps;
  const echoCapabilitiesForServerId = roleUi.echoCapabilitiesForServerId;
  const isEchoRoleBootstrapLoading = roleUi.isEchoRoleBootstrapLoading;

  const { activeChannelMessagesMap, activeChannelMessages } = useChatMessages(
    activeChannelId,
    workspace.users,
    presenceByUserId,
  );

  const mockDataModeOffComputed = useMockDataModeOffComputed();

  const explorePublicDirectoryEmpty = computed(
    () =>
      filterPublicExploreDirectoryRows(workspace.discoverableServers.value)
        .length === 0,
  );

  const inviteLanding = useInviteLandingFlow({
    base: import.meta.env.BASE_URL,
    isAuthenticated: isAuthenticatedComputed,
    workspaceReady: computed(() => !workspace.loading.value),
    activeRailTab,
    joinedServerIds: computed(() => serverStore.servers.map((s) => s.id)),
    joinedServerSlugs: computed(() =>
      serverStore.servers.map((s) => ({
        id: s.id,
        vanityCode: (s as { vanityCode?: string }).vanityCode,
      })),
    ),
    openServerSurface,
    selectExploreTab,
    refreshWorkspace: () => hydrateEchoFromApi(),
  });

  inviteLanding.initFromUrl();

  watch(
    inviteLanding.inviteLandingActive,
    (active) => {
      inviteLandingActiveRef.value = active;
    },
    { immediate: true },
  );

  const { showWelcomeBackSlimBanner, welcomeBackExploreGate } =
    useAppLayoutWelcomeBack({
      activeRailTab,
      isAuthenticated: isAuthenticatedComputed,
      sessionEndedMessage,
      isMockDataMode: mockDataModeOffComputed,
      explorePublicDirectoryEmpty,
      isGuestUser: isGuestComputed,
      workspaceLoading: computed(() => workspace.loading.value),
      inviteLandingActive: inviteLanding.inviteLandingActive,
    });

  const welcomeBackExploreMemberEmptyDirectory = computed(
    () =>
      activeRailTab.value === 'explore' &&
      !workspace.loading.value &&
      explorePublicDirectoryEmpty.value &&
      isAuthenticatedComputed.value &&
      !isGuestComputed.value,
  );

  const useCompactPhoneTabShell = computed(() => isCompactPhoneShell.value);

  const gridChrome = useAppLayoutGridChrome({
    workspace,
    activeRailTab,
    isMoreServersPanelOpen,
    isMoreServersCompact,
    isDMPanelOpen,
    dmPanelWidth,
    channelPanelCollapsed,
    channelPanelWidth,
    pfpBarExpanded,
    isServerEmptyOnboarding,
    isDmUiContext,
    collapseServerRail: computed(
      () =>
        welcomeBackExploreGate.value || inviteLanding.inviteLandingActive.value,
    ),
    isCompactShell,
    actionRailTop: actionRailTopLayout,
  });

  const {
    appGridTemplateColumns,
    exploreDiscoverableServers,
    isExploreView,
    MORE_SERVERS_PANEL_WIDTH: gridMoreServersPanelWidth,
    MORE_SERVERS_COMPACT_WIDTH: gridMoreServersCompactWidth,
  } = gridChrome;
  const expandChannelsGrid = gridChrome.expandChannels;

  const { expandChannels, expandMembers, collapseMembers } =
    useAppLayoutCompactShellExpand({
      isCompactShell,
      hasGuildChannelChrome,
      isCompactGuildSplitShell,
      useCompactPhoneTabShell,
      compactGuildTriPaneChannelPanelOpen,
      compactPagerPane,
      memberPanelCollapsed,
      mobileChannelSheetOpen,
      mobileMembersOverlayOpen,
      mobileBottomTab,
      mobileServersStack,
      hasActiveGuildChannel: () =>
        hasActivePhoneGuildChannel(
          serverStore.selectedServerId,
          activeChannelId.value,
        ),
      expandChannelsGrid,
      markMemberPanelExpandedByUser,
      markMemberPanelCollapsedByUser,
    });

  const nsfwGate = useAppLayoutNsfwGate({
    serverStore,
    workspace,
    effectiveActiveChannel,
    handleGoToChannel,
    getFirstTextChannelId,
    isDmUiContext,
    isExploreView,
    isServerEmptyOnboarding,
    mainContentColumns,
    memberPanelCollapsed,
  });
  const {
    showNsfwChatGate,
    acknowledgeNsfwChannel,
    declineNsfwGate,
    mainContentColumnsEffective,
    memberPanelCollapsedEffective,
  } = nsfwGate;

  const handleGoToMessageDelegated = createStableGoToMessageDelegate(
    () => actionRegistryRef.value,
  );

  const pinsEnabled = computed(() => mainSurface.value.type === 'dmThread');

  const pinsIntegration = useAppLayoutPinsIntegration({
    pinsEnabled,
    activeChannelId,
    echoDmPeerByChannelId,
    echoDmThreadIds,
    messages: workspace.messages,
    users: workspace.users,
    authSession,
    handleGoToMessage: handleGoToMessageDelegated,
  });
  const {
    pinChannelId,
    isPinsDropdownOpen,
    pinsButtonRefDm,
    pinsButtonRefServer,
    pinsDropdownRect,
    pinnedMessageIdsForCurrentChannel,
    pinnedMessagesForDropdown,
    closePinsDropdown,
    togglePinsDropdown,
    goToPinnedMessage,
    pinMessage,
    unpinMessage,
    pinPreview,
    setChannelPinsFromEcho,
    setPinnedMessageIdsForChannel,
    getPinnedIdsSnapshot,
  } = pinsIntegration;

  const { hostCallbacks } = useAppLayoutRealtimeHostWiring({
    echoSession,
    liveChannelCapabilitiesRefreshKey,
    hydrateEchoFromApi,
    refreshEchoSocialFromApi,
    syncEchoPresenceFromApi,
    echoChannelHistory,
    applyEchoPresenceFromSocket,
    handleEchoDmActivity,
    handleEchoDmCall,
    handleEchoDmThreadActivity,
    mergeReadStateUpdate: echoAttention.mergeReadStateUpdate,
    replaceAttentionSnapshot: echoAttention.replaceSnapshot,
    setChannelPinsFromEcho,
    restorePinnedIds: setPinnedMessageIdsForChannel,
    applyRealtimeAuthorHint,
    onVoiceE2eeEpochSuperseded: createAppLayoutVoiceE2eeEpochSupersededHandler({
      currentVoiceChannelId,
      dmLiveKitJoinChannelId: _dmLiveKitJoinChannelId,
      getLiveKitVoiceApi: () => _liveKitVoiceApi,
      rejoinDmCallVoice,
      reconnectGuildVoiceAfterE2eeRotation,
    }),
    onVoiceMlsMessage: createAppLayoutVoiceMlsMessageHandler({
      currentVoiceChannelId,
      dmLiveKitJoinChannelId: _dmLiveKitJoinChannelId,
      getLiveKitVoiceApi: () => _liveKitVoiceApi,
    }),
    applyVoiceMediaModerationFromSocket: (payload) => {
      callVoice.applyVoiceMediaModerationFromSocket?.(payload);
    },
  });

  const {
    sendMessage: sendMessageViaSocket,
    submitPollVote: submitPollVoteViaSocket,
    submitReactionToggle: submitReactionToggleViaSocket,
    submitPin: submitPinViaSocket,
    submitUnpin: submitUnpinViaSocket,
    submitMessageEdit: submitMessageEditViaSocket,
    submitImageSlotFill: submitImageSlotFillViaSocket,
    submitMessageDelete: submitMessageDeleteViaSocket,
    submitDmCallInvite: submitDmCallInviteViaSocket,
    submitDmCallAccept: submitDmCallAcceptViaSocket,
    submitDmCallEnd: submitDmCallEndViaSocket,
    isLiveReactionReady,
    isLiveSocketReady,
    uiTransactions,
    syncOutboundPresence,
  } = useAppLayoutRealtimeSocketBinding({
    messages: workspace.messages,
    activeChannelId,
    currentUserId: currentUserIdForSocket,
    hostCallbacks,
    getAuthKey: () =>
      // Generation counter covers cookie-mode rotations where accessToken stays
      // null (guest upgrade, re-login): the socket must recycle to drop the old
      // session's identity.
      [
        authSession.isAuthenticated,
        authSession.accessToken,
        authSession.authStateGeneration,
      ] as const,
    platformSession: platform?.session ?? null,
    getBackendUserStatus: () => authSession.backendUser?.status,
    restoreSessionFromApi: () => authSession.restoreSessionFromApi(),
    getLocalAuthorEcho: () => {
      const uid = currentUserIdForSocket.value;
      const u = authSession.backendUser;
      if (!uid || !u || u.id !== uid) return undefined;
      const displayName = u.displayName?.trim() || u.username?.trim();
      if (!displayName) return undefined;
      const avatar = u.pfp?.trim();
      return { displayName, ...(avatar ? { avatar } : {}) };
    },
    getDmPeerUserId: (cid: string) => echoDmPeerByChannelId.value.get(cid),
    getAccessToken: () => authSession.accessToken,
    ensureReplyTargetMessage,
    onTabResumeWhileConnected: () => {
      void echoChannelHistory.syncActiveChannelTailFromApi('tab_resume');
    },
  });

  registerEchoToastQuickReplySender((channelId, payload) => {
    const trimmed = payload.text.trim();
    if (!trimmed) return;
    if (!isLiveSocketReady()) {
      dispatchAppToast(
        'You are offline. Reconnect to send a message.',
        'warning',
      );
      return;
    }
    try {
      sendMessageViaSocket(
        channelId,
        trimmed,
        payload.mentions,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        payload.contentJson,
        payload.contentSchemaVersion,
      );
    } catch {
      dispatchAppToast('Could not send message.', 'warning');
    }
  });

  watch(
    () =>
      `${authSession.isAuthenticated ? '1' : '0'}:${authSession.backendUser?.id ?? ''}:${authSession.backendUser?.status ?? ''}`,
    () => {
      if (!authSession.isAuthenticated) return;
      if (!isLiveSocketReady()) return;
      syncOutboundPresence();
    },
  );

  const submitPinToggle = createSubmitPinToggle({
    pinChannelId,
    getPinnedIdsSnapshot,
    isLiveReactionReady,
    uiTransactions,
    pinMessage,
    unpinMessage,
    submitPinViaSocket,
    submitUnpinViaSocket,
  });
  const pinToggleHandlers = createPinToggleHandlers(submitPinToggle);

  wireDmCallSocketSubmitters({
    submitDmCallInvite: submitDmCallInviteViaSocket,
    submitDmCallAccept: submitDmCallAcceptViaSocket,
    submitDmCallEnd: submitDmCallEndViaSocket,
  });

  const { isReactionPersistReady, submitReactionToggle } =
    createAppLayoutReactionSocketFallback({
      authSession,
      isLiveSocketReady,
      submitReactionToggleViaSocket,
      updateChannelMessageInBucket,
      uiTransactions,
    });

  const { toggleReaction: toggleReactionOnMessages } = useMessageReactions(
    workspace.messages,
    {
      uiTransactions,
      isLiveReactionReady: isReactionPersistReady,
      emitReactionToggle: submitReactionToggle,
    },
  );

  const dmSocial = useDmSocialActions({
    currentUserId: currentUserIdForSocket,
    messageRequests: workspace.messageRequests,
    friendRequestsIncoming: workspace.friendRequestsIncoming,
    friendRequestsOutgoing: workspace.friendRequestsOutgoing,
    friendIds: workspace.friendIds,
    selectedMessageRequestId,
    dmActiveTab,
    activeChannelId,
    pfpBarExpanded,
    selectServer: selectServerViaStore,
    refreshFriendSocialFromApi: refreshEchoSocialFromApi,
  });

  const {
    selectMessageRequest,
    acceptMessageRequest,
    ignoreMessageRequest,
    returnFromMessageRequests,
    acceptFriendRequest,
    declineFriendRequest,
    cancelFriendRequest,
    sendFriendRequest,
  } = dmSocial;

  const handleAcceptMessageRequest = createHandleAcceptMessageRequestOpener({
    acceptMessageRequest,
    selectDmUser,
  });

  const guildMod = useGuildModeration({
    serverStore,
    authSession,
    workspace,
    selectedServer: selectedServerEcho,
    currentUser,
    activeChannel: effectiveActiveChannel,
    activeChannelContext,
    rolePreview: rolePreviewState,
    isRolePreviewActiveForServer: roleUi.isRolePreviewActiveForServer,
    previewHasUiPermission: roleUi.previewHasUiPermission,
    previewCanModerateMembers: roleUi.previewCanModerateMembers,
    resolvePreviewChannelPermission,
    echoCanModerateMembers: roleUi.echoCanModerateMembers,
    echoCanKickMembers: roleUi.echoCanKickMembers,
    echoCanBanMembers: roleUi.echoCanBanMembers,
    echoCanTimeoutMembers: roleUi.echoCanTimeoutMembers,
    echoCanChangeNicknames: roleUi.echoCanChangeNicknames,
    echoCanManageNicknames: roleUi.echoCanManageNicknames,
    echoCanManageMessages: roleUi.echoCanManageMessages,
    echoCanCreateInvite: roleUi.echoCanCreateInvite,
    echoCanMuteVoiceMembers: roleUi.echoCanMuteVoiceMembers,
    echoCanDeafenVoiceMembers: roleUi.echoCanDeafenVoiceMembers,
    echoCanMoveVoiceMembers: roleUi.echoCanMoveVoiceMembers,
    echoCapabilitiesForServerId: roleUi.echoCapabilitiesForServerId,
    onLeaveVoice: leaveVoiceSession,
    hydrateWorkspace: hydrateEchoFromApi,
  });

  const {
    canModerateMemberInServer,
    canModerateMemberActionInServer,
    canChangeMemberNicknameInServer,
    canModerateMessageAuthor,
    canOpenInviteForServer,
    canInviteToCurrentServer,
    moderationModalOpen,
    moderationAction,
    moderationTargetUserId,
    moderationTargetUser,
    handleModerateUser,
    onModerationModalConfirm,
    handleVcModerate,
    canVcModerateMember,
  } = guildMod;

  const {
    isServerNotificationSettingsOpen,
    currentServerNotificationLevel,
    openServerNotificationSettings,
    handleServerNotificationSave,
  } = useAppLayoutServerNotifications(workspace, selectedServerEcho);

  const serverNotificationLevelsMap = useServerNotificationLevelsMapComputed({
    servers: () => serverStore.servers,
    getServerNotificationLevel: (id) =>
      workspace.getServerNotificationLevel(id),
  });

  const channelDisplayNameByChannelId = computed(() => {
    const map: Record<string, string> = {};
    for (const categories of Object.values(
      workspace.categoriesByServer.value,
    )) {
      for (const cat of categories) {
        for (const ch of cat.channels) {
          map[ch.id] = getChannelDisplayName(ch.name ?? '') || 'Channel';
        }
      }
    }
    return map;
  });

  const {
    serverPingKindByServerId,
    serverPingBubbleByServerId,
    serverPingChannelDotsByServerId,
    serverUnreadActivityDotByServerId,
    channelMissedActivityByChannelId,
  } = useAppLayoutServerPingIndicators({
    serverAttentionByServerId,
    channelAttentionByChannelId,
    readStateByChannelId,
    serverNotificationLevelByServerId,
    channelDisplayNameByChannelId,
  });

  const getChatSoundMemberRoleIds = createChatSoundMemberRoleIdsGetter({
    currentUserId: currentUserIdForSocket,
    echoMemberRoleIdsByUser: () => roleUi.echoMemberRoleIdsByUser.value,
  });

  const {
    markServerAsReadForRail,
    handleServerRailMarkAllRead,
    handleDmRailMarkAllRead,
    markEchoChannelAsRead,
    markActiveChannelAsRead,
    handleDmMarkRead,
    handleChannelMarkRead,
  } = useAppLayoutMarkRead({
    authSession,
    echoAttention,
    workspace,
    serverStore,
    activeChannelId,
    echoDmPeerByChannelId,
  });

  useAppLayoutChatSound({
    activeChannelId,
    currentUser: currentUserComputed,
    selectedServerId: selectedServerIdRef,
    serverNotificationLevelsMap,
    memberRoleIds: getChatSoundMemberRoleIds,
    isDmChannel: isKnownDmChannelId,
    resolveChannelToastLabel: (channelId: string) => {
      const cid = channelId.trim();
      if (!cid) return 'Message';
      if (isKnownDmChannelId(cid)) {
        const peer = echoDmPeerByChannelId.value.get(cid);
        if (peer) {
          const u = workspace.users.value.find((x) => x.id === peer);
          if (u?.name?.trim()) return u.name.trim();
          return 'Direct message';
        }
        const g = groupDMs.value[cid];
        if (g?.name?.trim()) return g.name.trim();
        return 'Group DM';
      }
      const ctx = findChannelContextById(cid);
      const rawName = ctx?.channel?.name?.trim();
      return rawName ? getChannelDisplayName(rawName) : 'Channel';
    },
    resolveAuthorToastTitle: (authorId: string) => {
      const id = authorId.trim();
      if (!id) return 'Someone';
      const u = workspace.users.value.find((x) => x.id === id);
      return u?.name?.trim() || 'Someone';
    },
    isViewingConversationChannel: createAppLayoutIsViewingConversationChannel({
      activeChannelId,
      echoDmPeerByChannelId,
      groupDMs,
    }),
    isInDmUiContext: () => isDmUiContext.value,
    openConversationChannel: createAppLayoutOpenConversationChannel({
      echoDmThreadIds,
      echoDmPeerByChannelId,
      groupDMs,
      dmAttentionByChannelId,
      activeChannelId,
      selectedDMUserId,
      currentUserId: () => currentUser.value?.id,
      isKnownDmChannelId,
      findChannelContextById,
      handleActiveChannelChangeNavigation,
      selectDMTab,
      markEchoChannelAsRead,
      hiddenDmInboxStore,
    }),
  });

  const {
    isLeaveServerModalOpen: isLeaveServerModalOpenRef,
    leaveServerModalServerName: leaveServerModalServerNameRef,
    leaveServerModalVariant: leaveServerModalVariantRef,
    openLeaveServerOwnerBlockedModal,
    openLeaveServerConfirmModal,
    onLeaveServerModalUpdate,
    confirmLeaveServerFromModal,
  } = useAppLayoutLeaveServerModal({
    leaveServer: async (sid, uid) => {
      if (!authSession.isAuthenticated) {
        dispatchAppToast('Sign in to leave a server.', 'info');
        throw new Error('no_session');
      }
      try {
        await postEchoLeaveServer(null, sid);
      } catch (e) {
        reportPrimaryFlowFailure('leave_server_failed', e, undefined, {
          showBanner: false,
        });
        dispatchAppToast(
          e instanceof Error ? e.message : 'Could not leave server.',
          'warning',
        );
        throw e;
      }
      serverStore.leaveServer(sid, uid, { afterApiLeave: true });
    },
    currentUserId: () => currentUser.value?.id,
  });

  const {
    handleServerRailSettings,
    handleServerRailInvite,
    handleServerRailNotificationSettings,
    handleServerRailMarkRead,
    handleServerRailLeave,
    openServerFromMore,
  } = useAppLayoutServerRailActions({
    serverStore,
    currentUser,
    devModeIdsEnabled,
    canOpenServerSettings: roleUi.canOpenServerSettings,
    canOpenServerSettingsForServer: roleUi.canOpenServerSettingsForServer,
    canOpenInviteForServer,
    openServerSurface: (serverId) => openServerSurface(serverId),
    isServerSettingsModalOpen,
    isInviteModalOpen,
    isServerNotificationSettingsOpen,
    isMoreServersPinned,
    isMoreServersPanelOpen,
    clearInviteVoiceContext: () => {
      inviteModalVoiceChannelId.value = null;
      inviteModalVoiceChannelName.value = null;
    },
    markServerAsRead: markServerAsReadForRail,
    openLeaveServerOwnerBlockedModal,
    openLeaveServerConfirmModal,
  });

  const refreshRoleData = createVoidingInvoker(() =>
    roleUi.refreshEchoRoleData(),
  );
  const canDeleteCurrentServerComputed = useCanDeleteCurrentEchoServerComputed({
    selectedServer: selectedServerEcho,
    currentUserId: currentUserIdForSocket,
  });

  return {
    ...phase1,
    _channelPanelVoiceTransportUsesDmCall,
    _dmCallInviteSentChannelId,
    _dmCallMutedBeforeDeafen,
    _dmCallSignal,
    _dmLiveKitJoinChannelId,
    _dmVoiceJoinTargetId,
    _isDmVoiceCallUi,
    _joinVoiceSession,
    _liveKitVoiceApi,
    _setLkInputVolume,
    _syncLiveKitAudioFromUiStores,
    acceptFriendRequest,
    acceptMessageRequest,
    acknowledgeNsfwChannel,
    activeChannelMessages,
    activeChannelMessagesMap,
    activeDmThreadCallUi,
    activeGroupCallMembersVisible,
    activeGroupDM,
    activeGroupId,
    activeVoiceChannelParticipants,
    advanceSkrigglesRound,
    answerDmCall,
    appGridTemplateColumns,
    applyDmCallDeafened,
    applyEchoPresenceFromSocket,
    applyRealtimeAuthorHint,
    assignHydrateEchoFromApi,
    callOverlay,
    canChangeMemberNicknameInServer,
    canCreateChannels,
    canDeleteCurrentServerComputed,
    canInviteToCurrentServer,
    canJoinPreviewVoiceChannel,
    canManageThisChannel,
    canModerateMemberActionInServer,
    canModerateMemberInServer,
    canModerateMessageAuthor,
    canOpenInviteForServer,
    canVcModerateMember,
    cancelFriendRequest,
    categorySettingsEchoPermissionEditor,
    categorySettingsTarget,
    channelDisplayNameByChannelId,
    channelMissedActivityByChannelId,
    channelModals,
    channelPanelVcDeafenedEffective,
    channelPanelVcMutedEffective,
    channelPanelVcScreenshareEffective,
    channelPanelVcVideoEffective,
    channelPanelVoiceChannelId,
    channelPanelVoiceChannelName,
    channelSettingsCategoryAutoDeleteAfterSeconds,
    channelSettingsCategoryPermissionDefaults,
    channelSettingsEchoPermissionEditor,
    channelSettingsTarget,
    closePinsDropdown,
    codenamesRosterUserIds,
    collapseMembers,
    commitSkrigglesWordChoice,
    commitVcCodenamesDeal,
    commitVcHangmanWord,
    confirmLeaveServerFromModal,
    continueAsGuest,
    createChannelCategoryNames,
    createChannelCategoryOptions,
    createChannelInitialCategoryId,
    currentServerNotificationLevel,
    declineDmCall,
    declineFriendRequest,
    declineNsfwGate,
    deleteCategoryById,
    deleteChannelById,
    desktopStreamingPreferences,
    dismissVcTicTacToeInvite,
    dmCallAwaitingAccept,
    dmCallCallViewParticipants,
    dmCallDeafened,
    dmCallFullscreen,
    dmCallGlassPeer,
    dmCallIncoming,
    dmCallLobbyAfterSelfLeave,
    dmCallMatchesActiveChannel,
    dmCallMuted,
    dmCallQuarterView,
    dmCallRingRemoteVanishing,
    dmCallRingUi,
    dmCallRinging,
    dmCallScreenshare,
    dmCallVideo,
    dmCallVoiceStripThreadId,
    dmCallVoiceStripTitle,
    dmCallWithUserId,
    dmIncomingRailCluster,
    dmPartnerUser,
    dmPartnerUserIdForGroupDm,
    dmRailUnread,
    dmSocial,
    dmUnreadByChannelIdForPanel,
    echoCapabilitiesForServerId,
    echoChannelHistory,
    echoLifecycle,
    echoWorkspaceError,
    effectiveVcActivityKingUserId,
    endDmCall,
    ensureReplyTargetMessage,
    expandChannels,
    expandChannelsGrid,
    expandMembers,
    exploreDiscoverableServers,
    explorePublicDirectoryEmpty,
    getChatSoundMemberRoleIds,
    getPinnedIdsSnapshot,
    getRemoteParticipantVolume,
    getVcActivityPresenceForUser,
    getVcChannelActivityPresenceForChannel,
    getVcLocalCameraTrack,
    getVcLocalScreenTrack,
    goToPinnedMessage,
    gridChrome,
    gridMoreServersCompactWidth,
    gridMoreServersPanelWidth,
    guestCaptchaSiteKey,
    guestFriendsLocked,
    guestSession,
    guildMod,
    handleAcceptMessageRequest,
    handleCategoryDelete,
    handleCategoryReorder,
    handleCategorySettingsSave,
    handleChannelDelete,
    handleChannelMarkRead,
    handleChannelReorder,
    handleChannelSettingsSave,
    handleChannelVoicePanelLeave,
    handleCreateCategorySubmit,
    handleCreateChannelModalSubmit,
    handleCreateChannelSubmit,
    handleDmMarkRead,
    handleDmRailMarkAllRead,
    handleEchoDmActivity,
    handleEchoDmCall,
    handleEchoDmThreadActivity,
    handleGoToChannel,
    handleGoToMessageDelegated,
    handleJoinVoiceNavigation,
    handleLeaveVoiceNavigation,
    handleModerateUser,
    handleServerDeleted,
    handleServerNotificationSave,
    handleServerRailInvite,
    handleServerRailLeave,
    handleServerRailMarkAllRead,
    handleServerRailMarkRead,
    handleServerRailNotificationSettings,
    handleServerRailSettings,
    handleVcModerate,
    hangmanRosterUserIds,
    hostCallbacks,
    hydrateAfterGuestAccountUpgrade,
    hydrateEchoFromApi,
    ignoreMessageRequest,
    inviteLanding,
    isChannelPanelSwitchLoading,
    isChannelTreeLoadedForSelectedServer,
    isCreateCategoryModalOpen,
    isCreateChannelModalOpen,
    isEchoRoleBootstrapLoading,
    isExploreView,
    isGroupDMComputed,
    isGuestCaptchaModalOpen,
    isGuestDisplayNameModalOpen,
    isGuestUpgradeModalOpen,
    isGuestWelcomePrefsModalOpen,
    isGuildShellSettling,
    isInDMModeComputed,
    isInDmThreadOrIdleMainSurface,
    isLeaveServerModalOpenRef,
    isLiveReactionReady,
    isLiveSocketReady,
    isMessageSurfaceSwitchLoading,
    isPinsDropdownOpen,
    isReactionPersistReady,
    isServerNotificationSettingsOpen,
    isServerRailFastSwitchPending,
    isVcActive,
    isVcConnected,
    isVcConnecting,
    isVcDisconnecting,
    joinVoiceChannel,
    leaveDmCallVoice,
    leaveServerModalServerNameRef,
    leaveServerModalVariantRef,
    leaveVoiceChannel,
    leaveVoiceSession,
    liveCaps,
    liveChannelCapabilities,
    liveChannelCapabilitiesRefreshKey,
    liveKitNetworkStats,
    liveKitRoom,
    liveKitState,
    localAudioLevel,
    localSpeaking,
    mainContentColumnsEffective,
    markActiveChannelAsRead,
    markEchoChannelAsRead,
    markServerAsReadForRail,
    memberPanelCollapsedEffective,
    mockDataModeOffComputed,
    moderationAction,
    moderationModalOpen,
    moderationTargetUser,
    moderationTargetUserId,
    nsfwGate,
    onCategorySettingsModalOpenUpdate,
    onChannelPanelVcDeafened,
    onChannelPanelVcMuted,
    onChannelPanelVcScreenshare,
    onChannelPanelVcVideo,
    onChannelSettingsModalOpenUpdate,
    onDesktopCameraStarted,
    onDmCallVcDeafened,
    onDmCallVcMuted,
    onDmCallVcScreenshare,
    onDmCallVcVideo,
    onEchoMessageFailedGuest,
    onGuestCaptchaVerified,
    onGuildChannelVcDeafened,
    onGuildChannelVcMuted,
    onGuildChannelVcScreenshare,
    onGuildChannelVcVideo,
    onLeaveServerModalUpdate,
    onModerationModalConfirm,
    onVcChatButtonClickNavigation,
    handleMinimizeVoiceViewNavigation,
    openCategorySettings,
    openChannelSettings,
    openCreateCategoryModal,
    openCreateChannelModal,
    openGroupDmOnServerImpl,
    openGuestUpgradeModal,
    openLeaveServerConfirmModal,
    openLeaveServerOwnerBlockedModal,
    openServerFromMore,
    openServerNotificationSettings,
    pinChannelId,
    pinMessage,
    pinPreview,
    pinToggleHandlers,
    pinnedMessageIdsForCurrentChannel,
    pinnedMessagesForDropdown,
    pinsButtonRefDm,
    pinsButtonRefServer,
    pinsDropdownRect,
    pinsEnabled,
    pinsIntegration,
    publishSkrigglesCanvasCmd,
    publishSkrigglesCanvasSnapshot,
    publishSkrigglesStrokeBatch,
    publishVcYoutubePlaybackSync,
    reapplyVoiceProcessing,
    reconnectGuildVoiceAfterE2eeRotation,
    refreshEchoSocialFromApi,
    refreshRoleData,
    rejoinDmCallVoice,
    requestVcCodenamesClue,
    requestVcCodenamesEndTurn,
    requestVcCodenamesNewGame,
    requestVcCodenamesPushKeyToOrchestrator,
    requestVcCodenamesReveal,
    requestVcCodenamesSetup,
    requestVcHangmanGuessLetter,
    requestVcHangmanNextRound,
    wordlineView,
    submitWordlineGuess,
    setWordlineMode,
    requestVcTicTacToeMove,
    requestVcTicTacToeRematch,
    respondVcTicTacToeInvite,
    returnFromMessageRequests,
    selectMessageRequest,
    sendFriendRequest,
    sendMessageViaSocket,
    sendVcTicTacToeChallenge,
    serverNotificationLevelsMap,
    serverPingBubbleByServerId,
    serverPingChannelDotsByServerId,
    serverPingKindByServerId,
    serverUnreadActivityDotByServerId,
    setChannelPinsFromEcho,
    setDesktopStreamingPreferences,
    setLkOutputVolume,
    setPinnedMessageIdsForChannel,
    setRemoteParticipantVolume,
    setVcVideoQuality,
    showNsfwChatGate,
    showWelcomeBackSlimBanner,
    skrigglesCanvasEvents,
    skrigglesRosterUserIds,
    speakingMap,
    startDesktopCameraStream,
    startDesktopScreenShare,
    startDmCall,
    startDmCallWithUserId,
    startGroupCall,
    startGroupCallWithId,
    startSkrigglesGame,
    startVcScreenShare,
    stopVcScreenShare,
    submitDmCallAcceptViaSocket,
    submitDmCallEndViaSocket,
    submitDmCallInviteViaSocket,
    submitImageSlotFillViaSocket,
    submitMessageDeleteViaSocket,
    submitMessageEditViaSocket,
    submitPinToggle,
    submitPinViaSocket,
    submitPollVoteViaSocket,
    submitReactionToggle,
    submitReactionToggleViaSocket,
    submitSkrigglesGuess,
    submitUnpinViaSocket,
    switchMicDevice,
    switchSpeakerDevice,
    switchVcCamera,
    syncEchoPresenceFromApi,
    syncOutboundPresence,
    tickSkrigglesTimers,
    toggleDmCallMuted,
    togglePinsDropdown,
    toggleReactionOnMessages,
    uiTransactions,
    unpinMessage,
    updateSkrigglesSettings,
    vcCodenamesActivity,
    vcCodenamesSpymasterKey,
    vcHangmanActivity,
    vcMirrorCamera,
    vcRemoteParticipants,
    vcSkrigglesActivity,
    vcTicTacToeActivity,
    vcTicTacToePendingInvite,
    vcYoutubePlaybackShouldPublish,
    vcYoutubeRemotePlayback,
    vcWatchTogetherPlaybackShouldPublish,
    vcWatchTogetherRemotePlayback,
    publishVcWatchTogetherPlaybackSync,
    setWatchTogetherBrowseOpen,
    setWatchTogetherLobbyRole,
    startWatchTogetherSession,
    ensureWatchTogetherSessionId,
    patchWatchTogetherUi,
    playWatchTogetherAtIndex,
    openVcActivityWatchTogether,
    welcomeBackExploreGate,
    welcomeBackExploreMemberEmptyDirectory,
    useCompactPhoneTabShell,
    mobileBottomTab,
    mobileServersStack,
    wireDmCallSocketSubmitters,
  };
}
