import { computed, ref, unref, watch, type ComputedRef, type Ref } from 'vue';
import type { MainSurface, RailTab } from '@/features/layout/mainSurface';

export type AppLayoutCompactShellModeDeps = {
  isCompactShell: Ref<boolean>;
  hasGuildChannelChrome: ComputedRef<boolean> | Ref<boolean>;
  isCompactGuildSplitShell: Ref<boolean> | ComputedRef<boolean>;
  useCompactPhoneTabShell: Ref<boolean> | ComputedRef<boolean>;
  isExploreView: Ref<boolean> | ComputedRef<boolean>;
  isDmUiContext: Ref<boolean> | ComputedRef<boolean>;
  welcomeBackExploreGate: Ref<boolean> | ComputedRef<boolean>;
  inviteLandingActive: Ref<boolean> | ComputedRef<boolean>;
  isDMPanelOpen: Ref<boolean>;
  activeRailTab: Ref<RailTab>;
  mainSurface:
    | Ref<MainSurface | null | undefined>
    | ComputedRef<MainSurface | null | undefined>;
  activeChannelId:
    | Ref<string | null | undefined>
    | ComputedRef<string | null | undefined>;
  selectDMTab: () => void;
  openDmInboxFromRailOverflow: () => void;
};

function createCompactShellModeFlags(deps: AppLayoutCompactShellModeDeps) {
  const explorePageUnifiedScroll = computed(() => !!unref(deps.isExploreView));

  const useCompactGuildSplitShell = computed(
    () =>
      unref(deps.isCompactShell) &&
      unref(deps.hasGuildChannelChrome) &&
      !explorePageUnifiedScroll.value &&
      unref(deps.isCompactGuildSplitShell),
  );

  const useCompactTriPaneShell = computed(
    () =>
      unref(deps.isCompactShell) &&
      unref(deps.hasGuildChannelChrome) &&
      !explorePageUnifiedScroll.value &&
      !useCompactGuildSplitShell.value &&
      !unref(deps.useCompactPhoneTabShell),
  );

  const useCompactExploreShell = computed(
    () =>
      unref(deps.isCompactShell) &&
      explorePageUnifiedScroll.value &&
      !unref(deps.welcomeBackExploreGate) &&
      !unref(deps.inviteLandingActive) &&
      !unref(deps.useCompactPhoneTabShell),
  );

  const useCompactDmShell = computed(
    () =>
      unref(deps.isCompactShell) &&
      unref(deps.isDmUiContext) &&
      !useCompactTriPaneShell.value &&
      !useCompactExploreShell.value &&
      !unref(deps.useCompactPhoneTabShell),
  );

  const useCompactStackShell = computed(
    () =>
      unref(deps.isCompactShell) &&
      !useCompactDmShell.value &&
      !useCompactTriPaneShell.value &&
      !useCompactExploreShell.value &&
      !unref(deps.useCompactPhoneTabShell),
  );

  return {
    explorePageUnifiedScroll,
    useCompactGuildSplitShell,
    useCompactTriPaneShell,
    useCompactExploreShell,
    useCompactDmShell,
    useCompactStackShell,
  };
}

function createCompactDmPaneControls(
  deps: AppLayoutCompactShellModeDeps,
  useCompactDmShell: ComputedRef<boolean>,
) {
  const compactDmPane = ref<0 | 1>(1);

  function showCompactDmRailPane() {
    if (deps.isCompactShell.value) compactDmPane.value = 1;
  }

  function handleSelectDmTab() {
    deps.selectDMTab();
    showCompactDmRailPane();
  }

  function handleOpenDmInboxFromRailOverflow() {
    deps.openDmInboxFromRailOverflow();
    showCompactDmRailPane();
  }

  watch(useCompactDmShell, (on) => {
    if (!on) return;
    compactDmPane.value = 1;
    if (!deps.isDMPanelOpen.value) deps.isDMPanelOpen.value = true;
  });

  watch(
    () =>
      [
        deps.isCompactShell.value,
        deps.activeRailTab.value,
        deps.isDMPanelOpen.value,
      ] as const,
    ([compact, rail, dmOpen], prev) => {
      if (!compact || rail !== 'dm' || !dmOpen) return;
      if (!prev) return;
      const [, prevRail, prevOpen] = prev;
      if (prevRail !== 'dm' || !prevOpen) showCompactDmRailPane();
    },
  );

  watch(
    () =>
      [
        useCompactDmShell.value,
        unref(deps.mainSurface)?.type ?? null,
        unref(deps.activeChannelId),
      ] as const,
    (next, prev) => {
      if (!next[0] || !prev || !prev[0]) return;
      if (next[1] !== prev[1] || next[2] !== prev[2]) compactDmPane.value = 0;
    },
  );

  return {
    compactDmPane,
    showCompactDmRailPane,
    handleSelectDmTab,
    handleOpenDmInboxFromRailOverflow,
  };
}

/**
 * Compact shell mode selection (split / tri / explore / DM / stack) and DM pane
 * chrome. Keeps AppLayout.vue from owning these derived switches inline.
 */
export function useAppLayoutCompactShellModes(
  deps: AppLayoutCompactShellModeDeps,
) {
  const modes = createCompactShellModeFlags(deps);
  const compactExplorePane = ref<0 | 1>(0);

  watch(modes.useCompactExploreShell, (on) => {
    if (on) compactExplorePane.value = 0;
  });

  const dmPane = createCompactDmPaneControls(deps, modes.useCompactDmShell);

  const isDmThreadSurface = computed(
    () =>
      unref(deps.isDmUiContext) && unref(deps.mainSurface)?.type === 'dmThread',
  );

  const isPhoneHomeThreadStack = computed(() => {
    if (!unref(deps.isDmUiContext)) return false;
    const surfaceType = unref(deps.mainSurface)?.type;
    return (
      surfaceType === 'dmThread' ||
      surfaceType === 'dmFriends' ||
      surfaceType === 'dmNotifications' ||
      surfaceType === 'dmRequests'
    );
  });

  return {
    ...modes,
    compactExplorePane,
    ...dmPane,
    isDmThreadSurface,
    isPhoneHomeThreadStack,
  };
}
