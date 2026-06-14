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
import { storeToRefs } from 'pinia';
import { useServerStore } from '@/stores/server';
import { useThemeStore } from '@/stores/theme';
import { useEchoSessionStore } from '@/stores/echoSession';
import { useEchoAttentionStore } from '@/stores/echoAttention';
import { useEchoWorkspace } from '@/composables/useEchoWorkspace';
import { useAuthSessionStore } from '@/stores/authSession';
import { useDevSettingsStore } from '@/stores/devSettings';
import { PLATFORM_KEY } from '@/platform/keys';
import { useLayout } from '@/composables/useLayout';
import { bindPaperEditorChannelPanelWidth } from '@/features/paper/composables/paperEditorPanelBridge';
import { useCompactShell } from '@/composables/useCompactShell';
import { useCompactGuildSplitShell } from '@/composables/useCompactGuildSplitShell';
// Sub-composables
import { useAppLayoutUiState } from './useAppLayoutUiState';
import { useAppLayoutShellNavigation } from './useAppLayoutShellNavigation';
import { useImmediateShellSwitchPending } from './useImmediateShellSwitchPending';
import { isGuildShellSettling as computeGuildShellSettling } from './guildShellSettling';
import { useAppLayoutActiveChannelNavigation } from './useAppLayoutActiveChannelNavigation';
import { useGuildChannelTree } from '@/services/orchestration/useGuildChannelTree';
// `voiceMlsSession` pulls in the ts-mls crypto stack; it is dynamically imported
// at the voice-event handler below so it stays off the first-paint AppLayout chunk.
import { useEchoGuildRoleUi } from './useEchoGuildRoleUi';
import { useAppLayoutOpenDmThread } from './useAppLayoutOpenDmThread';
import { useAppLayoutEchoDmState } from '@/services/orchestration/useAppLayoutEchoDmState';
import { useInviteLandingFlow } from './useInviteLandingFlow';
import { useAppLayoutGuestSession } from './useAppLayoutGuestSession';
import { useAppLayoutLinkedDiscord } from './useAppLayoutLinkedDiscord';
import { useAppLayoutVcActivityGuards } from './useAppLayoutVcActivityGuards';
import { useAppLayoutServerLayoutPrefs } from './useAppLayoutServerLayoutPrefs';
import { useSelectedServerInvite } from './useSelectedServerInvite';
import { useAppLayoutCallVoiceBridge } from './useAppLayoutCallVoiceBridge';
import { createIsKnownDmChannelId } from '@/features/dm/createIsKnownDmChannelId';
import { createSelectDmUserWithShadowGuard } from '@/features/dm/createSelectDmUserWithShadowGuard';
import { createLatestDmPeerUserIdForRailResolver } from '@/features/dm/createLatestDmPeerUserIdForRailResolver';
import { useHiddenDmInboxStore } from '@/stores/hiddenDmInbox';
import { useFavoriteDmInboxStore } from '@/stores/favoriteDmInbox';
import { useAppLayoutWorkspaceFriendshipQueries } from './useAppLayoutWorkspaceFriendshipQueries';
import { createEchoCanContextComputeds } from './createEchoCanContextComputeds';
import { createSelectServerFromStore } from '@/features/layout/createSelectServerFromStore';
import { createChatMessageNavBridge } from '@/features/navigation/createChatMessageNavBridge';
import {
  isAppNavPath,
  parseAppPathname,
} from '@/features/layout/urlNavigation';

import { useChannelIconResolver } from '@/composables/useChannelIconResolver';
import { useAppLayoutShellAuthDerived } from './useAppLayoutShellAuthDerived';

import { createMemberListHighestRoleResolver } from './useMemberListHighestRoleResolver';
import { useAppLayoutEffectiveChannel } from './useAppLayoutEffectiveChannel';
import { useAppLayoutDmUiContext } from './useAppLayoutDmUiContext';
import { useComputedOptionalRefAlias } from './useComputedOptionalRefAlias';
import { useEchoDmPeerProfileHydration } from './useEchoDmPeerProfileHydration';
import type { WorkspaceRosterUserRow } from '@/services/domain/workspaceRoster';
import { useAppLayoutVoiceChannelForParticipantsComputed } from './useAppLayoutVoiceChannelForParticipantsComputed';
import { useAppLayoutBanners } from './useAppLayoutBanners';
import { useAppLayoutActionRegistryPipeline } from './useAppLayoutActionRegistryPipeline';
import { createIsChannelActive } from './createIsChannelActive';
import { createIsPersistedEchoDmThreadChecker } from './createIsPersistedEchoDmThreadChecker';
import { useEchoRolePreviewStateComputed } from './useEchoRolePreviewStateComputed';
import { bindResolveServerChannelInfoForMainSurface } from '@/features/layout/resolveServerChannelTypeForMainSurface';
import { newTraceId } from '@/observability/sessionDiagnostics';
import { useHasGuildChannelChromeComputed } from './useHasGuildChannelChromeComputed';
import { echoSyncCapabilities } from '@/platform/syncCapabilities';
import {
  createAppLayoutIsViewingConversationChannel,
  createAppLayoutOpenConversationChannel,
} from './useAppLayoutToastDmNavigation';
import {
  createAppLayoutApplyRealtimeAuthorHint,
  createAppLayoutEnsureReplyTargetMessage,
} from './useAppLayoutRealtimeAuthorHints';
import {
  createAppLayoutVoiceE2eeEpochSupersededHandler,
  createAppLayoutVoiceMlsMessageHandler,
} from './useAppLayoutRealtimeE2eeCallbacks';
import { useAppLayoutGuildMobileVcLobby } from './useAppLayoutGuildMobileVcLobby';
import {
  createAppLayoutToggleMemberList,
  useAppLayoutCompactShellExpand,
} from './useAppLayoutCompactShellExpand';

const ExploreView = defineAsyncComponent(
  () => import('@/features/layout/components/ExploreView.vue'),
);

/**
 * Layout shell composition root: ordered wiring of region composables + slices.
 * Policy and merge rules live in `frontend/src/services/` and named `useAppLayout*` /
 * `useEcho*` composables — not inline here.
 * Charter definition of “thin”: `docs/architecture/client-layer-violations.md` §1.
 */

export type WireAppLayoutDmAndShellResult = ReturnType<
  typeof wireAppLayoutDmAndShell
>;

export function wireAppLayoutDmAndShell() {
  const platform = inject(PLATFORM_KEY, null);
  const navTraceId = newTraceId();
  const serverStore = useServerStore();
  const {
    selectedServer: selectedServerRef,
    selectedServerId: selectedServerIdRef,
    servers: serverRowsRef,
  } = storeToRefs(serverStore);
  const selectServerViaStore = createSelectServerFromStore(serverStore);
  const channelIconResolver = useChannelIconResolver(selectedServerIdRef);
  const echoSession = useEchoSessionStore();
  const echoAttention = useEchoAttentionStore();
  const {
    dmAttentionByChannelId,
    serverAttentionByServerId,
    readStateByChannelId,
    channelAttentionByChannelId,
    serverNotificationLevelByServerId,
  } = storeToRefs(echoAttention);
  const {
    workspaceMembersByServer,
    presenceByUserId,
    presenceMobileByUserId,
    discordOnlineByUserId,
    lastOnlineAtByUserId,
  } = storeToRefs(echoSession);
  const workspace = useEchoWorkspace();
  const authSession = useAuthSessionStore();
  /** Set after `useAppLayoutGuestSession` — DM rail / thread opens use this for upgrade modal. */
  const openGuestUpgradeForDmRef = shallowRef<null | (() => void)>(null);
  const { sessionEndedMessage, authStateGeneration } = storeToRefs(authSession);
  const devSettings = useDevSettingsStore();
  const { devModeIdsEnabled } = storeToRefs(devSettings);
  const { linkedDiscordUserId, linkedDiscordState } = useAppLayoutLinkedDiscord(
    {
      authSession,
    },
  );
  const { showApiFetchErrorBanner } = useAppLayoutBanners(workspace);

  const friendshipQueries = useAppLayoutWorkspaceFriendshipQueries(workspace);

  const {
    actionRegistryRef,
    wireMessageGoToMessage,
    sealWithGroupDmAndNavigation,
  } = useAppLayoutActionRegistryPipeline();
  const chatMessageNavBridge = createChatMessageNavBridge();

  const uiState = useAppLayoutUiState();
  const layoutDims = useLayout();
  const {
    channelPanelCollapsed,
    channelPanelBubbleMode,
    memberPanelCollapsed,
    memberListShowGuests,
    memberPanelAutoCollapseUserOverride,
    markMemberPanelExpandedByUser,
    markMemberPanelCollapsedByUser,
    voiceSideChatCollapsed,
    channelPanelWidth,
    memberPanelWidth,
    voiceSideChatWidth,
    mainContentColumns,
    startChannelResize,
    startMemberResize,
    startVoiceSideChatResize,
    resetChannelWidth,
    resetMemberWidth,
    resetVoiceSideChatWidth,
    expandVoiceSideChat,
    toggleVoiceSideChat,
    toggleChannelPanelBubbleMode,
    voiceMobileSheetLevel,
    bumpVoiceMobileChatFromCallScrollUp,
    bumpVoiceMobileChatFromCallScrollDown,
    narrowChannelPanelForActivityOverflowStep,
    beginVcActivitySessionChannelLayout,
    endVcActivitySessionChannelLayout,
  } = layoutDims;

  bindPaperEditorChannelPanelWidth(channelPanelWidth);

  const { isCompactShell } = useCompactShell();
  const { isCompactGuildSplitShell } = useCompactGuildSplitShell();
  const themeStore = useThemeStore();
  const actionRailTopLayout = computed(
    () => themeStore.actionRailPlacement === 'top' && !isCompactShell.value,
  );

  /** Forward-declared; set by `useInviteLandingFlow` after shell nav is wired. */
  const inviteLandingActiveRef = ref(false);
  const inviteLandingActiveComputed = computed(
    () => inviteLandingActiveRef.value,
  );
  const compactPagerPane = ref<0 | 1 | 2>(1);
  /** Guild tri-pane: stack column visibility for compactTriPaneGuildNav (also tied to pager pane — see watch below). */
  const compactGuildTriPaneChannelPanelOpen = ref(false);
  /** Compact guild: slide-up preview before joining VC (Join / chat / audio check). */
  const guildMobileVcLobby = shallowRef<{
    channelId: string;
    channelName: string;
  } | null>(null);

  watch(isCompactShell, (on) => {
    if (!on) {
      compactPagerPane.value = 1;
      compactGuildTriPaneChannelPanelOpen.value = false;
      guildMobileVcLobby.value = null;
    }
  });

  const {
    pfpBarExpanded,
    isSystemSettingsOpen,
    activeRailTab,
    activeChannelId,
    selectedDMUserId,
    dmActiveTab,
    selectedMessageRequestId,
    isDMPanelOpen,
    isMoreServersPanelOpen,
    isMoreServersCompact,
    isMoreServersPinned,
    dmPanelWidth,
    startDmPanelResize,
    resetDmPanelWidth,
    openUserSettingsToDiscordFromAddServer,
    onJoinVoice,
    onLeaveVoice,
    toggleMoreServersPanel: toggleMoreServersPanelChrome,
    isAuthModalOpen,
    authModalInitialLoginEntry,
    authModalPasskeyOnOpen,
    authModalInitialTab,
    authModalInitialSubView,
    openAuthModal,
    isAddServerModalOpen,
    isInviteModalOpen,
    inviteModalVoiceChannelId,
    inviteModalVoiceChannelName,
    addServerInitialView,
    isSettingsModalOpen,
    settingsModalInitialSection,
    settingsModalActiveSection,
    isServerSettingsModalOpen,
    serverSettingsModalInitialSection,
    serverSettingsModalActiveSection,
    isMemberPopoutOpen,
    isSelfProfilePopoutOpen,
    isGroupDMModalOpen,
    isGroupDMSettingsOpen,
    groupDmSettingsInitialFocus,
    activeGroupSettingsId,
    activeMemberProfile,
    profileNotes,
    memberPopoutAnchor,
    memberPopoutOpenRolesPanel,
    selfProfileAnchor,
    isExpandedProfileModalOpen,
    isExpandedProfileSidePanel,
    isGroupOverviewOpen,
    expandedProfile,
    expandedProfileTargetUserId,
    customStatus,
    currentVoiceChannelId,
    currentVoiceChannelName,
    vcMuted,
    vcDeafened,
    micTestListenDeafenActive,
    setMicTestListenDeafen,
    applyVcDeafened,
    vcVideo,
    vcScreenshare,
    isScreenSharePickerOpen,
    isDesktopStreamingControlOpen,
    desktopStreamingControlMode,
    fullscreenStreamParticipantId,
    vcActivityUi,
    openVcActivityPicker,
    openVcActivityYoutubeBrowse,
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
    openVcActivityWatchTogether,
    setVcActivityYoutubeVideo,
    applyVcYoutubeWatchTogetherRemote,
    applyVcWatchTogetherRemote,
    setWatchTogetherLobbyRole,
    ensureWatchTogetherSessionId,
    patchWatchTogetherUi,
    setWatchTogetherBrowseOpen,
    startWatchTogetherSession,
    playWatchTogetherAtIndex,
    setVcYoutubeBrowseOpen,
    addVcYoutubeToQueue,
    removeVcYoutubeFromQueue,
    moveVcYoutubeInQueue,
    playVcYoutubeAtIndex,
    playVcYoutubeNext,
    playVcYoutubePrevious,
    closeVcActivity,
    groupDMs,
    groupDMPreselectedIds,
    groupDMLockedIds,
  } = uiState;

  watch(
    () => vcActivityUi.value.phase,
    (phase) => {
      if (phase === 'closed') {
        endVcActivitySessionChannelLayout();
      } else {
        beginVcActivitySessionChannelLayout();
      }
    },
    { immediate: true },
  );

  useAppLayoutServerLayoutPrefs({
    channelPanelCollapsed,
    channelPanelBubbleMode,
    memberPanelCollapsed,
    voiceSideChatCollapsed,
    compactGuildTriPaneChannelPanelOpen,
    isMoreServersPinned,
    markMemberPanelExpandedByUser,
    markMemberPanelCollapsedByUser,
    selectedServerId: selectedServerIdRef,
  });

  const isDmUiContext = useAppLayoutDmUiContext(activeRailTab);

  watch(
    () => dmActiveTab.value,
    (sub) => {
      if (sub !== 'messages' && selectedMessageRequestId.value) {
        selectedMessageRequestId.value = null;
      }
    },
  );

  const selectedServerInvite = useSelectedServerInvite({
    serverStore,
    workspace,
    authSession,
    isInviteModalOpen,
    inviteVoiceChannelId: inviteModalVoiceChannelId,
  });
  const {
    inviteLinkForServer,
    inviteLinkFromApi,
    inviteLinkLookupPending,
    inviteLinkFromSelectedServer,
    newlyCreatedServerId,
    syncVanityAcrossServerLists,
    directHexInviteLink,
    directHexInviteBusy,
    createDirectHexInvite,
  } = selectedServerInvite;

  const isChannelActive = createIsChannelActive(activeChannelId);

  const isGuildShellSettledForSwitchPending = computed(
    () =>
      !computeGuildShellSettling({
        rail: activeRailTab.value,
        selectedServerId: serverStore.selectedServerId,
        activeChannelId: activeChannelId.value,
        categoriesByServer: workspace.categoriesByServer.value,
        workspaceLoading: workspace.loading.value,
        workspaceFromApi: workspace.fromApi.value,
        initialLoadInFlight: workspace.initialLoadInFlight.value,
      }),
  );

  const { immediateShellSwitchPending } = useImmediateShellSwitchPending({
    activeRailTab,
    selectedServerId: selectedServerIdRef,
    clearWhen: isGuildShellSettledForSwitchPending,
  });

  const selectedServerEcho = useComputedOptionalRefAlias(selectedServerRef);
  const selectedServerView = selectedServerRef;

  const {
    currentUser,
    selfProfile,
    groupDmMaxMembers,
    currentUserIdForSocket,
    currentUserComputed,
    isAuthenticatedComputed,
    isGuestComputed,
  } = useAppLayoutShellAuthDerived({
    backendUser: () => authSession.backendUser,
    planLimits: () => authSession.planLimits,
    livePresenceByUserId: presenceByUserId,
    selectedServer: selectedServerEcho,
    workspaceMembersByServer,
  });

  watch(
    () =>
      [
        authStateGeneration.value,
        authSession.backendUser?.id ?? '',
        authSession.backendUser?.customStatus ?? '',
      ] as const,
    () => {
      const u = authSession.backendUser;
      if (!u) {
        customStatus.value = '';
        return;
      }
      customStatus.value =
        u.customStatus !== undefined && u.customStatus !== null
          ? String(u.customStatus)
          : '';
    },
    { immediate: true },
  );

  const roleUi = useEchoGuildRoleUi({
    serverStore,
    authSession,
    workspace,
    currentUser,
    selectedServer: selectedServerEcho,
  });
  const inviteApplicationsEnabled = computed(() => {
    const s = selectedServerInvite.selectedServer.value;
    return !!s && s.id !== 'echo' && s.applicationsEnabled === true;
  });
  const inviteJoinLinksEnabled = computed(() => {
    const s = selectedServerInvite.selectedServer.value;
    if (!s || s.id === 'echo') return true;
    return s.inviteJoinEnabled !== false;
  });
  const inviteCanCreateDirectHexInvite = computed(
    () =>
      inviteApplicationsEnabled.value &&
      inviteJoinLinksEnabled.value &&
      roleUi.serverSettingsCanManageServer.value,
  );
  const echoCanContext = createEchoCanContextComputeds(roleUi);
  const rolePreviewState = useEchoRolePreviewStateComputed(
    roleUi.rolePreview as Ref<unknown>,
  );

  const resolveMemberHighestRole = createMemberListHighestRoleResolver({
    memberListResolveHighestRole: roleUi.memberListResolveHighestRole,
    selectedServerId: selectedServerIdRef,
  });

  const channelTree = useGuildChannelTree({
    serverStore,
    workspace,
    selectedServer: selectedServerEcho,
    rolePreview: rolePreviewState,
    isRolePreviewActiveForServer: roleUi.isRolePreviewActiveForServer,
    previewHasUiPermission: roleUi.previewHasUiPermission,
  });

  const {
    rawCategoriesForServer,
    categoriesForServer,
    resolvePreviewChannelPermission,
    findChannelContextById,
    getFirstTextChannelId,
    watchActiveChannelWithServerChange,
  } = channelTree;

  const getServerChannelInfoForMainSurface =
    bindResolveServerChannelInfoForMainSurface(findChannelContextById);

  // DM peer/thread maps + merge hooks (before rail nav — `selectDM` must open thread + `activeChannelId`)
  const echoDmState = useAppLayoutEchoDmState({
    serverStore,
    workspace,
    authSession,
    activeChannelId,
    activeRailTab,
    dmActiveTab,
    selectedDMUserId,
    groupDMs,
  });
  const {
    echoDmPeerByChannelId,
    echoDmThreadIds,
    echoDmLastActivityIdByChannelId,
    echoDmLastActivityAtMsByChannelId,
    echoDmActiveCallParticipantUserIdsByChannelId,
    echoBlockedUserIds,
    mergeEchoDmThreadsFromApi,
    mergeEchoDmThread,
    mergeEchoDmThreadFromRealtime,
    mergeEchoBlockedFromApi,
    isEchoUserBlocked,
    leaveDmUiIfViewingUser,
  } = echoDmState;

  useEchoDmPeerProfileHydration({
    enabled: computed(
      () =>
        authSession.isAuthenticated &&
        !echoSyncCapabilities.isMockDataMode &&
        (activeRailTab.value === 'dm' ||
          isDMPanelOpen.value ||
          !!selectedDMUserId.value?.trim() ||
          !!activeGroupSettingsId.value?.trim()),
    ),
    getToken: () => authSession.accessToken?.trim() ?? '',
    workspaceUsers: workspace.users as Ref<WorkspaceRosterUserRow[]>,
    selfId: currentUserIdForSocket,
    echoPeerByChannelId: echoDmPeerByChannelId,
    groupDMs,
    selectedDMUserId,
    activeGroupSettingsId,
  });

  const {
    effectiveActiveChannel,
    activeChannelContext,
    isViewingVoiceChannel,
  } = useAppLayoutEffectiveChannel({
    activeChannelId,
    findChannelContextById,
    selectedDMUserId,
    echoDmPeerByChannelId,
    users: workspace.users,
    echoDmThreadIds,
    groupDMs,
  });

  const {
    openVcActivityPickerOnVoice,
    openVcActivityYoutubeBrowseOnVoice,
    openVcActivityWordleOnVoice,
    openVcActivityHangmanOnVoice,
    openVcActivitySkrigglesOnVoice,
    openVcActivityTicTacToeOnVoice,
    openVcActivityOpenGuessrOnVoice,
    openVcActivitySkribblIoOnVoice,
    openVcActivityGarticPhoneOnVoice,
    openVcActivityKrunkerOnVoice,
    openVcActivityCodenamesOnVoice,
    openVcActivityRichupOnVoice,
    openVcActivityGooberDashOnVoice,
    openVcActivitySmashKartsOnVoice,
    openVcActivityClusterRushOnVoice,
    openVcActivityWatchTogetherOnVoice,
  } = useAppLayoutVcActivityGuards({
    isViewingVoiceChannel,
    effectiveActiveChannel,
    vcActivityUi,
    closeVcActivity,
    openVcActivityPicker,
    openVcActivityYoutubeBrowse,
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
    openVcActivityWatchTogether,
  });

  watch(currentVoiceChannelId, (vc) => {
    const id = vc?.trim();
    if (!id) return;
    if (!isViewingVoiceChannel.value) return;
    const active = effectiveActiveChannel.value;
    if (active?.type !== 'voice' && active?.type !== 'stage') return;
    if (active.id === id) return;
    activeChannelId.value = id;
  });

  function applyVcYoutubeWatchTogetherRemoteOnVoice(
    ...args: Parameters<typeof applyVcYoutubeWatchTogetherRemote>
  ) {
    if (
      isViewingVoiceChannel.value &&
      effectiveActiveChannel.value?.type === 'stage'
    ) {
      return;
    }
    applyVcYoutubeWatchTogetherRemote(...args);
  }

  function applyVcWatchTogetherRemoteOnVoice(
    ...args: Parameters<typeof applyVcWatchTogetherRemote>
  ) {
    if (
      isViewingVoiceChannel.value &&
      effectiveActiveChannel.value?.type === 'stage'
    ) {
      return;
    }
    applyVcWatchTogetherRemote(...args);
  }

  const { handleActiveChannelChangeNavigation } =
    useAppLayoutActiveChannelNavigation({
      activeChannelId,
      isDMPanelOpen,
      echoDmThreadIds,
      findChannelContextById,
    });

  const { onSelectDmUser, isOpeningDmThread: _isOpeningDmThread } =
    useAppLayoutOpenDmThread({
      selectedDMUserId,
      dmActiveTab,
      selectedMessageRequestId,
      serverStore,
      pfpBarExpanded,
      authSession,
      activeChannelId,
      echoDmPeerByChannelId,
      echoDmThreadIds,
      messages: workspace.messages,
      messageRequests: workspace.messageRequests,
      isCompactShell,
      isDMPanelOpen,
      onGuestDmBlocked: () => openGuestUpgradeForDmRef.value?.(),
    });

  const selectDmUser = createSelectDmUserWithShadowGuard({
    users: () => workspace.users.value,
    onSelectDmUser,
  });

  const isKnownDmChannelId = createIsKnownDmChannelId({
    echoDmPeerByChannelId: () => echoDmPeerByChannelId.value,
    hasGroupDmChannel: (cid) => Boolean(groupDMs.value[cid]),
    echoDmThreadIds: () => echoDmThreadIds.value,
    findChannelContextById,
  });

  const hiddenDmInboxStore = useHiddenDmInboxStore();
  const favoriteDmInboxStore = useFavoriteDmInboxStore();
  const getLatestDmInboxTargetForRailRef = shallowRef<
    () =>
      | { kind: 'user'; userId: string }
      | { kind: 'group'; channelId: string }
      | null
  >(() => null);

  const isPersistedEchoDmThread = createIsPersistedEchoDmThreadChecker({
    getEchoDmThreadIds: () => echoDmThreadIds.value,
  });

  const getLatestDmPeerUserIdForRail = createLatestDmPeerUserIdForRailResolver({
    selfId: currentUserIdForSocket,
    echoPeerByChannelId: () => echoDmPeerByChannelId.value,
    messages: () => workspace.messages.value,
    users: workspace.users,
    skipPeerUserId: (userId) => hiddenDmInboxStore.isUserHidden(userId),
  });

  /** Mirrored from `dmCallWithUserId` after `callVoice` so shell nav debug logs stay complete. */
  const dmCallWithUserIdForShellLog = ref<string | null>(null);

  /** Wired after `useAppLayoutGroupDm`; `createDmRailIntents` reads `.value` when a rail avatar is clicked. */
  const selectGroupDmForIncomingRail = shallowRef<
    ((channelId: string) => void) | undefined
  >(undefined);

  /** Wired after `groupDmActions` exists; DM calls use this from `answerDmCall`. */
  const navigateToDmForAnswerRef = shallowRef<(targetId: string) => void>(
    () => {},
  );

  const {
    openServerSurface,
    selectServersTab,
    selectServersRailOnly,
    selectExploreTab,
    selectDMTab,
    closeDMPanel,
    dispatchNav,
    selectIncomingDmFromRail,
    selectIncomingGroupDmFromRail,
    openDmInboxFromRailOverflow,
    shellNavState,
    mainSurface,
    isServerEmptyOnboarding,
    suspiciousEmptyWorkspace,
    openServerSettingsFromUrl,
  } = useAppLayoutShellNavigation({
    base: import.meta.env.BASE_URL,
    activeRailTab,
    isDMPanelOpen,
    isMoreServersPanelOpen,
    pfpBarExpanded,
    activeChannelId,
    selectedDMUserId,
    dmActiveTab,
    selectedMessageRequestId,
    serverStore,
    workspace,
    authSession,
    echoDmThreadIds,
    echoDmPeerByChannelId,
    selectDmUser,
    getLatestDmPeerUserIdForRail,
    getLatestDmInboxTargetForRail: () =>
      getLatestDmInboxTargetForRailRef.value(),
    selectGroupDMFromRail: (channelId: string) =>
      selectGroupDmForIncomingRail.value?.(channelId),
    findChannelContextById,
    getFirstTextChannelId,
    canOpenServerSettingsForServer: roleUi.canOpenServerSettingsForServer,
    isSettingsModalOpen,
    settingsModalInitialSection,
    settingsModalActiveSection,
    isServerSettingsModalOpen,
    serverSettingsModalInitialSection,
    serverSettingsModalActiveSection,
    dmCallWithUserId: dmCallWithUserIdForShellLog,
    navDiagnosticsTraceId: navTraceId,
    selectGroupDmForIncomingRail,
    isGuestUser: () => authSession.backendUser?.isGuest === true,
    onGuestDmBlocked: () => openGuestUpgradeForDmRef.value?.(),
    isCompactShell,
    inviteLandingActive: inviteLandingActiveComputed,
  });

  const hasGuildChannelChrome = useHasGuildChannelChromeComputed(mainSurface);

  const { openGuildMobileVcLobby, closeGuildMobileVcLobby } =
    useAppLayoutGuildMobileVcLobby({
      hasGuildChannelChrome,
      isCompactShell,
      compactGuildTriPaneChannelPanelOpen,
      compactPagerPane,
      guildMobileVcLobby,
      activeChannelId,
      currentVoiceChannelId,
    });

  const voiceChannelForParticipants =
    useAppLayoutVoiceChannelForParticipantsComputed({
      currentVoiceChannelId,
      findChannelContextById,
      effectiveActiveChannel,
    });

  const callVoice = useAppLayoutCallVoiceBridge({
    workspace,
    authSession,
    mainSurface,
    activeChannelId,
    selectedDMUserId,
    groupDMs,
    echoDmPeerByChannelId,
    echoDmActiveCallParticipantUserIdsByChannelId,
    mergeRealtimeDmThread: mergeEchoDmThreadFromRealtime,
    selectedServerEcho,
    voiceChannelForParticipants,
    currentVoiceChannelId,
    currentVoiceChannelName,
    vcMuted,
    vcDeafened,
    micTestListenDeafenActive,
    applyVcDeafened,
    vcVideo,
    vcScreenshare,
    isScreenSharePickerOpen,
    isDesktopStreamingControlOpen,
    desktopStreamingControlMode,
    onJoinVoice,
    onLeaveVoice,
    isDmUiContext,
    voiceSideChatCollapsed,
    toggleVoiceSideChat,
    categoriesForServer,
    getFirstTextChannelId,
    findChannelContextById,
    roleUi,
    resolvePreviewChannelPermission,
    navigateToDmForAnswer: (targetId) =>
      navigateToDmForAnswerRef.value(targetId),
    isCompactShell,
    hasGuildChannelChrome,
    vcActivityUi,
    applyVcYoutubeWatchTogetherRemote: applyVcYoutubeWatchTogetherRemoteOnVoice,
    applyVcWatchTogetherRemote: applyVcWatchTogetherRemoteOnVoice,
    closeVcActivity,
  });

  return {
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
    applyVcWatchTogetherRemote,
    applyVcWatchTogetherRemoteOnVoice,
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
    patchWatchTogetherUi,
    playWatchTogetherAtIndex,
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
  };
}
