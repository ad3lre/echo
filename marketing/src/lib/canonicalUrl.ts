import { MARKETING_SITE_ORIGIN } from '../site';

/**
 * Marketing canonical URLs with `trailingSlash: never` (matches Astro sitemap + page routes).
 * Root is the bare origin (`https://app-echo.net`), not `https://app-echo.net/`.
 */
export function normalizeMarketingCanonicalUrl(
  origin: string,
  path: string,
): string {
  const base = origin.replace(/\/$/, '');
  const normalizedPath = path === '/' ? '' : path.replace(/\/$/, '');
  if (!normalizedPath) return base;
  const withLeading = normalizedPath.startsWith('/')
    ? normalizedPath
    : `/${normalizedPath}`;
  return `${base}${withLeading}`;
}

/** Canonical page URL for marketing HTML (`trailingSlash: never`). */
export function marketingCanonicalUrl(path: string): string {
  return normalizeMarketingCanonicalUrl(MARKETING_SITE_ORIGIN, path);
}

/** Alias used by structured-data helpers. */
export function marketingUrl(path = '/'): string {
  return marketingCanonicalUrl(path);
}
