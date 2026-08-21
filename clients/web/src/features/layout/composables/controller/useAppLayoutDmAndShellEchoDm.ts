import { computed, ref, shallowRef, watch, type Ref } from 'vue';
import { echoSyncCapabilities } from '@/platform/syncCapabilities';
import type { WorkspaceRosterUserRow } from '@/features/layout/echoWorkspace/workspaceRoster';
import { useAppLayoutEchoDmState } from '@/features/layout/composables/dm/useAppLayoutEchoDmState';
import { useEchoDmPeerProfileHydration } from '../dm/useEchoDmPeerProfileHydration';
import { useAppLayoutEffectiveChannel } from '../shell/useAppLayoutEffectiveChannel';
import { useAppLayoutVcActivityGuards } from '../voice/useAppLayoutVcActivityGuards';
import { useAppLayoutActiveChannelNavigation } from '../shell/useAppLayoutActiveChannelNavigation';
import { useAppLayoutOpenDmThread } from '../dm/useAppLayoutOpenDmThread';
import { createSelectDmUserWithShadowGuard } from '@/features/dm/createSelectDmUserWithShadowGuard';
import { createIsKnownDmChannelId } from '@/features/dm/createIsKnownDmChannelId';
import { createIsPersistedEchoDmThreadChecker } from '../dm/createIsPersistedEchoDmThreadChecker';
import { createLatestDmPeerUserIdForRailResolver } from '@/features/dm/createLatestDmPeerUserIdForRailResolver';
import { useHiddenDmInboxStore } from '@/features/dm/hiddenDmInbox';
import { useFavoriteDmInboxStore } from '@/features/dm/favoriteDmInbox';
import type { AppLayoutDmAndShellSession } from './useAppLayoutDmAndShellSession';
import type { AppLayoutDmAndShellRolesTree } from './useAppLayoutDmAndShellRolesTree';

function wireEchoDmState(session: AppLayoutDmAndShellSession) {
  const { uiState, serverStore, workspace, authSession } = session;
  return useAppLayoutEchoDmState({
    serverStore,
    workspace,
    authSession,
    activeChannelId: uiState.activeChannelId,
    activeRailTab: uiState.activeRailTab,
    dmActiveTab: uiState.dmActiveTab,
    selectedDMUserId: uiState.selectedDMUserId,
    groupDMs: uiState.groupDMs,
  });
}

function wireEchoDmHydration(
  session: AppLayoutDmAndShellSession,
  echoDmState: ReturnType<typeof useAppLayoutEchoDmState>,
  currentUserIdForSocket: AppLayoutDmAndShellRolesTree['currentUserIdForSocket'],
) {
  const { uiState, authSession, workspace } = session;
  useEchoDmPeerProfileHydration({
    enabled: computed(
      () =>
        authSession.isAuthenticated &&
        !echoSyncCapabilities.isMockDataMode &&
        (uiState.activeRailTab.value === 'dm' ||
          uiState.isDMPanelOpen.value ||
          !!uiState.selectedDMUserId.value?.trim() ||
          !!uiState.activeGroupSettingsId.value?.trim()),
    ),
    getToken: () => authSession.accessToken?.trim() ?? '',
    workspaceUsers: workspace.users as Ref<WorkspaceRosterUserRow[]>,
    selfId: currentUserIdForSocket,
    echoPeerByChannelId: echoDmState.echoDmPeerByChannelId,
    groupDMs: uiState.groupDMs,
    selectedDMUserId: uiState.selectedDMUserId,
    activeGroupSettingsId: uiState.activeGroupSettingsId,
  });
}

function wireEffectiveChannelAndVcGuards(
  session: AppLayoutDmAndShellSession,
  roles: AppLayoutDmAndShellRolesTree,
  echoDmState: ReturnType<typeof useAppLayoutEchoDmState>,
) {
  const { uiState } = session;
  const effective = useAppLayoutEffectiveChannel({
    activeChannelId: uiState.activeChannelId,
    findChannelContextById: roles.findChannelContextById,
    selectedDMUserId: uiState.selectedDMUserId,
    echoDmPeerByChannelId: echoDmState.echoDmPeerByChannelId,
    users: session.workspace.users,
    echoDmThreadIds: echoDmState.echoDmThreadIds,
    groupDMs: uiState.groupDMs,
  });
  const vcGuards = useAppLayoutVcActivityGuards({
    isViewingVoiceChannel: effective.isViewingVoiceChannel,
    effectiveActiveChannel: effective.effectiveActiveChannel,
    vcActivityUi: uiState.vcActivityUi,
    closeVcActivity: uiState.closeVcActivity,
    openVcActivityPicker: uiState.openVcActivityPicker,
    openVcActivityYoutubeBrowse: uiState.openVcActivityYoutubeBrowse,
    openVcActivityWordle: uiState.openVcActivityWordle,
    openVcActivityHangman: uiState.openVcActivityHangman,
    openVcActivitySkriggles: uiState.openVcActivitySkriggles,
    openVcActivityTicTacToe: uiState.openVcActivityTicTacToe,
    openVcActivityOpenGuessr: uiState.openVcActivityOpenGuessr,
    openVcActivitySkribblIo: uiState.openVcActivitySkribblIo,
    openVcActivityGarticPhone: uiState.openVcActivityGarticPhone,
    openVcActivityKrunker: uiState.openVcActivityKrunker,
    openVcActivityCodenames: uiState.openVcActivityCodenames,
    openVcActivityRichup: uiState.openVcActivityRichup,
    openVcActivityGooberDash: uiState.openVcActivityGooberDash,
    openVcActivitySmashKarts: uiState.openVcActivitySmashKarts,
    openVcActivityClusterRush: uiState.openVcActivityClusterRush,
    openVcActivityWatchTogether: uiState.openVcActivityWatchTogether,
  });
  watch(uiState.currentVoiceChannelId, (vc) => {
    const id = vc?.trim();
    if (!id) return;
    if (!effective.isViewingVoiceChannel.value) return;
    const active = effective.effectiveActiveChannel.value;
    if (active?.type !== 'voice' && active?.type !== 'stage') return;
    if (active.id === id) return;
    uiState.activeChannelId.value = id;
  });
  function applyVcYoutubeWatchTogetherRemoteOnVoice(
    ...args: Parameters<typeof uiState.applyVcYoutubeWatchTogetherRemote>
  ) {
    if (
      effective.isViewingVoiceChannel.value &&
      effective.effectiveActiveChannel.value?.type === 'stage'
    ) {
      return;
    }
    uiState.applyVcYoutubeWatchTogetherRemote(...args);
  }
  function applyVcWatchTogetherRemoteOnVoice(
    ...args: Parameters<typeof uiState.applyVcWatchTogetherRemote>
  ) {
    if (
      effective.isViewingVoiceChannel.value &&
      effective.effectiveActiveChannel.value?.type === 'stage'
    ) {
      return;
    }
    uiState.applyVcWatchTogetherRemote(...args);
  }
  return {
    ...effective,
    ...vcGuards,
    applyVcYoutubeWatchTogetherRemoteOnVoice,
    applyVcWatchTogetherRemoteOnVoice,
  };
}

function wireDmThreadSelection(
  session: AppLayoutDmAndShellSession,
  roles: AppLayoutDmAndShellRolesTree,
  echoDmState: ReturnType<typeof useAppLayoutEchoDmState>,
) {
  const { uiState } = session;
  const { handleActiveChannelChangeNavigation } =
    useAppLayoutActiveChannelNavigation({
      activeChannelId: uiState.activeChannelId,
      isDMPanelOpen: uiState.isDMPanelOpen,
      echoDmThreadIds: echoDmState.echoDmThreadIds,
      findChannelContextById: roles.findChannelContextById,
    });
  const { onSelectDmUser, isOpeningDmThread: _isOpeningDmThread } =
    useAppLayoutOpenDmThread({
      selectedDMUserId: uiState.selectedDMUserId,
      dmActiveTab: uiState.dmActiveTab,
      selectedMessageRequestId: uiState.selectedMessageRequestId,
      serverStore: session.serverStore,
      pfpBarExpanded: uiState.pfpBarExpanded,
      authSession: session.authSession,
      activeChannelId: uiState.activeChannelId,
      echoDmPeerByChannelId: echoDmState.echoDmPeerByChannelId,
      echoDmThreadIds: echoDmState.echoDmThreadIds,
      messages: session.workspace.messages,
      messageRequests: session.workspace.messageRequests,
      isCompactShell: session.isCompactShell,
      isDMPanelOpen: uiState.isDMPanelOpen,
      onGuestDmBlocked: () => session.openGuestUpgradeForDmRef.value?.(),
    });
  const hiddenDmInboxStore = useHiddenDmInboxStore();
  return {
    handleActiveChannelChangeNavigation,
    onSelectDmUser,
    _isOpeningDmThread,
    selectDmUser: createSelectDmUserWithShadowGuard({
      users: () => session.workspace.users.value,
      onSelectDmUser,
    }),
    isKnownDmChannelId: createIsKnownDmChannelId({
      echoDmPeerByChannelId: () => echoDmState.echoDmPeerByChannelId.value,
      hasGroupDmChannel: (cid) => Boolean(uiState.groupDMs.value[cid]),
      echoDmThreadIds: () => echoDmState.echoDmThreadIds.value,
      findChannelContextById: roles.findChannelContextById,
    }),
    hiddenDmInboxStore,
    favoriteDmInboxStore: useFavoriteDmInboxStore(),
    getLatestDmInboxTargetForRailRef: shallowRef<
      () =>
        | { kind: 'user'; userId: string }
        | { kind: 'group'; channelId: string }
        | null
    >(() => null),
    isPersistedEchoDmThread: createIsPersistedEchoDmThreadChecker({
      getEchoDmThreadIds: () => echoDmState.echoDmThreadIds.value,
    }),
    getLatestDmPeerUserIdForRail: createLatestDmPeerUserIdForRailResolver({
      selfId: roles.currentUserIdForSocket,
      echoPeerByChannelId: () => echoDmState.echoDmPeerByChannelId.value,
      messages: () => session.workspace.messages.value,
      users: session.workspace.users,
      skipPeerUserId: (userId) => hiddenDmInboxStore.isUserHidden(userId),
    }),
    dmCallWithUserIdForShellLog: ref<string | null>(null),
    selectGroupDmForIncomingRail: shallowRef<
      ((channelId: string) => void) | undefined
    >(undefined),
    navigateToDmForAnswerRef: shallowRef<(targetId: string) => void>(() => {}),
  };
}

/**
 * Echo DM maps, effective channel, VC activity guards, DM thread selection.
 * Contains wiring-order markers for echo DM / effective channel / open DM.
 */
export function useAppLayoutDmAndShellEchoDm(
  session: AppLayoutDmAndShellSession,
  roles: AppLayoutDmAndShellRolesTree,
) {
  const echoDmState = wireEchoDmState(session);
  wireEchoDmHydration(session, echoDmState, roles.currentUserIdForSocket);
  const channelVc = wireEffectiveChannelAndVcGuards(
    session,
    roles,
    echoDmState,
  );
  const dmThread = wireDmThreadSelection(session, roles, echoDmState);
  return {
    echoDmState,
    ...echoDmState,
    ...channelVc,
    ...dmThread,
  };
}

export type AppLayoutDmAndShellEchoDm = ReturnType<
  typeof useAppLayoutDmAndShellEchoDm
>;
