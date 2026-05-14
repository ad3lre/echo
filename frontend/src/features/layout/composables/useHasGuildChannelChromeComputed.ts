import { computed, type ComputedRef } from 'vue';
import type { MainSurface } from '@/features/layout/mainSurface';
import { deriveHasGuildChannelChrome } from '@/features/layout/mainSurface';

export function useHasGuildChannelChromeComputed(
  mainSurface: ComputedRef<MainSurface>,
) {
  return computed(() => deriveHasGuildChannelChrome(mainSurface.value));
}
