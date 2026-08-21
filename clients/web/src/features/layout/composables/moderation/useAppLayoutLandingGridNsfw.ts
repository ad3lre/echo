import { computed, watch, type ComputedRef, type Ref } from 'vue';
import type { WorkspaceStateApi } from '@/features/layout/echoWorkspace/types';
import type { RailTab } from '@/features/layout/mainSurface';
import type { ChannelSummary } from '@shared/types';
import { filterPublicExploreDirectoryRows } from '@/features/layout/exploreDirectoryRows';
import { hasActivePhoneGuildChannel } from '@/features/layout/phoneShellOverlayState';
import type { MobileBottomTabId } from '@/features/layout/mobileBottomTab';
import { useInviteLandingFlow } from '../server/useInviteLandingFlow';
import { useAppLayoutWelcomeBack } from '../controller/useAppLayoutWelcomeBack';
import { useAppLayoutGridChrome } from '../shell/useAppLayoutGridChrome';
import { useAppLayoutNsfwGate } from './useAppLayoutNsfwGate';
import { useMockDataModeOffComputed } from '../controller/useMockDataModeOffComputed';
import { useAppLayoutCompactShellExpand } from '../shell/useAppLayoutCompactShellExpand';
import type { useServerStore } from '@/features/layout/server';

type InviteLanding = ReturnType<typeof useInviteLandingFlow>;

export type UseAppLayoutLandingGridNsfwDeps = {
  workspace: WorkspaceStateApi;
  serverStore: ReturnType<typeof useServerStore>;
  activeRailTab: Ref<RailTab>;
  isAuthenticatedComputed: ComputedRef<boolean>;
  isGuestComputed: ComputedRef<boolean>;
  sessionEndedMessage: Ref<string | null | undefined>;
  inviteLandingActiveRef: Ref<boolean>;
  openServerSurface: (serverId: string, channelId?: string | null) => void;
  selectExploreTab: () => void;
  hydrateEchoFromApi: () => void | Promise<unknown>;
  isMoreServersPanelOpen: Ref<boolean>;
  isMoreServersCompact: Ref<boolean>;
  isDMPanelOpen: Ref<boolean>;
  dmPanelWidth: Ref<number>;
  channelPanelCollapsed: Ref<boolean>;
  channelPanelWidth: Ref<number>;
  pfpBarExpanded: Ref<boolean>;
  isServerEmptyOnboarding: ComputedRef<boolean>;
  isDmUiContext: ComputedRef<boolean>;
  isCompactShell: Ref<boolean>;
  isCompactPhoneShell: Ref<boolean>;
  actionRailTopLayout: ComputedRef<boolean>;
  hasGuildChannelChrome: ComputedRef<boolean>;
  isCompactGuildSplitShell: Ref<boolean>;
  compactGuildTriPaneChannelPanelOpen: Ref<boolean>;
  compactPagerPane: Ref<number>;
  memberPanelCollapsed: Ref<boolean>;
  mobileChannelSheetOpen: Ref<boolean>;
  mobileMembersOverlayOpen: Ref<boolean>;
  mobileBottomTab: Ref<MobileBottomTabId>;
  mobileServersStack: Ref<'list' | 'guild'>;
  markMemberPanelExpandedByUser: () => void;
  markMemberPanelCollapsedByUser: () => void;
  activeChannelId: Ref<string>;
  effectiveActiveChannel: ComputedRef<ChannelSummary | null>;
  handleGoToChannel: (channelId: string) => void;
  getFirstTextChannelId: (
    cats: { name: string; channels: { id: string; type: string }[] }[],
  ) => string;
  mainContentColumns: ComputedRef<string>;
};

function wireInviteLanding(
  deps: UseAppLayoutLandingGridNsfwDeps,
): InviteLanding {
  const inviteLanding = useInviteLandingFlow({
    base: import.meta.env.BASE_URL,
    isAuthenticated: deps.isAuthenticatedComputed,
    workspaceReady: computed(() => !deps.workspace.loading.value),
    activeRailTab: deps.activeRailTab,
    joinedServerIds: computed(() => deps.serverStore.servers.map((s) => s.id)),
    joinedServerSlugs: computed(() =>
      deps.serverStore.servers.map((s) => ({
        id: s.id,
        vanityCode: (s as { vanityCode?: string }).vanityCode,
      })),
    ),
    openServerSurface: deps.openServerSurface,
    selectExploreTab: deps.selectExploreTab,
    refreshWorkspace: () => {
      void deps.hydrateEchoFromApi();
    },
  });
  inviteLanding.initFromUrl();
  watch(
    inviteLanding.inviteLandingActive,
    (active) => {
      deps.inviteLandingActiveRef.value = active;
    },
    { immediate: true },
  );
  return inviteLanding;
}

function wireWelcomeBackChrome(
  deps: UseAppLayoutLandingGridNsfwDeps,
  inviteLanding: InviteLanding,
  mockDataModeOffComputed: ComputedRef<boolean>,
  explorePublicDirectoryEmpty: ComputedRef<boolean>,
) {
  const welcome = useAppLayoutWelcomeBack({
    activeRailTab: deps.activeRailTab,
    isAuthenticated: deps.isAuthenticatedComputed,
    sessionEndedMessage: deps.sessionEndedMessage,
    isMockDataMode: mockDataModeOffComputed,
    explorePublicDirectoryEmpty,
    isGuestUser: deps.isGuestComputed,
    workspaceLoading: computed(() => deps.workspace.loading.value),
    inviteLandingActive: inviteLanding.inviteLandingActive,
  });
  const welcomeBackExploreMemberEmptyDirectory = computed(
    () =>
      deps.activeRailTab.value === 'explore' &&
      !deps.workspace.loading.value &&
      explorePublicDirectoryEmpty.value &&
      deps.isAuthenticatedComputed.value &&
      !deps.isGuestComputed.value,
  );
  return { ...welcome, welcomeBackExploreMemberEmptyDirectory };
}

function wireGridAndCompact(
  deps: UseAppLayoutLandingGridNsfwDeps,
  collapseServerRail: ComputedRef<boolean>,
  useCompactPhoneTabShell: ComputedRef<boolean>,
) {
  const gridChrome = useAppLayoutGridChrome({
    workspace: deps.workspace,
    activeRailTab: deps.activeRailTab,
    isMoreServersPanelOpen: deps.isMoreServersPanelOpen,
    isMoreServersCompact: deps.isMoreServersCompact,
    isDMPanelOpen: deps.isDMPanelOpen,
    dmPanelWidth: deps.dmPanelWidth,
    channelPanelCollapsed: deps.channelPanelCollapsed,
    channelPanelWidth: deps.channelPanelWidth,
    pfpBarExpanded: deps.pfpBarExpanded,
    isServerEmptyOnboarding: deps.isServerEmptyOnboarding,
    isDmUiContext: deps.isDmUiContext,
    collapseServerRail,
    isCompactShell: deps.isCompactShell,
    actionRailTop: deps.actionRailTopLayout,
  });
  const compact = useAppLayoutCompactShellExpand({
    isCompactShell: deps.isCompactShell,
    hasGuildChannelChrome: deps.hasGuildChannelChrome,
    isCompactGuildSplitShell: deps.isCompactGuildSplitShell,
    useCompactPhoneTabShell,
    compactGuildTriPaneChannelPanelOpen:
      deps.compactGuildTriPaneChannelPanelOpen,
    compactPagerPane: deps.compactPagerPane,
    memberPanelCollapsed: deps.memberPanelCollapsed,
    mobileChannelSheetOpen: deps.mobileChannelSheetOpen,
    mobileMembersOverlayOpen: deps.mobileMembersOverlayOpen,
    mobileBottomTab: deps.mobileBottomTab,
    mobileServersStack: deps.mobileServersStack,
    hasActiveGuildChannel: () =>
      hasActivePhoneGuildChannel(
        deps.serverStore.selectedServerId,
        deps.activeChannelId.value,
      ),
    expandChannelsGrid: gridChrome.expandChannels,
    markMemberPanelExpandedByUser: deps.markMemberPanelExpandedByUser,
    markMemberPanelCollapsedByUser: deps.markMemberPanelCollapsedByUser,
  });
  return { gridChrome, ...compact };
}

function wireNsfwGate(
  deps: UseAppLayoutLandingGridNsfwDeps,
  isExploreView: ComputedRef<boolean>,
) {
  return useAppLayoutNsfwGate({
    serverStore: deps.serverStore,
    workspace: deps.workspace,
    effectiveActiveChannel: deps.effectiveActiveChannel,
    handleGoToChannel: deps.handleGoToChannel,
    getFirstTextChannelId: deps.getFirstTextChannelId,
    isDmUiContext: deps.isDmUiContext,
    isExploreView,
    isServerEmptyOnboarding: deps.isServerEmptyOnboarding,
    mainContentColumns: deps.mainContentColumns,
    memberPanelCollapsed: deps.memberPanelCollapsed,
  });
}

/**
 * Invite landing, welcome-back gate, app grid, compact expand, NSFW overlay.
 * Call once after `useChatMessages`.
 */
export function useAppLayoutLandingGridNsfw(
  deps: UseAppLayoutLandingGridNsfwDeps,
) {
  const mockDataModeOffComputed = useMockDataModeOffComputed();
  const explorePublicDirectoryEmpty = computed(
    () =>
      filterPublicExploreDirectoryRows(deps.workspace.discoverableServers.value)
        .length === 0,
  );
  const inviteLanding = wireInviteLanding(deps);
  const welcome = wireWelcomeBackChrome(
    deps,
    inviteLanding,
    mockDataModeOffComputed,
    explorePublicDirectoryEmpty,
  );
  const useCompactPhoneTabShell = computed(
    () => deps.isCompactPhoneShell.value,
  );
  const collapseServerRail = computed(
    () =>
      welcome.welcomeBackExploreGate.value ||
      inviteLanding.inviteLandingActive.value,
  );
  const grid = wireGridAndCompact(
    deps,
    collapseServerRail,
    useCompactPhoneTabShell,
  );
  const nsfwGate = wireNsfwGate(deps, grid.gridChrome.isExploreView);
  const {
    appGridTemplateColumns,
    exploreDiscoverableServers,
    isExploreView,
    MORE_SERVERS_PANEL_WIDTH: gridMoreServersPanelWidth,
    MORE_SERVERS_COMPACT_WIDTH: gridMoreServersCompactWidth,
  } = grid.gridChrome;
  return {
    mockDataModeOffComputed,
    explorePublicDirectoryEmpty,
    inviteLanding,
    ...welcome,
    useCompactPhoneTabShell,
    gridChrome: grid.gridChrome,
    gridMoreServersPanelWidth,
    gridMoreServersCompactWidth,
    appGridTemplateColumns,
    exploreDiscoverableServers,
    isExploreView,
    expandChannelsGrid: grid.gridChrome.expandChannels,
    expandChannels: grid.expandChannels,
    expandMembers: grid.expandMembers,
    collapseMembers: grid.collapseMembers,
    nsfwGate,
    showNsfwChatGate: nsfwGate.showNsfwChatGate,
    acknowledgeNsfwChannel: nsfwGate.acknowledgeNsfwChannel,
    declineNsfwGate: nsfwGate.declineNsfwGate,
    mainContentColumnsEffective: nsfwGate.mainContentColumnsEffective,
    memberPanelCollapsedEffective: nsfwGate.memberPanelCollapsedEffective,
  };
}
