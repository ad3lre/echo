/** 1x1 transparent GIF data URL - safe fallback when URL is invalid */
const FALLBACK_IMAGE =
  'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

/** Echo/API avatars are sometimes stored without a leading slash; allow only tight path chars. */
const BARE_RELATIVE_PATH = /^[\w\-./%~]+$/;

function isBareRelativePath(trimmed: string): boolean {
  return (
    trimmed.length > 0 &&
    trimmed.length <= 2048 &&
    BARE_RELATIVE_PATH.test(trimmed)
  );
}

/**
 * True when the UI should treat the value as “no intended image” and show a bundled default
 * (e.g. user/guild placeholder) rather than attempting a remote load or showing error UX.
 * Covers empty input, rejected schemes, non-path garbage, and the transparent 1×1 from {@link safeImageUrl}.
 */
export function requiresBundledMediaFallback(
  url: string | undefined | null,
): boolean {
  if (!url || typeof url !== 'string') return true;
  const trimmed = url.trim();
  if (!trimmed) return true;
  if (!isTrustedMediaUrl(trimmed)) return true;
  if (trimmed === FALLBACK_IMAGE) return true;
  return false;
}

/**
 * True when `safeImageUrl` would return a real remote/data/relative URL (not the 1×1 fallback).
 * Use to show explicit "unavailable" UI instead of a silent blank pixel.
 */
export function isTrustedMediaUrl(url: string | undefined | null): boolean {
  if (!url || typeof url !== 'string') return false;
  const trimmed = url.trim();
  if (!trimmed) return false;
  const lower = trimmed.slice(0, 12).toLowerCase();
  if (lower.startsWith('javascript:') || lower.startsWith('vbscript:')) {
    return false;
  }
  if (trimmed.startsWith('//')) return true;
  if (
    trimmed.startsWith('http://') ||
    trimmed.startsWith('https://') ||
    trimmed.startsWith('data:') ||
    trimmed.startsWith('/')
  ) {
    return true;
  }
  return isBareRelativePath(trimmed);
}

/**
 * Returns the URL if it looks like a valid image source (http, https, data:, or relative /).
 * Otherwise returns a transparent 1x1 placeholder to avoid broken img requests.
 */
export function safeImageUrl(url: string | undefined | null): string {
  if (!url || typeof url !== 'string') return FALLBACK_IMAGE;
  const trimmed = url.trim();
  if (!trimmed) return FALLBACK_IMAGE;
  const lower = trimmed.slice(0, 12).toLowerCase();
  if (lower.startsWith('javascript:') || lower.startsWith('vbscript:')) {
    return FALLBACK_IMAGE;
  }
  if (trimmed.startsWith('//')) {
    return `https:${trimmed}`;
  }
  if (
    trimmed.startsWith('http://') ||
    trimmed.startsWith('https://') ||
    trimmed.startsWith('data:') ||
    trimmed.startsWith('/')
  ) {
    return trimmed;
  }
  if (isBareRelativePath(trimmed)) {
    return `/${trimmed.replace(/^\/+/, '')}`;
  }
  return FALLBACK_IMAGE;
}
