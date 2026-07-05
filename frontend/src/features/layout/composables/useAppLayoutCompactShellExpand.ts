import type { ComputedRef, Ref } from 'vue';
import type { MobileBottomTabId } from '@/features/layout/mobileBottomTab';

export function useAppLayoutCompactShellExpand(deps: {
  isCompactShell: Ref<boolean>;
  hasGuildChannelChrome: ComputedRef<boolean>;
  isCompactGuildSplitShell: Ref<boolean>;
  useCompactPhoneTabShell: Ref<boolean>;
  compactGuildTriPaneChannelPanelOpen: Ref<boolean>;
  compactPagerPane: Ref<number>;
  memberPanelCollapsed: Ref<boolean>;
  mobileChannelSheetOpen: Ref<boolean>;
  mobileMembersOverlayOpen: Ref<boolean>;
  mobileBottomTab?: Ref<MobileBottomTabId>;
  mobileServersStack?: Ref<'list' | 'guild'>;
  hasActiveGuildChannel?: () => boolean;
  expandChannelsGrid: () => void;
  markMemberPanelExpandedByUser: () => void;
  markMemberPanelCollapsedByUser: () => void;
}): {
  expandChannels: () => void;
  expandMembers: () => void;
  collapseMembers: () => void;
} {
  function focusPhoneServersGuildSurface() {
    if (deps.mobileBottomTab) {
      deps.mobileBottomTab.value = 'servers';
    }
    if (deps.mobileServersStack && deps.hasActiveGuildChannel?.()) {
      deps.mobileServersStack.value = 'guild';
    }
  }

  function expandChannels() {
    if (deps.useCompactPhoneTabShell.value) {
      focusPhoneServersGuildSurface();
      deps.mobileChannelSheetOpen.value = true;
      return;
    }
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
    if (deps.useCompactPhoneTabShell.value) {
      focusPhoneServersGuildSurface();
      deps.mobileMembersOverlayOpen.value = true;
      deps.memberPanelCollapsed.value = false;
      deps.markMemberPanelExpandedByUser();
      return;
    }
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
    if (deps.useCompactPhoneTabShell.value) {
      deps.mobileMembersOverlayOpen.value = false;
      deps.memberPanelCollapsed.value = true;
      deps.markMemberPanelCollapsedByUser();
      return;
    }
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
  useCompactPhoneTabShell: Ref<boolean>;
  compactPagerPane: Ref<number>;
  memberPanelCollapsed: Ref<boolean>;
  mobileMembersOverlayOpen: Ref<boolean>;
  mobileBottomTab?: Ref<MobileBottomTabId>;
  mobileServersStack?: Ref<'list' | 'guild'>;
  hasActiveGuildChannel?: () => boolean;
  toggleMemberListBase: () => void;
  markMemberPanelExpandedByUser: () => void;
  markMemberPanelCollapsedByUser: () => void;
}): () => void {
  return function toggleMemberList() {
    if (deps.useCompactPhoneTabShell.value) {
      const opening = !deps.mobileMembersOverlayOpen.value;
      if (opening) {
        if (deps.mobileBottomTab) {
          deps.mobileBottomTab.value = 'servers';
        }
        if (deps.mobileServersStack && deps.hasActiveGuildChannel?.()) {
          deps.mobileServersStack.value = 'guild';
        }
      }
      deps.mobileMembersOverlayOpen.value = opening;
      deps.memberPanelCollapsed.value = !opening;
      if (opening) {
        deps.markMemberPanelExpandedByUser();
      } else {
        deps.markMemberPanelCollapsedByUser();
      }
      return;
    }
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
