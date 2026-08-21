import { computed } from 'vue';
import type {
  ChatHeaderAdapter,
  DmSurfaceAdapter,
  ProfileSurfaceAdapter,
} from '@/features/layout/regionAdapters';

export function useChatHeaderAdapter(deps: {
  dmSurface: DmSurfaceAdapter;
  profileSurface: ProfileSurfaceAdapter;
}): ChatHeaderAdapter {
  const model = computed(() => ({
    dm: deps.dmSurface.model.value,
    profile: {
      isExpandedProfileSidePanel:
        deps.profileSurface.model.value.isExpandedProfileSidePanel,
      isExpandedProfileModalOpen:
        deps.profileSurface.model.value.isExpandedProfileModalOpen,
      currentUserId: deps.profileSurface.model.value.currentUserId,
    },
  }));

  return {
    model,
    intents: {
      openProfilePanelForUserId:
        deps.dmSurface.intents.openProfilePanelForUserId,
      openProfileModal: deps.dmSurface.intents.openProfileModal,
      openGroupOverviewPanel: deps.dmSurface.intents.openGroupOverviewPanel,
      openGroupSettingsFromHeader:
        deps.dmSurface.intents.openGroupSettingsFromHeader,
    },
  };
}
