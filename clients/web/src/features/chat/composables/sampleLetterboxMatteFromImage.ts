import {
  classifyLetterboxPixels,
  LETTERBOX_SOLID_MAX_DELTA,
  type LetterboxMatte,
} from '@/features/chat/domain/imageLetterboxMatte';

const DEFAULT_SAMPLE = 24;

/**
 * Sample a loaded image (must be CORS-readable). Returns `blur` when the
 * canvas is tainted or the bitmap has meaningful color variation.
 */
export function sampleLetterboxMatteFromImage(
  img: CanvasImageSource & { width?: number; naturalWidth?: number },
  options?: { sampleSize?: number; solidMaxDelta?: number },
): LetterboxMatte {
  const sampleSize = options?.sampleSize ?? DEFAULT_SAMPLE;
  const solidMaxDelta = options?.solidMaxDelta ?? LETTERBOX_SOLID_MAX_DELTA;

  const canvas = document.createElement('canvas');
  canvas.width = sampleSize;
  canvas.height = sampleSize;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return { kind: 'blur' };

  try {
    ctx.drawImage(img, 0, 0, sampleSize, sampleSize);
    const { data } = ctx.getImageData(0, 0, sampleSize, sampleSize);
    return classifyLetterboxPixels(data, solidMaxDelta);
  } catch {
    // Cross-origin / tainted canvas — fall back to CSS blur backdrop.
    return { kind: 'blur' };
  }
}
