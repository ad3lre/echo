import {
  computed,
  defineAsyncComponent,
  inject,
  nextTick,
  onUnmounted,
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
import { fetchMeDiscord } from '@/api/meClient';
import { PLATFORM_KEY } from '@/platform/keys';
import { usePollVotes } from '@/composables/usePollVotes';
import { useEchoHistory } from '@/composables/useEchoHistory';
import { useChatMessages } from '@/composables/useChatMessages';
import { useMessageReactions } from '@/composables/useMessageReactions';
import { useReactionFavorites } from '@/composables/useReactionFavorites';
import { useLayout } from '@/composables/useLayout';
import { bindPaperEditorChannelPanelWidth } from '@/features/paper/composables/paperEditorPanelBridge';
import { useCompactShell } from '@/composables/useCompactShell';
// Sub-composables
import { useAppLayoutRealtimeSocketBinding } from './useAppLayoutRealtimeSocketBinding';
import { useStageVcActivityBlock } from '@/features/voice/composables/useStageVcActivityBlock';
import { useAppLayoutUiState } from './useAppLayoutUiState';
import { useAppLayoutShellNavigation } from './useAppLayoutShellNavigation';
import { useImmediateShellSwitchPending } from './useImmediateShellSwitchPending';
import { useAppLayoutActiveChannelNavigation } from './useAppLayoutActiveChannelNavigation';
import { useAppLayoutRailLoadingDerived } from './useAppLayoutRailLoadingDerived';
import { useAppLayoutChannelManageCapabilities } from './useAppLayoutChannelManageCapabilities';
import { useGuildChannelTree } from '@/services/orchestration/useGuildChannelTree';
import { useGuildChannelModals } from './useGuildChannelModals';
import { useEchoGuildRoleUi } from './useEchoGuildRoleUi';
import { useEchoWorkspaceLifecycle } from './useEchoWorkspaceLifecycle';
import { useEchoPresenceSync } from '@/services/orchestration/useEchoPresenceSync';
import { useGuildModeration } from './useGuildModeration';
import { useDmSocialActions } from '@/features/dm/composables/useDmSocialActions';
import { useAppLayoutOpenDmThread } from './useAppLayoutOpenDmThread';
import { useAppLayoutEchoDmState } from '@/services/orchestration/useAppLayoutEchoDmState';
import { useAppLayoutDmRailUnread } from '@/services/orchestration/useAppLayoutDmRailUnread';
import { useAppLayoutLiveChannelCaps } from './useAppLayoutLiveChannelCaps';
import { useAppLayoutNsfwGate } from './useAppLayoutNsfwGate';
import { useAppLayoutSearchIntegration } from './useAppLayoutSearchIntegration';
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
import { useAppLayoutProfilesDomain } from './useAppLayoutProfilesDomain';
import { useAppLayoutContextProfileSlice } from './useAppLayoutContextProfileSlice';
import { useAppLayoutContextVoiceSlice } from './useAppLayoutContextVoiceSlice';
import { useAppLayoutContextMessagingSlice } from './useAppLayoutContextMessagingSlice';
import { useAppLayoutContextServerRailSlice } from './useAppLayoutContextServerRailSlice';
import { useAppLayoutContextShellLayoutSlice } from './useAppLayoutContextShellLayoutSlice';
import { useAppLayoutContextDmSlice } from './useAppLayoutContextDmSlice';
import { useAppLayoutContextModerationSlice } from './useAppLayoutContextModerationSlice';
import { useAppLayoutContextShellChromeSlice } from './useAppLayoutContextShellChromeSlice';
import { buildAppLayoutControllerContext } from './buildAppLayoutControllerContext';
import { useAppLayoutDiscordBotPoll } from './useAppLayoutDiscordBotPoll';
import { useAppLayoutForwardMessage } from './useAppLayoutForwardMessage';
import { useAppLayoutMessageActions } from './useAppLayoutMessageActions';
import { useAddServerFlow } from './useAddServerFlow';
import { useSelectedServerInvite } from './useSelectedServerInvite';
import { useAppLayoutCallVoiceBridge } from './useAppLayoutCallVoiceBridge';
import { useAppLayoutGroupDm } from './useAppLayoutGroupDm';
import { useAppLayoutGuestQuickDm } from './useAppLayoutGuestQuickDm';
import { useAppLayoutLeaveServerModal } from './useAppLayoutLeaveServerModal';
import { useJoinServerConfirmModal } from './useJoinServerConfirmModal';
import { useServerApplicationModal } from './useServerApplicationModal';
import { createIsKnownDmChannelId } from '@/features/dm/createIsKnownDmChannelId';
import { createSelectDmUserWithShadowGuard } from '@/features/dm/createSelectDmUserWithShadowGuard';
import { createOpenEchoGroupDmOnServerInvoker } from '@/features/dm/openEchoGroupDmOnServer';
import { createEchoDmActivityHandler } from '@/features/dm/createEchoDmActivityHandler';
import { createHandleAcceptMessageRequestOpener } from '@/features/dm/createHandleAcceptMessageRequestOpener';
import { createLatestDmPeerUserIdForRailResolver } from '@/features/dm/createLatestDmPeerUserIdForRailResolver';
import { createLatestDmInboxTargetForRailResolver } from '@/features/dm/createLatestDmInboxTargetForRailResolver';
import {
  echoDmChannelIdForPeerUser,
  pinSelfDmInboxEntryFirst,
} from '@/features/dm/buildDmPanelUserList';
import { filterVisibleDmInboxEntries } from '@/features/dm/filterVisibleDmInbox';
import { maxIncomingPeerMessageMs } from '@/features/dm/hiddenDmInboxUtils';
import { sortFavoriteDmInboxFirst } from '@/features/dm/sortFavoriteDmInboxFirst';
import {
  collectDmMentionNotifications,
  type DmMentionNotificationRow,
} from '@/features/dm/collectDmMentionNotifications';
import type { RawMessage } from '@/services/realtime/chatMessageTypes';
import { useHiddenDmInboxStore } from '@/stores/hiddenDmInbox';
import { useFavoriteDmInboxStore } from '@/stores/favoriteDmInbox';
import { useDmInboxOrderCacheStore } from '@/stores/dmInboxOrderCache';
import { useAppLayoutWorkspaceFriendshipQueries } from './useAppLayoutWorkspaceFriendshipQueries';
import { createEchoCanContextComputeds } from './createEchoCanContextComputeds';
import { createStableGoToMessageDelegate } from '@/features/layout/actions/appActionRegistry';
import { createSelectServerFromStore } from '@/features/layout/createSelectServerFromStore';
import { createChatMessageNavBridge } from '@/features/navigation/createChatMessageNavBridge';
import { isDmThreadId } from '@/features/layout/mainSurface';
import {
  isAppNavPath,
  parseAppPathname,
} from '@/features/layout/urlNavigation';

import { getChannelDisplayName, icons } from '@/assets/icons';
import { useChannelIconResolver } from '@/composables/useChannelIconResolver';
import { useAppLayoutShellAuthDerived } from './useAppLayoutShellAuthDerived';

import { buildAppLayoutExpose } from './useAppLayoutController.expose';
import { createSubmitPinToggle } from './useAppLayoutSubmitPinToggle';
import { createMemberListHighestRoleResolver } from './useMemberListHighestRoleResolver';
import { useAppLayoutEffectiveChannel } from './useAppLayoutEffectiveChannel';
import { useAppLayoutDmPeerSelectionOpen } from './useAppLayoutDmPeerSelectionOpen';
import { useAppLayoutDmUiContext } from './useAppLayoutDmUiContext';
import { useAppLayoutDmGroupFriendsComputed } from './useAppLayoutDmGroupFriendsComputed';
import { useAppLayoutVoiceContextExpose } from './useAppLayoutVoiceContextExpose';
import { useAppLayoutVoiceScreenShareHandlers } from './useAppLayoutVoiceScreenShareHandlers';
import { useAppLayoutServerChromeCallbacks } from './useAppLayoutServerChromeCallbacks';
import { useComputedRefAlias } from './useComputedRefAlias';
import { useComputedOptionalRefAlias } from './useComputedOptionalRefAlias';
import { useAppLayoutMemberSurfaceSwitchLoading } from './useAppLayoutMemberSurfaceSwitchLoading';
import { useMockDataModeOffComputed } from './useMockDataModeOffComputed';
import { useAppLayoutDmPanelInboxComputed } from './useAppLayoutDmPanelInboxComputed';
import { useEchoDmPeerProfileHydration } from './useEchoDmPeerProfileHydration';
import { peerDisplayNamePlaceholder } from '@/features/dm/peerDisplayPlaceholder';
import type { WorkspaceRosterUserRow } from '@/services/domain/workspaceRoster';
import { useAppLayoutMainSurfaceDmFlags } from './useAppLayoutMainSurfaceDmFlags';
import { useAppLayoutDmProfileBridge } from './useAppLayoutDmProfileBridge';
import { useDmCallWithUserIdShellLogMirror } from './useDmCallWithUserIdShellLogMirror';
import { useAppLayoutVoiceChannelForParticipantsComputed } from './useAppLayoutVoiceChannelForParticipantsComputed';
import { useAppLayoutWorkspaceReadyComputed } from './useAppLayoutWorkspaceReadyComputed';
import { useAppLayoutBanners } from './useAppLayoutBanners';
import { useDmSurfaceAdapter } from './useDmSurfaceAdapter';
import { useProfileSurfaceAdapter } from './useProfileSurfaceAdapter';
import { useChatHeaderAdapter } from './useChatHeaderAdapter';
import { createEchoServerMemberOrchestration } from '@/services/orchestration/echoServerMemberOrchestration';
import { echoHttpToggleReaction } from '@/api/echo/echoReactionHttp';
import { failResult, type ActionResult } from '@/types/actionResult';
import { updateChannelMessageInBucket } from '@/services/realtime/channelMessageAuthority';
import { useAppLayoutActionRegistryPipeline } from './useAppLayoutActionRegistryPipeline';
import { useAppLayoutRealtimeHostWiring } from './useAppLayoutRealtimeHostWiring';
import { createBeforeOpenGroupDmModal } from './createBeforeOpenGroupDmModal';
import { createPromptSignInHandler } from './createPromptSignInHandler';
import { createResolveEchoDmPeerFromMap } from './createResolveEchoDmPeerFromMap';
import { openEchoDirectDmChannel } from '@/features/dm/echoDmCommandFacade';
import { createVoidingInvoker } from './createVoidingInvoker';
import { createIsChannelActive } from './createIsChannelActive';
import { createNavigateToChannelActiveOnly } from './createNavigateToChannelActiveOnly';
import { createIsPersistedEchoDmThreadChecker } from './createIsPersistedEchoDmThreadChecker';
import { createOpenMemberProfileWithRolesPref } from './createOpenMemberProfileWithRolesPref';
import { createPinToggleHandlers } from './createPinToggleHandlers';
import { useAppLayoutMemberPopoutChromeCallbacks } from './useAppLayoutMemberPopoutChromeCallbacks';
import { useAppLayoutUserSettingsModalCallbacks } from './useAppLayoutUserSettingsModalCallbacks';
import {
  useDmInboxUsersForPanelComputed,
  useGroupDmPanelListComputed,
} from './useDmPanelListComputeds';
import { usePreviewCanModerateMembersComputed } from './usePreviewCanModerateMembersComputed';
import { useCanDeleteCurrentEchoServerComputed } from './useCanDeleteCurrentEchoServerComputed';
import { useDmAttentionUnreadMapForPanelComputed } from './useDmAttentionUnreadMapForPanelComputed';
import { useEchoRolePreviewStateComputed } from './useEchoRolePreviewStateComputed';
import { useServerNotificationLevelsMapComputed } from './useServerNotificationLevelsMapComputed';
import { bindResolveServerChannelInfoForMainSurface } from '@/features/layout/resolveServerChannelTypeForMainSurface';
import { createChatSoundMemberRoleIdsGetter } from '@/features/layout/createChatSoundMemberRoleIdsGetter';
import { newTraceId } from '@/observability/sessionDiagnostics';
import { isEchoGraphId } from '@/utils/echoIds';
import { resolveEchoServerIdContainingChannel } from '@/features/voice/resolveEchoServerIdForGuildChannel';
import { createToggleBooleanRef } from './createToggleBooleanRef';
import { createHandleExpandedProfileOpenServer } from './createHandleExpandedProfileOpenServer';
import { createIsServerUnread } from './createIsServerUnread';
import { createOpenCreateChannelOnServer } from './createOpenCreateChannelOnServer';
import { createCanModerateMessageAuthorAdapter } from './createCanModerateMessageAuthorAdapter';
import { useHasGuildChannelChromeComputed } from './useHasGuildChannelChromeComputed';
import { useLiveChannelCapabilitiesRefreshKey } from './useLiveChannelCapabilitiesRefreshKey';
import { filterPublicExploreDirectoryRows } from '@/services/domain/exploreDirectoryRows';
import {
  buildEchoDmMarkReadPlan,
  buildEchoServerMarkReadPlan,
  buildLatestMessageIdByChannelIdForServer,
  type EchoServerMarkReadPlan,
} from '@/services/domain/echoServerMarkReadTargets';
import { fetchEchoAttentionSummary } from '@/api/echo/attention';
import type { NotificationReadPreset } from '@/features/dm/filterDmMentionNotificationRows';
import {
  deleteEchoGroupDmMember,
  fetchEchoDmThreads,
  patchEchoGroupDm,
  postEchoAddGroupDmMembers,
  postEchoLeaveGroupDm,
  postEchoLeaveServer,
} from '@/api/echoClient';
import { postEchoOpenDm } from '@/api/echo/social';
import { putEchoChannelReadState } from '@/api/echo/messages';
import { compareEchoTimelineIds } from '@/services/domain/echoMessageReadState';
import { resolveEchoDmWireChannelId } from '@/features/layout/resolveEchoDmWireChannelId';
import { isViewingEchoConversationChannel } from '@/features/layout/isViewingEchoConversationChannel';
import { echoSyncCapabilities } from '@/platform/syncCapabilities';
import { useEchoAfkPresence } from '@/composables/useEchoAfkPresence';
import {
  selectSelfPresence,
  normalizeCanonicalPresenceStatus,
} from '@/services/domain/presence';
import { reportPrimaryFlowFailure } from '@/utils/primaryFlowFailure';
import {
  dispatchAppToast,
  dispatchAppToastDetail,
  type AppToastAction,
} from '@/utils/controllerMissingAction';
import { registerEchoToastQuickReplySender } from '@/features/layout/echoToastQuickReplyBridge';
import { insertChannelMessageFromHistory } from '@/services/realtime/channelMessageAuthority';
import { randomUuidV4 } from '@/utils/randomUuid';

const ExploreView = defineAsyncComponent(
  () => import('@/components/ExploreView.vue'),
);

const SERVER_LAYOUT_PREFS_STORAGE_KEY = 'echo-server-layout-prefs-v1';

type ServerLayoutPrefs = {
  channelPanelCollapsed: boolean;
  channelPanelBubbleMode?: boolean;
  memberPanelCollapsed: boolean;
  voiceSideChatCollapsed: boolean;
  compactGuildTriPaneChannelPanelOpen: boolean;
  isMoreServersPinned: boolean;
};

function readServerLayoutPrefsStore(): Record<string, ServerLayoutPrefs> {
  if (typeof localStorage === 'undefined') return {};
  try {
    const raw = localStorage.getItem(SERVER_LAYOUT_PREFS_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
      return {};
    const out: Record<string, ServerLayoutPrefs> = {};
    for (const [serverId, value] of Object.entries(parsed)) {
      if (!serverId.trim()) continue;
      if (!value || typeof value !== 'object' || Array.isArray(value)) continue;
      const v = value as Partial<ServerLayoutPrefs>;
      out[serverId] = {
        channelPanelCollapsed: !!v.channelPanelCollapsed,
        memberPanelCollapsed: !!v.memberPanelCollapsed,
        voiceSideChatCollapsed: !!v.voiceSideChatCollapsed,
        compactGuildTriPaneChannelPanelOpen:
          !!v.compactGuildTriPaneChannelPanelOpen,
        isMoreServersPinned: !!v.isMoreServersPinned,
      };
    }
    return out;
  } catch {
    return {};
  }
}

function writeServerLayoutPrefsStore(
  store: Record<string, ServerLayoutPrefs>,
): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(
      SERVER_LAYOUT_PREFS_STORAGE_KEY,
      JSON.stringify(store),
    );
  } catch {
    /* ignore quota / private mode */
  }
}

type DmMarkReadPayload =
  | { kind: 'user'; userId: string }
  | { kind: 'group'; channelId: string };

/**
 * Layout shell composition root: ordered wiring of region composables + slices.
 * Policy and merge rules live in `frontend/src/services/` and named `useAppLayout*` /
 * `useEcho*` composables — not inline here.
 * Charter definition of “thin”: `docs/architecture/client-layer-violations.md` §1.
 */
export function useAppLayoutController() {
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
  const linkedDiscordUserId = ref<string | null>(null);
  const linkedDiscordState = ref<Awaited<
    ReturnType<typeof fetchMeDiscord>
  > | null>(null);

  async function refreshLinkedDiscordUserId(): Promise<void> {
    const u = authSession.backendUser;
    if (!authSession.isAuthenticated || !u || u.isGuest) {
      linkedDiscordUserId.value = null;
      linkedDiscordState.value = null;
      return;
    }
    try {
      const s = await fetchMeDiscord();
      linkedDiscordState.value = s;
      if (s.linked) {
        const id = s.profile.discordUserId?.trim();
        linkedDiscordUserId.value = id || null;
      } else {
        linkedDiscordUserId.value = null;
      }
    } catch {
      linkedDiscordUserId.value = null;
      linkedDiscordState.value = null;
    }
  }

  watch(
    () => [authSession.isAuthenticated, authStateGeneration.value] as const,
    () => {
      void refreshLinkedDiscordUserId();
    },
    { immediate: true },
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
    setVcActivityYoutubeVideo,
    applyVcYoutubeWatchTogetherRemote,
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

  /** Per-server panel layout state (collapse flags, pinned sidebar, etc.), keyed by server id. */
  const serverLayoutPrefsById = ref<Record<string, ServerLayoutPrefs>>(
    readServerLayoutPrefsStore(),
  );
  let serverLayoutPrefsPersistTimer: ReturnType<typeof setTimeout> | null =
    null;
  /**
   * True while `applyServerLayoutPrefsFor` is writing reactive refs from storage.
   * Prevents the layout-change watcher from immediately writing those values back,
   * which would corrupt the prefs for the server we just left.
   */
  let applyingServerLayoutPrefs = false;

  /** Strips whitespace and rejects the synthetic 'echo' DM rail server id. */
  function normalizedPrefsServerId(
    raw: string | null | undefined,
  ): string | null {
    const sid = raw?.trim() ?? '';
    if (!sid || sid === 'echo') return null;
    return sid;
  }

  /** Debounces writes to localStorage — layout changes fire rapidly during drag resize. */
  function persistServerLayoutPrefsSoon() {
    if (serverLayoutPrefsPersistTimer != null) {
      clearTimeout(serverLayoutPrefsPersistTimer);
    }
    serverLayoutPrefsPersistTimer = setTimeout(() => {
      serverLayoutPrefsPersistTimer = null;
      writeServerLayoutPrefsStore(serverLayoutPrefsById.value);
    }, 120);
  }

  onUnmounted(() => {
    if (serverLayoutPrefsPersistTimer != null) {
      clearTimeout(serverLayoutPrefsPersistTimer);
      serverLayoutPrefsPersistTimer = null;
      writeServerLayoutPrefsStore(serverLayoutPrefsById.value);
    }
  });

  /** Snapshots current panel state into the in-memory prefs map for the given server. */
  function writeServerLayoutPrefsFor(serverId: string | null | undefined) {
    const sid = normalizedPrefsServerId(serverId);
    if (!sid || applyingServerLayoutPrefs) return;
    serverLayoutPrefsById.value = {
      ...serverLayoutPrefsById.value,
      [sid]: {
        channelPanelCollapsed: channelPanelCollapsed.value,
        channelPanelBubbleMode: channelPanelBubbleMode.value,
        memberPanelCollapsed: memberPanelCollapsed.value,
        voiceSideChatCollapsed: voiceSideChatCollapsed.value,
        compactGuildTriPaneChannelPanelOpen:
          compactGuildTriPaneChannelPanelOpen.value,
        isMoreServersPinned: isMoreServersPinned.value,
      },
    };
    persistServerLayoutPrefsSoon();
  }

  /**
   * Restores panel state for the given server from the in-memory prefs map.
   * Falls back to expanded defaults on first visit (no stored prefs).
   */
  function applyServerLayoutPrefsFor(serverId: string | null | undefined) {
    const sid = normalizedPrefsServerId(serverId);
    if (!sid) return;
    const prefs = serverLayoutPrefsById.value[sid];
    applyingServerLayoutPrefs = true;
    try {
      if (prefs) {
        channelPanelCollapsed.value = prefs.channelPanelCollapsed;
        channelPanelBubbleMode.value = prefs.channelPanelBubbleMode ?? false;
        memberPanelCollapsed.value = prefs.memberPanelCollapsed;
        if (!prefs.memberPanelCollapsed) {
          markMemberPanelExpandedByUser();
        } else {
          markMemberPanelCollapsedByUser();
        }
        voiceSideChatCollapsed.value = prefs.voiceSideChatCollapsed;
        compactGuildTriPaneChannelPanelOpen.value =
          prefs.compactGuildTriPaneChannelPanelOpen;
        isMoreServersPinned.value = prefs.isMoreServersPinned;
        return;
      }
      // First visit for this server: start from expanded defaults.
      channelPanelCollapsed.value = false;
      channelPanelBubbleMode.value = false;
      memberPanelCollapsed.value = false;
      voiceSideChatCollapsed.value = false;
      compactGuildTriPaneChannelPanelOpen.value = false;
      isMoreServersPinned.value = false;
    } finally {
      applyingServerLayoutPrefs = false;
    }
  }

  watch(
    [
      channelPanelCollapsed,
      memberPanelCollapsed,
      voiceSideChatCollapsed,
      compactGuildTriPaneChannelPanelOpen,
      isMoreServersPinned,
    ],
    () => {
      writeServerLayoutPrefsFor(selectedServerIdRef.value);
    },
  );

  watch(
    selectedServerIdRef,
    (next, prev) => {
      writeServerLayoutPrefsFor(prev);
      applyServerLayoutPrefsFor(next);
    },
    { immediate: true },
  );

  const isInDMChat = useAppLayoutDmPeerSelectionOpen({
    activeRailTab,
    selectedDMUserId,
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

  const { immediateShellSwitchPending } = useImmediateShellSwitchPending({
    activeRailTab,
    selectedServerId: selectedServerIdRef,
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

  const { guardOpen: guardVcActivityOpen } = useStageVcActivityBlock({
    isViewingVoiceChannel,
    effectiveActiveChannel,
    vcActivityUi,
    closeVcActivity,
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

  const openVcActivityPickerOnVoice = guardVcActivityOpen(openVcActivityPicker);
  const openVcActivityYoutubeBrowseOnVoice = guardVcActivityOpen(
    openVcActivityYoutubeBrowse,
  );
  const openVcActivityWordleOnVoice = guardVcActivityOpen(openVcActivityWordle);
  const openVcActivityHangmanOnVoice = guardVcActivityOpen(
    openVcActivityHangman,
  );
  const openVcActivitySkrigglesOnVoice = guardVcActivityOpen(
    openVcActivitySkriggles,
  );
  const openVcActivityTicTacToeOnVoice = guardVcActivityOpen(
    openVcActivityTicTacToe,
  );
  const openVcActivityOpenGuessrOnVoice = guardVcActivityOpen(
    openVcActivityOpenGuessr,
  );
  const openVcActivitySkribblIoOnVoice = guardVcActivityOpen(
    openVcActivitySkribblIo,
  );
  const openVcActivityGarticPhoneOnVoice = guardVcActivityOpen(
    openVcActivityGarticPhone,
  );
  const openVcActivityKrunkerOnVoice = guardVcActivityOpen(
    openVcActivityKrunker,
  );
  const openVcActivityCodenamesOnVoice = guardVcActivityOpen(
    openVcActivityCodenames,
  );
  const openVcActivityRichupOnVoice = guardVcActivityOpen(openVcActivityRichup);
  const openVcActivityGooberDashOnVoice = guardVcActivityOpen(
    openVcActivityGooberDash,
  );
  const openVcActivitySmashKartsOnVoice = guardVcActivityOpen(
    openVcActivitySmashKarts,
  );
  const openVcActivityClusterRushOnVoice = guardVcActivityOpen(
    openVcActivityClusterRush,
  );

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
  const dmInboxOrderCacheStore = useDmInboxOrderCacheStore();
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

  watch(hasGuildChannelChrome, (on) => {
    if (!on) {
      compactGuildTriPaneChannelPanelOpen.value = false;
      guildMobileVcLobby.value = null;
    }
  });

  function openGuildMobileVcLobby(payload: {
    channelId: string;
    channelName: string;
  }) {
    guildMobileVcLobby.value = payload;
    if (isCompactShell.value && hasGuildChannelChrome.value) {
      compactPagerPane.value = 1;
    }
  }

  function closeGuildMobileVcLobby() {
    guildMobileVcLobby.value = null;
  }

  /** Compact tri-pane: return to chat after switching channels (e.g. picked from channel list). */
  watch(activeChannelId, (next, prev) => {
    if (!isCompactShell.value || !hasGuildChannelChrome.value) return;
    if (next === prev) return;
    compactPagerPane.value = 1;
  });

  watch(currentVoiceChannelId, (vc) => {
    const lobby = guildMobileVcLobby.value;
    if (!lobby || !vc?.trim()) return;
    if (vc.trim() === lobby.channelId.trim()) {
      guildMobileVcLobby.value = null;
    }
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
    closeVcActivity,
  });

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

  // DM Messages list recency sort depends on Echo DM thread activity ids.
  // Ensure we refresh `/dm/threads` when the user enters the Messages view so the
  // list is ordered correctly even before opening a specific thread.
  let dmThreadsRefreshInFlight: Promise<void> | null = null;
  async function refreshEchoDmThreadsForInboxSort(): Promise<void> {
    if (dmThreadsRefreshInFlight) return dmThreadsRefreshInFlight;
    const token = authSession.accessToken?.trim() ?? '';
    if (!authSession.isAuthenticated) return;
    dmThreadsRefreshInFlight = (async () => {
      try {
        const { threads } = await fetchEchoDmThreads(token);
        mergeEchoDmThreadsFromApi(threads);
      } catch (e) {
        reportPrimaryFlowFailure('dm_threads.refresh_for_inbox_sort', e, {
          inDmRail: activeRailTab.value === 'dm',
          dmPanelOpen: isDMPanelOpen.value,
          dmSubView: dmActiveTab.value,
        });
      }
    })().finally(() => {
      dmThreadsRefreshInFlight = null;
    });
    return dmThreadsRefreshInFlight;
  }

  watch(
    () =>
      [
        activeRailTab.value,
        isDMPanelOpen.value,
        dmActiveTab.value,
        authSession.backendUser?.id ?? null,
      ] as const,
    ([rail, dmOpen, subView]) => {
      if (subView !== 'messages') return;
      if (rail !== 'dm' && !dmOpen) return;
      void refreshEchoDmThreadsForInboxSort();
    },
    { immediate: true },
  );

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
    onEchoMessageFailedGuest,
    openAuthModal,
  });

  const channelModals = useGuildChannelModals({
    authSession,
    workspace,
    selectedServer: selectedServerEcho,
    categoriesForServer,
    activeChannelId,
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

  function applyRealtimeAuthorHint(payload: {
    userId: string;
    displayName?: string;
    avatarUrl?: string;
  }): void {
    const userId = payload.userId.trim();
    if (!userId) return;
    const displayName = payload.displayName?.trim() ?? '';
    const avatarUrl = payload.avatarUrl?.trim() ?? '';
    const rows = workspace.users.value;
    const idx = rows.findIndex((u) => u.id === userId);
    if (idx >= 0) {
      const row = rows[idx]!;
      const placeholder = peerDisplayNamePlaceholder(userId);
      const shouldFillName =
        !!displayName &&
        (!row.name.trim() ||
          row.name === placeholder ||
          row.name.toLowerCase() === 'unknown');
      const shouldFillAvatar = !!avatarUrl && !row.pfp?.trim();
      if (!shouldFillName && !shouldFillAvatar) return;
      const next = rows.slice();
      next[idx] = {
        ...row,
        ...(shouldFillName ? { name: displayName } : {}),
        ...(shouldFillAvatar ? { pfp: avatarUrl } : {}),
      };
      workspace.users.value = next;
      return;
    }
    if (!displayName && !avatarUrl) return;
    workspace.users.value = [
      ...rows,
      {
        id: userId,
        name: displayName || peerDisplayNamePlaceholder(userId),
        pfp: avatarUrl,
        status: echoSession.presenceByUserId[userId] ?? 'offline',
      },
    ];
  }

  const echoChannelHistory = useEchoHistory(activeChannelId, {
    echoDmThreadIds,
    echoDmPeerByChannelId,
  });

  /**
   * Realtime `message` events whose `replyTo.messageId` is missing locally leave
   * the reply preview unresolved ("Attachment"/em-dash) and the original bubble
   * invisible — typically because the receiver missed that earlier broadcast
   * (socket reconnect, channel-room subscribe lag). One-shot REST backfill so
   * the reply preview can render properly and the original message appears in
   * the bucket without forcing the user to click the reference. Dedup window
   * prevents the inbound stream from spamming the API when many replies share
   * the same target id.
   */
  const ensureReplyTargetMessageLastAttemptMs = new Map<string, number>();
  const ENSURE_REPLY_TARGET_MESSAGE_DEDUP_MS = 30_000;
  function ensureReplyTargetMessage(
    channelId: string,
    messageId: string,
  ): void {
    if (!channelId || !messageId) return;
    if (!echoChannelHistory?.prefetchUntilMessageVisible) return;
    const key = `${channelId}\u001f${messageId}`;
    const now = Date.now();
    const last = ensureReplyTargetMessageLastAttemptMs.get(key) ?? 0;
    if (now - last < ENSURE_REPLY_TARGET_MESSAGE_DEDUP_MS) return;
    ensureReplyTargetMessageLastAttemptMs.set(key, now);
    void echoChannelHistory.prefetchUntilMessageVisible(channelId, messageId);
  }

  const {
    isServerRailFastSwitchPending,
    isChannelPanelSwitchLoading,
    isMessageSurfaceSwitchLoading,
  } = useAppLayoutRailLoadingDerived({
    immediateShellSwitchPending,
    activeRailTab,
    serverStore,
    workspace,
    activeChannelId,
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

  function expandChannels() {
    if (isCompactShell.value && hasGuildChannelChrome.value) {
      compactGuildTriPaneChannelPanelOpen.value = true;
      compactPagerPane.value = 0;
      return;
    }
    expandChannelsGrid();
  }

  function expandMembers() {
    if (isCompactShell.value && hasGuildChannelChrome.value) {
      compactPagerPane.value = 2;
      return;
    }
    memberPanelCollapsed.value = false;
    markMemberPanelExpandedByUser();
  }

  function collapseMembers() {
    if (isCompactShell.value && hasGuildChannelChrome.value) {
      if (compactPagerPane.value === 2) {
        compactPagerPane.value = 1;
      }
      memberPanelCollapsed.value = true;
      markMemberPanelCollapsedByUser();
      return;
    }
    memberPanelCollapsed.value = true;
    markMemberPanelCollapsedByUser();
  }

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

  const searchIntegration = useAppLayoutSearchIntegration({
    workspace,
    categoriesForServer,
    activeChannelId,
    activeChannelMessages,
    authSession,
    serverStore,
    isInDMMode: isInDMModeComputed,
    echoDmThreadIds,
    selectedServer: selectedServerEcho,
    handleGoToMessage: handleGoToMessageDelegated,
  });
  const {
    searchText,
    filterChips,
    allChannels,
    isSearchActive,
    paginatedSearchResults,
    searchResultMessages,
    searchResultPage,
    totalPages,
    goToSearchPage,
    addFilter,
    removeFilter,
    clearSearch,
    searchLoading,
    searchError,
    searchScopeHint,
    onSearchInput,
    searchActiveTab,
    searchFilter,
    searchIsLoading,
    searchResults,
    searchStatus,
  } = searchIntegration;

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
    onVoiceE2eeEpochSuperseded: (payload) => {
      const cid = payload.voiceChannelId?.trim();
      if (!cid) return;
      const guildVc = currentVoiceChannelId.value?.trim();
      const dmVc = _dmLiveKitJoinChannelId.value?.trim();
      if (guildVc !== cid && dmVc !== cid) return;
      void (async () => {
        await _liveKitVoiceApi?.disconnect();
        if (dmVc === cid) {
          rejoinDmCallVoice();
          return;
        }
        if (guildVc === cid) {
          try {
            await reconnectGuildVoiceAfterE2eeRotation();
          } catch {
            dispatchAppToast(
              'Call encryption was rotated but reconnect failed. Rejoin voice manually.',
              'warning',
            );
          }
        }
      })();
    },
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
      [authSession.isAuthenticated, authSession.accessToken] as const,
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

  registerEchoToastQuickReplySender((channelId, text) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    if (!isLiveSocketReady()) {
      dispatchAppToast(
        'You are offline. Reconnect to send a message.',
        'warning',
      );
      return;
    }
    try {
      sendMessageViaSocket(channelId, trimmed);
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

  /** Socket when connected; otherwise Echo REST so flaky WebSockets do not block reactions. */
  function isReactionPersistReady(): boolean {
    return isLiveSocketReady() || authSession.isAuthenticated;
  }

  async function submitReactionToggle(
    channelId: string,
    messageId: string,
    emoji: string,
    correlationId?: string,
    ctx?: { removing: boolean },
  ): Promise<ActionResult> {
    if (isLiveSocketReady()) {
      return submitReactionToggleViaSocket(
        channelId,
        messageId,
        emoji,
        correlationId,
      );
    }
    if (!authSession.isAuthenticated) {
      return failResult(
        'SOCKET_DISCONNECTED',
        'Realtime is not connected. Wait for Echo to reconnect, then try again.',
        true,
      );
    }
    if (ctx?.removing === undefined) {
      return failResult(
        'SOCKET_DISCONNECTED',
        'Realtime is not connected. Wait for Echo to reconnect, then try again.',
        true,
      );
    }
    const r = await echoHttpToggleReaction({
      token: authSession.accessToken,
      channelId,
      messageId,
      emoji,
      removing: ctx.removing,
    });
    if (!r.ok) return r;
    if (r.reactions) {
      updateChannelMessageInBucket(channelId, messageId, {
        reactions: r.reactions.length > 0 ? r.reactions : undefined,
      });
      uiTransactions.commitPendingReactionTogglesForMessage(
        channelId,
        messageId,
      );
    }
    return { ok: true };
  }

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
    isViewingConversationChannel: (channelId: string) =>
      isViewingEchoConversationChannel(channelId, activeChannelId.value, {
        echoDmPeerByChannelId: echoDmPeerByChannelId.value,
        groupDMs: groupDMs.value,
      }),
    isInDmUiContext: () => isDmUiContext.value,
    openConversationChannel: (channelId: string, authorId: string) => {
      const cid = channelId.trim();
      if (!cid) return;
      const guildCtx = findChannelContextById(cid);
      const dmSummary = dmAttentionByChannelId.value[cid];
      const fromDmAttention = !!dmSummary && !guildCtx?.channel;
      const isDmTarget = isKnownDmChannelId(cid) || fromDmAttention;
      if (!isDmTarget) return;
      /**
       * `deriveMainSurface` only shows DM chat when `echoDmThreadIds` contains snowflake
       * thread ids. Toasts can open a channel already known via peer map / group map but
       * not yet registered here — without this, the rail shows `dmMessagesIdle` and history
       * never surfaces in the main pane.
       */
      if (!echoDmThreadIds.value.has(cid)) {
        const next = new Set(echoDmThreadIds.value);
        next.add(cid);
        echoDmThreadIds.value = next;
      }
      handleActiveChannelChangeNavigation(cid);
      const mappedPeerUserId = (
        echoDmPeerByChannelId.value.get(cid) ?? ''
      ).trim();
      const canUseAuthorAsDmPeer =
        !groupDMs.value[cid] &&
        !cid.startsWith('dm-group-') &&
        !!authorId.trim() &&
        authorId.trim() !== (currentUser.value?.id ?? '');
      const peerUserId = (
        dmSummary?.peerUserId ??
        mappedPeerUserId ??
        (canUseAuthorAsDmPeer ? authorId : '')
      ).trim();
      if (peerUserId) {
        selectedDMUserId.value = peerUserId;
        if (!echoDmPeerByChannelId.value.has(cid)) {
          const next = new Map(echoDmPeerByChannelId.value);
          next.set(cid, peerUserId);
          echoDmPeerByChannelId.value = next;
        }
        // Explicitly opening a conversation from a toast must reveal its inbox
        // row even if the peer was previously hidden — the user is clearly
        // requesting to see this conversation.
        hiddenDmInboxStore.unhideUser(peerUserId);
      } else {
        // Group DM (no single peer): unhide by channel id so the row appears.
        hiddenDmInboxStore.unhideGroup(cid);
      }
      // Same as `navigateToDmForAnswerRef`: changing only `activeChannelId` does not
      // move the rail off servers — the channel tree would stay visible beside DM chat.
      queueMicrotask(() => {
        selectDMTab();
      });
      void markEchoChannelAsRead(cid, { silent: true });
    },
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

  type EchoMarkReadPlanResult = {
    status: 'ok' | 'empty' | 'failed' | 'unauthenticated';
  };

  function buildServerMarkReadPlanForId(
    serverId: string,
  ): EchoServerMarkReadPlan {
    const sid = serverId.trim();
    return buildEchoServerMarkReadPlan({
      serverId: sid,
      channelAttentionByChannelId: channelAttentionByChannelId.value,
      readStateByChannelId: readStateByChannelId.value,
      latestMessageIdByChannelId: buildLatestMessageIdByChannelIdForServer({
        serverId: sid,
        categoriesByServer: workspace.categoriesByServer.value,
        messagesByChannelId: workspace.messages.value,
      }),
    });
  }

  async function executeEchoMarkReadPlan(
    plan: EchoServerMarkReadPlan,
    opts?: { applyOptimistic?: 'server' | 'dm'; refreshAttention?: boolean },
  ): Promise<EchoMarkReadPlanResult> {
    if (!authSession.isAuthenticated) return { status: 'unauthenticated' };
    if (
      plan.targets.length === 0 &&
      plan.channelIdsMissingLatestUnread.length === 0
    ) {
      return { status: 'empty' };
    }
    const token = authSession.accessToken?.trim() ?? '';
    if (!token) return { status: 'unauthenticated' };

    if (opts?.applyOptimistic) {
      for (const target of plan.targets) {
        echoAttention.applyServerChannelMarkRead(
          target.channelId,
          target.lastReadMessageId,
        );
      }
    }

    let failed = 0;
    for (const target of plan.targets) {
      try {
        await putEchoChannelReadState(
          token,
          target.channelId,
          target.lastReadMessageId,
        );
      } catch {
        failed += 1;
      }
    }

    if (opts?.refreshAttention !== false && failed === 0) {
      try {
        echoAttention.replaceSnapshot(await fetchEchoAttentionSummary(token));
      } catch {
        /* keep optimistic */
      }
    }

    return failed > 0 ? { status: 'failed' } : { status: 'ok' };
  }

  async function markServerAsReadForRail(serverId: string): Promise<void> {
    const result = await executeEchoMarkReadPlan(
      buildServerMarkReadPlanForId(serverId),
      { applyOptimistic: 'server' },
    );
    if (result.status === 'unauthenticated') {
      dispatchAppToast('Sign in to mark servers as read.', 'info');
      return;
    }
    if (result.status === 'empty') {
      dispatchAppToast('No unread channels in this server.', 'info');
      return;
    }
    if (result.status === 'failed') {
      dispatchAppToast('Could not mark all channels as read.', 'warning');
      return;
    }
    dispatchAppToast('Marked server as read.', 'info');
  }

  async function handleServerRailMarkAllRead(): Promise<void> {
    if (!authSession.isAuthenticated) {
      dispatchAppToast('Sign in to mark servers as read.', 'info');
      return;
    }
    const serverIds = [
      ...new Set(
        serverStore.servers
          .map((s) => s.id.trim())
          .filter((id) => id && id !== 'echo'),
      ),
    ];
    let anyTargets = false;
    let failed = 0;
    for (const sid of serverIds) {
      const plan = buildServerMarkReadPlanForId(sid);
      if (
        plan.targets.length > 0 ||
        plan.channelIdsMissingLatestUnread.length > 0
      ) {
        anyTargets = true;
      }
      const result = await executeEchoMarkReadPlan(plan, {
        applyOptimistic: 'server',
        refreshAttention: false,
      });
      if (result.status === 'failed') failed += 1;
    }
    const token = authSession.accessToken?.trim() ?? '';
    if (failed === 0 && token) {
      try {
        echoAttention.replaceSnapshot(await fetchEchoAttentionSummary(token));
      } catch {
        /* keep optimistic */
      }
    }
    if (!anyTargets) {
      dispatchAppToast('No unread channels.', 'info');
    } else if (failed > 0) {
      dispatchAppToast('Could not mark all servers as read.', 'warning');
    } else {
      dispatchAppToast('Marked all servers as read.', 'info');
    }
  }

  async function handleDmRailMarkAllRead(): Promise<void> {
    if (!authSession.isAuthenticated) {
      dispatchAppToast('Sign in to mark DMs as read.', 'info');
      return;
    }
    const msgsRoot = workspace.messages.value;
    const latestMessageIdByChannelId: Record<string, string> = {};
    for (const row of Object.values(channelAttentionByChannelId.value)) {
      if (row.kind !== 'dm') continue;
      const cid = row.channelId.trim();
      if (!cid || latestMessageIdByChannelId[cid]) continue;
      const msgs = msgsRoot[cid] ?? [];
      const last =
        msgs.length > 0 ? String(msgs[msgs.length - 1]?.id ?? '').trim() : '';
      if (last) latestMessageIdByChannelId[cid] = last;
    }
    const plan = buildEchoDmMarkReadPlan({
      channelAttentionByChannelId: channelAttentionByChannelId.value,
      readStateByChannelId: readStateByChannelId.value,
      latestMessageIdByChannelId,
    });
    const result = await executeEchoMarkReadPlan(plan, {
      applyOptimistic: 'dm',
    });
    if (result.status === 'empty') {
      dispatchAppToast('No unread DMs.', 'info');
      return;
    }
    if (result.status === 'failed') {
      dispatchAppToast('Could not mark all DMs as read.', 'warning');
      return;
    }
    dispatchAppToast('Marked all DMs as read.', 'info');
  }

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

  async function markEchoChannelAsRead(
    channelId: string,
    opts?: { emptyMessage?: string; successMessage?: string; silent?: boolean },
  ): Promise<void> {
    const cid = channelId.trim();
    if (!cid) {
      if (!opts?.silent) {
        dispatchAppToast(opts?.emptyMessage ?? 'Nothing to mark read.', 'info');
      }
      return;
    }
    if (!authSession.isAuthenticated) {
      if (!opts?.silent) {
        dispatchAppToast('Sign in to mark channels as read.', 'info');
      }
      return;
    }
    if (!isEchoGraphId(cid)) {
      if (!opts?.silent) {
        dispatchAppToast(
          'Mark as read only works in Echo channels and DMs.',
          'info',
        );
      }
      return;
    }
    const summary = echoAttention.getChannelAttention(cid);
    const latestFromAttention = summary?.latestUnreadMessageId?.trim() ?? '';
    const msgs = workspace.messages.value[cid] ?? [];
    const lastMsgId =
      msgs.length > 0 ? String(msgs[msgs.length - 1]?.id ?? '').trim() : '';
    const targetId = latestFromAttention || lastMsgId;
    if (!targetId) {
      if (!opts?.silent) {
        dispatchAppToast(opts?.emptyMessage ?? 'Nothing to mark read.', 'info');
      }
      return;
    }
    const currentCursor =
      readStateByChannelId.value[cid] ?? summary?.lastReadMessageId ?? null;
    const lr = String(currentCursor ?? '').trim();
    if (lr && compareEchoTimelineIds(lr, targetId) >= 0) {
      if (!opts?.silent) {
        dispatchAppToast('Channel is already up to date.', 'info');
      }
      return;
    }
    echoAttention.applyServerChannelMarkRead(cid, targetId);
    const token = authSession.accessToken?.trim() ?? '';
    try {
      const snapshot = await putEchoChannelReadState(token, cid, targetId);
      echoAttention.replaceSnapshot(snapshot);
      if (!opts?.silent) {
        dispatchAppToast(
          opts?.successMessage ?? 'Marked channel as read.',
          'info',
        );
      }
    } catch (e) {
      reportPrimaryFlowFailure(
        'mark_active_channel_read_failed',
        e,
        undefined,
        {
          showBanner: false,
        },
      );
      if (!opts?.silent) {
        dispatchAppToast('Could not mark channel as read.', 'warning');
      }
    }
  }

  async function markActiveChannelAsRead(): Promise<void> {
    const raw = activeChannelId.value?.trim() ?? '';
    const resolved = resolveEchoDmWireChannelId(
      raw,
      echoDmPeerByChannelId.value,
    );
    await markEchoChannelAsRead(resolved);
  }

  async function handleDmMarkRead(payload: DmMarkReadPayload): Promise<void> {
    const channelId =
      payload.kind === 'group'
        ? payload.channelId.trim()
        : (
            echoDmChannelIdForPeerUser(
              payload.userId,
              echoDmPeerByChannelId.value,
            ) ?? ''
          ).trim();
    await markEchoChannelAsRead(channelId, {
      emptyMessage: 'Nothing unread in this DM.',
      successMessage: 'Marked DM as read.',
    });
  }

  async function handleChannelMarkRead(channelId: string): Promise<void> {
    await markEchoChannelAsRead(channelId.trim(), {
      emptyMessage: 'Nothing unread in this channel.',
      successMessage: 'Marked channel as read.',
    });
  }

  const refreshRoleData = createVoidingInvoker(() =>
    roleUi.refreshEchoRoleData(),
  );
  const canDeleteCurrentServerComputed = useCanDeleteCurrentEchoServerComputed({
    selectedServer: selectedServerEcho,
    currentUserId: currentUserIdForSocket,
  });
  const {
    openMemberProfile,
    activeMemberNote,
    expandedProfileNote,
    expandedProfileLoading,
    updateProfileNote,
    openSelfProfile,
    openExpandedProfileFromMemberPopout,
    openExpandedProfileFromSelfPopout,
    openExpandedProfilePanelForUserId,
    openExtendedProfileModalForUserId,
    expandDmProfileToFullModal,
    handleExpandedProfileOpenProfile,
    handleExpandedProfileOpenDM,
    isExpandedProfileFriend,
    handleUpdateCustomStatus: _handleUpdateCustomStatus,
    handleProfileBlockUser,
    handleProfileUnblockUser,
    handleProfileReportUser,
    isExpandedProfileTargetBlocked: isExpandedProfileTargetBlockedComputed,
    isMemberPopoutTargetBlocked: isMemberPopoutTargetBlockedComputed,
    handleChangeMemberNicknameFromMemberList,
    isEchoUserBlocked: _isEchoUserBlockedFromSafety,
    isMemberPopoutFriend,
    isMemberPopoutCanSendFriendRequest,
    isExpandedProfileOutgoingRequest,
    handleExpandedProfileCancelOutgoingFriendRequest,
    handleExpandedProfileAcceptIncomingFriendRequest,
    handleExpandedProfileDeclineIncomingFriendRequest,
    memberListUsers,
    serverSettingsMemberUsers,
    usersForChannelPanel,
    handleExpandedProfileRemoveFriend,
    onExpandedProfileModalUpdate,
  } = useAppLayoutProfilesDomain({
    workspace: {
      ...workspace,
      refreshEchoSocialFromApi,
      acceptFriendRequest,
      declineFriendRequest,
      cancelFriendRequest,
    },
    authSession,
    serverStore,
    currentUser,
    activeChannel: effectiveActiveChannel,
    selectedServerEcho,
    selectedServerView,
    customStatus,
    echoBlockedUserIds,
    isMemberPopoutOpen,
    isSelfProfilePopoutOpen,
    isExpandedProfileModalOpen,
    isExpandedProfileSidePanel,
    isGroupOverviewOpen,
    activeMemberProfile,
    expandedProfile,
    expandedProfileTargetUserId,
    profileNotes,
    memberPopoutAnchor,
    selfProfileAnchor,
    selfProfile,
    isInDMChat,
    leaveDmUiIfViewingUser,
    canChangeMemberNicknameInServer,
    hydrateEchoFromApi,
    refreshEchoRoleData: refreshRoleData,
    workspaceMembersByServer,
    presenceByUserId,
    presenceMobileByUserId,
  });

  useAppLayoutDmProfileBridge({
    dmPartnerUser,
    isInDMChat,
    isInDmThreadOrIdleMainSurface,
    isExpandedProfileSidePanel,
    isExpandedProfileModalOpen,
    expandedProfile,
    expandedProfileTargetUserId,
    isGroupOverviewOpen,
    isGroupDM: isGroupDMComputed,
    openExpandedProfilePanelForUserId,
  });

  const userSettingsModalCallbacks = useAppLayoutUserSettingsModalCallbacks({
    isSettingsModalOpen,
    settingsModalInitialSection,
    settingsModalActiveSection,
  });
  const memberPopoutChromeCallbacks = useAppLayoutMemberPopoutChromeCallbacks({
    isMemberPopoutOpen,
    memberPopoutAnchor,
    memberPopoutOpenRolesPanel,
  });
  const openMemberProfileForContext = createOpenMemberProfileWithRolesPref({
    memberPopoutOpenRolesPanel,
    openMemberProfile,
  });
  const isMemberSurfaceSwitchLoading = useAppLayoutMemberSurfaceSwitchLoading({
    isServerRailFastSwitchPending,
    memberListUsers,
  });

  const usersForMentionAutocomplete = computed(() => {
    const cid = activeChannelId.value?.trim() ?? '';
    const ms = mainSurface.value.type;

    const inDmThread =
      ms === 'dmThread' ||
      (!!cid && isPersistedEchoDmThread(cid)) ||
      (!!cid && isDmThreadId(cid));

    if (inDmThread) {
      const idSet = new Set<string>();
      const me = authSession.backendUser?.id?.trim();
      if (me) idSet.add(me);

      if (isGroupDMComputed.value) {
        const mids = activeGroupDM.value?.memberIds;
        if (Array.isArray(mids)) {
          for (const raw of mids) {
            const id = raw?.trim();
            if (id) idSet.add(id);
          }
        }
      } else {
        const peer = selectedDMUserId.value?.trim();
        if (peer) idSet.add(peer);
        const partner = dmPartnerUser.value?.id?.trim();
        if (partner) idSet.add(partner);
        if (cid) {
          const mapped = echoDmPeerByChannelId.value.get(cid)?.trim();
          if (mapped) idSet.add(mapped);
          if (cid.startsWith('dm-') && !cid.startsWith('dm-group-')) {
            const legacy = cid.slice('dm-'.length).trim();
            if (legacy) idSet.add(legacy);
          }
        }
      }

      const roster = workspace.users.value;
      const byId = new Map<string, (typeof roster)[number]>(
        roster.map((u) => [u.id, u]),
      );
      const out: (typeof roster)[number][] = [];
      for (const id of idSet) {
        const row = byId.get(id);
        if (row) out.push(row);
      }
      return out;
    }

    if (
      ms === 'serverText' ||
      ms === 'serverVoice' ||
      ms === 'serverForum' ||
      ms === 'serverEmptyOnboarding'
    ) {
      const sid = serverStore.selectedServer?.id;
      const guildRolePending =
        !!sid &&
        sid !== 'echo' &&
        isEchoGraphId(sid) &&
        isEchoRoleBootstrapLoading.value;
      if (guildRolePending) return [];
      return memberListUsers.value;
    }

    return [];
  });

  const socketSendMessage = sendMessageViaSocket;
  const sendMessage = sendMessageViaSocket;

  const workspaceReady = useAppLayoutWorkspaceReadyComputed(workspace.loading);

  const isGuest = isGuestComputed;

  const {
    forwardModalOpen,
    forwardPickerDestinations,
    forwardModalSourceSummary,
    openForwardMessagePicker,
    closeForwardMessagePicker,
    submitForwardedMessage,
  } = useAppLayoutForwardMessage({
    activeChannelId,
    isLiveSocketReady,
    echoDmPeerByChannelId,
    echoDmThreadIds,
    echoDmLastActivityIdByChannelId,
    groupDMs,
    users: workspace.users,
    servers: workspace.servers,
    categoriesByServer: workspace.categoriesByServer,
    sendMessage,
  });

  const { handleMemberPopoutQuickDm, onGuestAccountUpgraded } =
    useAppLayoutGuestQuickDm({
      isGuest,
      isMemberPopoutOpen,
      isSettingsModalOpen,
      settingsModalInitialSection,
      settingsModalActiveSection,
      selectDMTab,
      selectDmUser,
      sendMessage,
      hydrateAfterGuestAccountUpgrade,
      isGuestAfterUpgrade: () => authSession.backendUser?.isGuest === true,
    });

  const handleExpandedProfileOpenServer = createHandleExpandedProfileOpenServer(
    {
      openServerSurface: (serverId) => openServerSurface(serverId),
      isExpandedProfileModalOpen,
      isExpandedProfileSidePanel,
      isGroupOverviewOpen,
      expandedProfile,
      expandedProfileTargetUserId,
    },
  );

  async function ensurePersistedDirectDmChannelIdForInvite(
    peerUserId: string,
  ): Promise<string> {
    const uid = peerUserId.trim();
    if (!uid) return '';
    for (const [channelId, peerId] of echoDmPeerByChannelId.value) {
      if (peerId === uid && isEchoGraphId(channelId)) return channelId;
    }
    const token = authSession.accessToken?.trim() ?? '';
    if (!token) return '';
    const channelId = await openEchoDirectDmChannel(token, uid);
    if (!channelId?.trim()) return '';
    const cid = channelId.trim();
    // Register the channel→peer mapping only. The server's `/dm/open` insert seeded
    // `echo_dm_activity.last_activity_at = NOW()`, and the next `/dm/threads` refresh
    // will deliver the authoritative `lastActivityAt`.
    mergeEchoDmThreadFromRealtime({
      channelId: cid,
      kind: 'direct',
      peerUserId: uid,
    });
    return cid;
  }

  const {
    isJoinServerConfirmModalOpen: isJoinServerConfirmModalOpenRef,
    joinServerConfirmPreview: joinServerConfirmPreviewRef,
    joinServerConfirmBusy: joinServerConfirmBusyRef,
    requestJoinServerConfirm,
    onJoinServerConfirmModalUpdate,
    confirmJoinServerFromModal,
    finishJoinServerConfirmModal,
  } = useJoinServerConfirmModal();

  const {
    isServerApplicationModalOpen: isServerApplicationModalOpenRef,
    serverApplicationPayload: serverApplicationPayloadRef,
    serverApplicationBusy: serverApplicationBusyRef,
    requestServerApplicationModal,
    onServerApplicationModalUpdate,
    confirmSubmittedFromModal: confirmServerApplicationSubmittedFromModal,
    finishServerApplicationModal,
  } = useServerApplicationModal();

  const addServerFlow = useAddServerFlow({
    serverStore,
    authSession,
    workspace,
    currentUser,
    activeChannelId,
    activeRailTab,
    dmActiveTab,
    isAddServerModalOpen,
    addServerInitialView,
    isMoreServersPanelOpen,
    isMoreServersPinned,
    newlyCreatedServerId,
    getFirstTextChannelId,
    hydrateWorkspace: hydrateEchoFromApi,
    sendMessage,
    inviteLinkForServer,
    selectedServer: selectedServerEcho,
    isExploreView,
    onPromptSignIn: createPromptSignInHandler(openAuthModal),
    isPersistedEchoDmThread,
    ensurePersistedDirectDmChannelId: ensurePersistedDirectDmChannelIdForInvite,
    requestJoinServerConfirm,
    finishJoinServerConfirmModal,
    requestServerApplicationModal,
    finishServerApplicationModal,
    echoDmPeerByChannelId,
    echoDmLastActivityAtMsByChannelId,
  });
  const {
    addServerJoinError,
    addServerCreateBusy,
    addServerJoinBusy,
    addServerJoinInvitePrefill,
    exploreDirectoryJoinBusy,
    openAddServerModal,
    joinEchoServerWithInviteRaw,
    handleJoinWithInviteLink,
    handleCreateServer,
    handleJoinDiscoverableServer,
    handleInviteFriend,
    inviteableFriends,
  } = addServerFlow;

  const { votePoll: votePollMock } = usePollVotes(workspace.messages);

  const reactionFavorites = useReactionFavorites();

  const resolveEchoDmPeerForMessageActions = createResolveEchoDmPeerFromMap(
    () => echoDmPeerByChannelId.value,
  );

  const messageActions = useAppLayoutMessageActions({
    activeChannelId,
    currentUser: currentUserComputed,
    users: workspace.users,
    messages: workspace.messages,
    votePoll: votePollMock,
    submitEchoPollVote: submitPollVoteViaSocket,
    submitEchoMessageEdit: submitMessageEditViaSocket,
    submitEchoMessageDelete: submitMessageDeleteViaSocket,
    uiTransactions,
    isLiveSocketReady,
    toggleReaction: toggleReactionOnMessages,
    recordReaction: reactionFavorites.recordReaction,
    clearSearch,
    onSelectServerForChannel: selectServerViaStore,
    onOpenServerChannel: (serverId, channelId) =>
      openServerSurface(serverId, channelId),
    onSelectDmUser: selectDmUser,
    onSelectGroupDmChannel: (channelId) =>
      selectGroupDmForIncomingRail.value?.(channelId),
    resolveGuildServerIdForChannel: (channelId) =>
      resolveEchoServerIdContainingChannel(
        channelId,
        workspace.categoriesByServer.value,
      ),
    resolveEchoDmPeer: resolveEchoDmPeerForMessageActions,
    prefetchEchoMessage: echoChannelHistory?.prefetchUntilMessageVisible,
    onAfterDeleteMessage: undefined,
    getActiveChatMessageNav: () => chatMessageNavBridge.getActiveApi(),
  });

  wireMessageGoToMessage(messageActions.handleGoToMessage);

  /**
   * All @mention / @everyone / @active notifications for the current user,
   * derived from the in-memory message cache. Limited to 120 rows to keep
   * rendering snappy; older mentions appear once the user visits the channel.
   */
  const dmMentionNotifications = computed(() =>
    collectDmMentionNotifications({
      messagesByChannelId: workspace.messages.value as Record<
        string,
        readonly RawMessage[] | undefined
      >,
      selfUserId: currentUserIdForSocket.value ?? '',
      resolveChannelLabel: (channelId: string) => {
        const ch = allChannels.value.find((c) => c.id === channelId);
        return ch?.name?.trim() || channelId;
      },
      resolveUserName: (userId: string) => {
        const u = workspace.users.value.find((x) => x.id === userId);
        return u?.name?.trim() || peerDisplayNamePlaceholder(userId);
      },
      maxItems: 120,
    }),
  );

  /** Proxies the attention store's read-state map for the notifications panel. */
  const dmNotificationReadStateByChannelId = computed(
    () => readStateByChannelId.value,
  );

  const mentionNotificationCategoriesByServer = computed(
    () => workspace.categoriesByServer.value,
  );

  /**
   * Controlled filter state for the notifications panel.
   * Persisted in the parent (AppLayout) across tab switches via v-model emits;
   * the panel resets these on first mount if the parent does not provide them.
   */
  const dmNotificationsReadPreset = ref<NotificationReadPreset>('all');
  const dmNotificationsSourceKey = ref('all');

  const mentionNotificationServers = computed(() =>
    serverRowsRef.value.map((s) => ({
      id: s.id,
      name: String(s.name ?? '').trim() || 'Server',
      imageUrl: String(s.imageUrl ?? '').trim() || undefined,
    })),
  );

  /** Navigates to the channel containing the notification, then scrolls to the specific message. */
  function onOpenMentionNotification(row: DmMentionNotificationRow) {
    messageActions.handleGoToChannel(row.channelId);
    void nextTick(() => {
      messageActions.handleGoToMessage(row.channelId, row.messageId);
    });
  }

  async function onMarkMentionNotificationRead(
    row: DmMentionNotificationRow,
  ): Promise<void> {
    await markEchoChannelAsRead(row.channelId, {
      emptyMessage: 'Nothing unread in this thread.',
      successMessage: 'Marked thread as read.',
    });
  }

  const afkPresenceEnabled = computed(
    () =>
      authSession.isAuthenticated &&
      !echoSyncCapabilities.isMockDataMode &&
      !!authSession.backendUser?.id,
  );
  const { noteUserPresenceChoice } = useEchoAfkPresence({
    enabled: afkPresenceEnabled,
    /** Match shell avatar: Echo presence map wins over `backendUser.status` (avoids losing AFK recovery when auth PATCH returns a stale session status). */
    getStatus: () => {
      const uid = authSession.backendUser?.id?.trim();
      if (!uid) return undefined;
      return selectSelfPresence({
        userId: uid,
        authoritativeStatusesByUserId: presenceByUserId.value,
        sessionStatus: authSession.backendUser?.status,
        mobileSurface: presenceMobileByUserId.value[uid] === true,
      }).status;
    },
    setStatus: messageActions.updateCurrentUserStatus,
  });

  const updateStatusCast = (status: string) => {
    const canonical = normalizeCanonicalPresenceStatus(status);
    if (!canonical) return;
    noteUserPresenceChoice(canonical);
    messageActions.updateCurrentUserStatus(canonical);
  };

  const dmInboxEntriesForPanelUnfiltered = useAppLayoutDmPanelInboxComputed({
    activeRailTab,
    isDMPanelOpen,
    selfId: currentUserIdForSocket,
    users: workspace.users,
    groupDMs,
    messages: workspace.messages,
    echoPeerByChannelId: echoDmPeerByChannelId,
    echoDmLastActivityAtMsByChannelId,
    selectedDMUserId,
    activeChannelId,
    dmUnreadByChannelIdForPanel,
    fallbackRankMsByKey: dmInboxOrderCacheStore.initialRankMsByKey,
  });
  const dmInboxEntriesForPanel = computed(() => {
    const selfUid = currentUserIdForSocket.value?.trim() ?? '';
    const sorted = sortFavoriteDmInboxFirst(
      filterVisibleDmInboxEntries(dmInboxEntriesForPanelUnfiltered.value, {
        isUserHidden: hiddenDmInboxStore.isUserHidden,
        isGroupHidden: hiddenDmInboxStore.isGroupHidden,
        selfUserId: selfUid,
      }),
      favoriteDmInboxStore,
    );
    return pinSelfDmInboxEntryFirst(sorted, selfUid);
  });

  let ensureEchoSelfDmThreadInFlight = false;
  watch(
    [
      () => workspace.socialGraphStatus.value,
      echoDmPeerByChannelId,
      () => authSession.backendUser?.id ?? '',
      () => authSession.backendUser?.isGuest === true,
      () => authSession.accessToken ?? '',
    ],
    () => {
      if (workspace.socialGraphStatus.value !== 'ready') return;
      if (echoSyncCapabilities.isMockDataMode) return;
      const selfId = authSession.backendUser?.id?.trim();
      if (!selfId || authSession.backendUser?.isGuest) return;
      const token = authSession.accessToken?.trim();
      if (!token) return;
      for (const p of echoDmPeerByChannelId.value.values()) {
        if (p === selfId) return;
      }
      if (ensureEchoSelfDmThreadInFlight) return;
      ensureEchoSelfDmThreadInFlight = true;
      void postEchoOpenDm(token, selfId)
        .then((r) => {
          const ch = String(r.channelId ?? '').trim();
          if (ch) {
            mergeEchoDmThread({
              kind: 'direct',
              channelId: ch,
              peerUserId: selfId,
            });
          }
        })
        .catch(() => {
          /* best-effort */
        })
        .finally(() => {
          ensureEchoSelfDmThreadInFlight = false;
        });
    },
    { flush: 'post' },
  );

  function isDmInboxUserFavorite(userId: string) {
    return favoriteDmInboxStore.isUserFavorite(userId);
  }

  function isDmInboxGroupFavorite(channelId: string) {
    return favoriteDmInboxStore.isGroupFavorite(channelId);
  }

  function toggleFavoriteDmInbox(
    payload:
      | { kind: 'user'; userId: string }
      | { kind: 'group'; channelId: string },
  ) {
    if (payload.kind === 'user') {
      favoriteDmInboxStore.toggleUser(payload.userId);
    } else {
      favoriteDmInboxStore.toggleGroup(payload.channelId);
    }
  }
  const dmUsersForDmPanelComputed = useDmInboxUsersForPanelComputed(
    dmInboxEntriesForPanel,
  );

  watch(
    [workspace.messages, echoDmLastActivityAtMsByChannelId],
    () => {
      const selfId = currentUserIdForSocket.value?.trim() ?? '';
      if (!selfId) return;
      hiddenDmInboxStore.syncUnhide({
        selfId,
        messages: workspace.messages.value,
        echoPeerByChannelId: echoDmPeerByChannelId.value,
        echoDmLastActivityIdByChannelId: echoDmLastActivityIdByChannelId.value,
      });
    },
    { deep: true },
  );

  /**
   * Persist real per-entry `lastActivityAt` (ms epoch) keyed by inbox row id so the
   * next session's cold-start render matches this session's last live render exactly.
   * For 1:1 rows the row id is the peer user id, so we look up the channel id via
   * `echoDmPeerByChannelId`; for groups the row id IS the channel id.
   */
  watch(dmInboxEntriesForPanel, (entries) => {
    if (!entries.length) return;
    const ats = echoDmLastActivityAtMsByChannelId.value;
    const peerByCh = echoDmPeerByChannelId.value;
    const channelIdForPeer = new Map<string, string>();
    for (const [ch, peer] of peerByCh) {
      if (!channelIdForPeer.has(peer)) channelIdForPeer.set(peer, ch);
    }
    const payload = entries.map((e) => {
      if (e.kind === 'group') {
        return { id: e.id, rankMs: ats.get(e.id) ?? 0 };
      }
      const ch = channelIdForPeer.get(e.id) ?? '';
      return { id: e.id, rankMs: ch ? (ats.get(ch) ?? 0) : 0 };
    });
    dmInboxOrderCacheStore.saveOrder(payload);
  });

  function hideDmFromInboxUser(peerId: string) {
    const selfId = currentUserIdForSocket.value?.trim() ?? '';
    if (!selfId || peerId === selfId) return;
    const snap = maxIncomingPeerMessageMs(
      peerId,
      selfId,
      workspace.messages.value,
      echoDmPeerByChannelId.value,
    );
    hiddenDmInboxStore.hideUser(peerId, snap);
    if (selectedDMUserId.value === peerId) {
      selectedDMUserId.value = null;
    }
    const echoCh = echoDmChannelIdForPeerUser(
      peerId,
      echoDmPeerByChannelId.value,
    );
    const ac = activeChannelId.value;
    if (ac === `dm-${peerId}` || (echoCh && ac === echoCh)) {
      activeChannelId.value = 'general';
    }
    dispatchAppToast(
      'Removed from your DM list. It will return when they message you again.',
      'info',
    );
  }

  function hideDmFromInboxGroup(channelId: string) {
    const act = echoDmLastActivityIdByChannelId.value.get(channelId) ?? '';
    hiddenDmInboxStore.hideGroup(channelId, act);
    if (activeGroupDM.value?.id === channelId) {
      activeChannelId.value = 'general';
    }
    dispatchAppToast(
      'Removed from your DM list. It will return when there is new activity.',
      'info',
    );
  }
  const groupDMListForPanelComputed = useGroupDmPanelListComputed(groupDMs);

  const { discordBotExportReadyBanner, dismissDiscordBotExportReadyBanner } =
    useAppLayoutDiscordBotPoll({
      isAuthenticated: () => authSession.isAuthenticated,
      isAddServerModalOpen,
    });

  const toggleMemberListBase = createToggleBooleanRef(memberPanelCollapsed);
  function toggleMemberList() {
    if (isCompactShell.value && hasGuildChannelChrome.value) {
      compactPagerPane.value = compactPagerPane.value === 2 ? 1 : 2;
      return;
    }
    const wasCollapsed = memberPanelCollapsed.value;
    toggleMemberListBase();
    if (!memberPanelCollapsed.value && wasCollapsed) {
      markMemberPanelExpandedByUser();
    } else if (memberPanelCollapsed.value && !wasCollapsed) {
      markMemberPanelCollapsedByUser();
    }
  }
  const toggleChannelPanel = createToggleBooleanRef(channelPanelCollapsed);
  const isServerUnread = createIsServerUnread(
    () => serverAttentionByServerId.value,
  );
  const openCreateChannelOnServer = createOpenCreateChannelOnServer({
    openServerSurface: (serverId) => openServerSurface(serverId),
    openCreateChannelModal,
  });
  const canModerateMessageAuthorForSurface =
    createCanModerateMessageAuthorAdapter(canModerateMessageAuthor);

  const beforeOpenGroupDmModal = createBeforeOpenGroupDmModal({
    closePinsDropdown,
    clearSearch,
  });

  const groupDmActions = useAppLayoutGroupDm({
    groupDMs,
    groupDMPreselectedIds,
    groupDMLockedIds,
    isGroupDMModalOpen,
    isGroupDMSettingsOpen,
    groupDmSettingsInitialFocus,
    activeGroupSettingsId,
    activeChannelId,
    selectedDMUserId,
    dmActiveTab,
    selectedMessageRequestId,
    isDMPanelOpen,
    pfpBarExpanded,
    currentUserId: currentUserIdForSocket,
    dmPartnerUserId: dmPartnerUserIdForGroupDm as unknown as Ref<string | null>,
    activeGroupId: activeGroupId as unknown as Ref<string | null>,
    users: workspace.users as unknown as Ref<
      Array<{ id: string; pfp: string }>
    >,
    messages: workspace.messages,
    selectServer: selectServerViaStore,
    isInDMChat: isInDmThreadOrIdleMainSurface as unknown as Ref<boolean>,
    isGroupOverviewOpen,
    isExpandedProfileModalOpen,
    isExpandedProfileSidePanel,
    expandedProfile,
    expandedProfileTargetUserId,
    openGroupDmOnServer: openGroupDmOnServerImpl,
    addMembersToGroupDmOnServer: async ({ channelId, memberUserIds }) => {
      if (!authSession.isAuthenticated) {
        dispatchAppToast('Sign in to add group members.', 'info');
        throw new Error('not_authenticated');
      }
      const token = authSession.accessToken?.trim() ?? '';
      try {
        await postEchoAddGroupDmMembers(token, channelId, { memberUserIds });
        const { threads } = await fetchEchoDmThreads(token);
        mergeEchoDmThreadsFromApi(threads);
      } catch (e) {
        reportPrimaryFlowFailure('group_dm.add_members', e, {
          channelId,
          memberCount: memberUserIds.length,
        });
        dispatchAppToastDetail({
          message: 'Could not add one or more members to the group.',
          severity: 'warning',
        });
        throw e;
      }
    },
    persistGroupDmSettings: async ({ channelId, name, pfp }) => {
      if (!authSession.isAuthenticated) {
        dispatchAppToast('Sign in to update group settings.', 'info');
        throw new Error('not_authenticated');
      }
      const token = authSession.accessToken?.trim() ?? '';
      try {
        await patchEchoGroupDm(token, channelId, { name, pfp });
        const { threads } = await fetchEchoDmThreads(token);
        mergeEchoDmThreadsFromApi(threads);
      } catch (e) {
        reportPrimaryFlowFailure('group_dm.update_settings', e, {
          channelId,
        });
        dispatchAppToastDetail({
          message: 'Could not save group settings.',
          severity: 'warning',
        });
        throw e;
      }
    },
    beforeOpenGroupDmModal,
    isCompactShell,
  });

  function handleSelectGroupDMWithGuestGuard(groupId: string) {
    if (authSession.backendUser?.isGuest === true) {
      openGuestUpgradeModal();
      return;
    }
    groupDmActions.handleSelectGroupDM(groupId);
  }

  selectGroupDmForIncomingRail.value = handleSelectGroupDMWithGuestGuard;

  const groupSettingsMembers = computed(() => {
    const groupId = activeGroupSettingsId.value?.trim();
    const group = groupId ? groupDMs.value[groupId] : null;
    if (!group) return [];
    const usersById = new Map(workspace.users.value.map((u) => [u.id, u]));
    return group.memberIds.map((id) => {
      const u = usersById.get(id);
      return {
        id,
        name: u?.name ?? peerDisplayNamePlaceholder(id),
        pfp: u?.pfp ?? '',
      };
    });
  });
  const groupSettingsId = computed(() => activeGroupSettingsId.value ?? '');

  function onOpenAddMembersToGroupDm() {
    const groupId = activeGroupSettingsId.value?.trim();
    const group = groupId ? groupDMs.value[groupId] : null;
    if (!group) return;
    const withoutSelf = group.memberIds.filter(
      (id) => id !== currentUser.value?.id,
    );
    groupDmActions.openGroupDMModal({
      targetGroupId: groupId,
      preselectedIds: withoutSelf,
      lockedIds: withoutSelf,
    });
  }

  async function handleKickGroupDmMember(payload: {
    groupId: string;
    userId: string;
  }) {
    const gid = payload.groupId?.trim();
    const uid = payload.userId?.trim();
    if (!gid || !uid) return;
    const self = currentUserIdForSocket.value?.trim();
    if (self && uid === self) return;

    if (echoSyncCapabilities.isMockDataMode) {
      const g = groupDMs.value[gid];
      if (!g) return;
      groupDMs.value = {
        ...groupDMs.value,
        [gid]: {
          ...g,
          memberIds: g.memberIds.filter((id) => id !== uid),
        },
      };
      return;
    }

    if (!authSession.isAuthenticated) return;

    try {
      await deleteEchoGroupDmMember(
        authSession.accessToken?.trim() ?? '',
        gid,
        uid,
      );
      const { threads } = await fetchEchoDmThreads(
        authSession.accessToken?.trim() ?? '',
      );
      mergeEchoDmThreadsFromApi(threads);
    } catch (e) {
      reportPrimaryFlowFailure('group_dm.kick_member', e, {
        groupId: gid,
        userId: uid,
      });
      dispatchAppToastDetail({
        message: 'Could not remove member from the group.',
        severity: 'warning',
      });
    }
  }

  async function handleLeaveGroupDm(payload: { groupId: string }) {
    const gid = payload.groupId?.trim();
    if (!gid) return;
    const self = currentUserIdForSocket.value?.trim();

    if (echoSyncCapabilities.isMockDataMode) {
      const g = groupDMs.value[gid];
      if (g && self) {
        const nextMemberIds = g.memberIds.filter((id) => id !== self);
        if (nextMemberIds.length === 0) {
          const next = { ...groupDMs.value };
          delete next[gid];
          groupDMs.value = next;
        } else {
          groupDMs.value = {
            ...groupDMs.value,
            [gid]: { ...g, memberIds: nextMemberIds },
          };
        }
      }
      isGroupDMSettingsOpen.value = false;
      groupDmSettingsInitialFocus.value = null;
      activeGroupSettingsId.value = null;
      isGroupOverviewOpen.value = false;
      if (activeChannelId.value === gid) {
        activeChannelId.value = 'general';
        selectedDMUserId.value = null;
        serverStore.selectServer('echo');
      }
      return;
    }

    if (!authSession.isAuthenticated || !self) {
      dispatchAppToast('Sign in to manage group DMs.', 'info');
      return;
    }

    try {
      await postEchoLeaveGroupDm(authSession.accessToken?.trim() ?? '', gid);
      const { threads } = await fetchEchoDmThreads(
        authSession.accessToken?.trim() ?? '',
      );
      mergeEchoDmThreadsFromApi(threads);
      isGroupDMSettingsOpen.value = false;
      groupDmSettingsInitialFocus.value = null;
      activeGroupSettingsId.value = null;
      isGroupOverviewOpen.value = false;
      if (activeChannelId.value === gid) {
        activeChannelId.value = 'general';
        selectedDMUserId.value = null;
        serverStore.selectServer('echo');
      }
    } catch (e) {
      reportPrimaryFlowFailure('group_dm.leave', e, { groupId: gid });
      dispatchAppToastDetail({
        message: 'Could not leave the group.',
        severity: 'warning',
      });
    }
  }

  navigateToDmForAnswerRef.value = (targetId: string) => {
    const tid = targetId.trim();
    if (!tid) return;
    if (groupDMs.value[tid]) {
      handleSelectGroupDMWithGuestGuard(tid);
      if (authSession.backendUser?.isGuest === true) return;
      selectDMTab();
      return;
    }
    void selectDmUser(tid);
    if (authSession.backendUser?.isGuest === true) return;
    // `onSelectDmUser` does not switch the server rail to DM; without this, the channel
    // tree stays visible ("No channels…") and the members/search column can leak beside DM call UI.
    queueMicrotask(() => {
      selectDMTab();
    });
  };

  const { appActionRegistry, appLayoutActions } = sealWithGroupDmAndNavigation({
    groupDm: {
      ...groupDmActions,
      handleSelectGroupDM: handleSelectGroupDMWithGuestGuard,
    },
    navigation: {
      openServerSettingsFromUrl,
      openDm: selectDmUser,
    },
  });

  const previewCanModerateMembersComputed =
    usePreviewCanModerateMembersComputed({
      previewCanModerateMembers: () => roleUi.previewCanModerateMembers(),
    });

  const profileSlice = useAppLayoutContextProfileSlice({
    openMemberProfile: openMemberProfileForContext,
    activeMemberNote,
    expandedProfileNote,
    updateProfileNote,
    openSelfProfile,
    openExpandedProfileFromMemberPopout,
    openExpandedProfileFromSelfPopout,
    openExpandedProfilePanelForUserId,
    openExtendedProfileModalForUserId,
    expandDmProfileToFullModal,
    handleExpandedProfileOpenProfile,
    handleExpandedProfileOpenDM,
    handleMemberPopoutQuickDm,
    handleExpandedProfileRemoveFriend,
    handleExpandedProfileCancelOutgoingFriendRequest,
    handleProfileBlockUser,
    handleProfileUnblockUser,
    handleProfileReportUser,
    isExpandedProfileTargetBlocked: isExpandedProfileTargetBlockedComputed,
    isExpandedProfileOutgoingRequest,
    isMemberPopoutTargetBlocked: isMemberPopoutTargetBlockedComputed,
    isExpandedProfileFriend,
    isMemberPopoutFriend,
    isMemberPopoutCanSendFriendRequest,
    memberListUsers,
    serverSettingsMemberUsers,
    usersForChannelPanel,
    usersForMentionAutocomplete,
    onExpandedProfileModalUpdate,
    expandedProfile,
    selectDmUser,
    selectDMTab,
    sendFriendRequest,
    memberPopoutOpenRolesPanel,
    isSystemSettingsOpen,
    isUserSettingsOpen: isSettingsModalOpen,
    memberListCollapsed: memberPanelCollapsed,
    memberListWidth: memberPanelWidth,
    activeMemberProfile,
    membersForMemberList: memberListUsers,
    toggleMemberList,
  });

  const voiceScreenShareHandlers: ReturnType<
    typeof useAppLayoutVoiceScreenShareHandlers
  > = useAppLayoutVoiceScreenShareHandlers({
    vcVideo,
    vcScreenshare,
    isScreenSharePickerOpen,
    isDesktopStreamingControlOpen,
    desktopStreamingControlMode,
    desktopStreamingPreferences,
    setDesktopStreamingPreferences,
    startVcScreenShare,
    startDesktopScreenShare,
    startDesktopCameraStream,
    onDesktopCameraStarted,
    stopVcScreenShare,
  });

  const voiceSlice = useAppLayoutContextVoiceSlice({
    getVcActivityPresenceForUser,
    getVcChannelActivityPresenceForChannel,
    effectiveVcActivityKingUserId,
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
    vcRemoteParticipants,
    vcMirrorCamera,
    switchVcCamera,
    setVcVideoQuality,
    speakingMap,
    localSpeaking,
    localAudioLevel,
    switchMicDevice,
    switchSpeakerDevice,
    setLkOutputVolume,
    reapplyVoiceProcessing,
    setMicTestListenDeafen,
    currentVoiceChannelId,
    currentVoiceChannelName,
    dmCallDeafened,
    dmCallFullscreen,
    dmCallMuted,
    dmCallQuarterView,
    dmCallMatchesActiveChannel,
    activeDmThreadCallUi,
    dmCallVideo,
    dmCallScreenshare,
    dmCallCallViewParticipants,
    dmCallWithUserId,
    dmCallRinging,
    dmCallAwaitingAccept,
    dmCallIncoming,
    dmCallRingRemoteVanishing,
    dmCallGlassPeer,
    dmCallVoiceStripThreadId,
    dmCallVoiceStripTitle,
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
    onGuildChannelVcVideo,
    onGuildChannelVcScreenshare,
    onDmCallVcMuted,
    onDmCallVcDeafened,
    onDmCallVcVideo,
    onDmCallVcScreenshare,
    applyDmCallDeafened,
    toggleDmCallMuted,
    handleJoinVoice: handleJoinVoiceNavigation,
    handleJoinVoiceIfAllowed: handleJoinVoiceNavigation,
    handleLeaveVoice: handleLeaveVoiceNavigation,
    handleChannelVoicePanelLeave,
    onJoinVoice,
    onJoinVoiceUi: onJoinVoice,
    onLeaveVoice,
    onLeaveVoiceUi: onLeaveVoice,
    onVcChatButtonClick: onVcChatButtonClickNavigation,
    isViewingVoiceChannel,
    updateVcVideoIfAllowed: voiceScreenShareHandlers.updateVcVideoIfAllowed,
    handleScreenSharePickerConfirm:
      voiceScreenShareHandlers.handleScreenSharePickerConfirm,
    openDesktopStreamingControl:
      voiceScreenShareHandlers.openDesktopStreamingControl,
    closeDesktopStreamingControl:
      voiceScreenShareHandlers.closeDesktopStreamingControl,
    handleDesktopStreamingControlConfirm:
      voiceScreenShareHandlers.handleDesktopStreamingControlConfirm,
    handleToggleScreenshare: voiceScreenShareHandlers.handleToggleScreenshare,
    handleStopScreenShare: voiceScreenShareHandlers.handleStopScreenShare,
    isScreenSharePickerOpen,
    isDesktopStreamingControlOpen,
    desktopStreamingControlMode,
    desktopStreamingPreferences,
    fullscreenStreamParticipantId,
    vcActivityUi,
    openVcActivityPicker: openVcActivityPickerOnVoice,
    openVcActivityYoutubeBrowse: openVcActivityYoutubeBrowseOnVoice,
    openVcActivityWordle: openVcActivityWordleOnVoice,
    openVcActivityHangman: openVcActivityHangmanOnVoice,
    openVcActivitySkriggles: openVcActivitySkrigglesOnVoice,
    openVcActivityTicTacToe: openVcActivityTicTacToeOnVoice,
    openVcActivityOpenGuessr: openVcActivityOpenGuessrOnVoice,
    openVcActivitySkribblIo: openVcActivitySkribblIoOnVoice,
    openVcActivityGarticPhone: openVcActivityGarticPhoneOnVoice,
    openVcActivityKrunker: openVcActivityKrunkerOnVoice,
    openVcActivityCodenames: openVcActivityCodenamesOnVoice,
    openVcActivityRichup: openVcActivityRichupOnVoice,
    openVcActivityGooberDash: openVcActivityGooberDashOnVoice,
    openVcActivitySmashKarts: openVcActivitySmashKartsOnVoice,
    openVcActivityClusterRush: openVcActivityClusterRushOnVoice,
    setVcActivityYoutubeVideo,
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
    getLocalScreenTrack: getVcLocalScreenTrack,
    getLocalCameraTrack: getVcLocalCameraTrack,
    getRemoteParticipantVolume,
    setRemoteParticipantVolume,
    vcDeafened,
    applyVcDeafened,
    vcMuted,
    vcScreenshare,
    vcVideo,
    isVcActive,
    isVcConnected,
    isVcConnecting,
    isVcDisconnecting,
    joinVoiceChannel,
    leaveVoiceChannel,
  });

  const messagingSlice = useAppLayoutContextMessagingSlice({
    handleGoToChannel: messageActions.handleGoToChannel,
    handleGoToMessage: messageActions.handleGoToMessage,
    handlePollVote: messageActions.handlePollVote,
    handleReact: messageActions.handleReact,
    pinMessage,
    toggleReaction: toggleReactionOnMessages,
    votePoll: messageActions.handlePollVote,
    recordReaction: reactionFavorites.recordReaction,
    removeReactionFavorite: reactionFavorites.removeReactionFavorite,
    topReactions: reactionFavorites.topReactions,
    goToPinnedMessage,
    goToSearchPage,
    searchError,
    searchLoading,
    searchResultMessages,
    searchResultPage,
    searchScopeHint,
    searchText,
    paginatedSearchResults,
    totalPages,
    onSearchInput,
    clearSearch,
    forwardModalOpen,
    forwardPickerDestinations,
    forwardModalSourceSummary,
    openForwardMessagePicker,
    closeForwardMessagePicker,
    submitForwardedMessage,
    socketSendMessage,
    sendMessage,
    searchActiveTab,
    searchFilter,
    searchIsLoading,
    searchResults,
    searchStatus,
  });

  const serverChromeCallbacks = useAppLayoutServerChromeCallbacks({
    isServerSettingsModalOpen,
    serverSettingsModalInitialSection,
    serverSettingsModalActiveSection,
    isInviteModalOpen,
    clearInviteVoiceContext: () => {
      inviteModalVoiceChannelId.value = null;
      inviteModalVoiceChannelName.value = null;
    },
    canOpenInviteForServer,
  });

  const serverRailSlice = useAppLayoutContextServerRailSlice({
    handleServerRailInvite,
    handleServerRailMarkRead,
    handleServerRailMarkAllRead,
    handleDmRailMarkAllRead,
    handleChannelMarkRead,
    handleServerRailLeave,
    handleServerRailNotificationSettings,
    handleServerRailSettings,
    openServerFromMore,
    openServerSettingsFromUrl,
    selectedServerId: useComputedRefAlias(selectedServerIdRef),
    servers: useComputedRefAlias(serverRowsRef),
    ...serverChromeCallbacks,
    onLeaveServerModalUpdate,
    confirmLeaveServerFromModal,
    isLeaveServerModalOpen: isLeaveServerModalOpenRef,
    leaveServerModalServerName: leaveServerModalServerNameRef,
    leaveServerModalVariant: leaveServerModalVariantRef,
    openServerNotificationSettings,
    handleServerNotificationSave,
    serverNotificationLevelsMap,
    serverPingKindByServerId,
    serverPingBubbleByServerId,
    serverPingChannelDotsByServerId,
    serverUnreadActivityDotByServerId,
    channelMissedActivityByChannelId,
    currentServerNotificationLevel,
    isServerNotificationSettingsOpen,
    canDeleteCurrentServer: canDeleteCurrentServerComputed,
    canOpenServerSettings: roleUi.canOpenServerSettings,
    canOpenServerSettingsForServer: roleUi.canOpenServerSettingsForServer,
    canOpenInviteForServer,
    reorderVisibleServers: serverStore.reorderVisibleServers,
    syncVanityAcrossServerLists,
    isServerUnread,
    onOpenCreateChannel: openCreateChannelOnServer,
    hasGuildChannelChrome,
  });

  const shellLayoutSlice = useAppLayoutContextShellLayoutSlice({
    toggleChannelPanel,
    openDMPanel: selectDMTab,
  });

  const dmGroupFriendsComputed = useAppLayoutDmGroupFriendsComputed({
    currentUserId: currentUserIdForSocket,
    users: workspace.users,
    friendIds: workspace.friendIds,
  });

  const dmSlice = useAppLayoutContextDmSlice({
    echoDmPeerByChannelId,
    echoDmThreadIds,
    echoBlockedUserIds,
    dmIncomingRailCluster,
    selectMessageRequest,
    ignoreMessageRequest,
    returnFromMessageRequests,
    acceptFriendRequest,
    declineFriendRequest,
    cancelFriendRequest,
    sendFriendRequest,
    handleDmMarkRead,
    hideDmFromInboxUser,
    hideDmFromInboxGroup,
    isDmInboxUserFavorite,
    isDmInboxGroupFavorite,
    toggleFavoriteDmInbox,
    handleAcceptMessageRequest,
    dmGroupFriends: dmGroupFriendsComputed,
    dmInboxEntriesForPanel,
    dmUsersForDmPanel: dmUsersForDmPanelComputed,
    groupDMListForPanel: groupDMListForPanelComputed,
    isEchoUserFriend: friendshipQueries.isEchoUserFriend,
    isEchoUserIncomingFriendRequest:
      friendshipQueries.isEchoUserIncomingFriendRequest,
    isEchoUserOutgoingFriendRequest:
      friendshipQueries.isEchoUserOutgoingFriendRequest,
    selectIncomingDmFromRail,
    selectIncomingGroupDmFromRail,
    openDmInboxFromRailOverflow,
    groupDMs,
    groupDMPreselectedIds,
    groupDMLockedIds,
    groupDmMaxMembers,
    dmActiveTab,
    dmPanelWidth,
    startDmPanelResize,
    dmPartnerUser,
    guestFriendsLocked,
    handleCreateGroupDM: groupDmActions.handleCreateGroupDM,
    handleKickGroupDmMember,
    handleLeaveGroupDm,
    onRemoveGroupDmMember: handleKickGroupDmMember,
    onLeaveGroupDm: handleLeaveGroupDm,
    onOpenAddMembersToGroupDm,
    handleSelectGroupDM: handleSelectGroupDMWithGuestGuard,
    handleUpdateGroupFromSettings: groupDmActions.handleUpdateGroupFromSettings,
    openGroupDMModal: groupDmActions.openGroupDMModal,
    openGroupOverviewPanel: groupDmActions.openGroupOverviewPanel,
    openGroupSettingsFromHeader: groupDmActions.openGroupSettingsFromHeader,
    groupSettingsMembers,
    groupSettingsId,
    isGroupDM: isGroupDMComputed,
    isGroupDMModalOpen,
    isGroupDMSettingsOpen,
    groupDmSettingsInitialFocus,
    activeGroupSettingsId,
    isGroupOverviewOpen,
  });

  const moderationSlice = useAppLayoutContextModerationSlice({
    canModerateMemberInServer,
    canVcModerateMember,
    canModerateMemberActionInServer,
    canChangeMemberNicknameInServer,
    canModerateMessageAuthor: canModerateMessageAuthorForSurface,
    moderationModalOpen,
    moderationAction,
    moderationTargetUserId,
    moderationTargetUser,
    handleModerateUser,
    onModerationModalConfirm,
    handleVcModerate,
  });

  const shellChromeSlice = useAppLayoutContextShellChromeSlice({
    ExploreView,
    MORE_SERVERS_PANEL_WIDTH: gridMoreServersPanelWidth,
    MORE_SERVERS_COMPACT_WIDTH: gridMoreServersCompactWidth,
    DM_PANEL_WIDTH: 240,
    appGridTemplateColumns,
    expandChannels,
    exploreDiscoverableServers,
    isExploreView,
    welcomeBackExploreGate,
    welcomeBackExploreMemberEmptyDirectory,
    showWelcomeBackSlimBanner,
    inviteLandingActive: inviteLanding.inviteLandingActive,
    inviteLandingPreview: inviteLanding.invitePreview,
    inviteLandingLoading: inviteLanding.isLoading,
    inviteLandingError: inviteLanding.previewError,
    inviteLandingPersistBeforeOAuth: inviteLanding.persistInviteBeforeOAuth,
    showNsfwChatGate,
    acknowledgeNsfwChannel,
    declineNsfwGate,
    mainContentColumns,
    mainContentColumnsEffective,
    addServerInitialView,
    addServerJoinError,
    addServerCreateBusy,
    addServerJoinBusy,
    addServerJoinInvitePrefill,
    exploreDirectoryJoinBusy,
    joinEchoServerWithInviteRaw,
    handleJoinWithInviteLink,
    handleCreateServer,
    handleJoinDiscoverableServer,
    isServerEmptyOnboarding,
    isJoinServerConfirmModalOpen: isJoinServerConfirmModalOpenRef,
    joinServerConfirmPreview: joinServerConfirmPreviewRef,
    joinServerConfirmBusy: joinServerConfirmBusyRef,
    confirmJoinServerFromModal,
    onJoinServerConfirmModalUpdate,
    isServerApplicationModalOpen: isServerApplicationModalOpenRef,
    serverApplicationPayload: serverApplicationPayloadRef,
    serverApplicationBusy: serverApplicationBusyRef,
    onServerApplicationModalUpdate,
    confirmServerApplicationSubmittedFromModal,
  });

  const friendshipKnownComputed = computed(
    () =>
      echoSyncCapabilities.isMockDataMode ||
      workspace.socialGraphStatus.value === 'ready',
  );

  const expandedProfileHideOpenDmButtonComputed = computed(() => {
    const pid = expandedProfile.value?.id?.trim();
    if (!pid) return false;
    const selected = selectedDMUserId.value?.trim();
    return !!selected && selected === pid;
  });

  const dmSurfaceAdapter = useDmSurfaceAdapter({
    dmPartnerUser,
    activeGroupDM,
    activeDmThreadCallUi,
    isGroupDM: isGroupDMComputed,
    isInDMMode: isInDMModeComputed,
    isInDMChat: isInDmThreadOrIdleMainSurface,
    dmActiveTab: useComputedRefAlias(dmActiveTab),
    presenceByUserId: useComputedRefAlias(presenceByUserId),
    presenceMobileByUserId: useComputedOptionalRefAlias(presenceMobileByUserId),
    activeGroupCallMembers: activeGroupCallMembersVisible,
    openExpandedProfilePanelForUserId,
    openExtendedProfileModalForUserId,
    openGroupOverviewPanel: groupDmActions.openGroupOverviewPanel,
    openGroupSettingsFromHeader: groupDmActions.openGroupSettingsFromHeader,
  });

  const profileSurfaceAdapter = useProfileSurfaceAdapter({
    currentUserId: computed(() => currentUserComputed.value?.id),
    expandedProfile: useComputedRefAlias(expandedProfile),
    expandedProfileNote: useComputedRefAlias(expandedProfileNote),
    expandedProfileLoading: useComputedRefAlias(expandedProfileLoading),
    isExpandedProfileSidePanel: useComputedRefAlias(isExpandedProfileSidePanel),
    isExpandedProfileModalOpen: useComputedRefAlias(isExpandedProfileModalOpen),
    isExpandedProfileTargetBlocked: useComputedRefAlias(
      isExpandedProfileTargetBlockedComputed,
    ),
    friendshipKnown: useComputedRefAlias(friendshipKnownComputed),
    friendIds: computed(() => workspace.friendIds.value),
    friendIdsByUserId: computed(() => workspace.friendIdsByUserId.value),
    friendRequestsIncoming: computed(
      () => workspace.friendRequestsIncoming.value ?? [],
    ),
    friendRequestsOutgoing: computed(
      () => workspace.friendRequestsOutgoing.value ?? [],
    ),
    blockedUserIds: computed(() => workspace.blockedUserIds.value ?? []),
    guestFriendsLocked: useComputedRefAlias(guestFriendsLocked),
    presenceMobileByUserId: useComputedOptionalRefAlias(presenceMobileByUserId),
    hideOpenDmButton: useComputedRefAlias(
      expandedProfileHideOpenDmButtonComputed,
    ),
    onUpdateExpandedProfileNote: (note: string) => {
      const id =
        expandedProfileTargetUserId.value?.trim() ??
        expandedProfile.value?.id ??
        null;
      if (id) updateProfileNote(id, note);
    },
    onExpandedProfileModalUpdate,
    handleExpandedProfileOpenServer,
    handleExpandedProfileOpenProfile,
    expandDmProfileToFullModal,
    handleExpandedProfileOpenDM: (userId: string) => {
      handleExpandedProfileOpenDM(userId, selectDmUser, selectDMTab);
    },
    handleExpandedProfileSendFriendRequest: (userId: string) => {
      void sendFriendRequest(userId);
    },
    handleExpandedProfileCancelOutgoingFriendRequest,
    handleExpandedProfileAcceptIncomingFriendRequest,
    handleExpandedProfileDeclineIncomingFriendRequest,
    handleExpandedProfileRemoveFriend,
    handleProfileBlockUser,
    handleProfileUnblockUser,
    handleProfileReportUser,
  });

  const chatHeaderAdapter = useChatHeaderAdapter({
    dmSurface: dmSurfaceAdapter,
    profileSurface: profileSurfaceAdapter,
  });

  const context = buildAppLayoutControllerContext(
    {
      profile: profileSlice,
      voice: voiceSlice,
      messaging: messagingSlice,
      serverRail: serverRailSlice,
      shellLayout: shellLayoutSlice,
      dm: dmSlice,
      moderation: moderationSlice,
      shellChrome: shellChromeSlice,
    },
    {
      activeChannel: effectiveActiveChannel,
      activeChannelContext,
      activeChannelId,
      activeChannelMessages,
      activeChannelMessagesMap,
      linkedDiscordUserId,
      linkedDiscordState,
      activeGroupCallMembers: activeGroupCallMembersVisible,
      activeGroupDM,
      activeMemberProfile,
      activeRailTab,
      addFilter,
      allChannels,
      applyEchoPresenceFromSocket,
      authModalInitialLoginEntry,
      authModalPasskeyOnOpen,
      authModalInitialTab,
      authModalInitialSubView,
      authSession,
      callOverlay,
      canCreateChannels,
      canManageThisChannel,
      canInviteToCurrentServer,
      canJoinPreviewVoiceChannel,
      categoriesForServer,
      categorySettingsTarget,
      categorySettingsEchoPermissionEditor,
      channelPanelCollapsed,
      channelPanelBubbleMode,
      channelPanelWidth,
      channelSettingsCategoryPermissionDefaults,
      channelSettingsCategoryAutoDeleteAfterSeconds,
      channelSettingsEchoPermissionEditor,
      channelSettingsTarget,
      clearRolePreview: roleUi.clearRolePreview,
      closeDMPanel,
      closePinsDropdown,
      createChannelCategoryNames,
      createChannelCategoryOptions,
      createChannelInitialCategoryId,
      currentUser: currentUserComputed,
      customStatus,
      deleteMessage: messageActions.deleteMessage,
      deleteMessageCore: messageActions.deleteMessage,
      ...echoCanContext,
      echoChannelHistory,
      echoRoleCatalog: roleUi.echoRoleCatalog,
      echoWorkspaceError,
      editMessage: messageActions.editMessage,
      effectiveActiveChannel,
      endDmCall,
      leaveDmCallVoice,
      rejoinDmCallVoice,
      answerDmCall,
      declineDmCall,
      dmCallRingUi,
      dmCallLobbyAfterSelfLeave,
      compactPagerPane,
      compactGuildTriPaneChannelPanelOpen,
      guildMobileVcLobby,
      openGuildMobileVcLobby,
      closeGuildMobileVcLobby,
      collapseMembers,
      expandMembers,
      expandVoiceSideChat,
      expandedProfile,
      filterChips,
      findChannelContextById,
      getChannelDisplayName,
      getChannelIcon: channelIconResolver.getIconUrl,
      getFirstTextChannelId,
      getLatestDMUserId: messageActions.getLatestDMUserId,
      getServerChannelInfoForMainSurface,
      handleActiveChannelChange: handleActiveChannelChangeNavigation,
      handleChangeMemberNicknameFromMemberList,
      handleCategoryDelete,
      handleCategoryReorder,
      handleCategorySettingsSave,
      handleChannelDelete,
      handleChannelReorder,
      handleChannelSettingsSave,
      deleteChannelById,
      deleteCategoryById,
      handleCreateCategorySubmit,
      handleCreateChannelModalSubmit,
      handleCreateChannelSubmit,
      handleExpandedProfileOpenServer,
      handleExpandedProfileAcceptIncomingFriendRequest,
      handleExpandedProfileDeclineIncomingFriendRequest,
      appActionRegistry,
      appLayoutActions,
      chatMessageNavBridge,
      handleInviteFriend,
      handlePinMessage: pinToggleHandlers.handlePinMessage,
      handleServerDeleted,
      handleStartRolePreview: roleUi.startRolePreview,
      handleUnpinMessage: pinToggleHandlers.handleUnpinMessage,
      handleUpdateCustomStatus: _handleUpdateCustomStatus,
      hydrateEchoFromApi,
      icons,
      inviteLinkForServer,
      inviteLinkFromApi,
      inviteLinkLookupPending,
      inviteLinkFromSelectedServer,
      inviteApplicationsEnabled,
      inviteJoinLinksEnabled,
      inviteCanCreateDirectHexInvite,
      directHexInviteLink,
      directHexInviteBusy,
      createDirectHexInvite,
      inviteableFriends,
      isAddServerModalOpen,
      isInviteModalOpen,
      inviteModalVoiceChannelId,
      inviteModalVoiceChannelName,
      isAuthModalOpen,
      isAuthenticated: isAuthenticatedComputed,
      isChannelActive,
      isCompactShell,
      isCreateCategoryModalOpen,
      isCreateChannelModalOpen,
      isDmUiContext,
      isDMPanelOpen,
      isEchoGraphId,
      isEchoUserBlocked,
      isExpandedProfileModalOpen,
      isExpandedProfileSidePanel,
      isGuest,
      isGuestCaptchaModalOpen,
      isGuestDisplayNameModalOpen,
      isGuestWelcomePrefsModalOpen,
      isGuestUpgradeModalOpen,
      isInDMChat: isInDmThreadOrIdleMainSurface,
      isInDMMode: isInDMModeComputed,
      isMemberPopoutOpen,
      isMemberProfileOpen: useComputedRefAlias(isMemberPopoutOpen),
      isMoreServersCompact,
      isMoreServersPanelOpen,
      isMoreServersPinned,
      isChannelPanelSwitchLoading,
      isMessageSurfaceSwitchLoading,
      isMemberSurfaceSwitchLoading,
      isEchoRoleBootstrapLoading,
      isPinsDropdownOpen,
      isRolePreviewActiveForServer: roleUi.isRolePreviewActiveForServer,
      isSearchActive,
      isSelfProfilePopoutOpen,
      isServerSettingsModalOpen,
      isSettingsModalOpen,
      settingsModalInitialSection,
      settingsModalActiveSection,
      serverSettingsModalInitialSection,
      serverSettingsModalActiveSection,
      mainSurface,
      markActiveChannelAsRead,
      memberListResolveHighestRole: resolveMemberHighestRole,
      memberListRoleManagement: roleUi.memberListRoleManagement,
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
      presenceByUserId,
      presenceMobileByUserId,
      newlyCreatedServerId,
      onCategorySettingsModalOpenUpdate,
      onChannelSettingsModalOpenUpdate,
      continueAsGuest,
      onMemberPopoutOpenUpdate:
        memberPopoutChromeCallbacks.onMemberPopoutOpenUpdate,
      onGuestAccountUpgraded,
      onGuestCaptchaVerified,
      onUserSettingsModalUpdate:
        userSettingsModalCallbacks.onUserSettingsModalUpdate,
      onSettingsModalActiveSectionUpdate:
        userSettingsModalCallbacks.onSettingsModalActiveSectionUpdate,
      openCategorySettings,
      openChannelSettings,
      openCreateCategoryModal,
      openCreateChannelModal,
      openGuestUpgradeModal,
      openServerSurface,
      openUserSettingsModal: userSettingsModalCallbacks.openUserSettingsModal,
      openAddServerModal,
      openAuthModal,
      openUserSettingsToDiscordFromAddServer,
      pfpBarExpanded,
      pinPreview,
      pinnedMessageIdsForCurrentChannel,
      pinnedMessagesForDropdown,
      pinsButtonRefDm,
      pinsButtonRefServer,
      pinsDropdownRect,
      previewCanModerateMembers: previewCanModerateMembersComputed,
      previewHasUiPermission: roleUi.previewHasUiPermission,
      profileNotes,
      rawCategoriesForServer,
      refreshEchoRoleData: refreshRoleData,
      removeFilter,
      resetChannelWidth,
      resetDmPanelWidth,
      resetMemberWidth,
      resetVoiceSideChatWidth,
      resolvePreviewChannelPermission,
      rolePreview: roleUi.rolePreview,
      selectDM: selectDmUser,
      selectDMTab,
      selectExploreTab,
      selectServersTab,
      selectServersRailOnly,
      selectedDMUserId,
      selectedMessageRequestId,
      dmMentionNotifications,
      dmNotificationReadStateByChannelId,
      mentionNotificationCategoriesByServer,
      mentionNotificationServers,
      dmNotificationsReadPreset,
      dmNotificationsSourceKey,
      onOpenMentionNotification,
      onMarkMentionNotificationRead,
      selectedServer: selectedServerView,
      selfProfile,
      selfProfileAnchor,
      serverSettingsCanManageRoles: roleUi.serverSettingsCanManageRoles,
      serverSettingsCanManageServer: roleUi.serverSettingsCanManageServer,
      serverStore,
      sessionEndedMessage,
      discordBotExportReadyBanner,
      dismissDiscordBotExportReadyBanner,
      shellNavState,
      startChannelResize,
      startDmCall,
      startDmCallWithUserId,
      startGroupCall,
      startGroupCallWithId,
      startMemberResize,
      startRolePreview: roleUi.startRolePreview,
      startVoiceSideChatResize,
      toggleMoreServersPanel: toggleMoreServersPanelChrome,
      togglePinsDropdown,
      toggleVoiceSideChat,
      toggleChannelPanelBubbleMode,
      voiceMobileSheetLevel,
      bumpVoiceMobileChatFromCallScrollUp,
      bumpVoiceMobileChatFromCallScrollDown,
      narrowChannelPanelForActivityOverflowStep,
      unpinMessage: pinToggleHandlers.unpinMessage,
      updateCurrentUserStatus: updateStatusCast,
      voiceSideChatCollapsed,
      voiceSideChatWidth,
      watchActiveChannelWithServerChange,
      isPersistedEchoDmThread,
      workspaceReady,
      onEchoMessageFailedGuest,
      dispatchNav,
      echoCapabilitiesForServerId,
      liveChannelCapabilities,
      refreshEchoSocialFromApi,
      guestCaptchaSiteKey,
      submitPollVote: submitPollVoteViaSocket,
      submitReactionToggle,
      submitPin: submitPinViaSocket,
      submitUnpin: submitUnpinViaSocket,
      submitMessageEdit: submitMessageEditViaSocket,
      submitMessageDelete: submitMessageDeleteViaSocket,
      showApiFetchErrorBanner,
    },
  );

  const { fetchMembersForServer } = createEchoServerMemberOrchestration({
    authSession,
    echoSession,
    selectedServerId: selectedServerIdRef,
  });

  watch(
    selectedServerIdRef,
    (sid) => {
      if (sid && sid !== 'echo') {
        void fetchMembersForServer(sid);
      }
    },
    { immediate: true },
  );

  return Object.assign(buildAppLayoutExpose(context), {
    dmSurfaceAdapter,
    profileSurfaceAdapter,
    chatHeaderAdapter,
  });
}
