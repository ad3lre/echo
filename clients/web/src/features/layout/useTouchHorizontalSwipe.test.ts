// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest';
import { bindTouchHorizontalSwipe } from './useTouchHorizontalSwipe';

function fireTouch(
  el: HTMLElement,
  type: 'touchstart' | 'touchmove' | 'touchend',
  x: number,
  y: number,
  target: EventTarget = el,
) {
  const touch = {
    identifier: 0,
    clientX: x,
    clientY: y,
    screenX: x,
    screenY: y,
    pageX: x,
    pageY: y,
    radiusX: 1,
    radiusY: 1,
    rotationAngle: 0,
    force: 1,
    target,
  } as Touch;
  const ev = new TouchEvent(type, {
    bubbles: true,
    cancelable: true,
    touches: type === 'touchend' ? [] : [touch],
    targetTouches: type === 'touchend' ? [] : [touch],
    changedTouches: [touch],
  });
  el.dispatchEvent(ev);
}

describe('bindTouchHorizontalSwipe', () => {
  it('invokes onSwipeLeft for dominant leftward swipe', () => {
    const el = document.createElement('div');
    const onSwipeLeft = vi.fn();
    const onSwipeRight = vi.fn();
    const unbind = bindTouchHorizontalSwipe(el, { onSwipeLeft, onSwipeRight });

    fireTouch(el, 'touchstart', 200, 200);
    fireTouch(el, 'touchmove', 200, 205);
    fireTouch(el, 'touchend', 120, 208);

    expect(onSwipeLeft).toHaveBeenCalledTimes(1);
    expect(onSwipeRight).not.toHaveBeenCalled();
    unbind();
  });

  it('invokes onSwipeRight for dominant rightward swipe from first move', () => {
    const el = document.createElement('div');
    const onSwipeLeft = vi.fn();
    const onSwipeRight = vi.fn();
    const unbind = bindTouchHorizontalSwipe(el, { onSwipeLeft, onSwipeRight });

    fireTouch(el, 'touchstart', 100, 100);
    fireTouch(el, 'touchmove', 170, 102);
    fireTouch(el, 'touchend', 175, 103);

    expect(onSwipeRight).toHaveBeenCalledTimes(1);
    expect(onSwipeLeft).not.toHaveBeenCalled();
    unbind();
  });

  it('does not fire when movement is mostly vertical', () => {
    const el = document.createElement('div');
    const onSwipeLeft = vi.fn();
    const unbind = bindTouchHorizontalSwipe(el, { onSwipeLeft });

    fireTouch(el, 'touchstart', 100, 100);
    fireTouch(el, 'touchmove', 105, 160);
    fireTouch(el, 'touchend', 110, 220);

    expect(onSwipeLeft).not.toHaveBeenCalled();
    unbind();
  });

  it('still fires when touch ends on an interactive child', () => {
    const el = document.createElement('div');
    const button = document.createElement('button');
    el.appendChild(button);
    const onSwipeLeft = vi.fn();
    const unbind = bindTouchHorizontalSwipe(el, { onSwipeLeft });

    fireTouch(el, 'touchstart', 220, 180, el);
    fireTouch(el, 'touchmove', 170, 182, button);
    fireTouch(el, 'touchend', 140, 184, button);

    expect(onSwipeLeft).toHaveBeenCalledTimes(1);
    unbind();
  });
});
