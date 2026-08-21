import { onMounted, onUnmounted, watch, type Ref } from 'vue';
import {
  clearEchoChatBottomChromeOwner,
  createEchoChatBottomChromeOwner,
  setEchoChatBottomChromeInset,
} from '@/features/layout/echoChatBottomChromeInset';

/**
 * Publishes the mobile bottom tab bar height so toasts and voice dock stack above it.
 */
export function useMobileBottomBarInsetReporter(
  targetRef: Ref<HTMLElement | null | undefined>,
): void {
  const owner = createEchoChatBottomChromeOwner();
  let resizeObserver: ResizeObserver | null = null;

  function publishInset(): void {
    const el = targetRef.value;
    if (!el || typeof window === 'undefined') {
      clearEchoChatBottomChromeOwner(owner);
      return;
    }
    const rect = el.getBoundingClientRect();
    if (rect.height <= 0) {
      clearEchoChatBottomChromeOwner(owner);
      return;
    }
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
