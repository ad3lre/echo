import { useChatMessages } from '@/features/chat/useChatMessages';
import { useAppLayoutDmRailUnread } from '@/features/layout/composables/dm/useAppLayoutDmRailUnread';
import { useAppLayoutLiveChannelCaps } from '../realtime/useAppLayoutLiveChannelCaps';
import { useLiveChannelCapabilitiesRefreshKey } from '../realtime/useLiveChannelCapabilitiesRefreshKey';
import { useAppLayoutDmRailUnreadInputs } from '../dm/useAppLayoutDmRailUnreadInputs';
import { useAppLayoutLandingGridNsfw } from '../moderation/useAppLayoutLandingGridNsfw';
import type { WireAppLayoutDmAndShellResult } from './wireAppLayoutDmAndShell';
import type { AppLayoutVoiceAndRealtimeLifecycle } from './useAppLayoutVoiceAndRealtimeLifecycle';

type Phase1 = WireAppLayoutDmAndShellResult;

function wireDmRail(
  phase1: Phase1,
  dmCallWithUserId: AppLayoutVoiceAndRealtimeLifecycle['callVoiceLayout']['dmCallWithUserId'],
) {
  const dmRailInputs = useAppLayoutDmRailUnreadInputs({
    workspace: phase1.workspace,
    authSession: phase1.authSession,
    dmAttentionByChannelId: phase1.dmAttentionByChannelId,
    readStateByChannelId: phase1.readStateByChannelId,
    currentUserIdForSocket: phase1.currentUserIdForSocket,
    isKnownDmChannelId: phase1.isKnownDmChannelId,
    groupDMs: phase1.groupDMs,
    echoDmPeerByChannelId: phase1.echoDmPeerByChannelId,
    echoDmLastActivityAtMsByChannelId: phase1.echoDmLastActivityAtMsByChannelId,
    echoDmActiveCallParticipantUserIdsByChannelId:
      phase1.echoDmActiveCallParticipantUserIdsByChannelId,
    selectedDMUserId: phase1.selectedDMUserId,
    activeChannelId: phase1.activeChannelId,
    dmCallWithUserId,
    hiddenDmInboxStore: phase1.hiddenDmInboxStore,
    favoriteDmInboxStore: phase1.favoriteDmInboxStore,
    getLatestDmInboxTargetForRailRef: phase1.getLatestDmInboxTargetForRailRef,
  });
  const dmRailUnread = useAppLayoutDmRailUnread({
    workspace: phase1.workspace,
    authSession: phase1.authSession,
    activeChannelId: phase1.activeChannelId,
    activeDmPeerUserId: phase1.selectedDMUserId,
    dmAttentionByChannelId: phase1.dmAttentionByChannelId,
    dmUnreadCountByChannelId: dmRailInputs.dmUnreadByChannelIdForPanel,
    lastActivityAtMsByChannelId: phase1.echoDmLastActivityAtMsByChannelId,
    echoDmPeerByChannelId: phase1.echoDmPeerByChannelId,
    groupDMs: phase1.groupDMs,
    isDmChannelId: (channelId) => phase1.isKnownDmChannelId(channelId),
    isHiddenDmUser: (userId) => phase1.hiddenDmInboxStore.isUserHidden(userId),
    isHiddenDmGroup: (channelId) =>
      phase1.hiddenDmInboxStore.isGroupHidden(channelId),
    activeCallUserIds: dmRailInputs.activeCallUserIds,
    activeCallGroupIds: dmRailInputs.activeCallGroupIds,
  });
  return { dmRailInputs, dmRailUnread };
}

function wireLandingChrome(
  phase1: Phase1,
  lifecycle: AppLayoutVoiceAndRealtimeLifecycle,
) {
  return useAppLayoutLandingGridNsfw({
    workspace: phase1.workspace,
    serverStore: phase1.serverStore,
    activeRailTab: phase1.activeRailTab,
    isAuthenticatedComputed: phase1.isAuthenticatedComputed,
    isGuestComputed: phase1.isGuestComputed,
    sessionEndedMessage: phase1.sessionEndedMessage,
    inviteLandingActiveRef: phase1.inviteLandingActiveRef,
    openServerSurface: phase1.openServerSurface,
    selectExploreTab: phase1.selectExploreTab,
    hydrateEchoFromApi: lifecycle.hydrateEchoFromApi,
    isMoreServersPanelOpen: phase1.isMoreServersPanelOpen,
    isMoreServersCompact: phase1.isMoreServersCompact,
    isDMPanelOpen: phase1.isDMPanelOpen,
    dmPanelWidth: phase1.dmPanelWidth,
    channelPanelCollapsed: phase1.channelPanelCollapsed,
    channelPanelWidth: phase1.channelPanelWidth,
    pfpBarExpanded: phase1.pfpBarExpanded,
    isServerEmptyOnboarding: phase1.isServerEmptyOnboarding,
    isDmUiContext: phase1.isDmUiContext,
    isCompactShell: phase1.isCompactShell,
    isCompactPhoneShell: phase1.isCompactPhoneShell,
    actionRailTopLayout: phase1.actionRailTopLayout,
    hasGuildChannelChrome: phase1.hasGuildChannelChrome,
    isCompactGuildSplitShell: phase1.isCompactGuildSplitShell,
    compactGuildTriPaneChannelPanelOpen:
      phase1.compactGuildTriPaneChannelPanelOpen,
    compactPagerPane: phase1.compactPagerPane,
    memberPanelCollapsed: phase1.memberPanelCollapsed,
    mobileChannelSheetOpen: phase1.mobileChannelSheetOpen,
    mobileMembersOverlayOpen: phase1.mobileMembersOverlayOpen,
    mobileBottomTab: phase1.mobileBottomTab,
    mobileServersStack: phase1.mobileServersStack,
    markMemberPanelExpandedByUser: phase1.markMemberPanelExpandedByUser,
    markMemberPanelCollapsedByUser: phase1.markMemberPanelCollapsedByUser,
    activeChannelId: phase1.activeChannelId,
    effectiveActiveChannel: phase1.effectiveActiveChannel,
    handleGoToChannel: lifecycle.handleGoToChannel,
    getFirstTextChannelId: phase1.getFirstTextChannelId,
    mainContentColumns: phase1.mainContentColumns,
  });
}

/**
 * DM rail unread, live caps, chat messages, landing/grid/NSFW.
 * Wiring-order: `useAppLayoutDmRailUnread`, `useChatMessages`.
 */
export function useAppLayoutVoiceAndRealtimeRailLanding(
  phase1: Phase1,
  lifecycle: AppLayoutVoiceAndRealtimeLifecycle,
) {
  const { dmRailInputs, dmRailUnread } = wireDmRail(
    phase1,
    lifecycle.callVoiceLayout.dmCallWithUserId,
  );
  const liveChannelCapabilitiesRefreshKey =
    useLiveChannelCapabilitiesRefreshKey();
  const liveCaps = useAppLayoutLiveChannelCaps({
    authSession: phase1.authSession,
    activeChannelId: phase1.activeChannelId,
    refreshKey: liveChannelCapabilitiesRefreshKey,
  });
  const { activeChannelMessagesMap, activeChannelMessages } = useChatMessages(
    phase1.activeChannelId,
    phase1.workspace.users,
    phase1.presenceByUserId,
  );
  const landingChrome = wireLandingChrome(phase1, lifecycle);
  return {
    dmRailInputs,
    dmRailUnread,
    liveCaps,
    liveChannelCapabilitiesRefreshKey,
    activeChannelMessagesMap,
    activeChannelMessages,
    landingChrome,
    expose: {
      ...landingChrome,
      dmIncomingRailCluster: dmRailUnread.dmIncomingRailCluster,
      dmRailUnread,
      dmUnreadByChannelIdForPanel: dmRailInputs.dmUnreadByChannelIdForPanel,
      liveCaps,
      liveChannelCapabilities: liveCaps.liveChannelCapabilities,
      liveChannelCapabilitiesRefreshKey,
      activeChannelMessages,
      activeChannelMessagesMap,
      echoCapabilitiesForServerId: phase1.roleUi.echoCapabilitiesForServerId,
      isEchoRoleBootstrapLoading: phase1.roleUi.isEchoRoleBootstrapLoading,
    },
  };
}

export type AppLayoutVoiceAndRealtimeRailLanding = ReturnType<
  typeof useAppLayoutVoiceAndRealtimeRailLanding
>;
