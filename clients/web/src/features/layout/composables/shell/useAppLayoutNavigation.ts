import { ref } from 'vue';
import type { DmSubView, RailTab } from '@/features/layout/mainSurface';

/**
 * Refs that decide **where** the user is in the app (rail, DM sub-view, selections).
 * Must not include panel widths, open/closed chrome, or modal visibility — those cannot affect `deriveMainSurface`.
 */
export function useAppLayoutNavigation() {
  const activeRailTab = ref<RailTab>('servers');
  const activeChannelId = ref('');
  const selectedDMUserId = ref<string | null>(null);
  const dmActiveTab = ref<DmSubView>('messages');
  const selectedMessageRequestId = ref<string | null>(null);

  return {
    activeRailTab,
    activeChannelId,
    selectedDMUserId,
    dmActiveTab,
    selectedMessageRequestId,
  };
}
