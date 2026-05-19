import type { Ref } from 'vue';
import { computed } from 'vue';
import type { RailTab } from '@/features/layout/mainSurface';

export function useAppLayoutDmUiContext(activeRailTab: Ref<RailTab>) {
  return computed(() => activeRailTab.value === 'dm');
}
