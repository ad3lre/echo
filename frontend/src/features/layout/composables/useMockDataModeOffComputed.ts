import { computed, type ComputedRef } from 'vue';

/** Welcome-back and similar flows: production shell is never mock-data mode. */
export function useMockDataModeOffComputed(): ComputedRef<boolean> {
  return computed(() => false);
}
