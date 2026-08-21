// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest';
import { useEdgeSwipe } from './useEdgeSwipe';

function firePointer(
  el: HTMLElement,
  type: 'pointerdown' | 'pointerup' | 'pointercancel',
  x: number,
  pointerId = 1,
) {
  el.dispatchEvent(
    new PointerEvent(type, {
      bubbles: true,
      clientX: x,
      clientY: 120,
      pointerId,
      pointerType: 'touch',
      button: 0,
    }),
  );
}

describe('useEdgeSwipe', () => {
  it('does not arm swipe starting in the OS edge reserve zone', () => {
    const onSwipeRight = vi.fn();
    const el = document.createElement('div');
    const { onPointerDown, onPointerUp } = useEdgeSwipe({
      screenEdgeReservePx: 20,
      edgePx: 24,
      minDistancePx: 40,
      onSwipeRight,
    });

    el.addEventListener('pointerdown', onPointerDown);
    el.addEventListener('pointerup', onPointerUp);

    firePointer(el, 'pointerdown', 8);
    firePointer(el, 'pointerup', 80);
    expect(onSwipeRight).not.toHaveBeenCalled();
  });

  it('fires onSwipeRight when swipe starts just inside the left inset zone', () => {
    const onSwipeRight = vi.fn();
    const el = document.createElement('div');
    const { onPointerDown, onPointerUp } = useEdgeSwipe({
      screenEdgeReservePx: 20,
      edgePx: 24,
      minDistancePx: 40,
      onSwipeRight,
    });

    el.addEventListener('pointerdown', onPointerDown);
    el.addEventListener('pointerup', onPointerUp);

    firePointer(el, 'pointerdown', 28);
    firePointer(el, 'pointerup', 90);
    expect(onSwipeRight).toHaveBeenCalledTimes(1);
  });
});
