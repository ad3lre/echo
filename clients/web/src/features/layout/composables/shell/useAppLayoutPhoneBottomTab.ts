import { computed, watch, type ComputedRef, type Ref } from 'vue';
import {
  railTabToMobileBottomTab,
  type MobileBottomTabId,
} from '@/features/layout/mobileBottomTab';
import { planMobileBottomTabNavigation } from '@/features/layout/applyMobileBottomTabNavigation';
import {
  shouldOpenPhoneMembersOverlayOnEnteringPhone,
  shouldResetPhoneServersUiState,
} from '@/features/layout/phoneShellOverlayState';
import { shouldShowPhoneBottomTabBar } from '@/features/layout/phoneBottomTabBarVisibility';
import type { RailTab } from '@/features/layout/mainSurface';

export type AppLayoutPhoneBottomTabDeps = {
  useCompactPhoneTabShell: Ref<boolean> | ComputedRef<boolean>;
  isDmThreadSurface: ComputedRef<boolean>;
  isPhoneHomeThreadStack: ComputedRef<boolean>;
  activeRailTab: Ref<RailTab>;
  activeChannelId:
    | Ref<string | null | undefined>
    | ComputedRef<string | null | undefined>;
  selectedServerId: () => string | undefined;
  mobileBottomTab: Ref<MobileBottomTabId>;
  mobileHomeStack: Ref<'hub' | 'thread'>;
  mobileServersStack: Ref<'list' | 'guild'>;
  mobileChannelSheetOpen: Ref<boolean>;
  mobileMembersOverlayOpen: Ref<boolean>;
  memberPanelCollapsed: Ref<boolean>;
  isDMPanelOpen: Ref<boolean>;
  inviteLandingActive: Ref<boolean> | ComputedRef<boolean>;
  welcomeBackExploreGate: Ref<boolean> | ComputedRef<boolean>;
  showWelcomeBackSlimBanner: Ref<boolean> | ComputedRef<boolean>;
  dmIncomingRailCluster:
    | Ref<{ totalUnreadCount?: number } | null | undefined>
    | ComputedRef<{ totalUnreadCount?: number } | null | undefined>;
  serverPingBubbleByServerId:
    | Ref<Record<string, unknown>>
    | ComputedRef<Record<string, unknown>>;
  serverUnreadActivityDotByServerId:
    | Ref<Record<string, unknown>>
    | ComputedRef<Record<string, unknown>>;
  serverActiveVoiceByServerId: ComputedRef<Record<string, boolean>>;
  handleSelectDmTab: () => void;
  selectServersTab: () => void;
  selectExploreTab: () => void;
};

function createApplyMobileBottomTabNavigation(
  deps: AppLayoutPhoneBottomTabDeps,
) {
  return function applyMobileBottomTabNavigation(tab: MobileBottomTabId) {
    const plan = planMobileBottomTabNavigation(tab, {
      activeRailTab: deps.activeRailTab.value,
      isDmThreadSurface: deps.isDmThreadSurface.value,
      selectedServerId: deps.selectedServerId(),
      activeChannelId: deps.activeChannelId.value ?? '',
      mobileServersStack: deps.mobileServersStack.value,
    });
    if (plan.invokeSelectDmTab) deps.handleSelectDmTab();
    if (plan.invokeSelectServersTab) deps.selectServersTab();
    if (plan.invokeSelectExploreTab) deps.selectExploreTab();
    if (plan.mobileHomeStack) deps.mobileHomeStack.value = plan.mobileHomeStack;
    if (plan.mobileServersStack)
      deps.mobileServersStack.value = plan.mobileServersStack;
  };
}

function wirePhoneBottomTabWatches(
  deps: AppLayoutPhoneBottomTabDeps,
  applyMobileBottomTabNavigation: (tab: MobileBottomTabId) => void,
) {
  let syncingMobileBottomTab = false;

  watch(deps.mobileBottomTab, (tab, prevTab) => {
    if (!deps.useCompactPhoneTabShell.value || syncingMobileBottomTab) return;
    if (prevTab && shouldResetPhoneServersUiState(prevTab, tab)) {
      deps.mobileMembersOverlayOpen.value = false;
      deps.mobileChannelSheetOpen.value = false;
    }
    applyMobileBottomTabNavigation(tab);
  });

  watch(deps.useCompactPhoneTabShell, (on, wasOn) => {
    if (on && wasOn === false) {
      deps.mobileChannelSheetOpen.value = false;
      deps.mobileMembersOverlayOpen.value =
        shouldOpenPhoneMembersOverlayOnEnteringPhone({
          memberPanelCollapsed: deps.memberPanelCollapsed.value,
        });
    }
    if (!on && wasOn) {
      deps.mobileMembersOverlayOpen.value = false;
      deps.mobileChannelSheetOpen.value = false;
    }
    if (!on) return;
    syncingMobileBottomTab = true;
    deps.mobileBottomTab.value = railTabToMobileBottomTab(
      deps.activeRailTab.value,
    );
    syncingMobileBottomTab = false;
    deps.isDMPanelOpen.value = true;
    if (deps.activeRailTab.value === 'servers') {
      deps.mobileServersStack.value =
        deps.selectedServerId() && deps.activeChannelId.value?.trim()
          ? 'guild'
          : 'list';
    }
  });

  watch(deps.activeRailTab, (rail) => {
    if (!deps.useCompactPhoneTabShell.value) return;
    const tab = railTabToMobileBottomTab(rail);
    syncingMobileBottomTab = true;
    if (deps.mobileBottomTab.value !== tab) {
      deps.mobileBottomTab.value = tab;
    }
    applyMobileBottomTabNavigation(tab);
    syncingMobileBottomTab = false;
  });

  watch(deps.isPhoneHomeThreadStack, (thread) => {
    if (
      !deps.useCompactPhoneTabShell.value ||
      deps.mobileBottomTab.value !== 'home'
    )
      return;
    deps.mobileHomeStack.value = thread ? 'thread' : 'hub';
  });
}

function createPhoneBottomTabBadges(deps: AppLayoutPhoneBottomTabDeps) {
  const phoneDmUnreadTotal = computed(
    () => deps.dmIncomingRailCluster.value?.totalUnreadCount ?? 0,
  );

  const phoneServersHasActivity = computed(() => {
    const bubbles = deps.serverPingBubbleByServerId.value;
    const dots = deps.serverUnreadActivityDotByServerId.value;
    const voice = deps.serverActiveVoiceByServerId.value;
    return (
      Object.keys(bubbles).length > 0 ||
      Object.keys(dots).length > 0 ||
      Object.keys(voice).length > 0
    );
  });

  const phoneExploreHasActivity = computed(
    () =>
      deps.mobileBottomTab.value !== 'explore' &&
      (deps.showWelcomeBackSlimBanner.value ||
        deps.welcomeBackExploreGate.value),
  );

  const showPhoneBottomTabBar = computed(
    () =>
      !deps.inviteLandingActive.value &&
      shouldShowPhoneBottomTabBar({
        mobileBottomTab: deps.mobileBottomTab.value,
        mobileHomeStack: deps.mobileHomeStack.value,
        mobileServersStack: deps.mobileServersStack.value,
        mobileChannelSheetOpen: deps.mobileChannelSheetOpen.value,
        mobileMembersOverlayOpen: deps.mobileMembersOverlayOpen.value,
      }),
  );

  return {
    phoneDmUnreadTotal,
    phoneServersHasActivity,
    phoneExploreHasActivity,
    showPhoneBottomTabBar,
  };
}

/**
 * Phone compact-shell bottom-tab sync, stack resets, and badge computeds.
 */
export function useAppLayoutPhoneBottomTab(deps: AppLayoutPhoneBottomTabDeps) {
  const applyMobileBottomTabNavigation =
    createApplyMobileBottomTabNavigation(deps);
  wirePhoneBottomTabWatches(deps, applyMobileBottomTabNavigation);
  const badges = createPhoneBottomTabBadges(deps);
  return {
    applyMobileBottomTabNavigation,
    ...badges,
  };
}
