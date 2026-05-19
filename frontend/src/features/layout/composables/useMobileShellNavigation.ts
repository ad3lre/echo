import { type Ref } from 'vue';
import {
  planMobileShellBack,
  type MobileShellBackSnapshot,
} from '@/features/layout/mobileShellBackReducer';

export type UseMobileShellNavigationOptions = {
  isCompactShell: Ref<boolean>;
  useCompactTriPaneShell: Ref<boolean>;
  useCompactExploreShell: Ref<boolean>;
  useCompactDmShell: Ref<boolean>;
  useCompactStackShell: Ref<boolean>;
  isExploreView: Ref<boolean>;
  compactPagerPane: Ref<0 | 1 | 2>;
  compactExplorePane: Ref<0 | 1>;
  compactDmPane: Ref<0 | 1>;
  compactGuildTriPaneChannelPanelOpen: Ref<boolean>;
  selectServersRailOnly: () => void;
  closeDMPanel: () => void;
};

function historyLengthSafe(): number {
  if (typeof window === 'undefined') return 1;
  return window.history.length;
}

export function useMobileShellNavigation(
  opts: UseMobileShellNavigationOptions,
) {
  function snapshot(): MobileShellBackSnapshot {
    return {
      useCompactTriPaneShell: opts.useCompactTriPaneShell.value,
      useCompactExploreShell: opts.useCompactExploreShell.value,
      useCompactDmShell: opts.useCompactDmShell.value,
      useCompactStackShell: opts.useCompactStackShell.value,
      isExploreView: opts.isExploreView.value,
      compactPagerPane: opts.compactPagerPane.value,
      compactExplorePane: opts.compactExplorePane.value,
      compactDmPane: opts.compactDmPane.value,
      compactGuildTriPaneChannelPanelOpen:
        opts.compactGuildTriPaneChannelPanelOpen.value,
    };
  }

  function mobileShellGoBack(): boolean {
    const plan = planMobileShellBack(snapshot(), {
      isCompactShell: opts.isCompactShell.value,
      historyLength: historyLengthSafe(),
    });

    switch (plan.kind) {
      case 'noop_desktop':
        opts.selectServersRailOnly();
        return true;
      case 'tri_pane_pager':
        opts.compactPagerPane.value = plan.next;
        return true;
      case 'tri_pane_collapse_channel_stack':
        opts.compactGuildTriPaneChannelPanelOpen.value = false;
        return true;
      case 'explore_pane':
        opts.compactExplorePane.value = plan.next;
        return true;
      case 'dm_pane':
        opts.compactDmPane.value = plan.next;
        return true;
      case 'history_back':
        if (typeof window !== 'undefined') window.history.back();
        else opts.selectServersRailOnly();
        return true;
      case 'close_dm_panel':
        opts.closeDMPanel();
        return true;
      case 'servers_rail_only':
        opts.selectServersRailOnly();
        return true;
    }
  }

  return {
    mobileShellGoBack,
  };
}
