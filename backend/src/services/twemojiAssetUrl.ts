/**
 * Stable Twemoji CDN URLs for market-pack emoji placeholders (no Node twemoji dependency).
 */
export function twemoji72UrlForGlyph(glyph: string): string {
  const g = glyph.trim();
  if (!g) return '';
  const cp = g.codePointAt(0);
  if (cp == null) return '';
  const hex = cp.toString(16).toLowerCase();
  return `https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/72x72/${hex}.png`;
}
