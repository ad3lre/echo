import { inject } from 'vue';
import { PLATFORM_KEY, type EchoPlatform } from '@/platform/keys';

/** Use in any component under `App.vue` (after `provide(PLATFORM_KEY, …)`). */
export function usePlatform(): EchoPlatform {
  const p = inject(PLATFORM_KEY, undefined);
  if (!p) {
    if (import.meta.env.DEV) {
      throw new Error(
        'usePlatform() requires provide(PLATFORM_KEY) from App.vue (getEchoPlatform).',
      );
    }
    throw new Error('Echo platform not provided');
  }
  return p;
}
