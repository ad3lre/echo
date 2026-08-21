import type { WireAppLayoutVoiceAndRealtimeResult } from './wireAppLayoutVoiceAndRealtime';
import { useAppLayoutProfilesDomain } from '../profiles/useAppLayoutProfilesDomain';
import { useAppLayoutDmProfileBridge } from '../dm/useAppLayoutDmProfileBridge';
import { useAppLayoutUserSettingsModalCallbacks } from './useAppLayoutUserSettingsModalCallbacks';
import { useAppLayoutMemberPopoutChromeCallbacks } from '../members/useAppLayoutMemberPopoutChromeCallbacks';
import { createOpenMemberProfileWithRolesPref } from '../profiles/createOpenMemberProfileWithRolesPref';
import { useAppLayoutMemberSurfaceSwitchLoading } from '../members/useAppLayoutMemberSurfaceSwitchLoading';

type Phase2 = WireAppLayoutVoiceAndRealtimeResult;

function wireProfilesDomain(phase2: Phase2) {
  return useAppLayoutProfilesDomain({
    workspace: {
      ...phase2.workspace,
      refreshEchoSocialFromApi: phase2.refreshEchoSocialFromApi,
      acceptFriendRequest: phase2.acceptFriendRequest,
      declineFriendRequest: phase2.declineFriendRequest,
      cancelFriendRequest: phase2.cancelFriendRequest,
    },
    authSession: phase2.authSession,
    serverStore: phase2.serverStore,
    currentUser: phase2.currentUser,
    activeChannel: phase2.effectiveActiveChannel,
    selectedServerEcho: phase2.selectedServerEcho,
    selectedServerView: phase2.selectedServerView,
    customStatus: phase2.customStatus,
    echoBlockedUserIds: phase2.echoBlockedUserIds,
    isMemberPopoutOpen: phase2.isMemberPopoutOpen,
    isSelfProfilePopoutOpen: phase2.isSelfProfilePopoutOpen,
    isExpandedProfileModalOpen: phase2.isExpandedProfileModalOpen,
    isExpandedProfileSidePanel: phase2.isExpandedProfileSidePanel,
    isGroupOverviewOpen: phase2.isGroupOverviewOpen,
    activeMemberProfile: phase2.activeMemberProfile,
    expandedProfile: phase2.expandedProfile,
    expandedProfileTargetUserId: phase2.expandedProfileTargetUserId,
    profileNotes: phase2.profileNotes,
    memberPopoutAnchor: phase2.memberPopoutAnchor,
    selfProfileAnchor: phase2.selfProfileAnchor,
    selfProfile: phase2.selfProfile,
    isInDMChat: phase2.isInDmThreadOrIdleMainSurface,
    isInDMMode: phase2.isInDMModeComputed,
    leaveDmUiIfViewingUser: phase2.leaveDmUiIfViewingUser,
    canChangeMemberNicknameInServer: phase2.canChangeMemberNicknameInServer,
    hydrateEchoFromApi: phase2.hydrateEchoFromApi,
    refreshEchoRoleData: phase2.refreshRoleData,
    workspaceMembersByServer: phase2.workspaceMembersByServer,
    presenceByUserId: phase2.presenceByUserId,
    presenceMobileByUserId: phase2.presenceMobileByUserId,
  });
}

function wireProfileChrome(
  phase2: Phase2,
  profiles: ReturnType<typeof wireProfilesDomain>,
) {
  useAppLayoutDmProfileBridge({
    dmPartnerUser: phase2.dmPartnerUser,
    isInDmThreadOrIdleMainSurface: phase2.isInDmThreadOrIdleMainSurface,
    isExpandedProfileSidePanel: phase2.isExpandedProfileSidePanel,
    isExpandedProfileModalOpen: phase2.isExpandedProfileModalOpen,
    expandedProfile: phase2.expandedProfile,
    expandedProfileTargetUserId: phase2.expandedProfileTargetUserId,
    isGroupOverviewOpen: phase2.isGroupOverviewOpen,
    isGroupDM: phase2.isGroupDMComputed,
    openExpandedProfilePanelForUserId:
      profiles.openExpandedProfilePanelForUserId,
    activeChannelId: phase2.activeChannelId,
    echoDmPeerByChannelId: phase2.echoDmPeerByChannelId,
    selectedDMUserId: phase2.selectedDMUserId,
    mainSurface: phase2.mainSurface,
    groupDMs: phase2.groupDMs,
  });
  const userSettingsModalCallbacks = useAppLayoutUserSettingsModalCallbacks({
    isSettingsModalOpen: phase2.isSettingsModalOpen,
    settingsModalInitialSection: phase2.settingsModalInitialSection,
    settingsModalActiveSection: phase2.settingsModalActiveSection,
  });
  const memberPopoutChromeCallbacks = useAppLayoutMemberPopoutChromeCallbacks({
    isMemberPopoutOpen: phase2.isMemberPopoutOpen,
    memberPopoutAnchor: phase2.memberPopoutAnchor,
    memberPopoutOpenRolesPanel: phase2.memberPopoutOpenRolesPanel,
  });
  const openMemberProfileForContext = createOpenMemberProfileWithRolesPref({
    memberPopoutOpenRolesPanel: phase2.memberPopoutOpenRolesPanel,
    openMemberProfile: profiles.openMemberProfile,
  });
  const isMemberSurfaceSwitchLoading = useAppLayoutMemberSurfaceSwitchLoading({
    isServerRailFastSwitchPending: phase2.isServerRailFastSwitchPending,
    isGuildShellSettling: phase2.isGuildShellSettling,
    memberListUsers: profiles.memberListUsers,
  });
  return {
    userSettingsModalCallbacks,
    memberPopoutChromeCallbacks,
    openMemberProfileForContext,
    isMemberSurfaceSwitchLoading,
  };
}

/**
 * Profiles domain, DM profile bridge, settings/member-popout chrome.
 * Call before mention autocomplete / search (wiring-order marker).
 */
export function useAppLayoutMessagingProfilesSetup(phase2: Phase2) {
  const profiles = wireProfilesDomain(phase2);
  const chrome = wireProfileChrome(phase2, profiles);
  return {
    ...profiles,
    ...chrome,
    assembly: {
      openMemberProfileForContext: chrome.openMemberProfileForContext,
      activeMemberNote: profiles.activeMemberNote,
      expandedProfileNote: profiles.expandedProfileNote,
      updateProfileNote: profiles.updateProfileNote,
      openSelfProfile: profiles.openSelfProfile,
      openExpandedProfileFromMemberPopout:
        profiles.openExpandedProfileFromMemberPopout,
      openExpandedProfileFromSelfPopout:
        profiles.openExpandedProfileFromSelfPopout,
      openExpandedProfilePanelForUserId:
        profiles.openExpandedProfilePanelForUserId,
      openExtendedProfileModalForUserId:
        profiles.openExtendedProfileModalForUserId,
      expandDmProfileToFullModal: profiles.expandDmProfileToFullModal,
      handleExpandedProfileOpenProfile:
        profiles.handleExpandedProfileOpenProfile,
      handleExpandedProfileOpenDM: profiles.handleExpandedProfileOpenDM,
      isExpandedProfileFriend: profiles.isExpandedProfileFriend,
      handleProfileBlockUser: profiles.handleProfileBlockUser,
      handleProfileUnblockUser: profiles.handleProfileUnblockUser,
      handleProfileReportUser: profiles.handleProfileReportUser,
      isExpandedProfileTargetBlockedComputed:
        profiles.isExpandedProfileTargetBlocked,
      isMemberPopoutTargetBlockedComputed: profiles.isMemberPopoutTargetBlocked,
      handleChangeMemberNicknameFromMemberList:
        profiles.handleChangeMemberNicknameFromMemberList,
      isMemberPopoutFriend: profiles.isMemberPopoutFriend,
      isMemberPopoutCanSendFriendRequest:
        profiles.isMemberPopoutCanSendFriendRequest,
      isExpandedProfileOutgoingRequest:
        profiles.isExpandedProfileOutgoingRequest,
      handleExpandedProfileCancelOutgoingFriendRequest:
        profiles.handleExpandedProfileCancelOutgoingFriendRequest,
      handleExpandedProfileAcceptIncomingFriendRequest:
        profiles.handleExpandedProfileAcceptIncomingFriendRequest,
      handleExpandedProfileDeclineIncomingFriendRequest:
        profiles.handleExpandedProfileDeclineIncomingFriendRequest,
      memberListUsers: profiles.memberListUsers,
      serverSettingsMemberUsers: profiles.serverSettingsMemberUsers,
      usersForChannelPanel: profiles.usersForChannelPanel,
      handleExpandedProfileRemoveFriend:
        profiles.handleExpandedProfileRemoveFriend,
      onExpandedProfileModalUpdate: profiles.onExpandedProfileModalUpdate,
      userSettingsModalCallbacks: chrome.userSettingsModalCallbacks,
      memberPopoutChromeCallbacks: chrome.memberPopoutChromeCallbacks,
      isMemberSurfaceSwitchLoading: chrome.isMemberSurfaceSwitchLoading,
      _handleUpdateCustomStatus: profiles.handleUpdateCustomStatus,
    },
  };
}
