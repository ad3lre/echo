import { computed, type Ref } from 'vue';
import type {
  MemberProfile,
  PopoutAnchorRect,
} from '@/features/member-profile/memberProfiles';
import type { AppLayoutControllerContext } from '../controller/appLayoutControllerTypes';

type ProfileSliceKeys =
  | 'activeMemberNote'
  | 'expandedProfileNote'
  | 'handleCallViewOpenProfile'
  | 'handleExpandedProfileNoteFromLayout'
  | 'handleExpandedProfileOpenDM'
  | 'handleMemberPopoutQuickDm'
  | 'handleExpandedProfileOpenProfile'
  | 'handleExpandedProfileRemoveFriend'
  | 'handleExpandedProfileSendFriendRequest'
  | 'handleExpandedProfileCancelOutgoingFriendRequest'
  | 'handleProfileBlockUser'
  | 'handleProfileUnblockUser'
  | 'handleProfileReportUser'
  | 'isExpandedProfileTargetBlocked'
  | 'isExpandedProfileOutgoingRequest'
  | 'isMemberPopoutTargetBlocked'
  | 'isExpandedProfileFriend'
  | 'isMemberPopoutFriend'
  | 'isMemberPopoutCanSendFriendRequest'
  | 'memberListUsers'
  | 'serverSettingsMemberUsers'
  | 'usersForChannelPanel'
  | 'usersForMentionAutocomplete'
  | 'rolesForMentionAutocomplete'
  | 'onExpandedProfileModalUpdate'
  | 'openExpandedProfileDmFromComposable'
  | 'openExpandedProfileFromMemberPopout'
  | 'openExpandedProfileFromSelfPopout'
  | 'openExpandedProfilePanelForUserId'
  | 'openExtendedProfileModalForUserId'
  | 'expandDmProfileToFullModal'
  | 'openMemberProfile'
  | 'openMemberProfileFromMemberColumn'
  | 'openProfileFromContextMenu'
  | 'openSelfProfile'
  | 'updateProfileNote'
  | 'isSystemSettingsOpen'
  | 'isUserSettingsOpen'
  | 'memberListCollapsed'
  | 'memberListWidth'
  | 'memberProfileUserId'
  | 'membersForMemberList'
  | 'toggleMemberList';

export function useAppLayoutContextProfileSlice(deps: {
  openMemberProfile: AppLayoutControllerContext['openMemberProfile'];
  activeMemberNote: AppLayoutControllerContext['activeMemberNote'];
  expandedProfileNote: AppLayoutControllerContext['expandedProfileNote'];
  updateProfileNote: AppLayoutControllerContext['updateProfileNote'];
  openSelfProfile: AppLayoutControllerContext['openSelfProfile'];
  openExpandedProfileFromMemberPopout: AppLayoutControllerContext['openExpandedProfileFromMemberPopout'];
  openExpandedProfileFromSelfPopout: AppLayoutControllerContext['openExpandedProfileFromSelfPopout'];
  openExpandedProfilePanelForUserId: AppLayoutControllerContext['openExpandedProfilePanelForUserId'];
  openExtendedProfileModalForUserId: AppLayoutControllerContext['openExtendedProfileModalForUserId'];
  expandDmProfileToFullModal: AppLayoutControllerContext['expandDmProfileToFullModal'];
  handleExpandedProfileOpenProfile: AppLayoutControllerContext['handleExpandedProfileOpenProfile'];
  handleExpandedProfileOpenDM: (
    userId: string,
    onSelectDM: (id: string) => void | Promise<unknown>,
    onSetDmRail: () => void,
  ) => void;
  handleMemberPopoutQuickDm: AppLayoutControllerContext['handleMemberPopoutQuickDm'];
  handleExpandedProfileRemoveFriend: AppLayoutControllerContext['handleExpandedProfileRemoveFriend'];
  handleExpandedProfileCancelOutgoingFriendRequest: AppLayoutControllerContext['handleExpandedProfileCancelOutgoingFriendRequest'];
  handleProfileBlockUser: AppLayoutControllerContext['handleProfileBlockUser'];
  handleProfileUnblockUser: AppLayoutControllerContext['handleProfileUnblockUser'];
  handleProfileReportUser: AppLayoutControllerContext['handleProfileReportUser'];
  isExpandedProfileTargetBlocked: AppLayoutControllerContext['isExpandedProfileTargetBlocked'];
  isExpandedProfileOutgoingRequest: AppLayoutControllerContext['isExpandedProfileOutgoingRequest'];
  isMemberPopoutTargetBlocked: AppLayoutControllerContext['isMemberPopoutTargetBlocked'];
  isExpandedProfileFriend: AppLayoutControllerContext['isExpandedProfileFriend'];
  isMemberPopoutFriend: AppLayoutControllerContext['isMemberPopoutFriend'];
  isMemberPopoutCanSendFriendRequest: AppLayoutControllerContext['isMemberPopoutCanSendFriendRequest'];
  memberListUsers: AppLayoutControllerContext['memberListUsers'];
  serverSettingsMemberUsers: AppLayoutControllerContext['serverSettingsMemberUsers'];
  usersForChannelPanel: AppLayoutControllerContext['usersForChannelPanel'];
  usersForMentionAutocomplete: AppLayoutControllerContext['usersForMentionAutocomplete'];
  rolesForMentionAutocomplete: AppLayoutControllerContext['rolesForMentionAutocomplete'];
  onExpandedProfileModalUpdate: AppLayoutControllerContext['onExpandedProfileModalUpdate'];
  expandedProfile: Ref<{ id?: string } | null>;
  selectDmUser: (id: string) => Promise<string | null>;
  selectDMTab: () => void;
  sendFriendRequest: (id: string) => Promise<void> | void;
  memberPopoutOpenRolesPanel: { value: boolean };
  isSystemSettingsOpen: AppLayoutControllerContext['isSystemSettingsOpen'];
  isUserSettingsOpen: AppLayoutControllerContext['isUserSettingsOpen'];
  memberListCollapsed: AppLayoutControllerContext['memberListCollapsed'];
  memberListWidth: AppLayoutControllerContext['memberListWidth'];
  activeMemberProfile: Ref<MemberProfile | null>;
  membersForMemberList: AppLayoutControllerContext['membersForMemberList'];
  toggleMemberList: AppLayoutControllerContext['toggleMemberList'];
}) {
  const memberProfileUserId = computed(
    () => deps.activeMemberProfile.value?.id ?? null,
  );

  const slice: Pick<AppLayoutControllerContext, ProfileSliceKeys> = {
    openMemberProfile: deps.openMemberProfile,
    activeMemberNote: deps.activeMemberNote,
    expandedProfileNote: deps.expandedProfileNote,
    updateProfileNote: deps.updateProfileNote,
    openSelfProfile: deps.openSelfProfile,
    openExpandedProfileFromMemberPopout:
      deps.openExpandedProfileFromMemberPopout,
    openExpandedProfileFromSelfPopout: deps.openExpandedProfileFromSelfPopout,
    openExpandedProfilePanelForUserId: deps.openExpandedProfilePanelForUserId,
    openExtendedProfileModalForUserId: deps.openExtendedProfileModalForUserId,
    expandDmProfileToFullModal: deps.expandDmProfileToFullModal,
    handleExpandedProfileOpenProfile: deps.handleExpandedProfileOpenProfile,
    handleExpandedProfileOpenDM: (uid: string) => {
      deps.handleExpandedProfileOpenDM(
        uid,
        deps.selectDmUser,
        deps.selectDMTab,
      );
    },
    handleMemberPopoutQuickDm: deps.handleMemberPopoutQuickDm,
    handleExpandedProfileRemoveFriend: deps.handleExpandedProfileRemoveFriend,
    handleExpandedProfileSendFriendRequest: (uid: string) => {
      void deps.sendFriendRequest(uid);
    },
    handleExpandedProfileCancelOutgoingFriendRequest:
      deps.handleExpandedProfileCancelOutgoingFriendRequest,
    handleProfileBlockUser: deps.handleProfileBlockUser,
    handleProfileUnblockUser: deps.handleProfileUnblockUser,
    handleProfileReportUser: deps.handleProfileReportUser,
    isExpandedProfileTargetBlocked: deps.isExpandedProfileTargetBlocked,
    isExpandedProfileOutgoingRequest: deps.isExpandedProfileOutgoingRequest,
    isMemberPopoutTargetBlocked: deps.isMemberPopoutTargetBlocked,
    isExpandedProfileFriend: deps.isExpandedProfileFriend,
    isMemberPopoutFriend: deps.isMemberPopoutFriend,
    isMemberPopoutCanSendFriendRequest: deps.isMemberPopoutCanSendFriendRequest,
    memberListUsers: deps.memberListUsers,
    serverSettingsMemberUsers: deps.serverSettingsMemberUsers,
    usersForChannelPanel: deps.usersForChannelPanel,
    usersForMentionAutocomplete: deps.usersForMentionAutocomplete,
    rolesForMentionAutocomplete: deps.rolesForMentionAutocomplete,
    onExpandedProfileModalUpdate: deps.onExpandedProfileModalUpdate,
    openExpandedProfileDmFromComposable: (
      uid: string,
      sel: (id: string) => void | Promise<unknown>,
      set: () => void,
    ) => {
      deps.handleExpandedProfileOpenDM(uid, sel, set);
    },
    handleCallViewOpenProfile: (
      userId: string,
      anchorRect: PopoutAnchorRect | null,
    ) => {
      if (!userId?.trim()) return;
      deps.memberPopoutOpenRolesPanel.value = false;
      deps.openMemberProfile(userId, anchorRect);
    },
    openProfileFromContextMenu: (userId: string) => {
      if (!userId?.trim()) return;
      deps.memberPopoutOpenRolesPanel.value = false;
      deps.handleExpandedProfileOpenProfile(userId, {
        skipInteractionGuard: true,
      });
    },
    openMemberProfileFromMemberColumn: (p: {
      userId: string;
      anchorRect?: PopoutAnchorRect | null;
      rolesPanel?: boolean;
      fromContextMenu?: boolean;
    }) => {
      if (!p?.userId) return;
      if (p.rolesPanel) {
        deps.memberPopoutOpenRolesPanel.value = true;
        deps.openMemberProfile(p.userId, p.anchorRect ?? null);
        return;
      }
      if (p.fromContextMenu) {
        deps.memberPopoutOpenRolesPanel.value = false;
        deps.handleExpandedProfileOpenProfile(p.userId, {
          skipInteractionGuard: true,
        });
        return;
      }
      deps.memberPopoutOpenRolesPanel.value = false;
      deps.openMemberProfile(p.userId, p.anchorRect ?? null);
    },
    handleExpandedProfileNoteFromLayout: (n: string) => {
      const id = deps.expandedProfile.value?.id ?? null;
      if (id) deps.updateProfileNote(id, n);
    },
    isSystemSettingsOpen: deps.isSystemSettingsOpen,
    isUserSettingsOpen: deps.isUserSettingsOpen,
    memberListCollapsed: deps.memberListCollapsed,
    memberListWidth: deps.memberListWidth,
    memberProfileUserId,
    membersForMemberList: deps.membersForMemberList,
    toggleMemberList: deps.toggleMemberList,
  };
  return slice;
}

export type BuildAppLayoutProfileSliceDeps = Parameters<
  typeof useAppLayoutContextProfileSlice
>[0];

export function buildAppLayoutProfileSliceDeps(
  deps: BuildAppLayoutProfileSliceDeps,
): BuildAppLayoutProfileSliceDeps {
  return deps;
}
