import type { ComputedRef, Ref } from 'vue';
import { computed } from 'vue';

/** `computed(() => source.value ?? undefined)` for optional context fields. */
export function useComputedOptionalRefAlias<T>(
  source: Ref<T | null | undefined>,
): ComputedRef<T | undefined> {
  return computed(() => source.value ?? undefined);
}
