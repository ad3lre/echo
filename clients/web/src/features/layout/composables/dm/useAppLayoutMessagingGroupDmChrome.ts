import type { Ref } from 'vue';
import { hasActivePhoneGuildChannel } from '@/features/layout/phoneShellOverlayState';
import type { WireAppLayoutVoiceAndRealtimeResult } from '../controller/wireAppLayoutVoiceAndRealtime';
import { createAppLayoutToggleMemberList } from '../shell/useAppLayoutCompactShellExpand';
import { createToggleBooleanRef } from '../controller/createToggleBooleanRef';
import { createIsServerUnread } from '../server/createIsServerUnread';
import { createOpenCreateChannelOnServer } from '../server/createOpenCreateChannelOnServer';
import { createCanModerateMessageAuthorAdapter } from '../messaging/createCanModerateMessageAuthorAdapter';
import { useAppLayoutGroupDmManagement } from './useAppLayoutGroupDmManagement';

type Phase2 = WireAppLayoutVoiceAndRealtimeResult;

export type UseAppLayoutMessagingGroupDmChromeExtras = {
  clearSearch: () => void;
};

export type NavigateToDmForAnswerDeps = {
  groupDMs: { readonly value: Record<string, unknown> };
  handleSelectGroupDMWithGuestGuard: (id: string) => void;
  selectDmUser: (id: string) => void | Promise<unknown>;
  selectDMTab: () => void;
  isGuestUser: () => boolean;
};

/** Late-bind target for answering a DM/group call from the shell. */
export function createNavigateToDmForAnswer(
  deps: NavigateToDmForAnswerDeps,
): (targetId: string) => void {
  return (targetId: string) => {
    const tid = targetId.trim();
    if (!tid) return;
    if (deps.groupDMs.value[tid]) {
      deps.handleSelectGroupDMWithGuestGuard(tid);
      if (deps.isGuestUser()) return;
      deps.selectDMTab();
      return;
    }
    void deps.selectDmUser(tid);
    if (deps.isGuestUser()) return;
    // `onSelectDmUser` does not switch the server rail to DM; without this, the
    // channel tree stays visible and the members/search column can leak beside
    // DM call UI.
    queueMicrotask(() => {
      deps.selectDMTab();
    });
  };
}

function wireMemberChannelToggles(phase2: Phase2) {
  const toggleMemberListBase = createToggleBooleanRef(
    phase2.memberPanelCollapsed,
  );
  const toggleMemberList = createAppLayoutToggleMemberList({
    isCompactShell: phase2.isCompactShell,
    hasGuildChannelChrome: phase2.hasGuildChannelChrome,
    isCompactGuildSplitShell: phase2.isCompactGuildSplitShell,
    useCompactPhoneTabShell: phase2.useCompactPhoneTabShell,
    compactPagerPane: phase2.compactPagerPane,
    memberPanelCollapsed: phase2.memberPanelCollapsed,
    mobileMembersOverlayOpen: phase2.mobileMembersOverlayOpen,
    mobileBottomTab: phase2.mobileBottomTab,
    mobileServersStack: phase2.mobileServersStack,
    hasActiveGuildChannel: () =>
      hasActivePhoneGuildChannel(
        phase2.serverStore.selectedServerId,
        phase2.activeChannelId.value,
      ),
    toggleMemberListBase,
    markMemberPanelExpandedByUser: phase2.markMemberPanelExpandedByUser,
    markMemberPanelCollapsedByUser: phase2.markMemberPanelCollapsedByUser,
  });
  return {
    toggleMemberList,
    toggleChannelPanel: createToggleBooleanRef(phase2.channelPanelCollapsed),
    isServerUnread: createIsServerUnread(
      () => phase2.serverAttentionByServerId.value,
    ),
    openCreateChannelOnServer: createOpenCreateChannelOnServer({
      openServerSurface: (serverId) => phase2.openServerSurface(serverId),
      openCreateChannelModal: phase2.openCreateChannelModal,
    }),
    canModerateMessageAuthorForSurface: createCanModerateMessageAuthorAdapter(
      phase2.canModerateMessageAuthor,
    ),
  };
}

function wireGroupDmManagement(
  phase2: Phase2,
  extras: UseAppLayoutMessagingGroupDmChromeExtras,
) {
  return useAppLayoutGroupDmManagement({
    groupDMs: phase2.groupDMs,
    groupDMPreselectedIds: phase2.groupDMPreselectedIds,
    groupDMLockedIds: phase2.groupDMLockedIds,
    isGroupDMModalOpen: phase2.isGroupDMModalOpen,
    isGroupDMSettingsOpen: phase2.isGroupDMSettingsOpen,
    groupDmSettingsInitialFocus: phase2.groupDmSettingsInitialFocus,
    activeGroupSettingsId: phase2.activeGroupSettingsId,
    activeChannelId: phase2.activeChannelId,
    selectedDMUserId: phase2.selectedDMUserId,
    dmActiveTab: phase2.dmActiveTab,
    selectedMessageRequestId: phase2.selectedMessageRequestId,
    isDMPanelOpen: phase2.isDMPanelOpen,
    pfpBarExpanded: phase2.pfpBarExpanded,
    currentUserId: phase2.currentUserIdForSocket,
    dmPartnerUserId: phase2.dmPartnerUserIdForGroupDm as unknown as Ref<
      string | null
    >,
    activeGroupId: phase2.activeGroupId as unknown as Ref<string | null>,
    selectServer: phase2.selectServerViaStore,
    isInDMChat: phase2.isInDmThreadOrIdleMainSurface as unknown as Ref<boolean>,
    isGroupOverviewOpen: phase2.isGroupOverviewOpen,
    isExpandedProfileModalOpen: phase2.isExpandedProfileModalOpen,
    isExpandedProfileSidePanel: phase2.isExpandedProfileSidePanel,
    expandedProfile: phase2.expandedProfile,
    expandedProfileTargetUserId: phase2.expandedProfileTargetUserId,
    openGroupDmOnServer: phase2.openGroupDmOnServerImpl,
    isCompactShell: phase2.isCompactShell,
    workspace: phase2.workspace,
    currentUser: phase2.currentUser,
    authSession: phase2.authSession,
    serverStore: phase2.serverStore,
    mergeEchoDmThreadsFromApi: phase2.mergeEchoDmThreadsFromApi,
    openGuestUpgradeModal: phase2.openGuestUpgradeModal,
    closePinsDropdown: phase2.closePinsDropdown,
    clearSearch: extras.clearSearch,
  });
}

/**
 * Member/channel toggles, group-DM management, action-registry seal.
 * Contains wiring-order marker `sealWithGroupDmAndNavigation`.
 */
export function useAppLayoutMessagingGroupDmChrome(
  phase2: Phase2,
  extras: UseAppLayoutMessagingGroupDmChromeExtras,
) {
  const toggles = wireMemberChannelToggles(phase2);
  const groupDm = wireGroupDmManagement(phase2, extras);
  phase2.selectGroupDmForIncomingRail.value =
    groupDm.handleSelectGroupDMWithGuestGuard;
  phase2.navigateToDmForAnswerRef.value = createNavigateToDmForAnswer({
    groupDMs: phase2.groupDMs,
    handleSelectGroupDMWithGuestGuard:
      groupDm.handleSelectGroupDMWithGuestGuard,
    selectDmUser: phase2.selectDmUser,
    selectDMTab: phase2.selectDMTab,
    isGuestUser: () => phase2.authSession.backendUser?.isGuest === true,
  });
  const { appActionRegistry, appLayoutActions } =
    phase2.sealWithGroupDmAndNavigation({
      groupDm: {
        ...groupDm.groupDmActions,
        handleSelectGroupDM: groupDm.handleSelectGroupDMWithGuestGuard,
      },
      navigation: {
        openServerSettingsFromUrl: phase2.openServerSettingsFromUrl,
        openDm: phase2.selectDmUser,
      },
    });
  return {
    groupDmActions: groupDm.groupDmActions,
    assembly: {
      ...toggles,
      groupDmActions: groupDm.groupDmActions,
      handleSelectGroupDMWithGuestGuard:
        groupDm.handleSelectGroupDMWithGuestGuard,
      groupSettingsMembers: groupDm.groupSettingsMembers,
      groupSettingsId: groupDm.groupSettingsId,
      onOpenAddMembersToGroupDm: groupDm.onOpenAddMembersToGroupDm,
      handleKickGroupDmMember: groupDm.handleKickGroupDmMember,
      handleLeaveGroupDm: groupDm.handleLeaveGroupDm,
      appActionRegistry,
      appLayoutActions,
    },
  };
}
