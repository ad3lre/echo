import { describe, expect, it } from 'vitest';
import { computeSearchDropdownPosition } from './searchDropdownPosition';

function rect(
  partial: Partial<DOMRect> &
    Pick<DOMRect, 'top' | 'left' | 'width' | 'height'>,
): DOMRect {
  const top = partial.top;
  const left = partial.left;
  const width = partial.width;
  const height = partial.height;
  return {
    top,
    left,
    width,
    height,
    bottom: top + height,
    right: left + width,
    x: left,
    y: top,
    toJSON() {
      return {};
    },
  };
}

describe('computeSearchDropdownPosition', () => {
  const inputRect = rect({ top: 40, left: 100, width: 320, height: 36 });

  it('fills viewport height for search results', () => {
    const pos = computeSearchDropdownPosition({
      inputRect,
      panelRect: null,
      anchoredToPanel: false,
      gapPx: 4,
      horizontalPadPx: 16,
      reservedRightPx: 680,
      viewportWidth: 1400,
      bottomPadPx: 8,
      fillViewportHeight: true,
    });
    expect(pos.top).toBe(80);
    expect(pos.height).toContain('100dvh');
    expect(pos.maxHeight).toBe('');
    expect(pos.left).toBeGreaterThan(inputRect.left - 16);
  });

  it('uses maxHeight for filter menus', () => {
    const pos = computeSearchDropdownPosition({
      inputRect,
      panelRect: null,
      anchoredToPanel: false,
      gapPx: 8,
      horizontalPadPx: 16,
      reservedRightPx: 680,
      viewportWidth: 1400,
      bottomPadPx: 8,
      fillViewportHeight: false,
    });
    expect(pos.height).toBe('');
    expect(pos.maxHeight).toContain('100dvh');
  });
});
