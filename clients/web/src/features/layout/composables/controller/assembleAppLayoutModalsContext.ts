import { computed, unref, type ComputedRef } from 'vue';
import type { AppLayoutModalsProvideDeps } from '@/features/layout/composables/controller/useAppLayoutModalsProvide';
import type { LayoutModalsContext } from '@/features/layout/layoutInjectionKeys';

type ModalsDerived = {
  currentUser: ComputedRef<{
    id?: string;
    name?: string;
    pfp?: string;
    status?: string;
    customStatus?: string;
    bannerImage?: string;
    bannerColor?: string;
    bannerRefractionEnabled?: boolean;
    bannerBlurEnabled?: boolean;
    bannerBlackoutEnabled?: boolean;
  } | null>;
  groupSettingsName: LayoutModalsContext['groupSettingsName'];
  groupSettingsPfp: LayoutModalsContext['groupSettingsPfp'];
  moderationCanPurgeBanMessages: LayoutModalsContext['moderationCanPurgeBanMessages'];
  serverSettingsGuildStructureEnabled: LayoutModalsContext['serverSettingsGuildStructureEnabled'];
  expandedProfileHideOpenDmButton: ComputedRef<boolean>;
};

export function assembleModalsAuthAndAddServer(
  deps: AppLayoutModalsProvideDeps,
  derived: Pick<ModalsDerived, 'currentUser'>,
) {
  return {
    profileSurfaceAdapter: deps.profileSurfaceAdapter,
    currentUser: derived.currentUser,
    onOpenSettingsFromProfileBar: deps.openUserSettingsModal,
    isAuthModalOpen: deps.isAuthModalOpen,
    authModalInitialLoginEntry: deps.authModalInitialLoginEntry,
    authModalPasskeyOnOpen: deps.authModalPasskeyOnOpen,
    authModalInitialTab: deps.authModalInitialTab,
    authModalInitialSubView: deps.authModalInitialSubView,
    onUpdateAuthModal: (next: boolean) => {
      deps.isAuthModalOpen.value = next;
    },
    isAddServerModalOpen: deps.isAddServerModalOpen,
    addServerInitialView: deps.addServerInitialView,
    canImportDiscord: true,
    discoverableServers: deps.exploreDiscoverableServers,
    onUpdateAddServerModal: (next: boolean) => {
      deps.isAddServerModalOpen.value = next;
    },
    onRequestDiscordLinkFromAddServer:
      deps.openUserSettingsToDiscordFromAddServer,
    onCreateServer: deps.handleCreateServer,
    onJoinDiscoverableServer: deps.handleJoinDiscoverableServer,
    onJoinWithInviteLink: deps.handleJoinWithInviteLink,
    addServerJoinError: deps.addServerJoinError,
    addServerCreateBusy: deps.addServerCreateBusy,
    addServerJoinBusy: deps.addServerJoinBusy,
    addServerJoinInvitePrefill: deps.addServerJoinInvitePrefill,
    exploreDirectoryJoinBusy: deps.exploreDirectoryJoinBusy,
  };
}

export function assembleModalsInviteAndServerSettings(
  deps: AppLayoutModalsProvideDeps,
  derived: Pick<ModalsDerived, 'serverSettingsGuildStructureEnabled'>,
) {
  return {
    isInviteModalOpen: deps.isInviteModalOpen,
    selectedServerName: computed(
      () => deps.selectedServer.value?.name ?? 'this server',
    ),
    inviteLink: deps.inviteLinkForServer,
    inviteLinkLookupPending: deps.inviteLinkLookupPending,
    inviteApplicationsEnabled: deps.inviteApplicationsEnabled,
    inviteJoinLinksEnabled: deps.inviteJoinLinksEnabled,
    inviteCanCreateDirectHexInvite: deps.inviteCanCreateDirectHexInvite,
    inviteDirectHexInviteLink: deps.directHexInviteLink,
    inviteDirectHexInviteBusy: deps.directHexInviteBusy,
    onCreateInviteDirectHex: deps.createDirectHexInvite,
    inviteModalVoiceChannelId: deps.inviteModalVoiceChannelId,
    inviteModalVoiceChannelName: deps.inviteModalVoiceChannelName,
    inviteableFriends: deps.inviteableFriends,
    onUpdateInviteModal: (next: boolean) => {
      deps.isInviteModalOpen.value = next;
    },
    onInviteFriend: deps.handleInviteFriend,
    isServerSettingsModalOpen: deps.isServerSettingsModalOpen,
    selectedServerForSettings: computed(() => {
      const s = deps.selectedServer.value;
      return s && s.id !== 'echo' ? s : null;
    }),
    memberListUsers: deps.memberListUsers,
    serverSettingsMemberUsers: deps.serverSettingsMemberUsersResolved,
    resolveMemberHighestRole: deps.memberListResolveHighestRole,
    canModerateMemberAction: deps.canModerateMemberActionInServer,
    onRequestModerateMember: deps.handleModerateUser,
    onUpdateServerSettingsModal: deps.onServerSettingsModalUpdate,
    serverSettingsModalInitialSection: deps.serverSettingsModalInitialSection,
    onUpdateServerSettingsModalActiveSection:
      deps.onServerSettingsModalActiveSectionUpdate,
    serverSettingsCanManageRoles: deps.serverSettingsCanManageRoles,
    serverSettingsCanManageServer: deps.serverSettingsCanManageServer,
    deleteServerEnabled: deps.canDeleteCurrentServer,
    onEchoWorkspaceRefresh: () => void deps.hydrateEchoFromApi(),
    onEchoRoleCatalogRefresh: () => void deps.refreshEchoRoleData(),
    onServerDeleted: deps.handleServerDeleted,
    onPreviewRoleFromSettings: deps.handleStartRolePreview,
    serverSettingsGuildStructureEnabled:
      derived.serverSettingsGuildStructureEnabled,
    serverSettingsStructureCategories: deps.categoriesForServer,
    serverSettingsOnChannelReorder: deps.handleChannelReorder,
    serverSettingsOnCategoryReorder: deps.handleCategoryReorder,
    serverSettingsIsDiscordImportedServer: computed(() => {
      const s = deps.selectedServer.value;
      return !!s?.discordGuildId?.trim();
    }),
  };
}

export function assembleModalsGroupAndUserSettings(
  deps: AppLayoutModalsProvideDeps,
  derived: Pick<ModalsDerived, 'groupSettingsName' | 'groupSettingsPfp'>,
) {
  return {
    isGroupDmSettingsOpen: deps.isGroupDMSettingsOpen,
    groupDmSettingsInitialFocus: deps.groupDmSettingsInitialFocus,
    groupSettingsId: deps.groupSettingsId,
    groupSettingsName: derived.groupSettingsName,
    groupSettingsPfp: derived.groupSettingsPfp,
    groupSettingsMembers: deps.groupSettingsMembers,
    onUpdateGroupDmSettingsOpen: (next: boolean) => {
      deps.isGroupDMSettingsOpen.value = next;
      if (!next) deps.groupDmSettingsInitialFocus.value = null;
    },
    onUpdateGroupFromSettings: deps.handleUpdateGroupFromSettings,
    onRemoveGroupDmMember: deps.onRemoveGroupDmMember,
    onLeaveGroupDm: deps.handleLeaveGroupDm,
    onOpenAddMembersToGroupDm: deps.onOpenAddMembersToGroupDm,
    isGroupDmModalOpen: deps.isGroupDMModalOpen,
    dmGroupFriends: deps.dmGroupFriends,
    groupDmPreselectedIds: deps.groupDMPreselectedIds,
    groupDmLockedIds: deps.groupDMLockedIds,
    groupDmMaxMembers: deps.groupDmMaxMembers,
    onUpdateGroupDmModal: (next: boolean) => {
      deps.isGroupDMModalOpen.value = next;
    },
    onCreateGroupDm: deps.handleCreateGroupDM,
    isSettingsModalOpen: deps.isSettingsModalOpen,
    settingsModalInitialSection: deps.settingsModalInitialSection,
    onUpdateSettingsModal: deps.onUserSettingsModalUpdate,
    onUpdateSettingsModalActiveSection: deps.onSettingsModalActiveSectionUpdate,
    onSettingsGuestUpgraded: () => void deps.onGuestAccountUpgraded(),
    onSettingsGuestSignInExisting: deps.onGuestUpgradeSignInFromSettings,
  };
}

export function assembleModalsPopouts(deps: AppLayoutModalsProvideDeps) {
  return {
    isDmUiContext: deps.isDmUiContext,
    isMemberPopoutOpen: deps.isMemberPopoutOpen,
    isMemberPopoutFriend: deps.isMemberPopoutFriend,
    isMemberPopoutCanSendFriendRequest: deps.isMemberPopoutCanSendFriendRequest,
    activeMemberProfile: deps.activeMemberProfile,
    memberPopoutAnchor: deps.memberPopoutAnchor,
    activeMemberNote: deps.activeMemberNote,
    memberListRoleManagement: deps.memberListRoleManagement,
    memberPopoutOpenRolesPanel: deps.memberPopoutOpenRolesPanel,
    onUpdateMemberPopoutOpen: deps.onMemberPopoutOpenUpdate,
    onUpdateMemberNote: (note: string) =>
      deps.updateProfileNote(unref(deps.activeMemberProfile)?.id ?? null, note),
    onOpenExpandedProfileFromMemberPopout:
      deps.openExpandedProfileFromMemberPopout,
    onMemberPopoutQuickDm: (p: { userId: string; text: string }) =>
      void deps.handleMemberPopoutQuickDm(p.userId, p.text),
    onMemberPopoutOpenDm: (userId: string) =>
      void deps.handleExpandedProfileOpenDM(userId),
    onMemberPopoutSendFriendRequest:
      deps.handleExpandedProfileSendFriendRequest,
    isSelfProfilePopoutOpen: deps.isSelfProfilePopoutOpen,
    selfProfile: deps.selfProfile,
    selfProfileAnchor: deps.selfProfileAnchor,
    customStatus: deps.customStatus,
    onUpdateSelfProfilePopoutOpen: (next: boolean) => {
      deps.isSelfProfilePopoutOpen.value = next;
    },
    onUpdateCustomStatus: deps.handleUpdateCustomStatus,
    onUpdateCurrentUserStatus: deps.updateCurrentUserStatus,
    onOpenExpandedProfileFromSelfPopout: deps.openExpandedProfileFromSelfPopout,
  };
}

export function assembleModalsExpandedProfile(
  deps: AppLayoutModalsProvideDeps,
  derived: Pick<ModalsDerived, 'expandedProfileHideOpenDmButton'>,
) {
  return {
    isExpandedProfileSidePanel: deps.isExpandedProfileSidePanel,
    isExpandedProfileModalOpen: deps.isExpandedProfileModalOpen,
    expandedProfilePresenceByUserId: deps.presenceByUserId,
    expandedProfilePresenceMobileByUserId: deps.presenceMobileByUserId,
    expandedProfile: deps.expandedProfile,
    isExpandedProfileFriend: deps.isExpandedProfileFriend,
    isExpandedProfileOutgoingRequest: deps.isExpandedProfileOutgoingRequest,
    friendshipKnown: deps.friendshipKnown,
    friendIds: computed(() => deps.workspace.friendIds.value),
    friendIdsByUserId: computed(() => deps.workspace.friendIdsByUserId.value),
    friendRequestsIncoming: computed(
      () => deps.workspace.friendRequestsIncoming.value,
    ),
    friendRequestsOutgoing: computed(
      () => deps.workspace.friendRequestsOutgoing.value,
    ),
    blockedUserIds: computed(() => deps.workspace.blockedUserIds.value),
    expandedProfileNote: deps.expandedProfileNote,
    onUpdateExpandedProfileNote: deps.handleExpandedProfileNoteFromLayout,
    onExpandedProfileModalUpdate: deps.onExpandedProfileModalUpdate,
    onOpenEditProfileFromExpandedProfile: () => {
      deps.onExpandedProfileModalUpdate(false);
      deps.openUserSettingsModal('Profile');
    },
    onExpandedProfileOpenServer: deps.handleExpandedProfileOpenServer,
    onExpandedProfileOpenProfile: deps.handleExpandedProfileOpenProfile,
    onExpandedProfileOpenDm: deps.handleExpandedProfileOpenDM,
    onExpandedProfileSendFriendRequest:
      deps.handleExpandedProfileSendFriendRequest,
    onExpandedProfileCancelOutgoingFriendRequest:
      deps.handleExpandedProfileCancelOutgoingFriendRequest,
    onExpandedProfileAcceptIncomingFriendRequest:
      deps.handleExpandedProfileAcceptIncomingFriendRequest as unknown as (
        userId: string,
      ) => void,
    onExpandedProfileDeclineIncomingFriendRequest:
      deps.handleExpandedProfileDeclineIncomingFriendRequest as unknown as (
        userId: string,
      ) => void,
    onExpandedProfileRemoveFriend: deps.handleExpandedProfileRemoveFriend,
    isExpandedProfileTargetBlocked: deps.isExpandedProfileTargetBlocked,
    guestFriendsLocked: deps.guestFriendsLocked,
    expandedProfileHideOpenDmButton: derived.expandedProfileHideOpenDmButton,
    isMemberPopoutTargetBlocked: deps.isMemberPopoutTargetBlocked,
    currentUserIdForProfiles: computed(() => unref(deps.currentUser)?.id),
    onProfileBlockUser: deps.handleProfileBlockUser,
    onProfileUnblockUser: deps.handleProfileUnblockUser,
    onProfileReportUser: deps.handleProfileReportUser,
  };
}

export function assembleModalsModerationAndEvents(
  deps: AppLayoutModalsProvideDeps,
  derived: Pick<ModalsDerived, 'moderationCanPurgeBanMessages'>,
) {
  return {
    moderationModalOpen: deps.moderationModalOpen,
    moderationAction: deps.moderationAction,
    moderationTargetUser: deps.moderationTargetUser,
    moderationServerName: computed(
      () => deps.selectedServer.value?.name ?? 'Server',
    ),
    moderationCanPurgeBanMessages: derived.moderationCanPurgeBanMessages,
    onUpdateModerationModalOpen: (v: boolean) => {
      deps.moderationModalOpen.value = v;
    },
    onModerationModalConfirm: deps.onModerationModalConfirm,
    isLeaveServerModalOpen: deps.isLeaveServerModalOpen,
    leaveServerModalVariant: deps.leaveServerModalVariant,
    leaveServerModalServerName: deps.leaveServerModalServerName,
    onUpdateLeaveServerModal: deps.onLeaveServerModalUpdate,
    onLeaveServerModalConfirm: deps.confirmLeaveServerFromModal,
    isJoinServerConfirmModalOpen: deps.isJoinServerConfirmModalOpen,
    joinServerConfirmPreview: deps.joinServerConfirmPreview,
    joinServerConfirmBusy: deps.joinServerConfirmBusy,
    onUpdateJoinServerConfirmModal: deps.onJoinServerConfirmModalUpdate,
    onJoinServerConfirmModalConfirm: deps.confirmJoinServerFromModal,
    isServerApplicationModalOpen: deps.isServerApplicationModalOpen,
    serverApplicationPayload: deps.serverApplicationPayload,
    serverApplicationBusy: deps.serverApplicationBusy,
    onUpdateServerApplicationModal: deps.onServerApplicationModalUpdate,
    onServerApplicationModalSubmitted:
      deps.confirmServerApplicationSubmittedFromModal,
    isEventDetailModalOpen: deps.isEventDetailModalOpen,
    eventDetailView: deps.eventDetailView,
    onUpdateEventDetailModal: (next: boolean) => {
      if (next) {
        deps.isEventDetailModalOpen.value = true;
        return;
      }
      deps.closeGuildEventDetailModal();
    },
    onEventDetailRsvp: (payload: { status: 'going' | 'declined' }) => {
      const ev = deps.eventDetailView.value;
      if (!ev) return;
      void deps.submitGuildEventRsvp({
        serverId: ev.serverId,
        eventId: ev.eventId,
        status: payload.status,
        closeDetailOnDecline: payload.status === 'declined',
      });
    },
    onEventDetailOpenLocation: () => {
      const ev = deps.eventDetailView.value;
      if (!ev) return;
      deps.closeGuildEventDetailModal();
      deps.isDMPanelOpen.value = false;
      deps.navigateGuildEventOpenPayload({
        serverId: ev.serverId,
        channelId: ev.channelId,
        customLocation: ev.customLocation,
      });
    },
  };
}

export function assembleAppLayoutModalsContext(
  deps: AppLayoutModalsProvideDeps,
  derived: ModalsDerived,
): LayoutModalsContext {
  return {
    ...assembleModalsAuthAndAddServer(deps, derived),
    ...assembleModalsInviteAndServerSettings(deps, derived),
    ...assembleModalsGroupAndUserSettings(deps, derived),
    ...assembleModalsPopouts(deps),
    ...assembleModalsExpandedProfile(deps, derived),
    ...assembleModalsModerationAndEvents(deps, derived),
  } as LayoutModalsContext;
}
