import { computed, type ComputedRef, type Ref } from 'vue';

/** `true` when workspace mock/API loading ref has finished initial load. */
export function useAppLayoutWorkspaceReadyComputed(
  loading: Ref<boolean>,
): ComputedRef<boolean> {
  return computed(() => !loading.value);
}
