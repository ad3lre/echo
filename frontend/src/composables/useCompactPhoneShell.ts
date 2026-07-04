import { computed, type Ref } from 'vue';
import { useCompactShell } from '@/composables/useCompactShell';
import { useCompactGuildSplitShell } from '@/composables/useCompactGuildSplitShell';

/**
 * True on phone viewports (<600px): compact shell without the tablet guild split.
 * Equivalent to `isCompactShell && !isCompactGuildSplitShell`.
 */
export function useCompactPhoneShell() {
  const { isCompactShell } = useCompactShell();
  const { isCompactGuildSplitShell } = useCompactGuildSplitShell();

  const isCompactPhoneShell = computed(
    () => isCompactShell.value && !isCompactGuildSplitShell.value,
  );

  return { isCompactPhoneShell };
}

/** Standalone computed when refs are already available (e.g. AppLayout controller). */
export function deriveCompactPhoneShell(
  isCompactShell: Ref<boolean>,
  isCompactGuildSplitShell: Ref<boolean>,
): Ref<boolean> {
  return computed(
    () => isCompactShell.value && !isCompactGuildSplitShell.value,
  );
}
