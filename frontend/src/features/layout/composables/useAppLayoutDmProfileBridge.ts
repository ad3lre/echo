import { watch, type ComputedRef, type Ref } from 'vue';
import { dmPeerUserIdFromChannelId } from '@/features/dm/buildDmPanelUserList';
import type { MainSurface } from '@/features/layout/mainSurface';

export function useAppLayoutDmProfileBridge(deps: {
  dmPartnerUser: ComputedRef<{ id: string } | null | undefined>;
  /** Main surface is a DM thread / idle DM — true for both peer and group threads. */
  isInDmThreadOrIdleMainSurface: ComputedRef<boolean>;
  isExpandedProfileSidePanel: Ref<boolean>;
  isExpandedProfileModalOpen: Ref<boolean>;
  expandedProfile: Ref<{ id?: string } | null>;
  expandedProfileTargetUserId: Ref<string | null>;
  isGroupOverviewOpen: Ref<boolean>;
  isGroupDM: ComputedRef<boolean>;
  openExpandedProfilePanelForUserId: (userId: string) => void;
  activeChannelId: Ref<string>;
  echoDmPeerByChannelId: Ref<Map<string, string>>;
  selectedDMUserId: Ref<string | null>;
  mainSurface: ComputedRef<MainSurface>;
  groupDMs: Ref<Record<string, unknown>>;
}) {
  watch(
    () => [deps.activeChannelId.value, deps.mainSurface.value.type] as const,
    ([channelId, surfaceType]) => {
      if (surfaceType !== 'dmThread') return;
      if (deps.groupDMs.value[channelId]) return;
      const peer = dmPeerUserIdFromChannelId(
        channelId,
        deps.echoDmPeerByChannelId.value,
      )?.trim();
      if (!peer) return;
      if (deps.selectedDMUserId.value === peer) return;
      deps.selectedDMUserId.value = peer;
    },
  );

  watch(deps.dmPartnerUser, (next) => {
    if (!next) return;
    if (deps.isGroupOverviewOpen.value) return;
    if (deps.isGroupDM.value) return;
    if (!deps.isInDmThreadOrIdleMainSurface.value) return;
    if (!deps.isExpandedProfileModalOpen.value) return;
    const boundId =
      deps.expandedProfileTargetUserId.value?.trim() ??
      deps.expandedProfile.value?.id?.trim() ??
      '';
    if (!boundId) return;
    if (next.id === boundId) return;
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
      deps.expandedProfileTargetUserId.value = null;
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
          deps.expandedProfileTargetUserId.value = null;
          deps.isGroupOverviewOpen.value = true;
        }
      }
    },
  );
}
