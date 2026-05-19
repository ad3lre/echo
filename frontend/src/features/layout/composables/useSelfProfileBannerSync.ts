import { watch, type ComputedRef, type Ref } from 'vue';
import {
  buildExpandedProfile,
  type ExpandedProfile,
  type MemberProfile,
} from '@/utils/memberProfiles';
import type { WorkspaceStateApi } from '@/composables/workspace/types';

export function useSelfProfileBannerSync(deps: {
  currentUser: ComputedRef<
    | {
        id: string;
        bannerImage?: string;
        bannerColor?: string;
        bannerRefractionEnabled?: boolean;
        bannerBlurEnabled?: boolean;
        bannerBlackoutEnabled?: boolean;
      }
    | undefined
  >;
  selfProfile: ComputedRef<MemberProfile | null>;
  isExpandedProfileModalOpen: Ref<boolean>;
  isMemberPopoutOpen: Ref<boolean>;
  expandedProfile: Ref<ExpandedProfile | null>;
  activeMemberProfile: Ref<MemberProfile | null>;
  workspace: WorkspaceStateApi;
}) {
  const {
    currentUser,
    selfProfile,
    isExpandedProfileModalOpen,
    isMemberPopoutOpen,
    expandedProfile,
    activeMemberProfile,
    workspace,
  } = deps;

  watch(
    () => [
      currentUser.value?.bannerImage,
      currentUser.value?.bannerColor,
      currentUser.value?.bannerRefractionEnabled,
      currentUser.value?.bannerBlurEnabled,
      currentUser.value?.bannerBlackoutEnabled,
    ],
    () => {
      const cur = currentUser.value;
      if (!cur) return;

      const updatedBaseProfile = selfProfile.value;
      if (!updatedBaseProfile) return;

      if (
        isExpandedProfileModalOpen.value &&
        expandedProfile.value &&
        expandedProfile.value.id === cur.id
      ) {
        expandedProfile.value = buildExpandedProfile(
          updatedBaseProfile,
          cur.id,
          {
            servers: workspace.servers.value,
            users: workspace.users.value,
            serverMemberIds: workspace.serverMemberIds.value,
            friendIdsByUserId: workspace.friendIdsByUserId.value,
          },
        );
      }

      if (
        isMemberPopoutOpen.value &&
        activeMemberProfile.value &&
        activeMemberProfile.value.id === cur.id
      ) {
        activeMemberProfile.value = updatedBaseProfile;
      }
    },
  );
}
