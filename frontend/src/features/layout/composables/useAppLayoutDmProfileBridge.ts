import { watch, type ComputedRef, type Ref } from 'vue';

export function useAppLayoutDmProfileBridge(deps: {
  dmPartnerUser: ComputedRef<{ id: string } | null | undefined>;
  /** DM rail + selected peer user id (1:1 thread); false while viewing a group DM. */
  isInDMChat: ComputedRef<boolean>;
  /** Main surface is a DM thread / idle DM — true for both peer and group threads. */
  isInDmThreadOrIdleMainSurface: ComputedRef<boolean>;
  isExpandedProfileSidePanel: Ref<boolean>;
  isExpandedProfileModalOpen: Ref<boolean>;
  expandedProfile: Ref<{ id?: string } | null>;
  isGroupOverviewOpen: Ref<boolean>;
  isGroupDM: ComputedRef<boolean>;
  openExpandedProfilePanelForUserId: (userId: string) => void;
}) {
  watch(deps.dmPartnerUser, (next) => {
    if (!next) return;
    if (
      !deps.isInDMChat.value ||
      !deps.isExpandedProfileSidePanel.value ||
      !deps.isExpandedProfileModalOpen.value
    )
      return;
    if (deps.expandedProfile.value?.id === next.id) return;
    deps.openExpandedProfilePanelForUserId(next.id);
  });

  watch(deps.isInDmThreadOrIdleMainSurface, (inDmSurface) => {
    if (
      !inDmSurface &&
      (deps.isExpandedProfileSidePanel.value || deps.isGroupOverviewOpen.value)
    ) {
      deps.isExpandedProfileModalOpen.value = false;
      deps.isExpandedProfileSidePanel.value = false;
      deps.expandedProfile.value = null;
      deps.isGroupOverviewOpen.value = false;
    }
  });

  watch(
    [deps.isGroupDM, deps.isInDmThreadOrIdleMainSurface],
    ([groupMode, inDmSurface], [prevGroupMode]) => {
      if (groupMode && !prevGroupMode && inDmSurface) {
        if (
          deps.isExpandedProfileSidePanel.value &&
          deps.isExpandedProfileModalOpen.value
        ) {
          deps.isExpandedProfileModalOpen.value = false;
          deps.isExpandedProfileSidePanel.value = false;
          deps.expandedProfile.value = null;
          deps.isGroupOverviewOpen.value = true;
        }
      }
    },
  );
}
