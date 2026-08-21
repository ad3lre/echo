import { describe, expect, it } from 'vitest';
import {
  clampPaperShapePx,
  computeShapeResize,
  formatPaperShapePx,
  isPaperShapeFillNone,
  parsePaperShapePx,
  PAPER_SHAPE_MAX_PX,
  PAPER_SHAPE_MIN_PX,
  PAPER_SHAPE_SIZE_PRESETS,
  shapeInlineStyle,
  stepShapeSizePx,
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

  it('detects transparent fills', () => {
    expect(isPaperShapeFillNone('transparent')).toBe(true);
    expect(isPaperShapeFillNone('none')).toBe(true);
    expect(isPaperShapeFillNone('#3b82f6')).toBe(false);
  });

  it('renders borders and transparent fills', () => {
    const hollow = shapeInlineStyle(
      'rectangle',
      'transparent',
      '120px',
      '120px',
    );
    expect(hollow).toContain('background-color:transparent');

    const bordered = shapeInlineStyle(
      'rectangle',
      'transparent',
      '120px',
      '120px',
      null,
      { color: '#111111', width: '3px', style: 'dashed' },
    );
    expect(bordered).toContain('border:3px dashed #111111');

    const triangle = shapeInlineStyle(
      'triangle',
      '#3b82f6',
      '120px',
      '120px',
      null,
      { color: '#111111', width: '2px', style: 'solid' },
    );
    expect(triangle).toContain('box-shadow:inset 0 0 0 2px #111111');
  });

  it('steps through presets and beyond in 20px increments', () => {
    expect(stepShapeSizePx(120, 'up')).toBe(200);
    expect(stepShapeSizePx(120, 'down')).toBe(80);
    const xl =
      PAPER_SHAPE_SIZE_PRESETS[PAPER_SHAPE_SIZE_PRESETS.length - 1]!.px;
    expect(stepShapeSizePx(xl, 'up')).toBe(xl + 20);
    const small = PAPER_SHAPE_SIZE_PRESETS[0]!.px;
    expect(stepShapeSizePx(small, 'down')).toBe(small - 20);
    expect(stepShapeSizePx(PAPER_SHAPE_MIN_PX, 'down')).toBe(
      PAPER_SHAPE_MIN_PX,
    );
    expect(stepShapeSizePx(PAPER_SHAPE_MAX_PX, 'up')).toBe(PAPER_SHAPE_MAX_PX);
  });
});
