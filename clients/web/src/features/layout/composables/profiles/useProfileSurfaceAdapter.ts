import { computed, type ComputedRef } from 'vue';
import type {
  ProfileSurfaceAdapter,
  ProfileSurfaceIntents,
  ProfileSurfaceModel,
} from '@/features/layout/regionAdapters';
import type { ExpandedProfile } from '@/features/member-profile/memberProfiles';

export function useProfileSurfaceAdapter(deps: {
  currentUserId: ComputedRef<string | undefined>;
  expandedProfile: ComputedRef<ExpandedProfile | null>;
  expandedProfileLoading: ComputedRef<boolean>;
  expandedProfileNote: ComputedRef<string>;
  isExpandedProfileSidePanel: ComputedRef<boolean>;
  isExpandedProfileModalOpen: ComputedRef<boolean>;
  isExpandedProfileTargetBlocked: ComputedRef<boolean>;
  friendshipKnown: ComputedRef<boolean>;
  friendIds: ComputedRef<string[]>;
  friendIdsByUserId: ComputedRef<Record<string, string[]>>;
  friendRequestsIncoming: ComputedRef<{ id?: string; fromUserId: string }[]>;
  friendRequestsOutgoing: ComputedRef<{ id?: string; toUserId: string }[]>;
  blockedUserIds: ComputedRef<string[]>;
  guestFriendsLocked: ComputedRef<boolean>;
  presenceMobileByUserId: ComputedRef<Record<string, true> | undefined>;
  hideOpenDmButton: ComputedRef<boolean>;
  onUpdateExpandedProfileNote: (note: string) => void;
  onExpandedProfileModalUpdate: (next: boolean) => void;
  handleExpandedProfileOpenServer: (serverId: string) => void;
  handleExpandedProfileOpenProfile: (userId: string) => void;
  expandDmProfileToFullModal: () => void;
  handleExpandedProfileOpenDM: (userId: string) => void;
  handleExpandedProfileSendFriendRequest: (userId: string) => void;
  handleExpandedProfileCancelOutgoingFriendRequest: (userId: string) => void;
  handleExpandedProfileAcceptIncomingFriendRequest?: (userId: string) => void;
  handleExpandedProfileDeclineIncomingFriendRequest?: (userId: string) => void;
  handleExpandedProfileRemoveFriend: (userId: string) => void | Promise<void>;
  handleProfileBlockUser: (userId: string) => void | Promise<void>;
  handleProfileUnblockUser: (userId: string) => void | Promise<void>;
  handleProfileReportUser: (payload: {
    userId: string;
    reason: string;
  }) => void | Promise<void>;
}): ProfileSurfaceAdapter {
  const model = computed<ProfileSurfaceModel>(() => ({
    currentUserId: deps.currentUserId.value,
    expandedProfile: deps.expandedProfile.value,
    expandedProfileLoading: deps.expandedProfileLoading.value,
    expandedProfileNote: deps.expandedProfileNote.value,
    isExpandedProfileSidePanel: deps.isExpandedProfileSidePanel.value,
    isExpandedProfileModalOpen: deps.isExpandedProfileModalOpen.value,
    isExpandedProfileTargetBlocked: deps.isExpandedProfileTargetBlocked.value,
    friendshipKnown: deps.friendshipKnown.value,
    friendIds: deps.friendIds.value,
    friendIdsByUserId: deps.friendIdsByUserId.value,
    friendRequestsIncoming: deps.friendRequestsIncoming.value,
    friendRequestsOutgoing: deps.friendRequestsOutgoing.value,
    blockedUserIds: deps.blockedUserIds.value,
    guestFriendsLocked: deps.guestFriendsLocked.value,
    presenceMobileByUserId: deps.presenceMobileByUserId.value,
    hideOpenDmButton: deps.hideOpenDmButton.value,
  }));

  const intents: ProfileSurfaceIntents = {
    updateNote: deps.onUpdateExpandedProfileNote,
    setModalOpen: deps.onExpandedProfileModalUpdate,
    openServer: deps.handleExpandedProfileOpenServer,
    openProfile: deps.handleExpandedProfileOpenProfile,
    expandProfileModal: deps.expandDmProfileToFullModal,
    openDm: deps.handleExpandedProfileOpenDM,
    sendFriendRequest: deps.handleExpandedProfileSendFriendRequest,
    cancelOutgoingFriendRequest:
      deps.handleExpandedProfileCancelOutgoingFriendRequest,
    acceptIncomingFriendRequest:
      deps.handleExpandedProfileAcceptIncomingFriendRequest,
    declineIncomingFriendRequest:
      deps.handleExpandedProfileDeclineIncomingFriendRequest,
    removeFriend: deps.handleExpandedProfileRemoveFriend,
    blockUser: deps.handleProfileBlockUser,
    unblockUser: deps.handleProfileUnblockUser,
    reportUser: deps.handleProfileReportUser,
  };

  return { model, intents };
}
