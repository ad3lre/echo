import { onMounted, onUnmounted, ref, watch, type Ref } from 'vue';

export type PaperPageLayout = {
  /** Left edge of page card relative to scrollRoot */
  left: number;
  /** Width of page card */
  width: number;
  /** Top edge of page card relative to scrollRoot content */
  top: number;
  /** Height of page card */
  height: number;
  /** scrollRoot scrollTop */
  scrollTop: number;
  /** Horizontal center of page card in viewport coordinates (for fixed toolbar) */
  viewportCenterX: number;
};

export function usePaperPageLayout(
  scrollRoot: Ref<HTMLElement | null>,
  pageRef: Ref<HTMLElement | null>,
) {
  const layout = ref<PaperPageLayout>({
    left: 0,
    width: 0,
    top: 0,
    height: 0,
    scrollTop: 0,
    viewportCenterX: 0,
  });

  let resizeObserver: ResizeObserver | null = null;

  function measure() {
    const root = scrollRoot.value;
    const page = pageRef.value;
    if (!root || !page) {
      layout.value = {
        left: 0,
        width: 0,
        top: 0,
        height: 0,
        scrollTop: 0,
        viewportCenterX: 0,
      };
      return;
    }
    const rootRect = root.getBoundingClientRect();
    const pageRect = page.getBoundingClientRect();
    layout.value = {
      left: pageRect.left - rootRect.left + root.scrollLeft,
      width: pageRect.width,
      top: pageRect.top - rootRect.top + root.scrollTop,
      height: pageRect.height,
      scrollTop: root.scrollTop,
      viewportCenterX: pageRect.left + pageRect.width / 2,
    };
  }

  function onScroll() {
    requestAnimationFrame(measure);
  }

  function attachPageObserver(page: HTMLElement) {
    resizeObserver?.disconnect();
    resizeObserver = new ResizeObserver(() => {
      requestAnimationFrame(measure);
    });
    resizeObserver.observe(page);
  }

  watch(pageRef, (page) => {
    if (page) attachPageObserver(page);
    else {
      resizeObserver?.disconnect();
      resizeObserver = null;
    }
    requestAnimationFrame(measure);
  });

  onMounted(() => {
    const root = scrollRoot.value;
    root?.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    if (pageRef.value) attachPageObserver(pageRef.value);
    requestAnimationFrame(measure);
  });

  onUnmounted(() => {
    scrollRoot.value?.removeEventListener('scroll', onScroll);
    window.removeEventListener('resize', onScroll);
    resizeObserver?.disconnect();
    resizeObserver = null;
  });

  return { layout, measure };
}
