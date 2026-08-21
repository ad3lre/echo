import { computed, unref } from 'vue';
import type { ChannelSummary } from '@shared/types';
import { resolveEchoServerIdContainingChannel } from '@/features/voice/resolveEchoServerIdForGuildChannel';
import type { AppLayoutChatSurfaceProvideDeps } from '@/features/layout/composables/messaging/useAppLayoutChatSurfaceProvide';
import type { LayoutChatSurfaceContext } from '@/features/layout/layoutInjectionKeys';

export function assembleChatSurfaceShell(
  deps: AppLayoutChatSurfaceProvideDeps,
  derived: {
    surfaceSwitchLoading: LayoutChatSurfaceContext['surfaceSwitchLoading'];
    dmThreadSwitchLoading: LayoutChatSurfaceContext['dmThreadSwitchLoading'];
  },
) {
  return {
    dmSurfaceAdapter: deps.dmSurfaceAdapter,
    profileSurfaceAdapter: deps.profileSurfaceAdapter,
    chatHeaderAdapter: deps.chatHeaderAdapter,
    mainSurface: deps.mainSurface,
    callOverlay: deps.callOverlay,
    surfaceSwitchLoading: derived.surfaceSwitchLoading,
    guildShellSettling: deps.isGuildShellSettling,
    dmThreadSwitchLoading: derived.dmThreadSwitchLoading,
    channelPanelCollapsed: deps.channelPanelCollapsed,
    memberPanelCollapsed: deps.memberPanelCollapsedEffective,
    memberPanelCollapsedRaw: deps.memberPanelCollapsed,
    compactGuildTriPaneNav: deps.useCompactTriPaneShell,
    compactGuildSplitNav: deps.useCompactGuildSplitShell,
    isCompactShell: deps.isCompactShell,
    narrowChannelPanelForActivityOverflowStep:
      deps.narrowChannelPanelForActivityOverflowStep,
    isDmUiContext: deps.isDmUiContext,
    isInDMMode: deps.isInDMMode,
    isViewingVoiceChannel: deps.isViewingVoiceChannel,
    startMemberResize: deps.startMemberResize,
    resetMemberWidth: deps.resetMemberWidth,
    effectiveActiveChannel: deps.effectiveActiveChannel,
    liveChannelCapabilities: deps.liveChannelCapabilities,
    isInDMChat: deps.isInDMChat,
    dmCallMatchesActiveChannel: deps.dmCallMatchesActiveChannel,
    activeDmThreadCallUi: deps.activeDmThreadCallUi,
    isExpandedProfileSidePanel: deps.isExpandedProfileSidePanel,
    isExpandedProfileModalOpen: deps.isExpandedProfileModalOpen,
    isGroupOverviewOpen: deps.isGroupOverviewOpen,
    dmPartnerUser: deps.dmPartnerUser,
    openExpandedProfilePanelForUserId: deps.openExpandedProfilePanelForUserId,
    openExtendedProfileModalForUserId: deps.openExtendedProfileModalForUserId,
    handleExpandedProfileOpenProfile: deps.handleExpandedProfileOpenProfile,
    isGroupDM: deps.isGroupDM,
    activeGroupDM: deps.activeGroupDM,
    icons: deps.icons,
    dmActiveTab: deps.dmActiveTab,
  };
}

export function assembleChatSurfaceHeaderSearch(
  deps: AppLayoutChatSurfaceProvideDeps,
  derived: { getChannelDisplayName: (name?: string) => string },
) {
  return {
    getChannelIcon: deps.getChannelIcon,
    getChannelDisplayName: derived.getChannelDisplayName,
    togglePinsDropdown: deps.togglePinsDropdown,
    expandChannels: deps.openChannelPaneFromHeader,
    handleMinimizeVoiceView: deps.handleMinimizeVoiceView,
    collapseMembers: deps.collapseMembers,
    expandMembers: deps.expandMembers,
    isRolePreviewActiveForServer: deps.isRolePreviewActiveForServer,
    rolePreview: deps.rolePreview,
    clearRolePreview: deps.clearRolePreview,
    memberPanelWidth: deps.memberPanelWidth,
    searchText: deps.searchText,
    filterChips: deps.filterChips,
    allChannels: deps.allChannels,
    users: computed(() => deps.workspace.users.value),
    usersForMentionAutocomplete: deps.usersForMentionAutocomplete,
    rolesForMentionAutocomplete: deps.rolesForMentionAutocomplete,
    paginatedSearchResults: deps.paginatedSearchResults,
    searchResultMessagesCount: computed(
      () => unref(deps.searchResultMessages).length,
    ),
    searchResultPage: deps.searchResultPage,
    totalPages: deps.totalPages,
    selectedServerName: computed(() => deps.selectedServer.value?.name ?? ''),
    onSearchInput: deps.onSearchInput,
    addFilter: deps.addFilter,
    removeFilter: deps.removeFilter,
    clearSearch: deps.clearSearch,
    goToSearchPage: deps.goToSearchPage,
    handleGoToMessage: deps.handleGoToMessage,
    searchLoading: deps.searchLoading,
    searchError: deps.searchError,
    searchScopeHint: deps.searchScopeHint,
  };
}

export function assembleChatSurfaceDmCall(
  deps: AppLayoutChatSurfaceProvideDeps,
  derived: { currentUser: LayoutChatSurfaceContext['currentUser'] },
) {
  return {
    dmCallWithUserId: deps.dmCallWithUserId,
    dmCallRinging: deps.dmCallRinging,
    dmCallAwaitingAccept: deps.dmCallAwaitingAccept,
    dmCallRingUi: deps.dmCallRingUi,
    dmCallLobbyAfterSelfLeave: deps.dmCallLobbyAfterSelfLeave,
    dmCallIncoming: deps.dmCallIncoming,
    dmCallRingRemoteVanishing: deps.dmCallRingRemoteVanishing,
    endDmCall: deps.endDmCall,
    leaveDmCallVoice: deps.leaveDmCallVoice,
    rejoinDmCallVoice: deps.rejoinDmCallVoice,
    answerDmCall: deps.answerDmCall,
    declineDmCall: deps.declineDmCall,
    startDmCall: deps.startDmCall,
    isPinsDropdownOpen: deps.isPinsDropdownOpen,
    pinsButtonRefDm: deps.pinsButtonRefDm,
    pinsButtonRefServer: deps.pinsButtonRefServer,
    openGroupDMModal: deps.openGroupDMModal,
    startGroupCall: deps.startGroupCall,
    openGroupOverviewPanel: ((gid?: string) =>
      deps.openGroupOverviewPanel(gid ?? '')) as (groupId?: string) => void,
    activeGroupCallMembers: deps.activeGroupCallMembers,
    currentUser: derived.currentUser,
    linkedDiscordUserId: deps.linkedDiscordUserId,
    dmCallVideo: deps.dmCallVideo,
    dmCallScreenshare: deps.dmCallScreenshare,
    dmCallMuted: deps.dmCallMuted,
    dmCallDeafened: deps.dmCallDeafened,
    vcMuted: deps.channelPanelVcMutedEffective,
    vcDeafened: deps.channelPanelVcDeafenedEffective,
    vcVideo: deps.channelPanelVcVideoEffective,
    vcScreenshare: deps.channelPanelVcScreenshareEffective,
    onToggleDmCallVideo: () => deps.onDmCallVcVideo(!unref(deps.dmCallVideo)),
    onToggleDmCallScreenshare: () =>
      deps.onDmCallVcScreenshare(!unref(deps.dmCallScreenshare)),
    onToggleDmCallMuted: deps.toggleDmCallMuted,
    onToggleDmCallDeafened: () =>
      deps.applyDmCallDeafened(!unref(deps.dmCallDeafened)),
    onGuildChannelVcMuted: deps.onGuildChannelVcMuted,
    onGuildChannelVcDeafened: deps.onGuildChannelVcDeafened,
    onGuildChannelVcVideo: (next: boolean) => {
      deps.onGuildChannelVcVideo(next);
    },
    onGuildChannelVcScreenshare: (next: boolean) => {
      deps.onGuildChannelVcScreenshare(next);
    },
    handleChannelVoicePanelLeave: deps.handleChannelVoicePanelLeave,
    onSetDmCallFullscreen: (next: boolean) => {
      deps.dmCallFullscreen.value = next;
    },
    dmCallCallViewParticipants: deps.dmCallCallViewParticipants,
    pinsDropdownRect: deps.pinsDropdownRect,
    pinnedMessagesForDropdown: deps.pinnedMessagesForDropdown,
    pinPreview: deps.pinPreview,
    presenceByUserId: deps.presenceByUserId,
    presenceMobileByUserId: deps.presenceMobileByUserId,
    closePinsDropdown: deps.closePinsDropdown,
    goToPinnedMessage: deps.goToPinnedMessage,
  };
}

export function assembleChatSurfaceMessages(
  deps: AppLayoutChatSurfaceProvideDeps,
) {
  return {
    activeVoiceChannelParticipants: deps.activeVoiceChannelParticipants,
    selectedServerId: computed(
      () =>
        deps.serverStore.selectedServerId ??
        deps.selectedServer.value?.id ??
        'echo',
    ),
    activeChannelMessagesMap: deps.activeChannelMessagesMap,
    sendMessage: deps.sendMessage,
    onRequestForward: deps.openForwardMessagePicker,
    voiceSideChatCollapsed: deps.voiceSideChatCollapsed,
    voiceSideChatWidth: deps.voiceSideChatWidth,
    startVoiceSideChatResize: deps.startVoiceSideChatResize,
    resetVoiceSideChatWidth: deps.resetVoiceSideChatWidth,
    expandVoiceSideChat: deps.expandVoiceSideChat,
    toggleVoiceSideChat: deps.toggleVoiceSideChat,
    voiceMobileSheetLevel: deps.voiceMobileSheetLevel,
    bumpVoiceMobileChatFromCallScrollUp:
      deps.bumpVoiceMobileChatFromCallScrollUp,
    bumpVoiceMobileChatFromCallScrollDown:
      deps.bumpVoiceMobileChatFromCallScrollDown,
    voiceMobileDockReservePx: deps.voiceMobileDockReservePxComputed,
    currentVoiceChannelId: deps.currentVoiceChannelId,
    handleCallViewOpenProfile: deps.handleCallViewOpenProfile,
    canModerateVcParticipant: deps.canModerateMemberInServer,
    canVcModerateParticipantAction: deps.canVcModerateMember,
    handleVcModerate: deps.handleVcModerate,
    handlePollVote: deps.handlePollVote,
    editMessage: deps.editMessage,
    deleteMessage: deps.deleteMessage,
    handleReact: deps.handleReact,
    topReactions: deps.topReactions,
    removeReactionFavorite: deps.removeReactionFavorite,
    handleGoToChannel: deps.handleGoToChannel,
    openServerSurfaceForChannel: (channelId: string) => {
      const cid = channelId.trim();
      if (!cid) return;
      const sid = resolveEchoServerIdContainingChannel(
        cid,
        deps.workspace.categoriesByServer.value,
      );
      if (sid && sid !== 'echo') {
        deps.openServerSurface(sid, cid);
        return;
      }
      deps.handleGoToChannel(cid);
    },
    focusGuildVoiceChannelInSidebar: deps.focusGuildVoiceChannelInSidebar,
    openMemberProfile: deps.openMemberProfile,
    openProfileFromContextMenu: deps.openProfileFromContextMenu,
    canModerateAuthor: deps.canModerateMessageAuthor,
    handleModerateUser: deps.handleModerateUser,
  };
}

export function assembleChatSurfaceSocial(
  deps: AppLayoutChatSurfaceProvideDeps,
) {
  return {
    isDMPanelOpen: deps.isDMPanelOpen,
    friendIds: computed(() => deps.workspace.friendIds.value),
    friendIdsByUserId: computed(() => deps.workspace.friendIdsByUserId.value),
    friendRequestsIncoming: computed(
      () => deps.workspace.friendRequestsIncoming.value,
    ),
    friendRequestsOutgoing: computed(
      () => deps.workspace.friendRequestsOutgoing.value,
    ),
    blockedUserIds: computed(() => deps.workspace.blockedUserIds.value),
    selectedDMUserId: deps.selectedDMUserId,
    messageRequests: computed(() => deps.workspace.messageRequests.value),
    selectedMessageRequestId: deps.selectedMessageRequestId,
    messages: computed(() => deps.workspace.messages.value),
    echoDmPeerByChannelId: computed(() => unref(deps.echoDmPeerByChannelId)),
    selectDM: deps.selectDM,
    acceptFriendRequest: deps.acceptFriendRequest,
    declineFriendRequest: deps.declineFriendRequest,
    cancelFriendRequest: deps.cancelFriendRequest,
    sendFriendRequest: deps.sendFriendRequest,
    ignoreMessageRequest: deps.ignoreMessageRequest,
    handleAcceptMessageRequest: deps.handleAcceptMessageRequest,
    returnFromMessageRequests: deps.returnFromMessageRequests,
    dmMentionNotifications: deps.dmMentionNotifications,
    mentionNotificationHydrationLoading:
      deps.mentionNotificationHydrationLoading,
    resolveDmMentionNotificationChannelLabel:
      deps.resolveDmMentionNotificationChannelLabel,
    resolveDmMentionNotificationAuthorName:
      deps.resolveDmMentionNotificationAuthorName,
    resolveDmMentionNotificationRowPreview:
      deps.resolveDmMentionNotificationRowPreview,
    dmNotificationReadStateByChannelId: deps.dmNotificationReadStateByChannelId,
    mentionNotificationCategoriesByServer:
      deps.mentionNotificationCategoriesByServer,
    mentionNotificationServers: deps.mentionNotificationServers,
    dmNotificationsReadPreset: deps.dmNotificationsReadPreset,
    dmNotificationsSourceKey: deps.dmNotificationsSourceKey,
    onUpdateDmNotificationsReadPreset: (preset: 'all' | 'unread' | 'read') => {
      deps.dmNotificationsReadPreset.value = preset;
    },
    onUpdateDmNotificationsSourceKey: (key: string) => {
      deps.dmNotificationsSourceKey.value = key;
    },
    onOpenMentionNotification: deps.onOpenMentionNotification,
    onMarkMentionNotificationRead: deps.onMarkMentionNotificationRead,
    isPersistedEchoDmThread: deps.isPersistedEchoDmThread,
    dmCallFullscreen: deps.dmCallFullscreen,
    pinnedMessageIdsForCurrentChannel: deps.pinnedMessageIdsForCurrentChannel,
    handlePinMessage: deps.handlePinMessage,
    handleUnpinMessage: deps.handleUnpinMessage,
  };
}

export function assembleChatSurfaceProfile(
  deps: AppLayoutChatSurfaceProvideDeps,
) {
  return {
    expandedProfile: deps.expandedProfile,
    isExpandedProfileFriend: deps.isExpandedProfileFriend,
    isExpandedProfileOutgoingRequest: deps.isExpandedProfileOutgoingRequest,
    friendshipKnown: deps.friendshipKnown,
    expandedProfileNote: deps.expandedProfileNote,
    onUpdateExpandedProfileNote: deps.handleExpandedProfileNoteFromLayout,
    onExpandedProfileModalUpdate: deps.onExpandedProfileModalUpdate,
    handleExpandedProfileOpenServer: deps.handleExpandedProfileOpenServer,
    expandDmProfileToFullModal: deps.expandDmProfileToFullModal,
    handleExpandedProfileOpenDM: deps.handleExpandedProfileOpenDM,
    handleExpandedProfileSendFriendRequest:
      deps.handleExpandedProfileSendFriendRequest,
    handleExpandedProfileCancelOutgoingFriendRequest:
      deps.handleExpandedProfileCancelOutgoingFriendRequest,
    handleExpandedProfileAcceptIncomingFriendRequest:
      deps.handleExpandedProfileAcceptIncomingFriendRequest,
    handleExpandedProfileDeclineIncomingFriendRequest:
      deps.handleExpandedProfileDeclineIncomingFriendRequest,
    handleExpandedProfileRemoveFriend: deps.handleExpandedProfileRemoveFriend,
    isExpandedProfileTargetBlocked: deps.isExpandedProfileTargetBlocked,
    guestFriendsLocked: deps.guestFriendsLocked,
    handleProfileBlockUser: deps.handleProfileBlockUser,
    handleProfileUnblockUser: deps.handleProfileUnblockUser,
    handleProfileReportUser: deps.handleProfileReportUser,
    onCloseGroupOverview: () => {
      deps.isGroupOverviewOpen.value = false;
    },
    handleKickGroupDmMember: deps.handleKickGroupDmMember,
    handleLeaveGroupDm: deps.handleLeaveGroupDm,
    openGroupSettingsFromHeader: deps.openGroupSettingsFromHeader,
    resolveAuthorRole: deps.memberListResolveHighestRole,
    showNsfwChatGate: deps.showNsfwChatGate,
    acknowledgeNsfwChannel: deps.acknowledgeNsfwChannel,
    declineNsfwGate: deps.declineNsfwGate,
    onOpenExplore: deps.selectExploreTab,
  };
}

export function assembleChatSurfaceFindChannel(
  deps: AppLayoutChatSurfaceProvideDeps,
) {
  return {
    findChannelContextById: deps.findChannelContextById as (
      channelId: string,
    ) => { channel: ChannelSummary; categoryId: string } | null,
  };
}
