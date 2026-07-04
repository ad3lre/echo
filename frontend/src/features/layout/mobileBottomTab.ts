import type { RailTab } from '@/features/layout/mainSurface';

/** Bottom tab ids for the phone shell (distinct from `RailTab` for clarity). */
export type MobileBottomTabId = 'home' | 'servers' | 'explore';

export function mobileBottomTabToRailTab(tab: MobileBottomTabId): RailTab {
  switch (tab) {
    case 'home':
      return 'dm';
    case 'servers':
      return 'servers';
    case 'explore':
      return 'explore';
  }
}

export function railTabToMobileBottomTab(rail: RailTab): MobileBottomTabId {
  switch (rail) {
    case 'dm':
      return 'home';
    case 'servers':
      return 'servers';
    case 'explore':
      return 'explore';
  }
}
