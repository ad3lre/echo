import { iconEchoRounded } from '@/assets/branding';
import { isTrustedMediaUrl } from '@/features/layout/display/safeImageUrl';

const SENTINEL_ICON_VALUES = new Set([
  '',
  '-',
  '.',
  'none',
  'nil',
  'null',
  'undefined',
  'n/a',
  'na',
]);

/**
 * Discord guild icons use `/icons/{guildId}/{iconHash}.{ext}`. An empty or missing
 * hash still produces a truthy URL string in some pipelines (e.g. `.../123/.png`),
 * which 404s and surfaces as “missing” in `<img>` + PausedGifAvatar.
 */
function isMalformedDiscordCdnGuildIconUrl(url: string): boolean {
  const u = url.trim();
  if (!u) return false;
  if (!/cdn\.discordapp\.(com|net)\//i.test(u)) return false;
  if (!/\/icons\/\d+\//i.test(u)) return false;
  // Empty filename before extension: `/icons/{id}/.png`
  if (/\/icons\/\d+\/\.\w{2,5}(\?|#|$)/i.test(u)) return true;
  // `/icons/{id}` or `/icons/{id}/` with no hash file
  if (/\/icons\/\d+\/?(\?|#|$)/i.test(u)) return true;
  return false;
}

/**
 * Root-relative URLs for `<img src>`: bare paths like `echo-rounded-logo.png` or `echo-uploads/…`
 * resolve against the **current route**, not the site root, and 404 on nested paths.
 */
function rootRelativeUrlForImgSrc(url: string): string {
  const u = url.trim().replace(/^\.\//, '');
  if (!u) return u;
  if (/^[a-z][a-z0-9+.-]*:/i.test(u)) return u;
  if (u.startsWith('//') || u.startsWith('/')) return u;
  return `/${u.replace(/^\/+/, '')}`;
}

/** Canonical guild icon URL for `<img>` / `PausedGifAvatar`: real icon or Echo default (presentation). */
export function serverGuildIconDisplayUrl(
  imageUrl: string | undefined | null,
): string {
  const t = typeof imageUrl === 'string' ? imageUrl.trim() : '';
  if (!t || SENTINEL_ICON_VALUES.has(t.toLowerCase())) {
    return iconEchoRounded;
  }
  if (!isTrustedMediaUrl(t)) {
    return iconEchoRounded;
  }
  if (isMalformedDiscordCdnGuildIconUrl(t)) {
    return iconEchoRounded;
  }
  return rootRelativeUrlForImgSrc(t);
}
