import { ref } from 'vue';

type Edge = 'left' | 'right' | null;

export type EdgeSwipeOptions = {
  /**
   * Max distance from the left/right screen edge (px) where the swipe is allowed
   * to start. This prevents fighting with horizontal sliders inside the modal.
   */
  edgePx?: number;
  /** Minimum horizontal distance (px) to trigger. */
  minDistancePx?: number;
  /** Maximum vertical drift (px) allowed to still count as a horizontal swipe. */
  maxOffAxisPx?: number;
  /**
   * Ignore the outermost px on each screen edge so OS/browser edge-back can own
   * the true bezel zone without racing this handler.
   */
  screenEdgeReservePx?: number;
  /** Called when the user swipes left starting near the right edge. */
  onSwipeLeft?: () => void;
  /** Called when the user swipes right starting near the left edge. */
  onSwipeRight?: () => void;
};

function isInteractiveTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  if (
    el.closest('input, textarea, select, button, a, [contenteditable="true"]')
  )
    return true;
  if (el.closest('[data-no-edge-swipe="true"]')) return true;
  return false;
}

/**
 * Minimal, UI-only edge swipe detector for touch pointers.
 *
 * - Right-swipe must begin near the left edge.
 * - Left-swipe must begin near the right edge.
 *
 * This keeps the gesture discoverable without breaking normal scrolling/tapping.
 */
export function useEdgeSwipe(options: EdgeSwipeOptions) {
  const edgePx = options.edgePx ?? 24;
  const minDistancePx = options.minDistancePx ?? 60;
  const maxOffAxisPx = options.maxOffAxisPx ?? 70;
  const screenEdgeReservePx = options.screenEdgeReservePx ?? 20;

  const startX = ref(0);
  const startY = ref(0);
  const startEdge = ref<Edge>(null);
  const activePointerId = ref<number | null>(null);

  function onPointerDown(e: PointerEvent) {
    if (e.pointerType !== 'touch') return;
    if (e.button !== 0) return;
    if (isInteractiveTarget(e.target)) return;

    const width = typeof window !== 'undefined' ? window.innerWidth : 0;
    const x = e.clientX;
    const y = e.clientY;

    let edge: Edge = null;
    if (width > 0) {
      const innerLeft = screenEdgeReservePx;
      const innerRight = width - screenEdgeReservePx;
      if (x > innerLeft && x <= innerLeft + edgePx) edge = 'left';
      else if (x >= innerRight - edgePx && x < innerRight) edge = 'right';
    }

    if (!edge) return;

    startX.value = x;
    startY.value = y;
    startEdge.value = edge;
    activePointerId.value = e.pointerId;
  }

  function onPointerCancel(e: PointerEvent) {
    if (activePointerId.value !== e.pointerId) return;
    activePointerId.value = null;
    startEdge.value = null;
  }

  function onPointerUp(e: PointerEvent) {
    if (activePointerId.value !== e.pointerId) return;
    activePointerId.value = null;

    const dx = e.clientX - startX.value;
    const dy = e.clientY - startY.value;
    const edge = startEdge.value;
    startEdge.value = null;

    if (Math.abs(dy) > maxOffAxisPx) return;
    if (edge === 'left' && dx >= minDistancePx) options.onSwipeRight?.();
    if (edge === 'right' && dx <= -minDistancePx) options.onSwipeLeft?.();
  }

  return {
    onPointerDown,
    onPointerUp,
    onPointerCancel,
  };
}
