import type { MobileBottomTabId } from '@/features/layout/mobileBottomTab';

export type PhoneBottomTabBarVisibilitySnapshot = {
  mobileBottomTab: MobileBottomTabId;
  mobileHomeStack: 'hub' | 'thread';
  mobileServersStack: 'list' | 'guild';
  mobileChannelSheetOpen: boolean;
  mobileMembersOverlayOpen: boolean;
};

/** Phone bottom tab bar: lists/menus only — hidden in DM and guild chat surfaces. */
export function shouldShowPhoneBottomTabBar(
  snapshot: PhoneBottomTabBarVisibilitySnapshot,
): boolean {
  if (snapshot.mobileBottomTab === 'home') {
    return snapshot.mobileHomeStack === 'hub';
  }
  if (snapshot.mobileBottomTab === 'servers') {
    if (snapshot.mobileServersStack === 'list') return true;
    return snapshot.mobileChannelSheetOpen || snapshot.mobileMembersOverlayOpen;
  }
  return true;
}
