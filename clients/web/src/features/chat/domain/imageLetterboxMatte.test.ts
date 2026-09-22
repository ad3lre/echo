import { describe, expect, it } from 'vitest';
import { classifyLetterboxPixels } from './imageLetterboxMatte';

function fillSolid(
  w: number,
  h: number,
  r: number,
  g: number,
  b: number,
  a = 255,
): Uint8ClampedArray {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    const o = i * 4;
    data[o] = r;
    data[o + 1] = g;
    data[o + 2] = b;
    data[o + 3] = a;
  }
  return data;
}

describe('classifyLetterboxPixels', () => {
  it('treats a flat fill as solid', () => {
    const matte = classifyLetterboxPixels(fillSolid(8, 8, 40, 120, 200));
    expect(matte.kind).toBe('solid');
    if (matte.kind === 'solid') {
      expect(matte.css).toMatch(/^rgba\(40, 120, 200,/);
    }
  });

  it('treats near-flat fills as solid within tolerance', () => {
    const data = fillSolid(4, 4, 100, 100, 100);
    data[0] = 108;
    data[1] = 100;
    data[2] = 100;
    const matte = classifyLetterboxPixels(data, 12);
    expect(matte.kind).toBe('solid');
  });

  it('uses blur when colors vary', () => {
    const data = fillSolid(4, 4, 10, 10, 10);
    data[0] = 200;
    data[1] = 20;
    data[2] = 20;
    expect(classifyLetterboxPixels(data).kind).toBe('blur');
  });
});
