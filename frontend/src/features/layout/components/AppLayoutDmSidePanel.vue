<script setup lang="ts">
import DMProfilePanel from '@/components/DMProfilePanel.vue';
import GroupDMOverviewPanel from '@/components/GroupDMOverviewPanel.vue';
import type { ExpandedProfile } from '@/utils/memberProfiles';
import { computed } from 'vue';
import type { ProfileSurfaceAdapter } from '@/features/layout/regionAdapters';

type GroupMember = { id: string; name: string; pfp: string; status?: string };

const props = defineProps<{
  profileSurfaceAdapter?: ProfileSurfaceAdapter;
  isVisible: boolean;
  isExpandedProfileSidePanel: boolean;
  isExpandedProfileModalOpen: boolean;
  expandedProfile: ExpandedProfile | null;
  friendshipKnown: boolean;
  friendIds?: string[];
  friendIdsByUserId?: Record<string, string[]>;
  friendRequestsIncoming?: { id: string; fromUserId: string }[];
  friendRequestsOutgoing?: { id: string; toUserId: string }[];
  blockedUserIds?: string[];
  expandedProfileNote: string;
  activeGroupDm: {
    id: string;
    name: string;
    pfp?: string;
    description?: string;
  } | null;
  activeGroupCallMembers: GroupMember[];
  isGroupOverviewOpen: boolean;
  onUpdateExpandedProfileNote: (note: string) => void;
  onExpandedProfileModalUpdate: (next: boolean) => void;
  onExpandedProfileOpenServer: (serverId: string) => void;
  onExpandedProfileOpenProfile: (userId: string) => void;
  onExpandDmProfileToFullModal: () => void;
  onExpandedProfileOpenDm: (userId: string) => void;
  onExpandedProfileSendFriendRequest: (userId: string) => void;
  onExpandedProfileCancelOutgoingFriendRequest: (userId: string) => void;
  onExpandedProfileAcceptIncomingFriendRequest?: (userId: string) => void;
  onExpandedProfileDeclineIncomingFriendRequest?: (userId: string) => void;
  onExpandedProfileRemoveFriend: (userId: string) => void;
  isExpandedProfileTargetBlocked: boolean;
  guestFriendsLocked?: boolean;
  onProfileBlockUser: (userId: string) => void | Promise<void>;
  onProfileUnblockUser: (userId: string) => void | Promise<void>;
  onProfileReportUser: (payload: {
    userId: string;
    reason: string;
  }) => void | Promise<void>;
  onCloseGroupOverview: () => void;
  onEditGroupAvatar: () => void;
  onEditGroupName: () => void;
  onRenameGroupFromOverview: (name: string) => void;
  onAddGroupMembers: () => void;
  onKickGroupDmMember: (payload: { groupId: string; userId: string }) => void;
  currentUserId?: string;
  presenceByUserId?: Record<string, string | undefined>;
  presenceMobileByUserId?: Record<string, true>;
}>();

const profileModel = computed(
  () =>
    props.profileSurfaceAdapter?.model.value ?? {
      currentUserId: props.currentUserId,
      expandedProfile: props.expandedProfile,
      expandedProfileLoading: false,
      expandedProfileNote: props.expandedProfileNote,
      isExpandedProfileSidePanel: props.isExpandedProfileSidePanel,
      isExpandedProfileModalOpen: props.isExpandedProfileModalOpen,
      isExpandedProfileTargetBlocked: props.isExpandedProfileTargetBlocked,
      friendshipKnown: props.friendshipKnown,
      friendIds: props.friendIds ?? [],
      friendIdsByUserId: props.friendIdsByUserId ?? {},
      friendRequestsIncoming: props.friendRequestsIncoming ?? [],
      friendRequestsOutgoing: props.friendRequestsOutgoing ?? [],
      blockedUserIds: props.blockedUserIds ?? [],
      guestFriendsLocked: props.guestFriendsLocked ?? false,
      presenceByUserId: props.presenceByUserId ?? {},
      presenceMobileByUserId: props.presenceMobileByUserId,
      hideOpenDmButton: false,
    },
);

const profileIntents = computed(
  () =>
    props.profileSurfaceAdapter?.intents ?? {
      updateNote: props.onUpdateExpandedProfileNote,
      setModalOpen: props.onExpandedProfileModalUpdate,
      openServer: props.onExpandedProfileOpenServer,
      openProfile: props.onExpandedProfileOpenProfile,
      expandProfileModal: props.onExpandDmProfileToFullModal,
      openDm: props.onExpandedProfileOpenDm,
      sendFriendRequest: props.onExpandedProfileSendFriendRequest,
      cancelOutgoingFriendRequest:
        props.onExpandedProfileCancelOutgoingFriendRequest,
      acceptIncomingFriendRequest:
        props.onExpandedProfileAcceptIncomingFriendRequest,
      declineIncomingFriendRequest:
        props.onExpandedProfileDeclineIncomingFriendRequest,
      removeFriend: props.onExpandedProfileRemoveFriend,
      blockUser: props.onProfileBlockUser,
      unblockUser: props.onProfileUnblockUser,
      reportUser: props.onProfileReportUser,
    },
);
</script>

<template>
  <div
    v-if="isVisible"
    class="hidden h-full w-[360px] shrink-0 bg-surface lg:block"
  >
    <DMProfilePanel
      v-if="
        profileModel.isExpandedProfileSidePanel &&
        profileModel.isExpandedProfileModalOpen
      "
      :model-value="profileModel.isExpandedProfileModalOpen"
      :profile="profileModel.expandedProfile"
      :current-user-id="profileModel.currentUserId"
      :friendship-known="profileModel.friendshipKnown"
      :is-target-blocked="profileModel.isExpandedProfileTargetBlocked"
      :guest-friends-locked="profileModel.guestFriendsLocked"
      :friend-ids="profileModel.friendIds"
      :friend-ids-by-user-id="profileModel.friendIdsByUserId"
      :friend-requests-incoming="profileModel.friendRequestsIncoming"
      :friend-requests-outgoing="profileModel.friendRequestsOutgoing"
      :blocked-user-ids="profileModel.blockedUserIds"
      :presence-by-user-id="profileModel.presenceByUserId"
      :presence-mobile-by-user-id="profileModel.presenceMobileByUserId"
      :note="profileModel.expandedProfileNote"
      @update:note="profileIntents.updateNote"
      @update:model-value="profileIntents.setModalOpen"
      @open-server="profileIntents.openServer"
      @open-profile="profileIntents.openProfile"
      @expand-to-full-modal="profileIntents.expandProfileModal"
      @open-dm="profileIntents.openDm"
      @send-friend-request="profileIntents.sendFriendRequest"
      @cancel-outgoing-friend-request="
        profileIntents.cancelOutgoingFriendRequest
      "
      @accept-incoming-friend-request="
        profileIntents.acceptIncomingFriendRequest?.($event)
      "
      @decline-incoming-friend-request="
        profileIntents.declineIncomingFriendRequest?.($event)
      "
      @remove-friend="profileIntents.removeFriend"
      @block-user="profileIntents.blockUser($event)"
      @unblock-user="profileIntents.unblockUser($event)"
      @report-user="profileIntents.reportUser($event)"
    />
    <GroupDMOverviewPanel
      v-else-if="isGroupOverviewOpen && activeGroupDm"
      :group="activeGroupDm"
      :members="activeGroupCallMembers"
      :can-edit="true"
      :current-user-id="currentUserId"
      :presence-by-user-id="presenceByUserId"
      :presence-mobile-by-user-id="presenceMobileByUserId"
      @close="onCloseGroupOverview"
      @edit-avatar="onEditGroupAvatar"
      @edit-name="onEditGroupName"
      @update-group-name="onRenameGroupFromOverview"
      @add-members="onAddGroupMembers"
      @open-profile="onExpandedProfileOpenProfile($event)"
      @open-dm="onExpandedProfileOpenDm($event)"
      @block-user="onProfileBlockUser($event)"
      @kick-member="onKickGroupDmMember($event)"
    />
  </div>
</template>
