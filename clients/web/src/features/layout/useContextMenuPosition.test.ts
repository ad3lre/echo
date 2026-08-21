/* @vitest-environment happy-dom */
import { describe, expect, it, vi } from 'vitest';
import {
  clampMenuToViewport,
  useContextMenuPosition,
} from '@/features/layout/useContextMenuPosition';

describe('useContextMenuPosition', () => {
  it('clampMenuToViewport keeps menus inside the viewport', () => {
    vi.stubGlobal('innerWidth', 800);
    vi.stubGlobal('innerHeight', 600);
    expect(clampMenuToViewport(-20, -10, 200, 100)).toEqual({
      left: 8,
      top: 8,
    });
    expect(clampMenuToViewport(700, 550, 200, 100)).toEqual({
      left: 592,
      top: 492,
    });
  });

  it('fitMenuToViewport clamps intended coordinates, not stale (0,0) paint', () => {
    vi.stubGlobal('innerWidth', 800);
    vi.stubGlobal('innerHeight', 600);

    const { menuPosition, setMenuPositionFromPoint, fitMenuToViewport } =
      useContextMenuPosition();
    setMenuPositionFromPoint(120, 140);
    const intended = { ...menuPosition.value };

    const menuEl = document.createElement('div');
    menuEl.getBoundingClientRect = () =>
      ({
        left: 0,
        top: 0,
        width: 180,
        height: 220,
        right: 180,
        bottom: 220,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      }) as DOMRect;

    fitMenuToViewport(menuEl);

    expect(menuPosition.value).toEqual(intended);
  });
});
