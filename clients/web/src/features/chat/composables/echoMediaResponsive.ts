import {
  appendMediaCdnVariantParams,
  type MediaCdnAllowedWidth,
  type MediaCdnOutputFormat,
} from '@shared/mediaCdnVariants';
import { extractStorageKeyFromMediaCdnUrl } from '@shared/mediaCdn';

const RASTER_STORAGE_KEY_SUFFIX = /\.(png|jpe?g|webp|bmp|tiff?|heic|heif)$/i;

/**
 * The media CDN validates variants from the object key before reading bytes.
 * Do not ask it for a WebP variant when a legacy key has no raster extension;
 * the original signed object can still be a perfectly valid image.
 */
export function echoMediaUrlSupportsVariants(
  url: string,
  storageKey?: string,
): boolean {
  const t = url.trim();
  if (!t || t.startsWith('data:') || t.startsWith('blob:')) return false;
  // This function is called after signing too. `echoMediaUrlNeedsSigning()` is
  // intentionally false for `?t=...`, so use the URL shape—not token state—to
  // recognize a canonical media-CDN object here.
  const canonicalKey = extractStorageKeyFromMediaCdnUrl(t);
  const key = canonicalKey || storageKey?.trim();
  if (!key || !canonicalKey) return false;
  return RASTER_STORAGE_KEY_SUFFIX.test(key.split('?')[0]!);
}

export function buildEchoMediaSrcSet(
  signedUrl: string,
  widths: readonly MediaCdnAllowedWidth[],
  format: MediaCdnOutputFormat = 'webp',
  storageKey?: string,
): string {
  if (
    !echoMediaUrlSupportsVariants(signedUrl, storageKey) ||
    widths.length === 0
  ) {
    return '';
  }
  return widths
    .map(
      (w) =>
        `${appendMediaCdnVariantParams(signedUrl, { width: w, format })} ${w}w`,
    )
    .join(', ');
}

export function buildEchoMediaVariantUrl(
  signedUrl: string,
  opts: {
    width: MediaCdnAllowedWidth;
    format?: MediaCdnOutputFormat;
    storageKey?: string;
  },
): string {
  if (!echoMediaUrlSupportsVariants(signedUrl, opts.storageKey)) {
    return signedUrl;
  }
  return appendMediaCdnVariantParams(signedUrl, {
    width: opts.width,
    format: opts.format ?? 'webp',
  });
}

/** Default responsive widths for chat collage / inline attachment thumbnails. */
export const ECHO_CHAT_MEDIA_RESPONSIVE_WIDTHS = [320, 640] as const;

/** Default responsive widths for avatar slots (member list, message author, etc.). */
export const ECHO_AVATAR_RESPONSIVE_WIDTHS = [64, 128, 256] as const;

export const ECHO_CHAT_MEDIA_COLLAGE_SIZES = '(max-width: 640px) 50vw, 320px';

export const ECHO_CHAT_MEDIA_SINGLE_SIZES = '(max-width: 640px) 100vw, 640px';

export const ECHO_AVATAR_SIZES = '(max-width: 480px) 48px, 128px';
