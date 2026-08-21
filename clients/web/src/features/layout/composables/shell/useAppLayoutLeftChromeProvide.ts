import { computed, provide, unref, type ComputedRef, type Ref } from 'vue';
import type { ChannelSummary } from '@shared/types';
import type { SettingsSection } from '@/features/settings/types';
import { dispatchAppToast } from '@/features/layout/failures/controllerMissingAction';
import {
  LAYOUT_LEFT_CHROME_KEY,
  type LayoutLeftChromeContext,
  type LayoutLeftChromeHostHandlers,
} from '@/features/layout/layoutInjectionKeys';
import type { CreateChannelModalSubmitPayload } from '@/features/layout/composables/controller/appLayoutControllerTypes';
import type { NotificationReadPreset } from '@/features/dm/filterDmMentionNotificationRows';
import type { DmSubView, RailTab } from '@/features/layout/mainSurface';
import type { MobileBottomTabId } from '@/features/layout/mobileBottomTab';
import type { AppLayoutLeftChromeProps } from '@/features/layout/appLayoutLeftChromeProps';
import { assembleAppLayoutLeftChromeContext } from '@/features/layout/composables/controller/assembleAppLayoutLeftChromeContext';

type RV<T> = Ref<T> | ComputedRef<T>;
type Ctx = LayoutLeftChromeContext;
type Host = LayoutLeftChromeHostHandlers;

export type AppLayoutLeftChromeProvideDeps = {
  welcomeBackExploreGate: RV<boolean>;
  inviteLandingActive: RV<boolean>;
  isCompactShell: RV<boolean>;
  hasGuildChannelChrome: RV<boolean>;
  isDmUiContext: Ctx['isDmUiContext'];
  guildMobileVcLobby: RV<{ channelId: string; channelName: string } | null>;
  isAuthenticated: Ctx['isAuthenticated'];
  currentUser: Ctx['currentUser'];
  echoDmPeerByChannelId: RV<ReadonlyMap<string, string>>;
  activeGroupDM: RV<{ id: string } | null | undefined>;
  friendIds: Ctx['friendIds'];
  messageRequests: Ctx['messageRequests'];
  friendRequestsIncoming: Ctx['friendRequestsIncoming'];
  friendRequestsOutgoing: Ctx['friendRequestsOutgoing'];
  icons: Record<string, string>;
  selectedServer: {
    value: AppLayoutLeftChromeProps['selectedServer'] | undefined;
  };
  activeMemberProfile: RV<{ id: string } | null | undefined>;
  isRolePreviewActiveForServer: RV<boolean>;
  previewHasUiPermission: (permission: string) => boolean;
  guestFriendsLocked: Ctx['guestFriendsLocked'];
  activeRailTab: RV<RailTab>;
  compactGuildTriPaneChannelPanelOpen: Ctx['compactGuildTriPaneChannelPanelOpen'];
  channelPanelCollapsed: Ref<boolean>;
  channelPanelBubbleMode: Ctx['channelPanelBubbleMode'];
  memberPanelCollapsedEffective: Ctx['memberPanelCollapsed'];
  memberPanelCollapsed: Ctx['memberPanelCollapsedRaw'];
  isServerEmptyOnboarding: Ctx['isServerEmptyOnboarding'];
  isExploreView: Ctx['isExploreView'];
  isInDMMode: Ctx['inDmMode'];
  isDMPanelOpen: Ref<boolean>;
  isChannelPanelSwitchLoading: Ctx['channelPanelLoading'];
  isChannelTreeLoadedForSelectedServer: Ctx['channelTreeLoaded'];
  presenceByUserId: Ctx['presenceByUserId'];
  presenceMobileByUserId: Ctx['presenceMobileByUserId'];
  serverNotificationLevelsMap: Ctx['serverNotificationLevelsMap'];
  serverPingKindByServerId: Ctx['serverPingKindsMap'];
  serverPingBubbleByServerId: Ctx['serverPingBubblesMap'];
  serverPingChannelDotsByServerId: Ctx['serverPingChannelDotsMap'];
  serverUnreadActivityDotByServerId: Ctx['serverUnreadActivityDotMap'];
  channelMissedActivityByChannelId: Ctx['channelMissedActivityByChannelId'];
  serverActiveVoiceByServerId: Ctx['serverActiveVoiceByServerId'];
  guildVoiceActivityCards: Ctx['guildVoiceActivityCards'];
  guildEventActivityCards: Ctx['guildEventActivityCards'];
  channelPanelVoiceChannelId: RV<string | null | undefined>;
  canOpenServerSettingsForServer: Ctx['canOpenServerSettingsForServer'];
  canOpenInviteForServer: Ctx['canOpenInviteForServer'];
  reorderVisibleServers: Ctx['reorderVisibleServers'];
  isMoreServersPanelOpen: Ref<boolean>;
  isMoreServersCompact: Ref<boolean>;
  isMoreServersPinned: Ref<boolean>;
  dmActiveTab: Ref<DmSubView>;
  dmIncomingRailCluster: Ctx['dmIncomingRailCluster'];
  dmInboxEntriesForPanel: Ctx['dmInboxEntries'];
  usersForChannelPanel: Ctx['usersForChannelPanel'];
  selectedDMUserId: Ctx['selectedDmUserId'];
  selectedMessageRequestId: Ctx['selectedMessageRequestId'];
  dmMentionNotifications: Ctx['dmMentionNotifications'];
  dmNotificationReadStateByChannelId: Ctx['dmNotificationReadStateByChannelId'];
  mentionNotificationCategoriesByServer: Ctx['mentionNotificationCategoriesByServer'];
  mentionNotificationServers: Ctx['mentionNotificationServers'];
  dmNotificationsReadPreset: Ref<NotificationReadPreset>;
  dmNotificationsSourceKey: Ref<string>;
  isPersistedEchoDmThread: Ctx['isPersistedEchoDmThread'];
  dmCallWithUserId: Ctx['dmCallWithUserId'];
  dmCallRinging: Ctx['dmCallRinging'];
  dmCallRingRemoteVanishing: Ctx['dmCallRingRemoteVanishing'];
  categoriesForServer: Ctx['categoriesForServer'];
  activeChannelId: Ctx['activeChannelId'];
  channelPanelVoiceChannelName: Ctx['guildVoiceChannelName'];
  liveKitState: Ctx['liveKitState'];
  liveKitNetworkStats: Ctx['liveKitNetworkStats'];
  liveKitRoom: Ctx['liveKitRoom'];
  getRemoteParticipantVolume: Ctx['getRemoteParticipantVolume'];
  setRemoteParticipantVolume: Ctx['setRemoteParticipantVolume'];
  localAudioLevel: Ctx['vcMicInputLevel'];
  switchVcCamera: Ctx['onSwitchCamera'];
  activeVoiceChannelParticipants: Ctx['voiceSessionParticipants'];
  getVcActivityPresenceForUser: Ctx['getVcActivityPresence'];
  getVcChannelActivityPresenceForChannel: Ctx['getVcChannelActivityPresence'];
  effectiveVcActivityKingUserId: Ctx['vcActivityKingUserId'];
  openMemberProfile: Ctx['openMemberProfile'];
  openProfileFromContextMenu: Ctx['openProfileFromContextMenu'];
  channelPanelVcMutedEffective: Ctx['guildVcMuted'];
  channelPanelVcDeafenedEffective: Ctx['guildVcDeafened'];
  channelPanelVcVideoEffective: Ctx['guildVcVideo'];
  channelPanelVcScreenshareEffective: Ctx['guildVcScreenshare'];
  canJoinPreviewVoiceChannel: Ctx['canJoinPreviewVoiceChannel'];
  voiceSideChatCollapsed: Ctx['voiceSideChatCollapsed'];
  canCreateChannels: Ctx['canCreateChannels'];
  canManageThisChannel: Ctx['canManageThisChannel'];
  startChannelResize: Ctx['startChannelResize'];
  resetChannelWidth: Ctx['resetChannelWidth'];
  canOpenServerSettings: Ctx['showServerSettingsMenuItem'];
  canInviteToCurrentServer: RV<boolean>;
  canModerateMemberInServer: Ctx['canModerateMemberInServer'];
  canVcModerateMember: Ctx['canVcModerateMember'];
  handleModerateUser: Ctx['handleModerateUser'];
  handleChannelReorder: Ctx['handleChannelReorder'];
  handleCategoryReorder: Ctx['handleCategoryReorder'];
  handleVcModerate: Ctx['handleVcModerate'];
  selectDM: Host['onDmSelectDm'];
  isDmInboxUserFavorite: Ctx['isDmInboxUserFavorite'];
  isDmInboxGroupFavorite: Ctx['isDmInboxGroupFavorite'];
  hideChannelPanelVoiceChromeEffective: Ctx['hideChannelPanelVoiceChrome'];
  focusGuildVoiceChannelInSidebar: Ctx['focusGuildVoiceChannelInSidebar'];
  showBugHunterOnRail: Ctx['bugHunterEnabled'];
  isBugReportModalOpen: Ref<boolean>;
  openUserSettingsModal: (section?: SettingsSection) => void;
  openAuthModal: Host['onOpenAuth'];
  selectServersTab: Host['onSelectServers'];
  openServerSurface: Host['onSelectServer'];
  selectExploreTab: Host['onToggleExplore'];
  handleSelectDmTab: Host['onToggleDmPanel'];
  selectIncomingDmFromRail: Host['onSelectIncomingDm'];
  selectIncomingGroupDmFromRail: Host['onSelectIncomingGroupDm'];
  handleOpenDmInboxFromRailOverflow: Host['onOpenDmInboxOverflow'];
  toggleMoreServersPanel: Host['onToggleMoreServers'];
  expandChannels: Host['onExpandChannels'];
  toggleChannelPanelBubbleMode: Host['onToggleChannelPanelBubbleMode'];
  expandMembers: Host['onExpandMembers'];
  openSelfProfile: Host['onOpenSelfProfile'];
  clearPhoneHomeDmThread: Host['onClearPhoneHomeDmThread'];
  handleDmPanelJoinGuildVoiceActivity: Host['onDmPanelJoinGuildVoiceActivity'];
  handleSelectGroupDM: Host['onDmSelectGroup'];
  selectMessageRequest: (requestId: string) => void;
  ignoreMessageRequest: Host['onDmIgnoreRequest'];
  acceptFriendRequest: Host['onDmAcceptFriendRequest'];
  declineFriendRequest: Host['onDmDeclineFriendRequest'];
  cancelFriendRequest: Host['onDmCancelFriendRequest'];
  sendFriendRequest: Host['onDmSendFriendRequest'];
  handleDmMarkRead: Host['onDmMarkRead'];
  hideDmFromInboxUser: (userId: string) => void;
  hideDmFromInboxGroup: (channelId: string) => void;
  toggleFavoriteDmInbox: NonNullable<Host['onDmToggleFavoriteInbox']>;
  openGuestUpgradeModal: Host['onDmRequestUpgrade'];
  startDmPanelResize: Host['onDmPanelResizeStart'];
  resetDmPanelWidth: Host['onDmPanelResizeReset'];
  handleActiveChannelChange: (channelId: string) => void;
  useCompactPhoneTabShell: RV<boolean>;
  mobileChannelSheetOpen: Ref<boolean>;
  mobileServersStack: Ref<'list' | 'guild'>;
  mobileBottomTab: Ref<MobileBottomTabId>;
  compactPagerPane: Ref<number>;
  onChannelPanelVcMuted: Host['onChannelUpdateVcMuted'];
  onChannelPanelVcDeafened: Host['onChannelUpdateVcDeafened'];
  onChannelPanelVcVideo: Host['onChannelUpdateVcVideo'];
  onChannelPanelVcScreenshare: Host['onChannelUpdateVcScreenshare'];
  handleJoinVoiceIfAllowed: Host['onChannelJoinVoice'];
  openGuildMobileVcLobby: NonNullable<Host['onChannelOpenVoiceLobby']>;
  handleChannelVoicePanelLeave: Host['onChannelLeaveVoice'];
  openServerSettingsIfAllowed: (serverId: string) => void;
  onVcChatButtonClick: Host['onChannelToggleSideChat'];
  openCreateChannelModal: (categoryId: string | null) => void;
  openCreateCategoryModal: Host['onChannelOpenCreateCategory'];
  handleCreateChannelModalSubmit: (
    payload: CreateChannelModalSubmitPayload,
  ) => void;
  openChannelSettings: Host['onChannelOpenChannelSettings'];
  openCategorySettings: Host['onChannelOpenCategorySettings'];
  deleteChannelById: (channelId: string) => Promise<boolean>;
  deleteCategoryById: (categoryId: string) => Promise<boolean>;
  openServerNotificationSettings: Host['onChannelOpenNotificationSettings'];
  handleServerRailLeave: Host['onChannelLeaveServer'];
  handleChannelMarkRead: (channelId: string) => void | Promise<void>;
  submitGuildEventRsvp: NonNullable<Host['onGuildEventRsvp']>;
  openGuildEventDetail: NonNullable<Host['onOpenGuildEventDetail']>;
  navigateGuildEventOpenPayload: (payload: {
    serverId: string;
    channelId?: string | null;
    customLocation?: string | null;
  }) => void;
  inviteModalVoiceChannelId: Ref<string | null>;
  inviteModalVoiceChannelName: Ref<string | null>;
  isInviteModalOpen: Ref<boolean>;
  callOverlay: RV<{ type: string }>;
  dmCallMatchesActiveChannel: RV<boolean | null | undefined>;
  dmCallMuted: RV<boolean>;
  dmCallDeafened: RV<boolean>;
  localSpeaking: RV<boolean>;
  currentVoiceChannelId: RV<string | null | undefined>;
  findChannelContextById: (
    id: string | null | undefined,
  ) => { channel: ChannelSummary } | null | undefined;
};

function createRailProfileAwaySelfSpeaking(
  deps: AppLayoutLeftChromeProvideDeps,
) {
  const railProfileDmCallAwaySpeaking = computed(() => {
    if (unref(deps.callOverlay).type !== 'dmCall') return false;
    if (!unref(deps.dmCallWithUserId)?.trim()) return false;
    if (unref(deps.dmCallMatchesActiveChannel) === true) return false;
    if (unref(deps.dmCallMuted) || unref(deps.dmCallDeafened)) return false;
    return unref(deps.localSpeaking);
  });

  const railProfileGuildVcAwaySpeaking = computed(() => {
    const vid = unref(deps.currentVoiceChannelId)?.trim();
    if (!vid) return false;
    if (
      unref(deps.channelPanelVcMutedEffective) ||
      unref(deps.channelPanelVcDeafenedEffective)
    ) {
      return false;
    }
    if (!unref(deps.localSpeaking)) return false;
    if (unref(deps.isDmUiContext)) return true;
    if (unref(deps.isExploreView)) return true;
    const ch = deps.findChannelContextById(vid)?.channel;
    if (ch?.type === 'voice') return false;
    return true;
  });

  return computed(
    () =>
      railProfileDmCallAwaySpeaking.value ||
      railProfileGuildVcAwaySpeaking.value,
  );
}

function createChannelInviteHandler(deps: AppLayoutLeftChromeProvideDeps) {
  return function handleChannelInviteRequest(payload?: {
    voiceChannelId: string;
    voiceChannelName?: string;
  }) {
    const sid = deps.selectedServer.value?.id?.trim();
    if (!sid) {
      dispatchAppToast('Select a server before inviting people.', 'warning');
      return;
    }
    if (!unref(deps.currentUser)?.id) {
      dispatchAppToast('Sign in to invite people to a server.', 'info');
      return;
    }
    if (!unref(deps.canInviteToCurrentServer)) {
      dispatchAppToast(
        'You don’t have permission to invite people to this server.',
        'warning',
      );
      return;
    }
    const vid = payload?.voiceChannelId?.trim();
    if (vid) {
      deps.inviteModalVoiceChannelId.value = vid;
      const providedName = payload?.voiceChannelName?.trim() ?? '';
      deps.inviteModalVoiceChannelName.value =
        providedName || deps.inviteModalVoiceChannelName.value;
    } else {
      deps.inviteModalVoiceChannelId.value = null;
      deps.inviteModalVoiceChannelName.value = null;
    }
    deps.isInviteModalOpen.value = true;
  };
}

/**
 * Left-chrome injection: server rail, DM panel, channel panel, and voice chrome.
 * Consumed via inject(LAYOUT_LEFT_CHROME_KEY).
 */
export function useAppLayoutLeftChromeProvide(
  deps: AppLayoutLeftChromeProvideDeps,
) {
  const handleChannelInviteRequest = createChannelInviteHandler(deps);
  provide(
    LAYOUT_LEFT_CHROME_KEY,
    assembleAppLayoutLeftChromeContext(deps, {
      railProfileAwaySelfSpeaking: createRailProfileAwaySelfSpeaking(deps),
      handleChannelInviteRequest,
    }),
  );
  return {
    handleChannelInviteRequest,
    onChannelPanelDeleteChannel: (payload: { channelId: string }) => {
      void deps.deleteChannelById(payload.channelId);
    },
    onChannelPanelDeleteCategory: (payload: { categoryId: string }) => {
      void deps.deleteCategoryById(payload.categoryId);
    },
  };
}
