import type { ComputedRef, Ref } from 'vue';
import { computed } from 'vue';

/** `computed(() => source.value)` for context fields that mirror a ref. */
export function useComputedRefAlias<T>(source: Ref<T>): ComputedRef<T> {
  return computed(() => source.value);
}
