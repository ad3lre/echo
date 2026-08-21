import { useAppLayoutShellNavigation } from './useAppLayoutShellNavigation';
import { useHasGuildChannelChromeComputed } from '../shell/useHasGuildChannelChromeComputed';
import { useAppLayoutGuildMobileVcLobby } from '../voice/useAppLayoutGuildMobileVcLobby';
import { useAppLayoutVoiceChannelForParticipantsComputed } from '../voice/useAppLayoutVoiceChannelForParticipantsComputed';
import { useAppLayoutCallVoiceBridge } from './useAppLayoutCallVoiceBridge';
import type { AppLayoutDmAndShellSession } from './useAppLayoutDmAndShellSession';
import type { AppLayoutDmAndShellRolesTree } from './useAppLayoutDmAndShellRolesTree';
import type { AppLayoutDmAndShellEchoDm } from './useAppLayoutDmAndShellEchoDm';

function wireShellNavigation(
  session: AppLayoutDmAndShellSession,
  roles: AppLayoutDmAndShellRolesTree,
  echoDm: AppLayoutDmAndShellEchoDm,
) {
  const { uiState } = session;
  return useAppLayoutShellNavigation({
    base: import.meta.env.BASE_URL,
    activeRailTab: uiState.activeRailTab,
    isDMPanelOpen: uiState.isDMPanelOpen,
    isMoreServersPanelOpen: uiState.isMoreServersPanelOpen,
    pfpBarExpanded: uiState.pfpBarExpanded,
    activeChannelId: uiState.activeChannelId,
    selectedDMUserId: uiState.selectedDMUserId,
    dmActiveTab: uiState.dmActiveTab,
    selectedMessageRequestId: uiState.selectedMessageRequestId,
    serverStore: session.serverStore,
    workspace: session.workspace,
    authSession: session.authSession,
    echoDmThreadIds: echoDm.echoDmThreadIds,
    echoDmPeerByChannelId: echoDm.echoDmPeerByChannelId,
    selectDmUser: echoDm.selectDmUser,
    getLatestDmPeerUserIdForRail: echoDm.getLatestDmPeerUserIdForRail,
    getLatestDmInboxTargetForRail: () =>
      echoDm.getLatestDmInboxTargetForRailRef.value(),
    selectGroupDMFromRail: (channelId: string) =>
      echoDm.selectGroupDmForIncomingRail.value?.(channelId),
    findChannelContextById: roles.findChannelContextById,
    getFirstTextChannelId: roles.getFirstTextChannelId,
    canOpenServerSettingsForServer: roles.roleUi.canOpenServerSettingsForServer,
    isSettingsModalOpen: uiState.isSettingsModalOpen,
    settingsModalInitialSection: uiState.settingsModalInitialSection,
    settingsModalActiveSection: uiState.settingsModalActiveSection,
    isServerSettingsModalOpen: uiState.isServerSettingsModalOpen,
    serverSettingsModalInitialSection:
      uiState.serverSettingsModalInitialSection,
    serverSettingsModalActiveSection: uiState.serverSettingsModalActiveSection,
    dmCallWithUserId: echoDm.dmCallWithUserIdForShellLog,
    navDiagnosticsTraceId: session.navTraceId,
    selectGroupDmForIncomingRail: echoDm.selectGroupDmForIncomingRail,
    isGuestUser: () => session.authSession.backendUser?.isGuest === true,
    onGuestDmBlocked: () => session.openGuestUpgradeForDmRef.value?.(),
    isCompactShell: session.isCompactShell,
    isCompactPhoneShell: session.isCompactPhoneShell,
    mobileBottomTab: session.mobileBottomTab,
    mobileHomeStack: session.mobileHomeStack,
    inviteLandingActive: session.inviteLandingActiveComputed,
  });
}

/**
 * Shell navigation + call/voice bridge. Call after echo-DM selection.
 * Contains wiring-order markers for shell nav / voice channel / call voice.
 */
export function useAppLayoutDmAndShellNavVoice(
  session: AppLayoutDmAndShellSession,
  roles: AppLayoutDmAndShellRolesTree,
  echoDm: AppLayoutDmAndShellEchoDm,
) {
  const shellNav = wireShellNavigation(session, roles, echoDm);
  const hasGuildChannelChrome = useHasGuildChannelChromeComputed(
    shellNav.mainSurface,
  );
  const guildMobile = useAppLayoutGuildMobileVcLobby({
    hasGuildChannelChrome,
    isCompactShell: session.isCompactShell,
    compactGuildTriPaneChannelPanelOpen:
      session.compactGuildTriPaneChannelPanelOpen,
    compactPagerPane: session.compactPagerPane,
    guildMobileVcLobby: session.guildMobileVcLobby,
    activeChannelId: session.uiState.activeChannelId,
    currentVoiceChannelId: session.uiState.currentVoiceChannelId,
  });
  const voiceChannelForParticipants =
    useAppLayoutVoiceChannelForParticipantsComputed({
      currentVoiceChannelId: session.uiState.currentVoiceChannelId,
      findChannelContextById: roles.findChannelContextById,
      effectiveActiveChannel: echoDm.effectiveActiveChannel,
    });
  const callVoice = wireCallVoice(
    session,
    roles,
    echoDm,
    shellNav,
    hasGuildChannelChrome,
    voiceChannelForParticipants,
  );
  return {
    ...shellNav,
    hasGuildChannelChrome,
    ...guildMobile,
    voiceChannelForParticipants,
    callVoice,
  };
}

function wireCallVoice(
  session: AppLayoutDmAndShellSession,
  roles: AppLayoutDmAndShellRolesTree,
  echoDm: AppLayoutDmAndShellEchoDm,
  shellNav: ReturnType<typeof useAppLayoutShellNavigation>,
  hasGuildChannelChrome: ReturnType<typeof useHasGuildChannelChromeComputed>,
  voiceChannelForParticipants: ReturnType<
    typeof useAppLayoutVoiceChannelForParticipantsComputed
  >,
) {
  const { uiState, layoutDims } = session;
  return useAppLayoutCallVoiceBridge({
    workspace: session.workspace,
    authSession: session.authSession,
    mainSurface: shellNav.mainSurface,
    activeChannelId: uiState.activeChannelId,
    selectedDMUserId: uiState.selectedDMUserId,
    groupDMs: uiState.groupDMs,
    echoDmPeerByChannelId: echoDm.echoDmPeerByChannelId,
    echoDmActiveCallParticipantUserIdsByChannelId:
      echoDm.echoDmActiveCallParticipantUserIdsByChannelId,
    mergeRealtimeDmThread: echoDm.mergeEchoDmThreadFromRealtime,
    selectedServerEcho: roles.selectedServerEcho,
    voiceChannelForParticipants,
    currentVoiceChannelId: uiState.currentVoiceChannelId,
    currentVoiceChannelName: uiState.currentVoiceChannelName,
    vcMuted: uiState.vcMuted,
    vcDeafened: uiState.vcDeafened,
    micTestListenDeafenActive: uiState.micTestListenDeafenActive,
    setMicTestListenDeafen: uiState.setMicTestListenDeafen,
    applyVcDeafened: uiState.applyVcDeafened,
    applyVcMuted: uiState.applyVcMuted,
    vcVideo: uiState.vcVideo,
    vcScreenshare: uiState.vcScreenshare,
    isScreenSharePickerOpen: uiState.isScreenSharePickerOpen,
    isDesktopStreamingControlOpen: uiState.isDesktopStreamingControlOpen,
    desktopStreamingControlMode: uiState.desktopStreamingControlMode,
    onJoinVoice: uiState.onJoinVoice,
    onLeaveVoice: uiState.onLeaveVoice,
    isDmUiContext: session.isDmUiContext,
    voiceSideChatCollapsed: layoutDims.voiceSideChatCollapsed,
    toggleVoiceSideChat: layoutDims.toggleVoiceSideChat,
    categoriesForServer: roles.categoriesForServer,
    getFirstTextChannelId: roles.getFirstTextChannelId,
    findChannelContextById: roles.findChannelContextById,
    roleUi: roles.roleUi,
    resolvePreviewChannelPermission: roles.resolvePreviewChannelPermission,
    navigateToDmForAnswer: (targetId) =>
      echoDm.navigateToDmForAnswerRef.value(targetId),
    isCompactShell: session.isCompactShell,
    hasGuildChannelChrome,
    vcActivityUi: uiState.vcActivityUi,
    applyVcYoutubeWatchTogetherRemote:
      echoDm.applyVcYoutubeWatchTogetherRemoteOnVoice,
    applyVcWatchTogetherRemote: echoDm.applyVcWatchTogetherRemoteOnVoice,
    closeVcActivity: uiState.closeVcActivity,
  });
}

export type AppLayoutDmAndShellNavVoice = ReturnType<
  typeof useAppLayoutDmAndShellNavVoice
>;
