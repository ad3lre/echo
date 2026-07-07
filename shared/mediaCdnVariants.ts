import path from 'node:path';

/** Max width query param on media-cdn object GET (resize, never upscale). */
export const ECHO_MEDIA_CDN_WIDTH_QUERY_PARAM = 'w';

/** Output format query param on media-cdn object GET. */
export const ECHO_MEDIA_CDN_FORMAT_QUERY_PARAM = 'f';

export type MediaCdnOutputFormat = 'webp';

/** Matches client chat upload compression (`uploadCompression.ts`). */
export const ECHO_MEDIA_UPLOAD_MAX_DIMENSION = 2560;

/** Matches client avatar upload preset. */
export const ECHO_MEDIA_AVATAR_MAX_DIMENSION = 512;

/** Matches client WebP quality (0–100 scale). */
export const ECHO_MEDIA_WEBP_QUALITY = 82;

export const ECHO_MEDIA_CDN_ALLOWED_WIDTHS = [
  32, 48, 64, 96, 128, 192, 256, 320, 384, 480, 640, 960, 1280, 1920, 2560,
] as const;

export type MediaCdnAllowedWidth =
  (typeof ECHO_MEDIA_CDN_ALLOWED_WIDTHS)[number];

export type MediaCdnVariantParams = {
  width?: MediaCdnAllowedWidth;
  format?: MediaCdnOutputFormat;
};

const RASTER_IMAGE_EXTENSIONS = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.webp',
  '.bmp',
  '.tif',
  '.tiff',
  '.heic',
  '.heif',
]);

const RASTER_IMAGE_CONTENT_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/bmp',
  'image/tiff',
  'image/heic',
  'image/heif',
]);

export function isRasterImageContentType(contentType: string): boolean {
  const ct = contentType.trim().toLowerCase();
  if (!ct.startsWith('image/')) return false;
  if (ct === 'image/gif') return false;
  return RASTER_IMAGE_CONTENT_TYPES.has(ct);
}

export function isRasterImageStorageKey(storageKey: string): boolean {
  const ext = path.extname(storageKey.trim()).toLowerCase();
  return RASTER_IMAGE_EXTENSIONS.has(ext);
}

export function normalizeMediaCdnVariantWidth(
  raw: unknown,
): MediaCdnAllowedWidth | null {
  const n =
    typeof raw === 'number'
      ? raw
      : typeof raw === 'string' && raw.trim()
        ? Number(raw.trim())
        : NaN;
  if (!Number.isFinite(n) || n <= 0) return null;
  const rounded = Math.round(n);
  return (ECHO_MEDIA_CDN_ALLOWED_WIDTHS as readonly number[]).includes(rounded)
    ? (rounded as MediaCdnAllowedWidth)
    : null;
}

function parseMediaCdnOutputFormat(raw: unknown): MediaCdnOutputFormat | null {
  if (typeof raw !== 'string' || !raw.trim()) return null;
  const f = raw.trim().toLowerCase();
  return f === 'webp' ? 'webp' : null;
}

/** Parse allowlisted `w` / `f` query params; returns null when neither is present. */
export function parseMediaCdnVariantQuery(
  query: Record<string, unknown>,
): MediaCdnVariantParams | null {
  const width = normalizeMediaCdnVariantWidth(
    query[ECHO_MEDIA_CDN_WIDTH_QUERY_PARAM],
  );
  const format = parseMediaCdnOutputFormat(
    query[ECHO_MEDIA_CDN_FORMAT_QUERY_PARAM],
  );
  if (
    query[ECHO_MEDIA_CDN_WIDTH_QUERY_PARAM] != null &&
    query[ECHO_MEDIA_CDN_WIDTH_QUERY_PARAM] !== '' &&
    width == null
  ) {
    return null;
  }
  if (
    query[ECHO_MEDIA_CDN_FORMAT_QUERY_PARAM] != null &&
    query[ECHO_MEDIA_CDN_FORMAT_QUERY_PARAM] !== '' &&
    format == null
  ) {
    return null;
  }
  if (width == null && format == null) return null;
  return {
    ...(width != null ? { width } : {}),
    ...(format != null ? { format } : {}),
  };
}

export function hasMediaCdnVariantQuery(
  query: Record<string, unknown>,
): boolean {
  const w = query[ECHO_MEDIA_CDN_WIDTH_QUERY_PARAM];
  const f = query[ECHO_MEDIA_CDN_FORMAT_QUERY_PARAM];
  return (
    (w != null && String(w).length > 0) || (f != null && String(f).length > 0)
  );
}

export function appendMediaCdnVariantParams(
  url: string,
  opts: MediaCdnVariantParams,
): string {
  const trimmed = url.trim();
  if (!trimmed) return trimmed;
  const width =
    opts.width != null ? normalizeMediaCdnVariantWidth(opts.width) : null;
  const format = opts.format ?? null;
  if (width == null && format == null) return trimmed;

  const hashIdx = trimmed.indexOf('#');
  const withoutHash = hashIdx >= 0 ? trimmed.slice(0, hashIdx) : trimmed;
  const hash = hashIdx >= 0 ? trimmed.slice(hashIdx) : '';
  const qIdx = withoutHash.indexOf('?');
  const base = qIdx >= 0 ? withoutHash.slice(0, qIdx) : withoutHash;
  const search = qIdx >= 0 ? withoutHash.slice(qIdx + 1) : '';
  const params = new URLSearchParams(search);
  if (width != null) {
    params.set(ECHO_MEDIA_CDN_WIDTH_QUERY_PARAM, String(width));
  }
  if (format != null) {
    params.set(ECHO_MEDIA_CDN_FORMAT_QUERY_PARAM, format);
  }
  const qs = params.toString();
  return `${base}${qs ? `?${qs}` : ''}${hash}`;
}

export function extForRasterContentType(contentType: string): string {
  const ct = contentType.trim().toLowerCase();
  if (ct === 'image/png') return '.png';
  if (ct === 'image/jpeg') return '.jpg';
  if (ct === 'image/webp') return '.webp';
  if (ct === 'image/gif') return '.gif';
  if (ct === 'image/bmp') return '.bmp';
  if (ct === 'image/tiff') return '.tiff';
  if (ct === 'image/heic') return '.heic';
  if (ct === 'image/heif') return '.heif';
  return '.bin';
}
