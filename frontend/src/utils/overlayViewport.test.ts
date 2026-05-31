import { describe, expect, it } from 'vitest';
import { clampFixedOverlayBox } from './overlayViewport';

describe('clampFixedOverlayBox', () => {
  it('keeps the box inside a panned visual viewport', () => {
    const viewport = {
      offsetLeft: 40,
      offsetTop: 60,
      width: 400,
      height: 500,
    };
    const { left, top } = clampFixedOverlayBox(-20, 10, 308, 420, viewport, 16);
    expect(left).toBe(56);
    expect(top).toBe(76);
  });

  it('clamps when the panel is taller than the visible strip', () => {
    const viewport = {
      offsetLeft: 0,
      offsetTop: 0,
      width: 320,
      height: 280,
    };
    const { top } = clampFixedOverlayBox(0, 0, 300, 400, viewport, 16);
    expect(top).toBe(16);
  });
});
