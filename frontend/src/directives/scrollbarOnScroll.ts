/**
 * Directive: show scrollbar only when user is actively scrolling.
 * Add v-scrollbar-on-scroll to elements that have the custom-scrollbar class.
 */
const HIDE_DELAY_MS = 1000;

export const scrollbarOnScroll = {
  mounted(el: HTMLElement) {
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    const onScroll = () => {
      el.classList.add('is-scrolling');
      if (timeoutId) clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        el.classList.remove('is-scrolling');
        timeoutId = null;
      }, HIDE_DELAY_MS);
    };

    el.addEventListener('scroll', onScroll, { passive: true });
    (el as HTMLElement & { _scrollbarCleanup?: () => void })._scrollbarCleanup =
      () => {
        el.removeEventListener('scroll', onScroll);
        if (timeoutId) clearTimeout(timeoutId);
      };
  },
  unmounted(el: HTMLElement) {
    const cleanup = (el as HTMLElement & { _scrollbarCleanup?: () => void })
      ._scrollbarCleanup;
    cleanup?.();
  },
};
