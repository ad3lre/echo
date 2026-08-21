import { computed, provide, unref, type ComputedRef, type Ref } from 'vue';
import type { ChannelCategory } from '@/features/layout/channels/useChannels';
import type { WorkspaceStateApi } from '@/features/layout/echoWorkspace/useEchoWorkspace';
import type { SettingsSection } from '@/features/settings/types';
import type { ProfileSurfaceAdapter } from '@/features/layout/regionAdapters';
import type { EventDetailView } from '@/features/server-events/eventDetailView';
import {
  LAYOUT_MODALS_KEY,
  type LayoutModalsContext,
} from '@/features/layout/layoutInjectionKeys';
import { assembleAppLayoutModalsContext } from '@/features/layout/composables/controller/assembleAppLayoutModalsContext';

type RV<T> = Ref<T> | ComputedRef<T>;
type Ctx = LayoutModalsContext;

type GroupDmRecord = Record<
  string,
  { id?: string; name: string; pfp?: string; memberIds?: string[] }
>;

type SelectedServerLike = {
  id?: string;
  name?: string;
  ownerId?: string;
  discordGuildId?: string;
} | null;

export type AppLayoutModalsProvideDeps = {
  profileSurfaceAdapter: ProfileSurfaceAdapter | undefined;
  currentUser: RV<
    | {
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
      }
    | null
    | undefined
  >;
  isAuthenticated: RV<boolean>;
  openUserSettingsModal: (section?: SettingsSection) => void;
  isAuthModalOpen: Ref<boolean>;
  authModalInitialLoginEntry: Ctx['authModalInitialLoginEntry'];
  authModalPasskeyOnOpen: Ctx['authModalPasskeyOnOpen'];
  authModalInitialTab: Ctx['authModalInitialTab'];
  authModalInitialSubView: Ctx['authModalInitialSubView'];
  isAddServerModalOpen: Ref<boolean>;
  addServerInitialView: Ctx['addServerInitialView'];
  exploreDiscoverableServers: Ctx['discoverableServers'];
  openUserSettingsToDiscordFromAddServer: Ctx['onRequestDiscordLinkFromAddServer'];
  handleCreateServer: Ctx['onCreateServer'];
  handleJoinDiscoverableServer: Ctx['onJoinDiscoverableServer'];
  handleJoinWithInviteLink: Ctx['onJoinWithInviteLink'];
  addServerJoinError: Ctx['addServerJoinError'];
  addServerCreateBusy: Ctx['addServerCreateBusy'];
  addServerJoinBusy: Ctx['addServerJoinBusy'];
  addServerJoinInvitePrefill: Ctx['addServerJoinInvitePrefill'];
  exploreDirectoryJoinBusy: Ctx['exploreDirectoryJoinBusy'];
  isInviteModalOpen: Ref<boolean>;
  selectedServer: { value: SelectedServerLike | null | undefined };
  inviteLinkForServer: Ctx['inviteLink'];
  inviteLinkLookupPending: Ctx['inviteLinkLookupPending'];
  inviteApplicationsEnabled: Ctx['inviteApplicationsEnabled'];
  inviteJoinLinksEnabled: Ctx['inviteJoinLinksEnabled'];
  inviteCanCreateDirectHexInvite: Ctx['inviteCanCreateDirectHexInvite'];
  directHexInviteLink: Ctx['inviteDirectHexInviteLink'];
  directHexInviteBusy: Ctx['inviteDirectHexInviteBusy'];
  createDirectHexInvite: Ctx['onCreateInviteDirectHex'];
  inviteModalVoiceChannelId: Ctx['inviteModalVoiceChannelId'];
  inviteModalVoiceChannelName: Ctx['inviteModalVoiceChannelName'];
  inviteableFriends: Ctx['inviteableFriends'];
  handleInviteFriend: Ctx['onInviteFriend'];
  isServerSettingsModalOpen: Ctx['isServerSettingsModalOpen'];
  memberListUsers: Ctx['memberListUsers'];
  serverSettingsMemberUsersResolved: Ctx['serverSettingsMemberUsers'];
  memberListResolveHighestRole: Ctx['resolveMemberHighestRole'];
  canModerateMemberActionInServer: Ctx['canModerateMemberAction'];
  handleModerateUser: Ctx['onRequestModerateMember'];
  onServerSettingsModalUpdate: Ctx['onUpdateServerSettingsModal'];
  serverSettingsModalInitialSection: Ctx['serverSettingsModalInitialSection'];
  onServerSettingsModalActiveSectionUpdate: Ctx['onUpdateServerSettingsModalActiveSection'];
  serverSettingsCanManageRoles: Ctx['serverSettingsCanManageRoles'];
  serverSettingsCanManageServer: Ctx['serverSettingsCanManageServer'];
  canDeleteCurrentServer: Ctx['deleteServerEnabled'];
  hydrateEchoFromApi: () => Promise<void> | void;
  refreshEchoRoleData: () => Promise<void> | void;
  handleServerDeleted: Ctx['onServerDeleted'];
  handleStartRolePreview: Ctx['onPreviewRoleFromSettings'];
  isEchoGraphId: (id: string) => boolean;
  canCreateChannels: RV<boolean>;
  categoriesForServer: RV<ChannelCategory[]>;
  handleChannelReorder: Ctx['serverSettingsOnChannelReorder'];
  handleCategoryReorder: Ctx['serverSettingsOnCategoryReorder'];
  isGroupDMSettingsOpen: Ref<boolean>;
  groupDmSettingsInitialFocus: Ref<'name' | 'icon' | null>;
  groupSettingsId: Ctx['groupSettingsId'];
  activeGroupSettingsId: RV<string | null | undefined>;
  groupDMs: RV<GroupDmRecord | undefined>;
  effectiveActiveChannel: RV<{ name?: string } | null | undefined>;
  activeGroupDM: RV<{ pfp?: string } | null | undefined>;
  groupSettingsMembers: Ctx['groupSettingsMembers'];
  handleUpdateGroupFromSettings: Ctx['onUpdateGroupFromSettings'];
  onRemoveGroupDmMember: Ctx['onRemoveGroupDmMember'];
  handleLeaveGroupDm: Ctx['onLeaveGroupDm'];
  onOpenAddMembersToGroupDm: Ctx['onOpenAddMembersToGroupDm'];
  isGroupDMModalOpen: Ref<boolean>;
  dmGroupFriends: Ctx['dmGroupFriends'];
  groupDMPreselectedIds: Ctx['groupDmPreselectedIds'];
  groupDMLockedIds: Ctx['groupDmLockedIds'];
  groupDmMaxMembers: Ctx['groupDmMaxMembers'];
  handleCreateGroupDM: Ctx['onCreateGroupDm'];
  isSettingsModalOpen: Ctx['isSettingsModalOpen'];
  settingsModalInitialSection: Ctx['settingsModalInitialSection'];
  onUserSettingsModalUpdate: Ctx['onUpdateSettingsModal'];
  onSettingsModalActiveSectionUpdate: Ctx['onUpdateSettingsModalActiveSection'];
  onGuestAccountUpgraded: () => Promise<void> | void;
  onGuestUpgradeSignInFromSettings: Ctx['onSettingsGuestSignInExisting'];
  isDmUiContext: Ctx['isDmUiContext'];
  isMemberPopoutOpen: Ctx['isMemberPopoutOpen'];
  isMemberPopoutFriend: Ctx['isMemberPopoutFriend'];
  isMemberPopoutCanSendFriendRequest: Ctx['isMemberPopoutCanSendFriendRequest'];
  activeMemberProfile: Ctx['activeMemberProfile'];
  memberPopoutAnchor: Ctx['memberPopoutAnchor'];
  activeMemberNote: Ctx['activeMemberNote'];
  memberListRoleManagement: Ctx['memberListRoleManagement'];
  memberPopoutOpenRolesPanel: Ctx['memberPopoutOpenRolesPanel'];
  onMemberPopoutOpenUpdate: Ctx['onUpdateMemberPopoutOpen'];
  updateProfileNote: (userId: string | null, note: string) => void;
  openExpandedProfileFromMemberPopout: Ctx['onOpenExpandedProfileFromMemberPopout'];
  handleMemberPopoutQuickDm: (
    userId: string,
    text: string,
  ) => void | Promise<void>;
  handleExpandedProfileOpenDM: (userId: string) => void | Promise<void>;
  handleExpandedProfileSendFriendRequest: Ctx['onMemberPopoutSendFriendRequest'];
  isSelfProfilePopoutOpen: Ref<boolean>;
  selfProfile: Ctx['selfProfile'];
  selfProfileAnchor: Ctx['selfProfileAnchor'];
  customStatus: Ctx['customStatus'];
  handleUpdateCustomStatus: Ctx['onUpdateCustomStatus'];
  updateCurrentUserStatus: Ctx['onUpdateCurrentUserStatus'];
  openExpandedProfileFromSelfPopout: Ctx['onOpenExpandedProfileFromSelfPopout'];
  isExpandedProfileSidePanel: Ctx['isExpandedProfileSidePanel'];
  isExpandedProfileModalOpen: Ctx['isExpandedProfileModalOpen'];
  presenceByUserId: Ctx['expandedProfilePresenceByUserId'];
  presenceMobileByUserId: Ctx['expandedProfilePresenceMobileByUserId'];
  expandedProfile: Ctx['expandedProfile'];
  isExpandedProfileFriend: Ctx['isExpandedProfileFriend'];
  isExpandedProfileOutgoingRequest: Ctx['isExpandedProfileOutgoingRequest'];
  friendshipKnown: RV<boolean>;
  workspace: Pick<
    WorkspaceStateApi,
    | 'friendIds'
    | 'friendIdsByUserId'
    | 'friendRequestsIncoming'
    | 'friendRequestsOutgoing'
    | 'blockedUserIds'
  >;
  expandedProfileNote: Ctx['expandedProfileNote'];
  handleExpandedProfileNoteFromLayout: Ctx['onUpdateExpandedProfileNote'];
  onExpandedProfileModalUpdate: (next: boolean) => void;
  handleExpandedProfileOpenServer: Ctx['onExpandedProfileOpenServer'];
  handleExpandedProfileOpenProfile: Ctx['onExpandedProfileOpenProfile'];
  handleExpandedProfileCancelOutgoingFriendRequest: Ctx['onExpandedProfileCancelOutgoingFriendRequest'];
  handleExpandedProfileAcceptIncomingFriendRequest: (userId: string) => unknown;
  handleExpandedProfileDeclineIncomingFriendRequest: (
    userId: string,
  ) => unknown;
  handleExpandedProfileRemoveFriend: Ctx['onExpandedProfileRemoveFriend'];
  isExpandedProfileTargetBlocked: Ctx['isExpandedProfileTargetBlocked'];
  guestFriendsLocked: Ctx['guestFriendsLocked'];
  isMemberPopoutTargetBlocked: Ctx['isMemberPopoutTargetBlocked'];
  handleProfileBlockUser: Ctx['onProfileBlockUser'];
  handleProfileUnblockUser: Ctx['onProfileUnblockUser'];
  handleProfileReportUser: Ctx['onProfileReportUser'];
  moderationModalOpen: Ref<boolean>;
  moderationAction: Ctx['moderationAction'];
  moderationTargetUser: Ctx['moderationTargetUser'];
  echoCapabilitiesForServerId: RV<string | null | undefined>;
  echoCanManageMessages: RV<boolean>;
  onModerationModalConfirm: Ctx['onModerationModalConfirm'];
  isLeaveServerModalOpen: Ctx['isLeaveServerModalOpen'];
  leaveServerModalVariant: Ctx['leaveServerModalVariant'];
  leaveServerModalServerName: Ctx['leaveServerModalServerName'];
  onLeaveServerModalUpdate: Ctx['onUpdateLeaveServerModal'];
  confirmLeaveServerFromModal: Ctx['onLeaveServerModalConfirm'];
  isJoinServerConfirmModalOpen: Ctx['isJoinServerConfirmModalOpen'];
  joinServerConfirmPreview: Ctx['joinServerConfirmPreview'];
  joinServerConfirmBusy: Ctx['joinServerConfirmBusy'];
  onJoinServerConfirmModalUpdate: Ctx['onUpdateJoinServerConfirmModal'];
  confirmJoinServerFromModal: Ctx['onJoinServerConfirmModalConfirm'];
  isServerApplicationModalOpen: Ctx['isServerApplicationModalOpen'];
  serverApplicationPayload: Ctx['serverApplicationPayload'];
  serverApplicationBusy: Ctx['serverApplicationBusy'];
  onServerApplicationModalUpdate: Ctx['onUpdateServerApplicationModal'];
  confirmServerApplicationSubmittedFromModal: Ctx['onServerApplicationModalSubmitted'];
  isEventDetailModalOpen: Ref<boolean>;
  eventDetailView: Ref<EventDetailView | null>;
  closeGuildEventDetailModal: () => void;
  submitGuildEventRsvp: (payload: {
    serverId: string;
    eventId: string;
    status: 'going' | 'declined';
    closeDetailOnDecline?: boolean;
  }) => void | Promise<void>;
  navigateGuildEventOpenPayload: (payload: {
    serverId: string;
    channelId?: string | null;
    customLocation?: string | null;
  }) => void;
  isDMPanelOpen: Ref<boolean>;
};

function createModalsDerived(deps: AppLayoutModalsProvideDeps) {
  const currentUser = computed(() =>
    unref(deps.isAuthenticated) ? (unref(deps.currentUser) ?? null) : null,
  );
  const groupSettingsName = computed(() => {
    const gid = unref(deps.activeGroupSettingsId);
    const gdm = unref(deps.groupDMs);
    if (gid && gdm && gdm[gid]) return gdm[gid].name;
    return unref(deps.effectiveActiveChannel)?.name ?? '';
  });
  const groupSettingsPfp = computed(() => {
    const gid = unref(deps.activeGroupSettingsId);
    const gdm = unref(deps.groupDMs);
    if (gid && gdm && gdm[gid]) return gdm[gid].pfp ?? '';
    return unref(deps.activeGroupDM)?.pfp ?? '';
  });
  const moderationCanPurgeBanMessages = computed(() => {
    const s = deps.selectedServer.value;
    if (!s?.id || !deps.isEchoGraphId(s.id)) return false;
    return (
      unref(deps.echoCapabilitiesForServerId) === s.id &&
      unref(deps.echoCanManageMessages) === true
    );
  });
  const serverSettingsGuildStructureEnabled = computed(() => {
    const s = deps.selectedServer.value;
    if (!s || s.id === 'echo') return false;
    if (!deps.isEchoGraphId(s.id ?? '')) return false;
    return unref(deps.canCreateChannels);
  });
  return {
    currentUser,
    groupSettingsName,
    groupSettingsPfp,
    moderationCanPurgeBanMessages,
    serverSettingsGuildStructureEnabled,
    expandedProfileHideOpenDmButton: computed(() => false),
  };
}

/**
 * Global layout modals injection. Consumed via inject(LAYOUT_MODALS_KEY).
 */
export function useAppLayoutModalsProvide(deps: AppLayoutModalsProvideDeps) {
  provide(
    LAYOUT_MODALS_KEY,
    assembleAppLayoutModalsContext(deps, createModalsDerived(deps)),
  );
}
