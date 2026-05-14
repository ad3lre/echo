import { nextTick, onUnmounted, watch, type ComputedRef, type Ref } from 'vue';
import { useEdgeSwipe } from '@/composables/useEdgeSwipe';
import { bindTouchHorizontalSwipe } from '@/composables/useTouchHorizontalSwipe';

export type UseCompactSettingsModalGesturesOptions<T extends string> = {
  modelValue: () => boolean;
  isCompactShell: () => boolean;
  mobilePage: Ref<'nav' | 'content'>;
  activeSection: Ref<T>;
  visibleSectionsFlat: ComputedRef<readonly T[]>;
  close: () => void;
  onMobileBack: () => void;
  mobileNavRef: Ref<HTMLElement | null>;
  contentRef: Ref<HTMLElement | null>;
};

/**
 * Shared compact settings-style modal gestures (user settings + server settings).
 * Edge detection uses {@link useEdgeSwipe} with a screen-edge reserve so OS back can own the bezel.
 */
export function useCompactSettingsModalGestures<T extends string>(
  opts: UseCompactSettingsModalGesturesOptions<T>,
) {
  const edgeSwipe = useEdgeSwipe({
    screenEdgeReservePx: 20,
    onSwipeLeft: () => {
      if (!opts.modelValue() || !opts.isCompactShell()) return;
      if (opts.mobilePage.value === 'nav') opts.mobilePage.value = 'content';
    },
    onSwipeRight: () => {
      if (!opts.modelValue() || !opts.isCompactShell()) return;
      if (opts.mobilePage.value === 'content') opts.mobilePage.value = 'nav';
      else opts.close();
    },
  });

  function onModalPointerDown(e: PointerEvent) {
    if (!opts.isCompactShell()) return;
    edgeSwipe.onPointerDown(e);
  }
  function onModalPointerUp(e: PointerEvent) {
    if (!opts.isCompactShell()) return;
    edgeSwipe.onPointerUp(e);
  }
  function onModalPointerCancel(e: PointerEvent) {
    if (!opts.isCompactShell()) return;
    edgeSwipe.onPointerCancel(e);
  }

  let mobileSwipeUnbind: (() => void) | null = null;

  function unbindMobileSwipeGestures() {
    mobileSwipeUnbind?.();
    mobileSwipeUnbind = null;
  }

  function bindMobileSwipeGestures() {
    unbindMobileSwipeGestures();
    if (!opts.modelValue()) return;

    if (opts.isCompactShell() && opts.mobilePage.value === 'nav') {
      const el = opts.mobileNavRef.value;
      if (!el) return;
      mobileSwipeUnbind = bindTouchHorizontalSwipe(
        el,
        {
          onSwipeLeft: () => {
            opts.mobilePage.value = 'content';
          },
        },
        { minDistancePx: 48, dominanceRatio: 1.3 },
      );
      return;
    }

    if (!opts.isCompactShell() || opts.mobilePage.value === 'content') {
      const el = opts.contentRef.value;
      if (!el) return;
      mobileSwipeUnbind = bindTouchHorizontalSwipe(
        el,
        {
          onSwipeLeft: () => {
            const list = opts.visibleSectionsFlat.value;
            const idx = list.indexOf(opts.activeSection.value);
            if (idx >= 0 && idx < list.length - 1) {
              opts.activeSection.value = list[idx + 1]!;
            }
          },
          onSwipeRight: () => {
            const list = opts.visibleSectionsFlat.value;
            const idx = list.indexOf(opts.activeSection.value);
            if (idx <= 0) {
              if (opts.isCompactShell()) opts.onMobileBack();
            } else {
              opts.activeSection.value = list[idx - 1]!;
            }
          },
        },
        { minDistancePx: 48, dominanceRatio: 1.3 },
      );
    }
  }

  watch(
    () =>
      [
        opts.modelValue(),
        opts.isCompactShell(),
        opts.mobilePage.value,
      ] as const,
    async ([open]) => {
      unbindMobileSwipeGestures();
      if (!open) return;
      await nextTick();
      bindMobileSwipeGestures();
    },
  );

  onUnmounted(() => {
    unbindMobileSwipeGestures();
  });

  return {
    onModalPointerDown,
    onModalPointerUp,
    onModalPointerCancel,
  };
}
