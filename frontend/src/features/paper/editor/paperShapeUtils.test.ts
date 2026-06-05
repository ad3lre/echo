import { describe, expect, it } from 'vitest';
import {
  clampPaperShapePx,
  computeShapeResize,
  formatPaperShapePx,
  parsePaperShapePx,
} from '@/features/paper/editor/paperShapeUtils';

describe('paperShapeUtils', () => {
  it('parses and formats pixel dimensions', () => {
    expect(parsePaperShapePx('120px', 80)).toBe(120);
    expect(formatPaperShapePx(96)).toBe('96px');
  });

  it('keeps circles square when resizing', () => {
    const next = computeShapeResize('circle', 100, 100, 40, 10, 'se');
    expect(next.width).toBe(next.height);
    expect(next.width).toBe(140);
  });

  it('only changes width for lines', () => {
    const next = computeShapeResize('line', 160, 4, 50, 80, 'e');
    expect(next.width).toBe(210);
    expect(next.height).toBe(4);
  });

  it('clamps to minimum size', () => {
    expect(clampPaperShapePx(8)).toBe(24);
  });
});
