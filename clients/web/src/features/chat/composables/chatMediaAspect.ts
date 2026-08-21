import type { StyleValue } from 'vue';

/** Placeholder box while image dimensions are unknown (matches video player min shell). */
export const CHAT_BITMAP_DEFAULT_ASPECT_RATIO = '16 / 9';

/** Matches attachment shells: `max-width: min(100%, 40rem)` at 16px root. */
export const CHAT_ATTACHMENT_BITMAP_MAX_WIDTH_PX = 640;

/** Matches inline image slots: `max-width: min(100%, min(92vw, 36rem))`. */
export const CHAT_IMAGE_SLOT_MAX_WIDTH_PX = 576;

export function aspectRatioStyleFromDimensions(
  width: number,
  height: number,
): { aspectRatio: string } {
  return { aspectRatio: `${width} / ${height}` };
}

export function mediaAspectStyleFromDims(
  media:
    | { width?: number | null; height?: number | null }
    | Pick<
        { width?: number | null; height?: number | null },
        'width' | 'height'
      >
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

/** Reserved block height for a full-width chat bitmap at known aspect ratio. */
export function estimateChatBitmapBlockPx(
  width: number,
  height: number,
  options?: {
    maxWidthPx?: number;
    verticalMarginPx?: number;
  },
): number {
  if (width <= 0 || height <= 0) return 200;
  const maxWidthPx = options?.maxWidthPx ?? CHAT_ATTACHMENT_BITMAP_MAX_WIDTH_PX;
  const verticalMarginPx = options?.verticalMarginPx ?? 8;
  const blockHeight = (maxWidthPx * height) / width + verticalMarginPx;
  return Math.ceil(blockHeight);
}
