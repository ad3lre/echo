/**
 * Resolve a raster image URL for rich link-card previews.
 *
 * Discord `type: "video"` / gifv embeds often store an `.mp4` on `image` (or
 * only on `video` mapped onto `image` at import). Putting that URL in `<img>`
 * always errors → "Preview unavailable". Prefer a real image/thumbnail instead.
 */

import type { Embed } from './types/message';

export type EmbedPreviewImage = {
  url: string;
  width?: number;
  height?: number;
};

/** True when the URL path looks like a video file browsers will not decode in `<img>`. */
export function isLikelyVideoFileUrl(url: string | undefined | null): boolean {
  if (!url || typeof url !== 'string') return false;
  const t = url.trim();
  if (!t) return false;
  return /\.(mp4|webm|mov|m4v)(\?|#|$)/i.test(t);
}

function asPreviewImage(
  media: { url?: string; width?: number; height?: number } | undefined,
): EmbedPreviewImage | undefined {
  const url = media?.url?.trim();
  if (!url || isLikelyVideoFileUrl(url)) return undefined;
  const out: EmbedPreviewImage = { url };
  if (typeof media?.width === 'number' && media.width > 0) {
    out.width = media.width;
  }
  if (typeof media?.height === 'number' && media.height > 0) {
    out.height = media.height;
  }
  return out;
}

/**
 * Best raster preview for an embed card: `image` first, then `thumbnail`,
 * skipping video file URLs that would break `<img>`.
 */
export function resolveEmbedCardPreviewImage(
  embed: Pick<Embed, 'image' | 'thumbnail'>,
): EmbedPreviewImage | undefined {
  return asPreviewImage(embed.image) ?? asPreviewImage(embed.thumbnail);
}
