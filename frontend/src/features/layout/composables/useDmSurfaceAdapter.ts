import { computed, type ComputedRef } from 'vue';
import type {
  DmSurfaceAdapter,
  DmSurfaceGroup,
  DmSurfaceIntents,
  DmSurfaceModel,
  DmSurfaceUser,
} from '@/features/layout/regionAdapters';
import type { ActiveDmThreadCallUi } from '@/features/layout/dmThreadCallUi';
import type { DmSubView } from '@/features/layout/mainSurface';

export function useDmSurfaceAdapter(deps: {
  dmPartnerUser: ComputedRef<DmSurfaceUser | null>;
  activeGroupDM: ComputedRef<DmSurfaceGroup | null>;
  activeDmThreadCallUi: ComputedRef<ActiveDmThreadCallUi | null>;
  isGroupDM: ComputedRef<boolean>;
  isInDMMode: ComputedRef<boolean>;
  isInDMChat: ComputedRef<boolean>;
  dmActiveTab: ComputedRef<DmSubView>;
  presenceByUserId: ComputedRef<Record<string, string | undefined>>;
  presenceMobileByUserId: ComputedRef<Record<string, true> | undefined>;
  activeGroupCallMembers: ComputedRef<
    { id: string; name: string; pfp: string; status?: string }[]
  >;
  openExpandedProfilePanelForUserId: (userId: string) => void;
  handleExpandedProfileOpenProfile: (userId: string) => void;
  openGroupOverviewPanel: (groupId?: string) => void;
  openGroupSettingsFromHeader: (focus?: 'name' | 'icon') => void;
}): DmSurfaceAdapter {
  const model = computed<DmSurfaceModel>(() => ({
    partnerUser: deps.dmPartnerUser.value,
    activeGroupDm: deps.activeGroupDM.value,
    activeDmThreadCallUi: deps.activeDmThreadCallUi.value,
    isGroupDM: deps.isGroupDM.value,
    isInDMMode: deps.isInDMMode.value,
    isInDMChat: deps.isInDMChat.value,
    dmActiveTab: deps.dmActiveTab.value,
    presenceByUserId: deps.presenceByUserId.value,
    presenceMobileByUserId: deps.presenceMobileByUserId.value,
    activeGroupCallMembers: deps.activeGroupCallMembers.value,
  }));

  const intents: DmSurfaceIntents = {
    openProfilePanelForUserId: deps.openExpandedProfilePanelForUserId,
    openProfileModal: deps.handleExpandedProfileOpenProfile,
    openGroupOverviewPanel: deps.openGroupOverviewPanel,
    openGroupSettingsFromHeader: deps.openGroupSettingsFromHeader,
  };

  return { model, intents };
}
