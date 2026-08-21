import { useAppLayoutRealtimeSession } from '../realtime/useAppLayoutRealtimeSession';
import { useDmSocialActions } from '@/features/dm/composables/useDmSocialActions';
import { createHandleAcceptMessageRequestOpener } from '@/features/dm/createHandleAcceptMessageRequestOpener';
import { useGuildModeration } from '../server/useGuildModeration';
import { useAppLayoutServerRailAttention } from '../rail/useAppLayoutServerRailAttention';
import { createVoidingInvoker } from './createVoidingInvoker';
import { useCanDeleteCurrentEchoServerComputed } from '../server/useCanDeleteCurrentEchoServerComputed';
import type { WireAppLayoutDmAndShellResult } from './wireAppLayoutDmAndShell';
import type { AppLayoutVoiceAndRealtimeLifecycle } from './useAppLayoutVoiceAndRealtimeLifecycle';
import type { AppLayoutVoiceAndRealtimeChannels } from './useAppLayoutVoiceAndRealtimeChannels';
import type { AppLayoutVoiceAndRealtimeRailLanding } from './useAppLayoutVoiceAndRealtimeRailLanding';

type Phase1 = WireAppLayoutDmAndShellResult;

function wireRealtimeSession(
  phase1: Phase1,
  lifecycle: AppLayoutVoiceAndRealtimeLifecycle,
  channels: AppLayoutVoiceAndRealtimeChannels,
  railLanding: AppLayoutVoiceAndRealtimeRailLanding,
) {
  const cv = lifecycle.callVoiceLayout;
  return useAppLayoutRealtimeSession({
    workspace: phase1.workspace,
    echoSession: phase1.echoSession,
    authSession: phase1.authSession,
    platform: phase1.platform,
    actionRegistryRef: phase1.actionRegistryRef,
    mainSurface: phase1.mainSurface,
    activeChannelId: phase1.activeChannelId,
    currentUserIdForSocket: phase1.currentUserIdForSocket,
    echoDmPeerByChannelId: phase1.echoDmPeerByChannelId,
    echoDmThreadIds: phase1.echoDmThreadIds,
    echoChannelHistory: channels.echoChannelHistory,
    liveChannelCapabilitiesRefreshKey:
      railLanding.liveChannelCapabilitiesRefreshKey,
    hydrateEchoFromApi: lifecycle.hydrateEchoFromApi,
    refreshEchoSocialFromApi: lifecycle.refreshEchoSocialFromApi,
    syncEchoPresenceFromApi: lifecycle.syncEchoPresenceFromApi,
    applyEchoPresenceFromSocket: lifecycle.applyEchoPresenceFromSocket,
    mergeEchoDmThreadFromRealtime: phase1.mergeEchoDmThreadFromRealtime,
    handleEchoDmCall: cv.handleEchoDmCall,
    mergeReadStateUpdate: phase1.echoAttention.mergeReadStateUpdate,
    replaceAttentionSnapshot: phase1.echoAttention.replaceSnapshot,
    currentVoiceChannelId: phase1.currentVoiceChannelId,
    dmLiveKitJoinChannelId: cv._dmLiveKitJoinChannelId,
    getLiveKitVoiceApi: () => cv._liveKitVoiceApi,
    rejoinDmCallVoice: cv.rejoinDmCallVoice,
    reconnectGuildVoiceAfterE2eeRotation:
      cv.reconnectGuildVoiceAfterE2eeRotation,
    applyVoiceMediaModerationFromSocket: (payload) => {
      phase1.callVoice.applyVoiceMediaModerationFromSocket?.(payload);
    },
    wireDmCallSocketSubmitters: cv.wireDmCallSocketSubmitters,
  });
}

function wireDmSocialAndModeration(
  phase1: Phase1,
  lifecycle: AppLayoutVoiceAndRealtimeLifecycle,
) {
  const dmSocial = useDmSocialActions({
    currentUserId: phase1.currentUserIdForSocket,
    messageRequests: phase1.workspace.messageRequests,
    friendRequestsIncoming: phase1.workspace.friendRequestsIncoming,
    friendRequestsOutgoing: phase1.workspace.friendRequestsOutgoing,
    friendIds: phase1.workspace.friendIds,
    selectedMessageRequestId: phase1.selectedMessageRequestId,
    dmActiveTab: phase1.dmActiveTab,
    activeChannelId: phase1.activeChannelId,
    pfpBarExpanded: phase1.pfpBarExpanded,
    selectServer: phase1.selectServerViaStore,
    refreshFriendSocialFromApi: lifecycle.refreshEchoSocialFromApi,
  });
  const handleAcceptMessageRequest = createHandleAcceptMessageRequestOpener({
    acceptMessageRequest: dmSocial.acceptMessageRequest,
    selectDmUser: phase1.selectDmUser,
  });
  const guildMod = useGuildModeration({
    serverStore: phase1.serverStore,
    authSession: phase1.authSession,
    workspace: phase1.workspace,
    selectedServer: phase1.selectedServerEcho,
    currentUser: phase1.currentUser,
    activeChannel: phase1.effectiveActiveChannel,
    activeChannelContext: phase1.activeChannelContext,
    rolePreview: phase1.rolePreviewState,
    isRolePreviewActiveForServer: phase1.roleUi.isRolePreviewActiveForServer,
    previewHasUiPermission: phase1.roleUi.previewHasUiPermission,
    previewCanModerateMembers: phase1.roleUi.previewCanModerateMembers,
    resolvePreviewChannelPermission: phase1.resolvePreviewChannelPermission,
    echoCanModerateMembers: phase1.roleUi.echoCanModerateMembers,
    echoCanKickMembers: phase1.roleUi.echoCanKickMembers,
    echoCanBanMembers: phase1.roleUi.echoCanBanMembers,
    echoCanTimeoutMembers: phase1.roleUi.echoCanTimeoutMembers,
    echoCanChangeNicknames: phase1.roleUi.echoCanChangeNicknames,
    echoCanManageNicknames: phase1.roleUi.echoCanManageNicknames,
    echoCanManageMessages: phase1.roleUi.echoCanManageMessages,
    echoCanCreateInvite: phase1.roleUi.echoCanCreateInvite,
    echoCanMuteVoiceMembers: phase1.roleUi.echoCanMuteVoiceMembers,
    echoCanDeafenVoiceMembers: phase1.roleUi.echoCanDeafenVoiceMembers,
    echoCanMoveVoiceMembers: phase1.roleUi.echoCanMoveVoiceMembers,
    echoCapabilitiesForServerId: phase1.roleUi.echoCapabilitiesForServerId,
    onLeaveVoice: lifecycle.callVoiceLayout.leaveVoiceSession,
    hydrateWorkspace: lifecycle.hydrateEchoFromApi,
  });
  return { dmSocial, handleAcceptMessageRequest, guildMod };
}

function wireServerRailAttention(
  phase1: Phase1,
  guildMod: ReturnType<typeof useGuildModeration>,
) {
  return useAppLayoutServerRailAttention({
    workspace: phase1.workspace,
    selectedServerEcho: phase1.selectedServerEcho,
    serverStore: phase1.serverStore,
    serverAttentionByServerId: phase1.serverAttentionByServerId,
    channelAttentionByChannelId: phase1.channelAttentionByChannelId,
    readStateByChannelId: phase1.readStateByChannelId,
    serverNotificationLevelByServerId: phase1.serverNotificationLevelByServerId,
    currentUserIdForSocket: phase1.currentUserIdForSocket,
    echoMemberRoleIdsByUser: phase1.roleUi.echoMemberRoleIdsByUser,
    authSession: phase1.authSession,
    echoAttention: phase1.echoAttention,
    activeChannelId: phase1.activeChannelId,
    echoDmPeerByChannelId: phase1.echoDmPeerByChannelId,
    currentUser: phase1.currentUser,
    currentUserComputed: phase1.currentUserComputed,
    selectedServerIdRef: phase1.selectedServerIdRef,
    isKnownDmChannelId: phase1.isKnownDmChannelId,
    groupDMs: phase1.groupDMs,
    findChannelContextById: phase1.findChannelContextById,
    echoDmThreadIds: phase1.echoDmThreadIds,
    dmAttentionByChannelId: phase1.dmAttentionByChannelId,
    selectedDMUserId: phase1.selectedDMUserId,
    handleActiveChannelChangeNavigation:
      phase1.handleActiveChannelChangeNavigation,
    selectDMTab: phase1.selectDMTab,
    hiddenDmInboxStore: phase1.hiddenDmInboxStore,
    isDmUiContext: phase1.isDmUiContext,
    devModeIdsEnabled: phase1.devModeIdsEnabled,
    canOpenServerSettings: phase1.roleUi.canOpenServerSettings,
    canOpenServerSettingsForServer:
      phase1.roleUi.canOpenServerSettingsForServer,
    canOpenInviteForServer: guildMod.canOpenInviteForServer,
    openServerSurface: phase1.openServerSurface,
    isServerSettingsModalOpen: phase1.isServerSettingsModalOpen,
    isInviteModalOpen: phase1.isInviteModalOpen,
    isMoreServersPinned: phase1.isMoreServersPinned,
    isMoreServersPanelOpen: phase1.isMoreServersPanelOpen,
    inviteModalVoiceChannelId: phase1.inviteModalVoiceChannelId,
    inviteModalVoiceChannelName: phase1.inviteModalVoiceChannelName,
  });
}

/**
 * Realtime session, DM social, guild moderation, server-rail attention.
 */
export function useAppLayoutVoiceAndRealtimeSessionSocial(
  phase1: Phase1,
  lifecycle: AppLayoutVoiceAndRealtimeLifecycle,
  channels: AppLayoutVoiceAndRealtimeChannels,
  railLanding: AppLayoutVoiceAndRealtimeRailLanding,
) {
  const realtimeSession = wireRealtimeSession(
    phase1,
    lifecycle,
    channels,
    railLanding,
  );
  const { dmSocial, handleAcceptMessageRequest, guildMod } =
    wireDmSocialAndModeration(phase1, lifecycle);
  const serverRailAttention = wireServerRailAttention(phase1, guildMod);
  const refreshRoleData = createVoidingInvoker(() =>
    phase1.roleUi.refreshEchoRoleData(),
  );
  const canDeleteCurrentServerComputed = useCanDeleteCurrentEchoServerComputed({
    selectedServer: phase1.selectedServerEcho,
    currentUserId: phase1.currentUserIdForSocket,
  });
  return {
    realtimeSession,
    dmSocial,
    guildMod,
    serverRailAttention,
    expose: {
      ...realtimeSession,
      ...serverRailAttention,
      ...guildMod,
      ...dmSocial,
      dmSocial,
      guildMod,
      handleAcceptMessageRequest,
      refreshRoleData,
      canDeleteCurrentServerComputed,
    },
  };
}

export type AppLayoutVoiceAndRealtimeSessionSocial = ReturnType<
  typeof useAppLayoutVoiceAndRealtimeSessionSocial
>;
