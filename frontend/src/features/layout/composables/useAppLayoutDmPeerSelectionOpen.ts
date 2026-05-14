import type { Ref } from 'vue';
import { computed } from 'vue';
import type { RailTab } from '@/features/layout/mainSurface';

/** DM rail + a selected peer (profiles / popouts), distinct from main-surface dmThread/dmIdle. */
export function useAppLayoutDmPeerSelectionOpen(opts: {
  activeRailTab: Ref<RailTab>;
  selectedDMUserId: Ref<string | null>;
}) {
  return computed(
    () => opts.activeRailTab.value === 'dm' && !!opts.selectedDMUserId.value,
  );
}
