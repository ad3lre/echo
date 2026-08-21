import type { WireAppLayoutVoiceAndRealtimeResult } from '../controller/wireAppLayoutVoiceAndRealtime';
import { useAppLayoutForwardMessage } from './useAppLayoutForwardMessage';
import { useAppLayoutGuestQuickDm } from '../guest/useAppLayoutGuestQuickDm';
import { createHandleExpandedProfileOpenServer } from '../profiles/createHandleExpandedProfileOpenServer';
import { createEnsurePersistedDirectDmChannelIdForInvite } from '../dm/useAppLayoutDmInvitePersistence';
import { useJoinServerConfirmModal } from '@/features/layout/useJoinServerConfirmModal';
import { useServerApplicationModal } from '@/features/layout/useServerApplicationModal';
import { useAddServerFlow } from '../server/useAddServerFlow';
import { createPromptSignInHandler } from '../controller/createPromptSignInHandler';

type Phase2 = WireAppLayoutVoiceAndRealtimeResult;

export type UseAppLayoutMessagingForwardAddServerExtras = {
  sendMessage: Phase2['sendMessageViaSocket'];
};

function wireForwardAndGuest(
  phase2: Phase2,
  extras: UseAppLayoutMessagingForwardAddServerExtras,
) {
  const forward = useAppLayoutForwardMessage({
    activeChannelId: phase2.activeChannelId,
    isLiveSocketReady: phase2.isLiveSocketReady,
    echoDmPeerByChannelId: phase2.echoDmPeerByChannelId,
    echoDmThreadIds: phase2.echoDmThreadIds,
    echoDmLastActivityIdByChannelId: phase2.echoDmLastActivityIdByChannelId,
    groupDMs: phase2.groupDMs,
    users: phase2.workspace.users,
    servers: phase2.workspace.servers,
    categoriesByServer: phase2.workspace.categoriesByServer,
    sendMessage: extras.sendMessage,
  });
  const { handleMemberPopoutQuickDm } = useAppLayoutGuestQuickDm({
    isGuest: phase2.isGuestComputed,
    isMemberPopoutOpen: phase2.isMemberPopoutOpen,
    isSettingsModalOpen: phase2.isSettingsModalOpen,
    settingsModalInitialSection: phase2.settingsModalInitialSection,
    settingsModalActiveSection: phase2.settingsModalActiveSection,
    selectDMTab: phase2.selectDMTab,
    selectDmUser: phase2.selectDmUser,
    sendMessage: extras.sendMessage,
    hydrateAfterGuestAccountUpgrade: phase2.hydrateAfterGuestAccountUpgrade,
    isGuestAfterUpgrade: () => phase2.authSession.backendUser?.isGuest === true,
  });
  const handleExpandedProfileOpenServer = createHandleExpandedProfileOpenServer(
    {
      openServerSurface: (serverId) => phase2.openServerSurface(serverId),
      isExpandedProfileModalOpen: phase2.isExpandedProfileModalOpen,
      isExpandedProfileSidePanel: phase2.isExpandedProfileSidePanel,
      isGroupOverviewOpen: phase2.isGroupOverviewOpen,
      expandedProfile: phase2.expandedProfile,
      expandedProfileTargetUserId: phase2.expandedProfileTargetUserId,
    },
  );
  return {
    ...forward,
    handleMemberPopoutQuickDm,
    handleExpandedProfileOpenServer,
  };
}

function wireJoinAndAddServer(
  phase2: Phase2,
  extras: UseAppLayoutMessagingForwardAddServerExtras,
) {
  const joinConfirm = useJoinServerConfirmModal();
  const serverApplication = useServerApplicationModal();
  const ensurePersistedDirectDmChannelIdForInvite =
    createEnsurePersistedDirectDmChannelIdForInvite({
      authSession: phase2.authSession,
      echoDmPeerByChannelId: phase2.echoDmPeerByChannelId,
      mergeEchoDmThreadFromRealtime: phase2.mergeEchoDmThreadFromRealtime,
    });
  const addServerFlow = useAddServerFlow({
    serverStore: phase2.serverStore,
    authSession: phase2.authSession,
    workspace: phase2.workspace,
    currentUser: phase2.currentUser,
    activeChannelId: phase2.activeChannelId,
    activeRailTab: phase2.activeRailTab,
    dmActiveTab: phase2.dmActiveTab,
    isAddServerModalOpen: phase2.isAddServerModalOpen,
    addServerInitialView: phase2.addServerInitialView,
    isMoreServersPanelOpen: phase2.isMoreServersPanelOpen,
    isMoreServersPinned: phase2.isMoreServersPinned,
    newlyCreatedServerId: phase2.newlyCreatedServerId,
    getFirstTextChannelId: phase2.getFirstTextChannelId,
    hydrateWorkspace: phase2.hydrateEchoFromApi,
    sendMessage: extras.sendMessage,
    inviteLinkForServer: phase2.inviteLinkForServer,
    selectedServer: phase2.selectedServerEcho,
    isExploreView: phase2.isExploreView,
    onPromptSignIn: createPromptSignInHandler(phase2.openAuthModal),
    isPersistedEchoDmThread: phase2.isPersistedEchoDmThread,
    ensurePersistedDirectDmChannelId: ensurePersistedDirectDmChannelIdForInvite,
    requestJoinServerConfirm: joinConfirm.requestJoinServerConfirm,
    finishJoinServerConfirmModal: joinConfirm.finishJoinServerConfirmModal,
    requestServerApplicationModal:
      serverApplication.requestServerApplicationModal,
    finishServerApplicationModal:
      serverApplication.finishServerApplicationModal,
    echoDmPeerByChannelId: phase2.echoDmPeerByChannelId,
    echoDmLastActivityAtMsByChannelId: phase2.echoDmLastActivityAtMsByChannelId,
  });
  return { joinConfirm, serverApplication, addServerFlow };
}

/**
 * Forward picker, guest quick-DM, join-server / application modals, add-server.
 */
export function useAppLayoutMessagingForwardAddServer(
  phase2: Phase2,
  extras: UseAppLayoutMessagingForwardAddServerExtras,
) {
  const forwardGuest = wireForwardAndGuest(phase2, extras);
  const { joinConfirm, serverApplication, addServerFlow } =
    wireJoinAndAddServer(phase2, extras);
  return {
    handleExpandedProfileOpenServer:
      forwardGuest.handleExpandedProfileOpenServer,
    assembly: {
      forwardModalOpen: forwardGuest.forwardModalOpen,
      forwardPickerDestinations: forwardGuest.forwardPickerDestinations,
      forwardModalSourceSummary: forwardGuest.forwardModalSourceSummary,
      openForwardMessagePicker: forwardGuest.openForwardMessagePicker,
      closeForwardMessagePicker: forwardGuest.closeForwardMessagePicker,
      submitForwardedMessage: forwardGuest.submitForwardedMessage,
      handleMemberPopoutQuickDm: forwardGuest.handleMemberPopoutQuickDm,
      handleExpandedProfileOpenServer:
        forwardGuest.handleExpandedProfileOpenServer,
      addServerJoinError: addServerFlow.addServerJoinError,
      addServerCreateBusy: addServerFlow.addServerCreateBusy,
      addServerJoinBusy: addServerFlow.addServerJoinBusy,
      addServerJoinInvitePrefill: addServerFlow.addServerJoinInvitePrefill,
      exploreDirectoryJoinBusy: addServerFlow.exploreDirectoryJoinBusy,
      openAddServerModal: addServerFlow.openAddServerModal,
      joinEchoServerWithInviteRaw: addServerFlow.joinEchoServerWithInviteRaw,
      handleJoinWithInviteLink: addServerFlow.handleJoinWithInviteLink,
      handleCreateServer: addServerFlow.handleCreateServer,
      handleJoinDiscoverableServer: addServerFlow.handleJoinDiscoverableServer,
      handleInviteFriend: addServerFlow.handleInviteFriend,
      inviteableFriends: addServerFlow.inviteableFriends,
      isJoinServerConfirmModalOpenRef: joinConfirm.isJoinServerConfirmModalOpen,
      joinServerConfirmPreviewRef: joinConfirm.joinServerConfirmPreview,
      joinServerConfirmBusyRef: joinConfirm.joinServerConfirmBusy,
      confirmJoinServerFromModal: joinConfirm.confirmJoinServerFromModal,
      onJoinServerConfirmModalUpdate:
        joinConfirm.onJoinServerConfirmModalUpdate,
      isServerApplicationModalOpenRef:
        serverApplication.isServerApplicationModalOpen,
      serverApplicationPayloadRef: serverApplication.serverApplicationPayload,
      serverApplicationBusyRef: serverApplication.serverApplicationBusy,
      onServerApplicationModalUpdate:
        serverApplication.onServerApplicationModalUpdate,
      confirmServerApplicationSubmittedFromModal:
        serverApplication.confirmSubmittedFromModal,
    },
  };
}
