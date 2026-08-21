import type { Ref } from 'vue';
import { computed } from 'vue';
import type { MainSurface, RailTab } from '@/features/layout/mainSurface';

export function useAppLayoutMainSurfaceDmFlags(opts: {
  mainSurface: Ref<MainSurface>;
  activeRailTab: Ref<RailTab>;
  activeGroupDM: Ref<unknown | null | undefined>;
}) {
  const isInDmThreadOrIdleMainSurface = computed(
    () =>
      opts.mainSurface.value.type === 'dmThread' ||
      opts.mainSurface.value.type === 'dmMessagesIdle',
  );
  const isInDMMode = computed(() => opts.activeRailTab.value === 'dm');
  const isGroupDM = computed(() => !!opts.activeGroupDM.value);
  return {
    isInDmThreadOrIdleMainSurface,
    isInDMMode,
    isGroupDM,
  };
}
