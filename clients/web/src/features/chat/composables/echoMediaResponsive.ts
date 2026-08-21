import {
  appendMediaCdnVariantParams,
  type MediaCdnAllowedWidth,
  type MediaCdnOutputFormat,
} from '@shared/mediaCdnVariants';
import { echoMediaUrlNeedsSigning } from '@/features/chat/mediaCdn';

export function echoMediaUrlSupportsVariants(url: string): boolean {
  const t = url.trim();
  if (!t || t.startsWith('data:') || t.startsWith('blob:')) return false;
  return echoMediaUrlNeedsSigning(t);
}

export function buildEchoMediaSrcSet(
  signedUrl: string,
  widths: readonly MediaCdnAllowedWidth[],
  format: MediaCdnOutputFormat = 'webp',
): string {
  if (!echoMediaUrlSupportsVariants(signedUrl) || widths.length === 0) {
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
  opts: { width: MediaCdnAllowedWidth; format?: MediaCdnOutputFormat },
): string {
  if (!echoMediaUrlSupportsVariants(signedUrl)) return signedUrl;
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
