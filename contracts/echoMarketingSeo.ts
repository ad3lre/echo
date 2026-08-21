/** Canonical marketing origin (legal pages, sitemap, structured data). */
export const ECHO_MARKETING_SITE_ORIGIN = 'https://app-echo.net';

/** Chat `/legal/{id}` tab ids → marketing site paths (`trailingSlash: never`). */
export const CHAT_LEGAL_DOC_TO_MARKETING_PATH: Readonly<
  Record<string, string>
> = {
  privacy: '/privacy',
  terms: '/terms',
  community: '/community-guidelines',
  attributions: '/attributions',
};

/** Build the marketing canonical URL for a chat legal doc tab id, or null when unknown. */
export function marketingLegalCanonicalUrl(
  chatLegalDocId: string,
): string | null {
  const path = CHAT_LEGAL_DOC_TO_MARKETING_PATH[chatLegalDocId];
  if (!path) return null;
  return normalizeMarketingCanonicalUrl(ECHO_MARKETING_SITE_ORIGIN, path);
}

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

/** Match `GET /legal/{privacy|terms|community|attributions}` (optional trailing slash). */
export const CHAT_LEGAL_PATH_RE =
  /^\/legal\/(privacy|terms|community|attributions)\/?$/;
