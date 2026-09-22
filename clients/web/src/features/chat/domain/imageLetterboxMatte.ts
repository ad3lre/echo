/**
 * Letterbox matte for `object-fit: contain` chat media.
 *
 * Prefer a soft blurred fill from the image itself. When the bitmap is
 * essentially one flat color, use that solid instead (blur would only soften
 * edges without adding atmosphere).
 */

export type LetterboxMatte = { kind: 'solid'; css: string } | { kind: 'blur' };

/** Max channel delta from mean (0–255) to treat the image as a single color. */
export const LETTERBOX_SOLID_MAX_DELTA = 12;

/** Pure pixel classifier (exported for unit tests). */
export function classifyLetterboxPixels(
  rgba: ArrayLike<number>,
  solidMaxDelta = LETTERBOX_SOLID_MAX_DELTA,
): LetterboxMatte {
  const pixelCount = Math.floor(rgba.length / 4);
  if (pixelCount <= 0) return { kind: 'blur' };

  let sumR = 0;
  let sumG = 0;
  let sumB = 0;
  let sumA = 0;
  for (let i = 0; i < pixelCount; i++) {
    const o = i * 4;
    sumR += rgba[o]!;
    sumG += rgba[o + 1]!;
    sumB += rgba[o + 2]!;
    sumA += rgba[o + 3]!;
  }

  const meanR = sumR / pixelCount;
  const meanG = sumG / pixelCount;
  const meanB = sumB / pixelCount;
  const meanA = sumA / pixelCount;

  let maxDelta = 0;
  for (let i = 0; i < pixelCount; i++) {
    const o = i * 4;
    maxDelta = Math.max(
      maxDelta,
      Math.abs(rgba[o]! - meanR),
      Math.abs(rgba[o + 1]! - meanG),
      Math.abs(rgba[o + 2]! - meanB),
      Math.abs(rgba[o + 3]! - meanA),
    );
    if (maxDelta > solidMaxDelta) return { kind: 'blur' };
  }

  return {
    kind: 'solid',
    css: `rgba(${Math.round(meanR)}, ${Math.round(meanG)}, ${Math.round(meanB)}, ${(meanA / 255).toFixed(3)})`,
  };
}
