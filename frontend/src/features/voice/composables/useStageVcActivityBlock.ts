import { computed, watch, type ComputedRef, type Ref } from 'vue';
import type { VcActivityUiState } from '@/features/voice/vcActivityTypes';
import { dispatchAppToast } from '@/utils/controllerMissingAction';

export function useStageVcActivityBlock(deps: {
  isViewingVoiceChannel: ComputedRef<boolean>;
  effectiveActiveChannel: ComputedRef<{ type?: string } | null>;
  vcActivityUi: Ref<VcActivityUiState>;
  closeVcActivity: () => void;
}) {
  const blocked = computed(
    () =>
      deps.isViewingVoiceChannel.value &&
      deps.effectiveActiveChannel.value?.type === 'stage',
  );

  watch(blocked, (on) => {
    if (on && deps.vcActivityUi.value.phase !== 'closed') {
      deps.closeVcActivity();
    }
  });

  function guardOpen<T extends (...args: never[]) => unknown>(fn: T): T {
    return ((...args: Parameters<T>) => {
      if (blocked.value) {
        dispatchAppToast(
          "Activities aren't available in stage channels.",
          'info',
        );
        return;
      }
      return fn(...args);
    }) as T;
  }

  return { blocked, guardOpen };
}
