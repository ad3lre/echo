import { computed, provide, unref, type ComputedRef, type Ref } from 'vue';
import type { ChannelSummary } from '@shared/types';
import type { ChannelCategory } from '@/features/layout/channels/useChannels';
import type { WorkspaceStateApi } from '@/features/layout/echoWorkspace/useEchoWorkspace';
import type { useAuthSessionStore } from '@/features/auth/authSession';
import type { useServerStore } from '@/features/layout/server';
import type { NotificationReadPreset } from '@/features/dm/filterDmMentionNotificationRows';
import type { OpenGroupDmModalPayload } from '@/features/layout/composables/dm/useAppLayoutGroupDm';
import type { MainSurface } from '@/features/layout/mainSurface';
import { useForumPostsController } from '@/features/layout/composables/controller/useForumPostsController';
import {
  LAYOUT_CHAT_SURFACE_KEY,
  type LayoutChatSurfaceContext,
} from '@/features/layout/layoutInjectionKeys';
import type { AppLayoutChatSurfaceVoiceActivitySlice } from '@/features/layout/composables/voice/appLayoutChatSurfaceVoiceActivitySlice';
import { assembleAppLayoutChatSurfaceContext } from '@/features/layout/composables/controller/assembleAppLayoutChatSurfaceContext';

type RV<T> = Ref<T> | ComputedRef<T>;
type Ctx = LayoutChatSurfaceContext;

export type AppLayoutChatSurfaceProvideDeps = {
  voiceActivity: AppLayoutChatSurfaceVoiceActivitySlice;
  workspace: Pick<
    WorkspaceStateApi,
    | 'users'
    | 'friendIds'
    | 'friendIdsByUserId'
    | 'friendRequestsIncoming'
    | 'friendRequestsOutgoing'
    | 'blockedUserIds'
    | 'messageRequests'
    | 'messages'
    | 'categoriesByServer'
  >;
  authSession: Pick<ReturnType<typeof useAuthSessionStore>, 'accessToken'>;
  serverStore: Pick<
    ReturnType<typeof useServerStore>,
    'selectedServerId' | 'selectedServer'
  >;
  isEchoGraphId: (id: string) => boolean;
  canManageThisChannel: (channel: ChannelSummary) => boolean;
  findChannelContextById: (
    channelId: string | null | undefined,
  ) => { channel: ChannelSummary; category: ChannelCategory } | null;
  dmSurfaceAdapter: Ctx['dmSurfaceAdapter'];
  profileSurfaceAdapter: Ctx['profileSurfaceAdapter'];
  chatHeaderAdapter: Ctx['chatHeaderAdapter'];
  mainSurface: Ref<MainSurface> | ComputedRef<MainSurface | null>;
  callOverlay: Ctx['callOverlay'];
  isMessageSurfaceSwitchLoading: RV<boolean>;
  isOpeningDmThread: unknown;
  isGuildShellSettling: Ctx['guildShellSettling'];
  channelPanelCollapsed: Ctx['channelPanelCollapsed'];
  memberPanelCollapsedEffective: Ctx['memberPanelCollapsed'];
  memberPanelCollapsed: Ctx['memberPanelCollapsedRaw'];
  useCompactTriPaneShell: Ctx['compactGuildTriPaneNav'];
  useCompactGuildSplitShell: Ctx['compactGuildSplitNav'];
  isCompactShell: Ctx['isCompactShell'];
  narrowChannelPanelForActivityOverflowStep: Ctx['narrowChannelPanelForActivityOverflowStep'];
  isDmUiContext: Ctx['isDmUiContext'];
  isInDMMode: Ctx['isInDMMode'];
  isViewingVoiceChannel: Ctx['isViewingVoiceChannel'];
  startMemberResize: Ctx['startMemberResize'];
  resetMemberWidth: Ctx['resetMemberWidth'];
  effectiveActiveChannel: Ctx['effectiveActiveChannel'];
  liveChannelCapabilities: Ctx['liveChannelCapabilities'];
  isInDMChat: Ctx['isInDMChat'];
  dmCallMatchesActiveChannel: Ctx['dmCallMatchesActiveChannel'];
  activeDmThreadCallUi: Ctx['activeDmThreadCallUi'];
  isExpandedProfileSidePanel: Ctx['isExpandedProfileSidePanel'];
  isExpandedProfileModalOpen: Ctx['isExpandedProfileModalOpen'];
  isGroupOverviewOpen: Ref<boolean>;
  dmPartnerUser: Ctx['dmPartnerUser'];
  openExpandedProfilePanelForUserId: Ctx['openExpandedProfilePanelForUserId'];
  openExtendedProfileModalForUserId: Ctx['openExtendedProfileModalForUserId'];
  handleExpandedProfileOpenProfile: Ctx['handleExpandedProfileOpenProfile'];
  isGroupDM: Ctx['isGroupDM'];
  activeGroupDM: Ctx['activeGroupDM'];
  icons: Ctx['icons'];
  dmActiveTab: Ctx['dmActiveTab'];
  getChannelIcon: Ctx['getChannelIcon'];
  getChannelDisplayName: (name: string) => string;
  togglePinsDropdown: Ctx['togglePinsDropdown'];
  openChannelPaneFromHeader: Ctx['expandChannels'];
  handleMinimizeVoiceView: Ctx['handleMinimizeVoiceView'];
  collapseMembers: Ctx['collapseMembers'];
  expandMembers: Ctx['expandMembers'];
  isRolePreviewActiveForServer: Ctx['isRolePreviewActiveForServer'];
  rolePreview: Ctx['rolePreview'];
  clearRolePreview: Ctx['clearRolePreview'];
  memberPanelWidth: Ctx['memberPanelWidth'];
  searchText: Ctx['searchText'];
  filterChips: Ctx['filterChips'];
  allChannels: Ctx['allChannels'];
  usersForMentionAutocomplete: Ctx['usersForMentionAutocomplete'];
  rolesForMentionAutocomplete: Ctx['rolesForMentionAutocomplete'];
  paginatedSearchResults: Ctx['paginatedSearchResults'];
  searchResultMessages: RV<unknown[]>;
  searchResultPage: Ctx['searchResultPage'];
  totalPages: Ctx['totalPages'];
  selectedServer: {
    value: { id?: string; name?: string } | null | undefined;
  };
  onSearchInput: Ctx['onSearchInput'];
  addFilter: Ctx['addFilter'];
  removeFilter: Ctx['removeFilter'];
  clearSearch: Ctx['clearSearch'];
  goToSearchPage: Ctx['goToSearchPage'];
  handleGoToMessage: (channelId: string, messageId: string) => void;
  searchLoading: Ctx['searchLoading'];
  searchError: Ctx['searchError'];
  searchScopeHint: Ctx['searchScopeHint'];
  dmCallWithUserId: Ctx['dmCallWithUserId'];
  dmCallRinging: Ctx['dmCallRinging'];
  dmCallAwaitingAccept: Ctx['dmCallAwaitingAccept'];
  dmCallRingUi: Ctx['dmCallRingUi'];
  dmCallLobbyAfterSelfLeave: Ctx['dmCallLobbyAfterSelfLeave'];
  dmCallIncoming: Ctx['dmCallIncoming'];
  dmCallRingRemoteVanishing: Ctx['dmCallRingRemoteVanishing'];
  endDmCall: Ctx['endDmCall'];
  leaveDmCallVoice: Ctx['leaveDmCallVoice'];
  rejoinDmCallVoice: Ctx['rejoinDmCallVoice'];
  answerDmCall: Ctx['answerDmCall'];
  declineDmCall: Ctx['declineDmCall'];
  startDmCall: Ctx['startDmCall'];
  isPinsDropdownOpen: Ctx['isPinsDropdownOpen'];
  pinsButtonRefDm: Ctx['pinsButtonRefDm'];
  pinsButtonRefServer: Ctx['pinsButtonRefServer'];
  openGroupDMModal: (payload?: OpenGroupDmModalPayload) => void;
  startGroupCall: Ctx['startGroupCall'];
  openGroupOverviewPanel: (groupId: string) => void;
  activeGroupCallMembers: Ctx['activeGroupCallMembers'];
  currentUser: RV<
    | {
        id?: string;
        name?: string;
        pfp?: string;
        isGuest?: boolean;
      }
    | null
    | undefined
  >;
  linkedDiscordUserId: Ctx['linkedDiscordUserId'];
  dmCallVideo: RV<boolean>;
  dmCallScreenshare: RV<boolean>;
  dmCallMuted: Ctx['dmCallMuted'];
  dmCallDeafened: RV<boolean>;
  channelPanelVcMutedEffective: Ctx['vcMuted'];
  channelPanelVcDeafenedEffective: Ctx['vcDeafened'];
  channelPanelVcVideoEffective: Ctx['vcVideo'];
  channelPanelVcScreenshareEffective: Ctx['vcScreenshare'];
  onDmCallVcVideo: (next: boolean) => void;
  onDmCallVcScreenshare: (next: boolean) => void;
  toggleDmCallMuted: Ctx['onToggleDmCallMuted'];
  applyDmCallDeafened: (next: boolean) => void;
  onGuildChannelVcMuted: Ctx['onGuildChannelVcMuted'];
  onGuildChannelVcDeafened: Ctx['onGuildChannelVcDeafened'];
  onGuildChannelVcVideo: (next: boolean) => void;
  onGuildChannelVcScreenshare: (next: boolean) => void;
  handleChannelVoicePanelLeave: Ctx['handleChannelVoicePanelLeave'];
  dmCallFullscreen: Ref<boolean>;
  dmCallCallViewParticipants: Ctx['dmCallCallViewParticipants'];
  pinsDropdownRect: Ctx['pinsDropdownRect'];
  pinnedMessagesForDropdown: Ctx['pinnedMessagesForDropdown'];
  pinPreview: Ctx['pinPreview'];
  presenceByUserId: Ctx['presenceByUserId'];
  presenceMobileByUserId: Ctx['presenceMobileByUserId'];
  closePinsDropdown: Ctx['closePinsDropdown'];
  goToPinnedMessage: Ctx['goToPinnedMessage'];
  activeVoiceChannelParticipants: Ctx['activeVoiceChannelParticipants'];
  activeChannelMessagesMap: Ctx['activeChannelMessagesMap'];
  sendMessage: Ctx['sendMessage'];
  openForwardMessagePicker: Ctx['onRequestForward'];
  voiceSideChatCollapsed: Ctx['voiceSideChatCollapsed'];
  voiceSideChatWidth: Ctx['voiceSideChatWidth'];
  startVoiceSideChatResize: Ctx['startVoiceSideChatResize'];
  resetVoiceSideChatWidth: Ctx['resetVoiceSideChatWidth'];
  expandVoiceSideChat: Ctx['expandVoiceSideChat'];
  toggleVoiceSideChat: Ctx['toggleVoiceSideChat'];
  voiceMobileSheetLevel: Ctx['voiceMobileSheetLevel'];
  bumpVoiceMobileChatFromCallScrollUp: Ctx['bumpVoiceMobileChatFromCallScrollUp'];
  bumpVoiceMobileChatFromCallScrollDown: Ctx['bumpVoiceMobileChatFromCallScrollDown'];
  voiceMobileDockReservePxComputed: Ctx['voiceMobileDockReservePx'];
  currentVoiceChannelId: Ctx['currentVoiceChannelId'];
  handleCallViewOpenProfile: Ctx['handleCallViewOpenProfile'];
  canModerateMemberInServer: Ctx['canModerateVcParticipant'];
  canVcModerateMember: Ctx['canVcModerateParticipantAction'];
  handleVcModerate: Ctx['handleVcModerate'];
  handlePollVote: Ctx['handlePollVote'];
  editMessage: Ctx['editMessage'];
  deleteMessage: Ctx['deleteMessage'];
  handleReact: Ctx['handleReact'];
  topReactions: Ctx['topReactions'];
  removeReactionFavorite: Ctx['removeReactionFavorite'];
  handleGoToChannel: (channelId: string) => void;
  openServerSurface: (serverId: string, channelId?: string) => void;
  focusGuildVoiceChannelInSidebar: Ctx['focusGuildVoiceChannelInSidebar'];
  openMemberProfile: Ctx['openMemberProfile'];
  openProfileFromContextMenu: Ctx['openProfileFromContextMenu'];
  canModerateMessageAuthor: Ctx['canModerateAuthor'];
  handleModerateUser: Ctx['handleModerateUser'];
  isDMPanelOpen: Ctx['isDMPanelOpen'];
  selectedDMUserId: Ctx['selectedDMUserId'];
  selectedMessageRequestId: Ctx['selectedMessageRequestId'];
  echoDmPeerByChannelId: RV<ReadonlyMap<string, string>>;
  selectDM: Ctx['selectDM'];
  acceptFriendRequest: Ctx['acceptFriendRequest'];
  declineFriendRequest: Ctx['declineFriendRequest'];
  cancelFriendRequest: Ctx['cancelFriendRequest'];
  sendFriendRequest: Ctx['sendFriendRequest'];
  ignoreMessageRequest: Ctx['ignoreMessageRequest'];
  handleAcceptMessageRequest: Ctx['handleAcceptMessageRequest'];
  returnFromMessageRequests: Ctx['returnFromMessageRequests'];
  dmMentionNotifications: Ctx['dmMentionNotifications'];
  mentionNotificationHydrationLoading: Ctx['mentionNotificationHydrationLoading'];
  resolveDmMentionNotificationChannelLabel: Ctx['resolveDmMentionNotificationChannelLabel'];
  resolveDmMentionNotificationAuthorName: Ctx['resolveDmMentionNotificationAuthorName'];
  resolveDmMentionNotificationRowPreview: Ctx['resolveDmMentionNotificationRowPreview'];
  dmNotificationReadStateByChannelId: Ctx['dmNotificationReadStateByChannelId'];
  mentionNotificationCategoriesByServer: Ctx['mentionNotificationCategoriesByServer'];
  mentionNotificationServers: Ctx['mentionNotificationServers'];
  dmNotificationsReadPreset: Ref<NotificationReadPreset>;
  dmNotificationsSourceKey: Ref<string>;
  onOpenMentionNotification: Ctx['onOpenMentionNotification'];
  onMarkMentionNotificationRead: Ctx['onMarkMentionNotificationRead'];
  isPersistedEchoDmThread: Ctx['isPersistedEchoDmThread'];
  pinnedMessageIdsForCurrentChannel: Ctx['pinnedMessageIdsForCurrentChannel'];
  handlePinMessage: Ctx['handlePinMessage'];
  handleUnpinMessage: Ctx['handleUnpinMessage'];
  expandedProfile: Ctx['expandedProfile'];
  isExpandedProfileFriend: Ctx['isExpandedProfileFriend'];
  isExpandedProfileOutgoingRequest: Ctx['isExpandedProfileOutgoingRequest'];
  friendshipKnown: RV<boolean>;
  expandedProfileNote: Ctx['expandedProfileNote'];
  handleExpandedProfileNoteFromLayout: Ctx['onUpdateExpandedProfileNote'];
  onExpandedProfileModalUpdate: Ctx['onExpandedProfileModalUpdate'];
  handleExpandedProfileOpenServer: Ctx['handleExpandedProfileOpenServer'];
  expandDmProfileToFullModal: Ctx['expandDmProfileToFullModal'];
  handleExpandedProfileOpenDM: Ctx['handleExpandedProfileOpenDM'];
  handleExpandedProfileSendFriendRequest: Ctx['handleExpandedProfileSendFriendRequest'];
  handleExpandedProfileCancelOutgoingFriendRequest: Ctx['handleExpandedProfileCancelOutgoingFriendRequest'];
  handleExpandedProfileAcceptIncomingFriendRequest: Ctx['handleExpandedProfileAcceptIncomingFriendRequest'];
  handleExpandedProfileDeclineIncomingFriendRequest: Ctx['handleExpandedProfileDeclineIncomingFriendRequest'];
  handleExpandedProfileRemoveFriend: Ctx['handleExpandedProfileRemoveFriend'];
  isExpandedProfileTargetBlocked: Ctx['isExpandedProfileTargetBlocked'];
  guestFriendsLocked: Ctx['guestFriendsLocked'];
  handleProfileBlockUser: Ctx['handleProfileBlockUser'];
  handleProfileUnblockUser: Ctx['handleProfileUnblockUser'];
  handleProfileReportUser: Ctx['handleProfileReportUser'];
  handleKickGroupDmMember: Ctx['handleKickGroupDmMember'];
  handleLeaveGroupDm: Ctx['handleLeaveGroupDm'];
  openGroupSettingsFromHeader: Ctx['openGroupSettingsFromHeader'];
  memberListResolveHighestRole: Ctx['resolveAuthorRole'];
  showNsfwChatGate: Ctx['showNsfwChatGate'];
  acknowledgeNsfwChannel: Ctx['acknowledgeNsfwChannel'];
  declineNsfwGate: Ctx['declineNsfwGate'];
  selectExploreTab: Ctx['onOpenExplore'];
  vcRemoteParticipants: Ctx['remoteParticipants'];
  liveKitRoom: Ctx['lkRoom'];
  vcMirrorCamera: Ctx['mirrorLocalCamera'];
  getLocalScreenTrack: Ctx['getLocalScreenTrack'];
  getLocalCameraTrack: Ctx['getLocalCameraTrack'];
  getRemoteParticipantVolume: Ctx['getRemoteParticipantVolume'];
  setRemoteParticipantVolume: Ctx['setRemoteParticipantVolume'];
  fullscreenStreamParticipantId: Ref<string | null>;
  vcActivityUi: Ctx['vcActivityUi'];
  effectiveVcActivityKingUserId: Ctx['effectiveVcActivityKingUserId'];
  serverSettingsCanManageServer: Ctx['canShowDiscordChannelImport'];
  openChannelSettings: Ctx['openChannelSettings'];
};

function createChatSurfaceDerived(deps: AppLayoutChatSurfaceProvideDeps) {
  return {
    surfaceSwitchLoading: computed(
      () =>
        !!unref(deps.isMessageSurfaceSwitchLoading) ||
        !!unref(deps.isOpeningDmThread as RV<boolean> | boolean | undefined),
    ),
    dmThreadSwitchLoading: computed(
      () =>
        !!unref(deps.isOpeningDmThread as RV<boolean> | boolean | undefined),
    ),
    currentUser: computed(() => unref(deps.currentUser) ?? null),
    getChannelDisplayName: (name?: string) =>
      deps.getChannelDisplayName(name ?? ''),
  };
}

/**
 * Main chat column injection. Consumed via inject(LAYOUT_CHAT_SURFACE_KEY).
 */
export function useAppLayoutChatSurfaceProvide(
  deps: AppLayoutChatSurfaceProvideDeps,
) {
  const forum = useForumPostsController({
    authSession: deps.authSession,
    serverStore: deps.serverStore,
    workspace: deps.workspace,
    mainSurface: deps.mainSurface as Ref<MainSurface | null>,
    isEchoGraphId: deps.isEchoGraphId,
    canManageThisChannel: deps.canManageThisChannel,
    findChannelContextById: deps.findChannelContextById,
    handleGoToChannel: deps.handleGoToChannel,
    handleGoToMessage: deps.handleGoToMessage,
  });
  provide(
    LAYOUT_CHAT_SURFACE_KEY,
    assembleAppLayoutChatSurfaceContext(
      deps,
      createChatSurfaceDerived(deps),
      forum,
    ),
  );
}
