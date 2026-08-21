import { computed, onMounted, onUnmounted, ref } from 'vue';

/** Heuristic: layout viewport taller than visual viewport by this much ⇒ software keyboard. */
const KEYBOARD_GAP_THRESHOLD_PX = 72;

/**
 * Compact mobile shells pin their block size to `window.visualViewport` so iOS Safari keeps
 * the chat column sized to the visible area when the keyboard opens.
 *
 * iOS Safari pans the **layout** viewport when the keyboard opens (`visualViewport.offsetTop`
 * shifts). If we only shrink `height` to `visualViewport.height` but leave the shell at layout
 * y=0, the visible region no longer matches the shell — the composer can jump to the top of
 * the screen with a dead band above the keyboard. Pin the shell to the visual viewport with
 * `position: fixed` + `offsetTop` / `offsetLeft` / `width` / `height`.
 *
 * While the keyboard is up, skip `padding-bottom: env(safe-area-inset-bottom)` — WebKit often
 * keeps that inset non-zero even though the home-indicator band is covered, which stacks with
 * the shrunk visual viewport and leaves a dead band above the keyboard.
 *
 * **Updates are rAF-coalesced** — WebKit may emit many `resize`/`scroll` events per frame during
 * keyboard and chrome transitions; batching avoids redundant reactive churn.
 *
 * iOS Safari sometimes reports `visualViewport.height` slightly shorter than the visible layout
 * strip `innerHeight - visualViewport.offsetTop` while the URL / bottom chrome animates. Pinning
 * only to `visualViewport.height` then leaves an empty band above the home indicator; use the
 * larger of the two when the keyboard is not up.
 */
export function useCompactShellVisualViewportFrame() {
  const visualViewportHeightPx = ref<number | null>(null);
  const visualViewportWidthPx = ref<number | null>(null);
  const visualViewportOffsetTopPx = ref<number | null>(null);
  const visualViewportOffsetLeftPx = ref<number | null>(null);
  const layoutViewportHeightPx = ref<number | null>(null);

  let viewportMetricsRaf = 0;

  function syncVisualViewportMetricsNow() {
    if (typeof window === 'undefined' || !window.visualViewport) {
      visualViewportHeightPx.value = null;
      visualViewportWidthPx.value = null;
      visualViewportOffsetTopPx.value = null;
      visualViewportOffsetLeftPx.value = null;
      layoutViewportHeightPx.value = null;
      return;
    }
    const vv = window.visualViewport;
    visualViewportHeightPx.value = vv.height;
    visualViewportWidthPx.value = vv.width;
    visualViewportOffsetTopPx.value = vv.offsetTop;
    visualViewportOffsetLeftPx.value = vv.offsetLeft;
    layoutViewportHeightPx.value = window.innerHeight;
  }

  /** Coalesces to one layout read per frame — iOS can fire `visualViewport` resize/scroll rapidly. */
  function scheduleVisualViewportMetrics() {
    if (typeof window === 'undefined') return;
    if (viewportMetricsRaf !== 0) return;
    viewportMetricsRaf = window.requestAnimationFrame(() => {
      viewportMetricsRaf = 0;
      syncVisualViewportMetricsNow();
    });
  }

  onMounted(() => {
    syncVisualViewportMetricsNow();
    if (typeof window !== 'undefined') {
      window.addEventListener('resize', scheduleVisualViewportMetrics);
    }
    if (typeof window !== 'undefined' && window.visualViewport) {
      const vv = window.visualViewport;
      vv.addEventListener('resize', scheduleVisualViewportMetrics);
      vv.addEventListener('scroll', scheduleVisualViewportMetrics);
    }
  });

  onUnmounted(() => {
    if (typeof window !== 'undefined' && viewportMetricsRaf !== 0) {
      window.cancelAnimationFrame(viewportMetricsRaf);
      viewportMetricsRaf = 0;
    }
    if (typeof window !== 'undefined') {
      window.removeEventListener('resize', scheduleVisualViewportMetrics);
    }
    if (typeof window !== 'undefined' && window.visualViewport) {
      const vv = window.visualViewport;
      vv.removeEventListener('resize', scheduleVisualViewportMetrics);
      vv.removeEventListener('scroll', scheduleVisualViewportMetrics);
    }
  });

  const rootStyle = computed(() => {
    const base: Record<string, string> = {
      boxSizing: 'border-box',
      paddingLeft: 'max(0px, env(safe-area-inset-left, 0px))',
      paddingRight: 'max(0px, env(safe-area-inset-right, 0px))',
    };
    const lh = layoutViewportHeightPx.value;
    const vh = visualViewportHeightPx.value;
    const vw = visualViewportWidthPx.value;
    const ot = visualViewportOffsetTopPx.value;
    const ol = visualViewportOffsetLeftPx.value;
    const keyboardLikely =
      lh != null &&
      vh != null &&
      Math.round(lh - vh) >= KEYBOARD_GAP_THRESHOLD_PX;
    base.paddingBottom = keyboardLikely
      ? '0px'
      : 'max(0px, env(safe-area-inset-bottom, 0px))';

    let blockHeightPx: number | null = null;
    if (vh != null) {
      if (!keyboardLikely && lh != null && ot != null) {
        const vvRounded = Math.round(vh);
        const layoutStripPx = Math.max(0, Math.round(lh - ot));
        blockHeightPx = Math.max(vvRounded, layoutStripPx);
      } else {
        blockHeightPx = Math.round(vh);
      }
    }

    if (blockHeightPx != null && vw != null && ot != null && ol != null) {
      base.position = 'fixed';
      base.zIndex = '0';
      base.top = `${Math.round(ot)}px`;
      base.left = `${Math.round(ol)}px`;
      const w = Math.round(vw);
      base.width = `${w}px`;
      base.maxWidth = `${w}px`;
      base.height = `${blockHeightPx}px`;
      base.maxHeight = `${blockHeightPx}px`;
    } else if (blockHeightPx != null) {
      base.height = `${blockHeightPx}px`;
      base.maxHeight = `${blockHeightPx}px`;
    }
    return base;
  });

  return {
    rootStyle,
    visualViewportHeightPx,
    visualViewportWidthPx,
  };
}
