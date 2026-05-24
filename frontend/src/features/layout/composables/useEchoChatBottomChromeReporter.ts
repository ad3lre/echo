import { onMounted, onUnmounted, watch, type Ref } from 'vue';
import {
  clearEchoChatBottomChromeOwner,
  createEchoChatBottomChromeOwner,
  setEchoChatBottomChromeInset,
} from '@/features/layout/echoChatBottomChromeInset';

export type EchoChatBottomChromeReporterOptions = {
  /**
   * Fired when the bottom stack grows taller (multi-line composer, reply bar,
   * typing row, pending media). Shrinks are ignored.
   */
  onLayoutGrowth?: (heightPx: number, deltaPx: number) => void;
};

/**
 * Publishes how much viewport space the chat bottom stack (typing row + composer)
 * occupies so fixed toasts can anchor above it instead of guessing with rem constants.
 */
export function useEchoChatBottomChromeReporter(
  targetRef: Ref<HTMLElement | null | undefined>,
  options?: EchoChatBottomChromeReporterOptions,
): void {
  const owner = createEchoChatBottomChromeOwner();
  let resizeObserver: ResizeObserver | null = null;
  let lastLayoutHeightPx = 0;

  function publishInset(): void {
    const el = targetRef.value;
    if (!el || typeof window === 'undefined') {
      clearEchoChatBottomChromeOwner(owner);
      lastLayoutHeightPx = 0;
      return;
    }
    const rect = el.getBoundingClientRect();
    if (rect.height <= 0) {
      clearEchoChatBottomChromeOwner(owner);
      lastLayoutHeightPx = 0;
      return;
    }
    const heightPx = Math.round(rect.height);
    if (heightPx > lastLayoutHeightPx && lastLayoutHeightPx > 0) {
      options?.onLayoutGrowth?.(heightPx, heightPx - lastLayoutHeightPx);
    }
    lastLayoutHeightPx = heightPx;
    const inset = Math.max(0, window.innerHeight - rect.top);
    setEchoChatBottomChromeInset(owner, inset);
  }

  onMounted(() => {
    if (typeof window === 'undefined') return;

    resizeObserver =
      typeof ResizeObserver !== 'undefined'
        ? new ResizeObserver(() => publishInset())
        : null;

    watch(
      targetRef,
      (el, _prev, onCleanup) => {
        if (resizeObserver && el) resizeObserver.observe(el);
        publishInset();
        onCleanup(() => {
          if (resizeObserver && el) resizeObserver.unobserve(el);
        });
      },
      { immediate: true },
    );

    window.addEventListener('resize', publishInset);
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', publishInset);
      window.visualViewport.addEventListener('scroll', publishInset);
    }
  });

  onUnmounted(() => {
    clearEchoChatBottomChromeOwner(owner);
    resizeObserver?.disconnect();
    resizeObserver = null;
    if (typeof window === 'undefined') return;
    window.removeEventListener('resize', publishInset);
    if (window.visualViewport) {
      window.visualViewport.removeEventListener('resize', publishInset);
      window.visualViewport.removeEventListener('scroll', publishInset);
    }
  });
}
