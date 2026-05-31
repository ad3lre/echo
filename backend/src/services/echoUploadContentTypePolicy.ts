/**
 * Shared upload Content-Type policy for presign, register, and serve paths.
 * Blocks types that could execute in a browser when fetched from the upload origin.
 */

const SAFE_CONTENT_TYPE_RE = /^(image|video|audio)\//i;

const SAFE_CONTENT_TYPE_EXACT = new Set([
  'application/octet-stream',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.apple.mpegurl',
  'video/iso.segment',
]);

/** Explicit blocklist even when a broader prefix would match (e.g. image/svg+xml). */
const BLOCKED_CONTENT_TYPES = new Set([
  'image/svg+xml',
  'text/html',
  'text/javascript',
  'application/javascript',
  'application/xhtml+xml',
]);

export type EchoUploadContentTypeSanitizeResult = {
  contentType: string;
  /** True when the raw type was rejected and replaced with the fallback. */
  coerced: boolean;
};

export function sanitizeEchoUploadContentType(
  raw: string,
  fallback = 'application/octet-stream',
): EchoUploadContentTypeSanitizeResult {
  const ct = raw.trim().toLowerCase();
  if (!ct) return { contentType: fallback, coerced: false };
  if (BLOCKED_CONTENT_TYPES.has(ct)) {
    return { contentType: fallback, coerced: true };
  }
  if (SAFE_CONTENT_TYPE_RE.test(ct)) {
    return { contentType: ct, coerced: false };
  }
  if (SAFE_CONTENT_TYPE_EXACT.has(ct)) {
    return { contentType: ct, coerced: false };
  }
  return { contentType: fallback, coerced: true };
}

/** Apply at serve time so poisoned DB metadata cannot override presign safety. */
export function sanitizeEchoUploadServeContentType(
  raw: string,
  storageKey: string,
): EchoUploadContentTypeSanitizeResult {
  const fromKey = sanitizeEchoUploadContentType(
    raw.trim() || guessEchoUploadContentTypeFromKey(storageKey),
  );
  return fromKey;
}

function guessEchoUploadContentTypeFromKey(storageKey: string): string {
  const ext = storageKey.includes('.')
    ? storageKey.slice(storageKey.lastIndexOf('.')).toLowerCase()
    : '';
  const m: Record<string, string> = {
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.svg': 'image/svg+xml',
    '.mp4': 'video/mp4',
    '.webm': 'video/webm',
    '.pdf': 'application/pdf',
  };
  return m[ext] ?? 'application/octet-stream';
}
