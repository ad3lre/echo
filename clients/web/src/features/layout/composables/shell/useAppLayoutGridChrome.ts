import { computed, type ComputedRef, type Ref } from 'vue';
import type { WorkspaceStateApi } from '@/features/layout/echoWorkspace/useEchoWorkspace';
import type { RailTab } from '@/features/layout/mainSurface';
import { filterPublicExploreDirectoryRows } from '@/features/layout/exploreDirectoryRows';

export function useAppLayoutGridChrome(deps: {
  workspace: WorkspaceStateApi;
  activeRailTab: Ref<RailTab>;
  isMoreServersPanelOpen: Ref<boolean>;
  isMoreServersCompact: Ref<boolean>;
  isDMPanelOpen: Ref<boolean>;
  dmPanelWidth: Ref<number>;
  channelPanelCollapsed: Ref<boolean>;
  channelPanelWidth: Ref<number>;
  pfpBarExpanded: Ref<boolean>;
  isServerEmptyOnboarding: ComputedRef<boolean>;
  isDmUiContext: ComputedRef<boolean>;
  /** When true, the 96px server rail column is collapsed (e.g. welcome-back full-bleed hero). */
  collapseServerRail: ComputedRef<boolean>;
  /** Sub-800px: single main column; rail/channels/members live inside the compact pager. */
  isCompactShell: Ref<boolean>;
  /**
   * Desktop: action rail in a top bar (Settings → Appearance). When true, the first
   * grid column is omitted — the rail is laid out in `AppLayoutLeftChrome` row 1.
   */
  actionRailTop: ComputedRef<boolean>;
}) {
  const {
    workspace,
    activeRailTab,
    isMoreServersPanelOpen,
    isMoreServersCompact,
    isDMPanelOpen,
    dmPanelWidth,
    channelPanelCollapsed,
    channelPanelWidth,
    pfpBarExpanded,
    isServerEmptyOnboarding,
    isDmUiContext,
    collapseServerRail,
    isCompactShell,
    actionRailTop,
  } = deps;

  const MORE_SERVERS_PANEL_WIDTH = 288;
  const SERVER_RAIL_WIDTH = '96px';
  const MORE_SERVERS_COMPACT_WIDTH = 80;

  /** Public directory only (GET /directory/servers or mock discoverable). Not your joined-server list. */
  const exploreDiscoverableServers = computed(() =>
    filterPublicExploreDirectoryRows(workspace.discoverableServers.value),
  );

  function expandChannels() {
    channelPanelCollapsed.value = false;
    pfpBarExpanded.value = false;
  }

  const isExploreView = computed(() => activeRailTab.value === 'explore');

  const appGridTemplateColumns = computed(() => {
    if (isCompactShell.value) {
      return 'minmax(0, 1fr)';
    }
    const channelWidth =
      channelPanelCollapsed.value ||
      isExploreView.value ||
      isServerEmptyOnboarding.value
        ? '0px'
        : `${channelPanelWidth.value}px`;
    const moreWidth = isMoreServersPanelOpen.value
      ? `${isMoreServersCompact.value ? MORE_SERVERS_COMPACT_WIDTH : MORE_SERVERS_PANEL_WIDTH}px`
      : '0px';
    const dmWidth = isDMPanelOpen.value ? `${dmPanelWidth.value}px` : '0px';

    const railSideColumn =
      actionRailTop.value || collapseServerRail.value
        ? '0px'
        : SERVER_RAIL_WIDTH;

    const chromeRowSansRail = (): string => {
      if (
        isExploreView.value ||
        isDmUiContext.value ||
        isServerEmptyOnboarding.value
      ) {
        return `${moreWidth} ${dmWidth} minmax(0, 1fr)`;
      }
      if (isDMPanelOpen.value) {
        return `${moreWidth} ${dmWidth} 0px minmax(0, 1fr)`;
      }
      return `${moreWidth} ${dmWidth} ${channelWidth} minmax(0, 1fr)`;
    };

    if (actionRailTop.value) {
      return chromeRowSansRail();
    }

    if (
      isExploreView.value ||
      isDmUiContext.value ||
      isServerEmptyOnboarding.value
    ) {
      return `${railSideColumn} ${moreWidth} ${dmWidth} minmax(0, 1fr)`;
    }
    if (isDMPanelOpen.value) {
      return `${railSideColumn} ${moreWidth} ${dmWidth} 0px minmax(0, 1fr)`;
    }
    return `${railSideColumn} ${moreWidth} ${dmWidth} ${channelWidth} minmax(0, 1fr)`;
  });

  return {
    exploreDiscoverableServers,
    expandChannels,
    appGridTemplateColumns,
    isExploreView,
    MORE_SERVERS_PANEL_WIDTH,
    MORE_SERVERS_COMPACT_WIDTH,
  };
}
