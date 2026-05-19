import { watch, watchEffect, nextTick, type Ref } from 'vue';

/** Applied while the user is interacting with overflowing display math (scroll / wheel). */
export const KATEX_DISPLAY_SCROLLBAR_VISIBLE_CLASS =
  'echo-katex-display--scrollbar-visible';

const REVEAL_MS = 1400;

/**
 * Keeps horizontal scrollbars hidden on `.katex-display` blocks until the user
 * begins scrolling (wheel / trackpad / scrollbar / touch scroll).
 */
export function useMessageKatexScrollbarReveal(
  containerRef: Ref<HTMLElement | null>,
  revision: () => unknown,
) {
  const timers = new WeakMap<HTMLElement, ReturnType<typeof setTimeout>>();

  function reveal(el: HTMLElement) {
    el.classList.add(KATEX_DISPLAY_SCROLLBAR_VISIBLE_CLASS);
    const prev = timers.get(el);
    if (prev) clearTimeout(prev);
    const id = setTimeout(() => {
      el.classList.remove(KATEX_DISPLAY_SCROLLBAR_VISIBLE_CLASS);
      timers.delete(el);
    }, REVEAL_MS);
    timers.set(el, id);
  }

  function bindScrollListeners(root: HTMLElement | null) {
    if (!root) return;
    root.querySelectorAll<HTMLElement>('.katex-display').forEach((el) => {
      if (el.dataset.echoKatexSb === '1') return;
      el.dataset.echoKatexSb = '1';
      el.addEventListener(
        'scroll',
        () => {
          reveal(el);
        },
        { passive: true },
      );
    });
  }

  function onWheel(e: WheelEvent) {
    const root = containerRef.value;
    if (!root) return;
    let el = e.target as HTMLElement | null;
    while (el && el !== root) {
      if (el.classList.contains('katex-display')) {
        if (el.scrollWidth > el.clientWidth + 1) reveal(el);
        return;
      }
      el = el.parentElement;
    }
  }

  watch(
    () => [revision(), containerRef.value] as const,
    async () => {
      await nextTick();
      bindScrollListeners(containerRef.value);
    },
    { flush: 'post', immediate: true },
  );

  watchEffect((onCleanup) => {
    const root = containerRef.value;
    if (!root) return;
    root.addEventListener('wheel', onWheel, { passive: true });
    onCleanup(() => root.removeEventListener('wheel', onWheel));
  });
}
