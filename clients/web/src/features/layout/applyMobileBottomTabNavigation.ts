import type { MobileBottomTabId } from '@/features/layout/mobileBottomTab';
import { mobileBottomTabToRailTab } from '@/features/layout/mobileBottomTab';
import type { RailTab } from '@/features/layout/mainSurface';

export type MobileBottomTabNavigationSnapshot = {
  activeRailTab: RailTab;
  isDmThreadSurface: boolean;
  selectedServerId: string | null | undefined;
  activeChannelId: string;
  mobileServersStack: 'list' | 'guild';
};

export type MobileBottomTabNavigationPlan = {
  invokeSelectDmTab: boolean;
  invokeSelectServersTab: boolean;
  invokeSelectExploreTab: boolean;
  mobileHomeStack?: 'hub' | 'thread';
  mobileServersStack?: 'list' | 'guild';
};

/** Pure plan for phone bottom-tab navigation (side effects applied by caller). */
export function planMobileBottomTabNavigation(
  tab: MobileBottomTabId,
  snapshot: MobileBottomTabNavigationSnapshot,
): MobileBottomTabNavigationPlan {
  const rail = mobileBottomTabToRailTab(tab);
  if (tab === 'home') {
    return {
      invokeSelectDmTab: true,
      invokeSelectServersTab: false,
      invokeSelectExploreTab: false,
      mobileHomeStack: snapshot.isDmThreadSurface ? 'thread' : 'hub',
    };
  }
  if (tab === 'servers') {
    const plan: MobileBottomTabNavigationPlan = {
      invokeSelectDmTab: false,
      invokeSelectServersTab: snapshot.activeRailTab !== 'servers',
      invokeSelectExploreTab: false,
    };
    if (snapshot.selectedServerId && snapshot.activeChannelId.trim()) {
      plan.mobileServersStack = 'guild';
    } else if (snapshot.mobileServersStack !== 'guild') {
      plan.mobileServersStack = 'list';
    }
    return plan;
  }
  return {
    invokeSelectDmTab: false,
    invokeSelectServersTab: false,
    invokeSelectExploreTab: snapshot.activeRailTab !== rail,
  };
}
