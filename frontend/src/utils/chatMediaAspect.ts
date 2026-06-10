import type { StyleValue } from 'vue';

/** Placeholder box while image dimensions are unknown (matches video player min shell). */
export const CHAT_BITMAP_DEFAULT_ASPECT_RATIO = '16 / 9';

export function aspectRatioStyleFromDimensions(
  width: number,
  height: number,
): { aspectRatio: string } {
  return { aspectRatio: `${width} / ${height}` };
}

export function mediaAspectStyleFromDims(
  media:
    | { width?: number; height?: number }
    | Pick<{ width?: number; height?: number }, 'width' | 'height'>
    | undefined,
): { aspectRatio: string } | undefined {
  const width = media?.width;
  const height = media?.height;
  if (
    typeof width === 'number' &&
    width > 0 &&
    typeof height === 'number' &&
    height > 0
  ) {
    return aspectRatioStyleFromDimensions(width, height);
  }
  return undefined;
}

export function readAspectRatioFromStyle(
  s: StyleValue | undefined,
): string | null {
  if (!s || typeof s !== 'object' || Array.isArray(s)) return null;
  const ar = (s as Record<string, string>).aspectRatio;
  return typeof ar === 'string' && ar.trim() ? ar.trim() : null;
}
