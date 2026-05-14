/**
 * Background fills for auto-generated avatars (white initials). Mid-saturation, dark enough
 * for ~52px semibold text at AA contrast; order is stable — index only via hash.
 */
export const AVATAR_BACKGROUND_PALETTE = [
  '#5865F2',
  '#3BA55D',
  '#F26522',
  '#9B59B6',
  '#E74C3C',
  '#1ABC9C',
  '#3498DB',
  '#E91E63',
  '#C0392B',
  '#16A085',
  '#2980B9',
  '#8E44AD',
  '#D35400',
  '#27AE60',
  '#2C3E50',
  '#E67E22',
  '#1F618D',
  '#884EA0',
  '#117864',
  '#B03A2E',
  '#AF601A',
  '#6C3483',
  '#2874A6',
] as const;

/** @deprecated Prefer hashing into {@link AVATAR_BACKGROUND_PALETTE}; kept for callers/tests. */
export const DEFAULT_AVATAR_BACKGROUND = AVATAR_BACKGROUND_PALETTE[0];

/** FNV-1a 32-bit — stable, fast, good distribution for short strings (display names). */
function fnv1a32(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * Picks a palette color from the display name (trimmed, case-folded for hashing).
 * Empty names still get a deterministic bucket.
 */
export function avatarBackgroundFromDisplayName(displayName: string): string {
  const key = displayName.trim().toLowerCase() || '\0';
  const idx = fnv1a32(key) % AVATAR_BACKGROUND_PALETTE.length;
  return AVATAR_BACKGROUND_PALETTE[idx]!;
}

/**
 * Two “dominant” letters from a display name: first letter of the first word +
 * first letter of the last word when multiple words; otherwise the first two
 * characters of the single token (duplicated if only one character).
 */
export function dominantLettersFromDisplayName(displayName: string): string {
  const trimmed = displayName.trim();
  if (!trimmed) return '?';

  const parts = trimmed.split(/\s+/).filter(Boolean);
  const toUpper = (ch: string) => ch.toLocaleUpperCase();

  if (parts.length >= 2) {
    const a = Array.from(parts[0])[0];
    const b = Array.from(parts[parts.length - 1])[0];
    const pair = `${a ? toUpper(a) : ''}${b ? toUpper(b) : ''}`.trim();
    return pair || '?';
  }

  const word = parts[0] ?? trimmed;
  const chars = Array.from(word);
  if (chars.length === 0) return '?';
  if (chars.length === 1) return `${toUpper(chars[0])}${toUpper(chars[0])}`;
  return `${toUpper(chars[0])}${toUpper(chars[1])}`;
}

/** SVG avatar as a data URL (stored in `auth_users.pfp` for new accounts). */
export function generateDefaultAvatarPfp(displayName: string): string {
  const letters = dominantLettersFromDisplayName(displayName);
  const background = avatarBackgroundFromDisplayName(displayName);
  const safe = letters
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128">
  <rect width="128" height="128" fill="${background}"/>
  <text x="64" y="64" dominant-baseline="central" text-anchor="middle" fill="#ffffff"
    font-family="ui-sans-serif, system-ui, Segoe UI, sans-serif" font-size="52" font-weight="600">${safe}</text>
</svg>`;

  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}
