import type { ComputedRef, Ref } from 'vue';

export function useAppLayoutCompactShellExpand(deps: {
  isCompactShell: Ref<boolean>;
  hasGuildChannelChrome: ComputedRef<boolean>;
  isCompactGuildSplitShell: Ref<boolean>;
  compactGuildTriPaneChannelPanelOpen: Ref<boolean>;
  compactPagerPane: Ref<number>;
  memberPanelCollapsed: Ref<boolean>;
  expandChannelsGrid: () => void;
  markMemberPanelExpandedByUser: () => void;
  markMemberPanelCollapsedByUser: () => void;
}): {
  expandChannels: () => void;
  expandMembers: () => void;
  collapseMembers: () => void;
} {
  function expandChannels() {
    if (
      deps.isCompactShell.value &&
      deps.hasGuildChannelChrome.value &&
      deps.isCompactGuildSplitShell.value
    ) {
      return;
    }
    if (deps.isCompactShell.value && deps.hasGuildChannelChrome.value) {
      deps.compactGuildTriPaneChannelPanelOpen.value = true;
      deps.compactPagerPane.value = 0;
      return;
    }
    deps.expandChannelsGrid();
  }

  function expandMembers() {
    if (
      deps.isCompactShell.value &&
      deps.hasGuildChannelChrome.value &&
      deps.isCompactGuildSplitShell.value
    ) {
      deps.memberPanelCollapsed.value = false;
      deps.markMemberPanelExpandedByUser();
      return;
    }
    if (deps.isCompactShell.value && deps.hasGuildChannelChrome.value) {
      deps.compactPagerPane.value = 2;
      return;
    }
    deps.memberPanelCollapsed.value = false;
    deps.markMemberPanelExpandedByUser();
  }

  function collapseMembers() {
    if (
      deps.isCompactShell.value &&
      deps.hasGuildChannelChrome.value &&
      deps.isCompactGuildSplitShell.value
    ) {
      deps.memberPanelCollapsed.value = true;
      deps.markMemberPanelCollapsedByUser();
      return;
    }
    if (deps.isCompactShell.value && deps.hasGuildChannelChrome.value) {
      if (deps.compactPagerPane.value === 2) {
        deps.compactPagerPane.value = 1;
      }
      deps.memberPanelCollapsed.value = true;
      deps.markMemberPanelCollapsedByUser();
      return;
    }
    deps.memberPanelCollapsed.value = true;
    deps.markMemberPanelCollapsedByUser();
  }

  return { expandChannels, expandMembers, collapseMembers };
}

export function createAppLayoutToggleMemberList(deps: {
  isCompactShell: Ref<boolean>;
  hasGuildChannelChrome: ComputedRef<boolean>;
  isCompactGuildSplitShell: Ref<boolean>;
  compactPagerPane: Ref<number>;
  memberPanelCollapsed: Ref<boolean>;
  toggleMemberListBase: () => void;
  markMemberPanelExpandedByUser: () => void;
  markMemberPanelCollapsedByUser: () => void;
}): () => void {
  return function toggleMemberList() {
    if (
      deps.isCompactShell.value &&
      deps.hasGuildChannelChrome.value &&
      !deps.isCompactGuildSplitShell.value
    ) {
      deps.compactPagerPane.value = deps.compactPagerPane.value === 2 ? 1 : 2;
      return;
    }
    const wasCollapsed = deps.memberPanelCollapsed.value;
    deps.toggleMemberListBase();
    if (!deps.memberPanelCollapsed.value && wasCollapsed) {
      deps.markMemberPanelExpandedByUser();
    } else if (deps.memberPanelCollapsed.value && !wasCollapsed) {
      deps.markMemberPanelCollapsedByUser();
    }
  };
}
