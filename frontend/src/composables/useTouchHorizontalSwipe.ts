export type TouchHorizontalSwipeHandlers = {
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
};

export type TouchHorizontalSwipeOptions = {
  /** Minimum horizontal travel (px). */
  minDistancePx?: number;
  /** Require horizontal motion to dominate vertical by this factor. */
  dominanceRatio?: number;
  /** If vertical movement exceeds this before a clear horizontal lock, cancel (px). */
  verticalCancelPx?: number;
};

/**
 * Bind one-shot horizontal swipe detection on an element (touch only).
 * Does not call `preventDefault` — uses `passive: true` listeners.
 */
export function bindTouchHorizontalSwipe(
  el: HTMLElement,
  handlers: TouchHorizontalSwipeHandlers,
  opts?: TouchHorizontalSwipeOptions,
): () => void {
  const minDistancePx = opts?.minDistancePx ?? 44;
  const dominanceRatio = opts?.dominanceRatio ?? 1.3;
  const verticalCancelPx = opts?.verticalCancelPx ?? 26;

  let startX = 0;
  let startY = 0;
  let tracking = false;
  let cancelled = false;
  let activeTouchId: number | null = null;
  let startedOnNoSwipeTarget = false;

  function isNoSwipeTarget(target: EventTarget | null): boolean {
    const t = target as HTMLElement | null;
    if (!t) return false;
    if (
      t.closest(
        'input, textarea, select, button, a, [contenteditable="true"], [data-no-settings-swipe="true"]',
      )
    ) {
      return true;
    }
    return false;
  }

  function onTouchStart(e: TouchEvent) {
    if (e.touches.length !== 1) return;
    startedOnNoSwipeTarget = isNoSwipeTarget(e.target);
    if (startedOnNoSwipeTarget) {
      tracking = false;
      return;
    }
    const t = e.touches[0];
    startX = t.clientX;
    startY = t.clientY;
    tracking = true;
    cancelled = false;
    activeTouchId = t.identifier;
  }

  function getTouchById(list: TouchList): Touch | null {
    if (activeTouchId == null) return null;
    for (let i = 0; i < list.length; i += 1) {
      const touch = list[i];
      if (touch && touch.identifier === activeTouchId) return touch;
    }
    return null;
  }

  function onTouchMove(e: TouchEvent) {
    if (!tracking || cancelled) return;
    const t = getTouchById(e.touches);
    if (!t) return;
    const dx = t.clientX - startX;
    const dy = t.clientY - startY;
    if (
      Math.abs(dy) > verticalCancelPx &&
      Math.abs(dy) > Math.abs(dx) * dominanceRatio
    ) {
      cancelled = true;
    }
  }

  function onTouchEnd(e: TouchEvent) {
    if (!tracking) return;
    tracking = false;
    if (cancelled || startedOnNoSwipeTarget) {
      activeTouchId = null;
      cancelled = false;
      startedOnNoSwipeTarget = false;
      return;
    }
    const t = getTouchById(e.changedTouches);
    activeTouchId = null;
    cancelled = false;
    startedOnNoSwipeTarget = false;
    if (!t) return;
    const dx = t.clientX - startX;
    const dy = t.clientY - startY;
    if (Math.abs(dx) < minDistancePx) return;
    if (Math.abs(dx) < Math.abs(dy) * dominanceRatio) return;

    if (dx < 0) handlers.onSwipeLeft?.();
    else handlers.onSwipeRight?.();
  }

  function onTouchCancel(e: TouchEvent) {
    const t = getTouchById(e.changedTouches);
    if (!t) return;
    tracking = false;
    cancelled = false;
    startedOnNoSwipeTarget = false;
    activeTouchId = null;
  }

  el.addEventListener('touchstart', onTouchStart, { passive: true });
  el.addEventListener('touchmove', onTouchMove, { passive: true });
  el.addEventListener('touchend', onTouchEnd, { passive: true });
  el.addEventListener('touchcancel', onTouchCancel, { passive: true });

  return () => {
    el.removeEventListener('touchstart', onTouchStart);
    el.removeEventListener('touchmove', onTouchMove);
    el.removeEventListener('touchend', onTouchEnd);
    el.removeEventListener('touchcancel', onTouchCancel);
  };
}
