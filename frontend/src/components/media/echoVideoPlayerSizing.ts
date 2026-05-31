export const VIDEO_COMPACT_MAX_WIDTH = 'min(100%, 28rem)';
export const VIDEO_EXPANDED_MAX_WIDTH = 'min(100%, min(92vw, 56rem))';
export const VIDEO_COMPACT_MAX_HEIGHT = 'min(80vh, 24rem)';
export const VIDEO_EXPANDED_MAX_HEIGHT = 'min(80vh, 36rem)';

export function parseAspectRatioPair(
  aspectRatio: string,
): { w: number; h: number } | null {
  const parts = aspectRatio.split('/').map((part) => Number(part.trim()));
  if (parts.length !== 2 || !parts.every((n) => Number.isFinite(n) && n > 0)) {
    return null;
  }
  return { w: parts[0], h: parts[1] };
}

export function isPortraitAspectRatio(aspectRatio: string | null): boolean {
  if (!aspectRatio) return false;
  const pair = parseAspectRatioPair(aspectRatio);
  return pair ? pair.h > pair.w : false;
}
