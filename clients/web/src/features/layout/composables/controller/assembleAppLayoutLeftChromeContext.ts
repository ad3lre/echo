import { computed, unref, type ComputedRef } from 'vue';
import type { SettingsSection } from '@/features/settings/types';
import type { NotificationReadPreset } from '@/features/dm/filterDmMentionNotificationRows';
import type { DmSubView } from '@/features/layout/mainSurface';
import type {
  LayoutLeftChromeContext,
  LayoutLeftChromeHostHandlers,
} from '@/features/layout/layoutInjectionKeys';
import type { AppLayoutLeftChromeProvideDeps } from '@/features/layout/composables/shell/useAppLayoutLeftChromeProvide';

function assembleLeftChromeDerived(deps: AppLayoutLeftChromeProvideDeps) {
  return {
    hideServerRail: computed(
      () =>
        unref(deps.welcomeBackExploreGate) || unref(deps.inviteLandingActive),
    ),
    mobileVoiceChannelTapOpensLobby: computed(
      () =>
        !!(
          unref(deps.isCompactShell) &&
          !unref(deps.isDmUiContext) &&
          unref(deps.hasGuildChannelChrome)
        ),
    ),
    voiceLobbyChannelId: computed(
      () => unref(deps.guildMobileVcLobby)?.channelId ?? null,
    ),
    currentUserForServerList: computed(() =>
      unref(deps.isAuthenticated) ? (unref(deps.currentUser) ?? null) : null,
    ),
    currentUser: computed(() => unref(deps.currentUser)),
    echoPeerByChannelId: computed(() => unref(deps.echoDmPeerByChannelId)),
    currentUserId: computed(() => unref(deps.currentUser)?.id ?? ''),
    selectedGroupDmChannelId: computed(
      () => unref(deps.activeGroupDM)?.id ?? null,
    ),
    friendIds: computed(() => unref(deps.friendIds)),
    messageRequests: computed(() => unref(deps.messageRequests)),
    friendRequestsIncoming: computed(() => unref(deps.friendRequestsIncoming)),
    friendRequestsOutgoing: computed(() => unref(deps.friendRequestsOutgoing)),
    phoneCallIcon: computed(() => deps.icons.phoneCall),
    selectedServer: computed(() => deps.selectedServer.value ?? null),
    activeMemberProfileId: computed(
      () => unref(deps.activeMemberProfile)?.id ?? null,
    ),
    canUseVideo: computed(
      () =>
        !unref(deps.isRolePreviewActiveForServer) ||
        deps.previewHasUiPermission('video'),
    ),
  };
}

function assembleLeftChromeRailState(deps: AppLayoutLeftChromeProvideDeps) {
  return {
    isAuthenticated: deps.isAuthenticated,
    guestFriendsLocked: deps.guestFriendsLocked,
    activeRailTab: deps.activeRailTab,
    compactGuildTriPaneChannelPanelOpen:
      deps.compactGuildTriPaneChannelPanelOpen,
    channelPanelCollapsed: deps.channelPanelCollapsed,
    channelPanelBubbleMode: deps.channelPanelBubbleMode,
    memberPanelCollapsed: deps.memberPanelCollapsedEffective,
    memberPanelCollapsedRaw: deps.memberPanelCollapsed,
    isDmUiContext: deps.isDmUiContext,
    isServerEmptyOnboarding: deps.isServerEmptyOnboarding,
    isExploreView: deps.isExploreView,
    inDmMode: deps.isInDMMode,
    dmPanelOpen: deps.isDMPanelOpen,
    channelPanelLoading: deps.isChannelPanelSwitchLoading,
    channelTreeLoaded: deps.isChannelTreeLoadedForSelectedServer,
    presenceByUserId: deps.presenceByUserId,
    presenceMobileByUserId: deps.presenceMobileByUserId,
    serverNotificationLevelsMap: deps.serverNotificationLevelsMap,
    serverPingKindsMap: deps.serverPingKindByServerId,
    serverPingBubblesMap: deps.serverPingBubbleByServerId,
    serverPingChannelDotsMap: deps.serverPingChannelDotsByServerId,
    serverUnreadActivityDotMap: deps.serverUnreadActivityDotByServerId,
    channelMissedActivityByChannelId: deps.channelMissedActivityByChannelId,
    serverActiveVoiceByServerId: deps.serverActiveVoiceByServerId,
    guildVoiceActivityCards: deps.guildVoiceActivityCards,
    guildEventActivityCards: deps.guildEventActivityCards,
    guildVoiceActivityCurrentVoiceChannelId: deps.channelPanelVoiceChannelId,
    canOpenServerSettingsForServer: deps.canOpenServerSettingsForServer,
    canOpenInviteForServer: deps.canOpenInviteForServer,
    reorderVisibleServers: deps.reorderVisibleServers,
    isMoreServersPanelOpen: deps.isMoreServersPanelOpen,
    isMoreServersCompact: deps.isMoreServersCompact,
    isMoreServersPinned: deps.isMoreServersPinned,
    dmActiveTab: deps.dmActiveTab,
    dmIncomingRailCluster: deps.dmIncomingRailCluster,
    dmInboxEntries: deps.dmInboxEntriesForPanel,
    usersForChannelPanel: deps.usersForChannelPanel,
    selectedDmUserId: deps.selectedDMUserId,
    selectedMessageRequestId: deps.selectedMessageRequestId,
    dmMentionNotifications: deps.dmMentionNotifications,
    dmNotificationReadStateByChannelId: deps.dmNotificationReadStateByChannelId,
    mentionNotificationCategoriesByServer:
      deps.mentionNotificationCategoriesByServer,
    mentionNotificationServers: deps.mentionNotificationServers,
    dmNotificationsReadPreset: deps.dmNotificationsReadPreset,
    dmNotificationsSourceKey: deps.dmNotificationsSourceKey,
    isPersistedEchoDmThread: deps.isPersistedEchoDmThread,
    dmCallWithUserId: deps.dmCallWithUserId,
    dmCallRinging: deps.dmCallRinging,
    dmCallRingRemoteVanishing: deps.dmCallRingRemoteVanishing,
  };
}

function assembleLeftChromeVoiceState(deps: AppLayoutLeftChromeProvideDeps) {
  return {
    categoriesForServer: deps.categoriesForServer,
    activeChannelId: deps.activeChannelId,
    guildVoiceChannelId: computed(
      () => unref(deps.channelPanelVoiceChannelId) ?? null,
    ),
    guildVoiceChannelName: deps.channelPanelVoiceChannelName,
    liveKitState: deps.liveKitState,
    liveKitNetworkStats: deps.liveKitNetworkStats,
    liveKitRoom: deps.liveKitRoom,
    getRemoteParticipantVolume: deps.getRemoteParticipantVolume,
    setRemoteParticipantVolume: deps.setRemoteParticipantVolume,
    vcMicInputLevel: deps.localAudioLevel,
    onSwitchCamera: deps.switchVcCamera,
    voiceSessionParticipants: deps.activeVoiceChannelParticipants,
    getVcActivityPresence: deps.getVcActivityPresenceForUser,
    getVcChannelActivityPresence: deps.getVcChannelActivityPresenceForChannel,
    vcActivityKingUserId: deps.effectiveVcActivityKingUserId,
    openMemberProfile: deps.openMemberProfile,
    openProfileFromContextMenu: deps.openProfileFromContextMenu,
    guildVcMuted: deps.channelPanelVcMutedEffective,
    guildVcDeafened: deps.channelPanelVcDeafenedEffective,
    guildVcVideo: deps.channelPanelVcVideoEffective,
    guildVcScreenshare: deps.channelPanelVcScreenshareEffective,
    canJoinPreviewVoiceChannel: deps.canJoinPreviewVoiceChannel,
    voiceSideChatCollapsed: deps.voiceSideChatCollapsed,
    canCreateChannels: deps.canCreateChannels,
    canManageThisChannel: deps.canManageThisChannel,
    startChannelResize: deps.startChannelResize,
    resetChannelWidth: deps.resetChannelWidth,
    showServerSettingsMenuItem: deps.canOpenServerSettings,
    canInviteToCurrentServer: deps.canInviteToCurrentServer,
    canModerateMemberInServer: deps.canModerateMemberInServer,
    canVcModerateMember: deps.canVcModerateMember,
    handleModerateUser: deps.handleModerateUser,
    handleChannelReorder: deps.handleChannelReorder,
    handleCategoryReorder: deps.handleCategoryReorder,
    handleVcModerate: deps.handleVcModerate,
    selectDmUser: deps.selectDM,
    isDmInboxUserFavorite: deps.isDmInboxUserFavorite,
    isDmInboxGroupFavorite: deps.isDmInboxGroupFavorite,
    hideChannelPanelVoiceChrome: deps.hideChannelPanelVoiceChromeEffective,
    focusGuildVoiceChannelInSidebar: deps.focusGuildVoiceChannelInSidebar,
  };
}

function assembleLeftChromeNavHandlers(deps: AppLayoutLeftChromeProvideDeps) {
  return {
    onSelectServers: deps.selectServersTab,
    onSelectServer: deps.openServerSurface,
    onToggleExplore: deps.selectExploreTab,
    onToggleDmPanel: deps.handleSelectDmTab,
    onSelectIncomingDm: deps.selectIncomingDmFromRail,
    onSelectIncomingGroupDm: deps.selectIncomingGroupDmFromRail,
    onOpenDmInboxOverflow: deps.handleOpenDmInboxFromRailOverflow,
    onToggleMoreServers: deps.toggleMoreServersPanel,
    onExpandChannels: deps.expandChannels,
    onToggleChannelPanelBubbleMode: deps.toggleChannelPanelBubbleMode,
    onExpandMembers: deps.expandMembers,
    onOpenSelfProfile: deps.openSelfProfile,
    onOpenBugReport: () => {
      deps.isBugReportModalOpen.value = true;
    },
    onOpenSettings: () => deps.openUserSettingsModal(),
    onOpenAuth: () => deps.openAuthModal(),
    onMoreServersClose: () => {
      deps.isMoreServersPanelOpen.value = false;
    },
    onMoreServersSetCompact: (v: boolean) => {
      deps.isMoreServersCompact.value = v;
    },
    onMoreServersTogglePinned: () => {
      deps.isMoreServersPinned.value = !deps.isMoreServersPinned.value;
    },
    onDmClose: () => {
      deps.isDMPanelOpen.value = false;
    },
    onClearPhoneHomeDmThread: deps.clearPhoneHomeDmThread,
    onDmPanelJoinGuildVoiceActivity: deps.handleDmPanelJoinGuildVoiceActivity,
    onDmUpdateActiveTab: (tab: DmSubView) => {
      deps.dmActiveTab.value = tab;
    },
    onDmSelectDm: deps.selectDM,
    onDmSelectGroup: deps.handleSelectGroupDM,
    onDmSelectMessageRequest: (requestId: string | null) => {
      if (requestId != null) deps.selectMessageRequest(requestId);
    },
    onDmIgnoreRequest: deps.ignoreMessageRequest,
    onDmAcceptFriendRequest: deps.acceptFriendRequest,
    onDmDeclineFriendRequest: deps.declineFriendRequest,
    onDmCancelFriendRequest: deps.cancelFriendRequest,
    onDmSendFriendRequest: deps.sendFriendRequest,
    onDmMarkRead: deps.handleDmMarkRead,
    onDmHideFromInbox: (
      payload:
        | {
            kind: 'user';
            userId: string;
          }
        | {
            kind: 'group';
            channelId: string;
          },
    ) => {
      if (payload.kind === 'user') {
        deps.hideDmFromInboxUser(payload.userId);
      } else {
        deps.hideDmFromInboxGroup(payload.channelId);
      }
    },
    onDmToggleFavoriteInbox: deps.toggleFavoriteDmInbox,
    onDmRequestUpgrade: deps.openGuestUpgradeModal,
    onDmPanelResizeStart: deps.startDmPanelResize,
    onDmPanelResizeReset: deps.resetDmPanelWidth,
  };
}

function assembleLeftChromeChannelHandlers(
  deps: AppLayoutLeftChromeProvideDeps,
  handleChannelInviteRequest: LayoutLeftChromeHostHandlers['onChannelInvite'],
) {
  return {
    onChannelUpdateActiveId: (channelId: string) => {
      deps.handleActiveChannelChange(channelId);
      if (unref(deps.useCompactPhoneTabShell)) {
        deps.mobileChannelSheetOpen.value = false;
        deps.mobileServersStack.value = 'guild';
        deps.mobileBottomTab.value = 'servers';
        return;
      }
      if (unref(deps.isCompactShell) && unref(deps.hasGuildChannelChrome)) {
        deps.compactPagerPane.value = 1;
      }
    },
    onChannelUpdateCollapsed: (v: boolean) => {
      deps.channelPanelCollapsed.value = v;
    },
    onChannelUpdateVcMuted: deps.onChannelPanelVcMuted,
    onChannelUpdateVcDeafened: deps.onChannelPanelVcDeafened,
    onChannelUpdateVcVideo: deps.onChannelPanelVcVideo,
    onChannelUpdateVcScreenshare: deps.onChannelPanelVcScreenshare,
    onChannelJoinVoice: deps.handleJoinVoiceIfAllowed,
    onChannelOpenVoiceLobby: deps.openGuildMobileVcLobby,
    onChannelLeaveVoice: deps.handleChannelVoicePanelLeave,
    onChannelInvite: handleChannelInviteRequest,
    onChannelOpenServerSettings: () => {
      const sid = deps.selectedServer.value?.id ?? '';
      deps.openServerSettingsIfAllowed(sid);
    },
    onChannelToggleSideChat: deps.onVcChatButtonClick,
    onChannelOpenCreateChannel: (id: string | null) =>
      deps.openCreateChannelModal(id),
    onChannelOpenCreateCategory: deps.openCreateCategoryModal,
    onChannelQuickCreateSubmit: deps.handleCreateChannelModalSubmit,
    onChannelOpenChannelSettings: deps.openChannelSettings,
    onChannelOpenCategorySettings: deps.openCategorySettings,
    ...assembleLeftChromeChannelMutations(deps),
  };
}

function assembleLeftChromeChannelMutations(
  deps: AppLayoutLeftChromeProvideDeps,
) {
  return {
    onChannelDeleteChannel: async (payload: { channelId: string }) => {
      await deps.deleteChannelById(payload.channelId);
    },
    onChannelDeleteCategory: async (payload: { categoryId: string }) => {
      await deps.deleteCategoryById(payload.categoryId);
    },
    onChannelOpenNotificationSettings: deps.openServerNotificationSettings,
    onChannelOpenVoiceAudioSettings: () =>
      deps.openUserSettingsModal('Voice & Video' as SettingsSection),
    onChannelLeaveServer: deps.handleServerRailLeave,
    onChannelMarkRead: (channelId: string) => {
      void deps.handleChannelMarkRead(channelId);
    },
    onGuildEventRsvp: deps.submitGuildEventRsvp,
    onOpenGuildEventDetail: deps.openGuildEventDetail,
    onUpdateDmNotificationsReadPreset: (preset: NotificationReadPreset) => {
      deps.dmNotificationsReadPreset.value = preset;
    },
    onUpdateDmNotificationsSourceKey: (key: string) => {
      deps.dmNotificationsSourceKey.value = key;
    },
    onOpenGuildEventChannel: (payload: {
      serverId: string;
      channelId?: string | null;
      customLocation?: string | null;
      eventId?: string;
    }) => {
      deps.isDMPanelOpen.value = false;
      deps.navigateGuildEventOpenPayload({
        serverId: payload.serverId,
        channelId: payload.channelId,
        customLocation: payload.customLocation,
      });
    },
  };
}

export function assembleAppLayoutLeftChromeContext(
  deps: AppLayoutLeftChromeProvideDeps,
  derived: {
    railProfileAwaySelfSpeaking: ComputedRef<boolean>;
    handleChannelInviteRequest: LayoutLeftChromeHostHandlers['onChannelInvite'];
  },
): LayoutLeftChromeContext {
  return {
    ...assembleLeftChromeDerived(deps),
    ...assembleLeftChromeRailState(deps),
    ...assembleLeftChromeVoiceState(deps),
    ...assembleLeftChromeNavHandlers(deps),
    ...assembleLeftChromeChannelHandlers(
      deps,
      derived.handleChannelInviteRequest,
    ),
    bugHunterEnabled: deps.showBugHunterOnRail,
    railProfileAwaySelfSpeaking: derived.railProfileAwaySelfSpeaking,
  };
}
