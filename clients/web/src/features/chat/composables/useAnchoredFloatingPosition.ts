import {
  computed,
  onUnmounted,
  ref,
  watch,
  type ComputedRef,
  type Ref,
} from 'vue';

/** Matches Tailwind `-top-3` + `right-1` relative to the anchor (message row) top-right. */
const OFFSET_TOP_PX = 12;
const OFFSET_RIGHT_INSET_PX = 4;

/**
 * Fixed viewport position for UI teleported to `body`, anchored to an element’s
 * `getBoundingClientRect()` (e.g. message row). Updates on capture-phase scroll
 * (nested overflow containers) and resize. Listeners attach only while `enabled` is true.
 */
export function useAnchoredFloatingPosition(
  anchorRef: Ref<HTMLElement | null>,
  enabled: Ref<boolean>,
): { style: ComputedRef<Record<string, string>>; updatePosition: () => void } {
  const topPx = ref(0);
  const rightPx = ref(0);

  function updatePosition() {
    if (!enabled.value) return;
    const el = anchorRef.value;
    if (!el) return;
    const r = el.getBoundingClientRect();
    topPx.value = Math.round(r.top - OFFSET_TOP_PX);
    rightPx.value = Math.round(
      window.innerWidth - r.right + OFFSET_RIGHT_INSET_PX,
    );
  }

  function onScrollOrResize() {
    requestAnimationFrame(updatePosition);
  }

  watch(
    enabled,
    (e) => {
      if (e) {
        window.addEventListener('scroll', onScrollOrResize, true);
        window.addEventListener('resize', onScrollOrResize);
        requestAnimationFrame(updatePosition);
      } else {
        window.removeEventListener('scroll', onScrollOrResize, true);
        window.removeEventListener('resize', onScrollOrResize);
      }
    },
    { immediate: true },
  );

  watch(
    () => anchorRef.value,
    () => {
      if (enabled.value) requestAnimationFrame(updatePosition);
    },
    { flush: 'post' },
  );

  onUnmounted(() => {
    window.removeEventListener('scroll', onScrollOrResize, true);
    window.removeEventListener('resize', onScrollOrResize);
  });

  const style = computed(() => ({
    position: 'fixed',
    top: `${topPx.value}px`,
    right: `${rightPx.value}px`,
    zIndex: '95',
  }));

  return { style, updatePosition };
}
