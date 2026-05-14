import type { Ref } from 'vue';

export function createHandleExpandedProfileOpenServer(deps: {
  openServerSurface: (serverId: string) => void;
  isExpandedProfileModalOpen: Ref<boolean>;
  isExpandedProfileSidePanel: Ref<boolean>;
  isGroupOverviewOpen: Ref<boolean>;
  expandedProfile: Ref<unknown | null>;
}) {
  return (serverId: string) => {
    const nextServerId = serverId.trim();
    if (!nextServerId) return;
    deps.openServerSurface(nextServerId);
    deps.isExpandedProfileModalOpen.value = false;
    deps.isExpandedProfileSidePanel.value = false;
    deps.isGroupOverviewOpen.value = false;
    deps.expandedProfile.value = null;
  };
}
