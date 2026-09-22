/**
 * Tenor / Giphy page and media URLs posted as links (including Discord-synced embeds)
 * should render as inline animated GIFs, not rich link preview cards.
 */

import type { Embed } from './types/message';

const GIF_HOST_SUFFIXES = [
  'giphy.com',
  'media.giphy.com',
  'tenor.com',
  'tenor.co',
  'klipy.com',
] as const;

/**
 * Tenor CDN paths look like `/LSI81MmB6gEAAAAD/cat-fear.png` where the trailing
 * `AAAxx` token selects a format (mp4 / png preview / gif). Rewrite to `AAAAC`
 * + `.gif` so chat always gets an animated GIF, not a static preview or mp4.
 */
const TENOR_CDN_FORMAT_RE =
  /^(https?:\/\/(?:media\.tenor\.com|c\.tenor\.com)\/)([A-Za-z0-9_-]+?)(AAA[A-Za-z0-9]{2})(\/[^/?#]*?)(\.[a-z0-9]+)(\?[^#]*)?(#.*)?$/i;

function hostMatchesGifHost(hostname: string): boolean {
  const h = hostname.toLowerCase();
  return GIF_HOST_SUFFIXES.some((s) => h === s || h.endsWith(`.${s}`));
}

function tryParseHttpUrl(url: string): URL | null {
  try {
    const u = new URL(url);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    return u;
  } catch {
    return null;
  }
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Rewrite Tenor CDN preview/mp4 URLs to the animated GIF variant. */
export function normalizeTenorAnimatedGifUrl(url: string): string {
  const t = url.trim();
  if (!t) return t;
  const m = t.match(TENOR_CDN_FORMAT_RE);
  if (!m) return t;
  const origin = m[1]!;
  const id = m[2]!;
  const pathBase = (m[4] || '/tenor').replace(/\.[^.]+$/, '') || '/tenor';
  const query = m[6] ?? '';
  const hash = m[7] ?? '';
  return `${origin}${id}AAAAC${pathBase}.gif${query}${hash}`;
}

/** Direct GIF / GIF-host CDN URL (media.tenor.com, media.giphy.com, *.gif, …). */
export function isLikelyGifMediaUrl(url: string | undefined | null): boolean {
  if (!url || typeof url !== 'string') return false;
  const t = url.trim().toLowerCase();
  if (!t) return false;
  if (t.startsWith('data:image/gif')) return true;
  if (/\.gif(\?|#|$)/i.test(t)) return true;
  if (/(^|[?&])format=gif([&#]|$)/i.test(t)) return true;
  const u = tryParseHttpUrl(t);
  if (!u) return false;
  if (isGifHostPageUrl(t)) return false;
  const h = u.hostname.toLowerCase();
  if (h === 'media.tenor.com' || h.endsWith('.media.tenor.com')) return true;
  if (h === 'c.tenor.com' || h.endsWith('.c.tenor.com')) return true;
  if (h === 'media.giphy.com' || h.endsWith('.media.giphy.com')) return true;
  if (h === 'i.giphy.com' || h.endsWith('.i.giphy.com')) return true;
  if (h === 'static.klipy.com' || h.endsWith('.static.klipy.com')) return true;
  const path = u.pathname.toLowerCase();
  if (path.includes('/media/') && hostMatchesGifHost(h)) return true;
  return false;
}

/** Tenor / Giphy viewer page URL (tenor.com/view/…, giphy.com/gifs/…). */
export function isGifHostPageUrl(url: string | undefined | null): boolean {
  if (!url || typeof url !== 'string') return false;
  const u = tryParseHttpUrl(url.trim());
  if (!u || !hostMatchesGifHost(u.hostname)) return false;
  const path = u.pathname.toLowerCase();
  if (path.includes('/view/')) return true;
  if (path.includes('/gifs/')) return true;
  if (path.startsWith('/gif/')) return true;
  return false;
}

export function isGifHostLinkUrl(url: string | undefined | null): boolean {
  return isLikelyGifMediaUrl(url) || isGifHostPageUrl(url);
}

function providerLooksLikeGifHost(provider: string | undefined): boolean {
  const p = provider?.trim().toLowerCase();
  return p === 'tenor' || p === 'giphy';
}

function candidateMediaUrls(embed: Embed): string[] {
  const out: string[] = [];
  const push = (raw: string | undefined) => {
    const t = raw?.trim();
    if (t) out.push(t);
  };
  push(embed.image?.url);
  push(embed.thumbnail?.url);
  push(embed.url);
  return out;
}

/** Best-effort animated media URL from a link unfurl / Discord embed row. */
export function gifDisplayUrlFromEmbed(embed: Embed): string | null {
  for (const raw of candidateMediaUrls(embed)) {
    if (!isLikelyGifMediaUrl(raw)) continue;
    return normalizeTenorAnimatedGifUrl(raw);
  }
  return null;
}

/** Whether this embed should be shown as an inline GIF instead of a link preview card. */
export function isGifHostEmbed(embed: Embed): boolean {
  if (embed.echoJump) return false;
  // YouTube/Vimeo iframes stay as video cards; Tenor/Giphy "gifv" never sets this.
  if (embed.video) return false;
  if (gifDisplayUrlFromEmbed(embed)) return true;
  const pageUrl = embed.url?.trim();
  if (pageUrl && isGifHostPageUrl(pageUrl)) return true;
  if (providerLooksLikeGifHost(embed.provider)) return true;
  return false;
}

export function isInlineGifHostEmbed(embed: Embed): boolean {
  return isGifHostEmbed(embed) && gifDisplayUrlFromEmbed(embed) != null;
}

export function linkEmbedsExcludingInlineGifs(
  embeds: Embed[] | undefined,
): Embed[] {
  return (embeds ?? []).filter((e) => !isInlineGifHostEmbed(e));
}

/**
 * Drop bare Tenor/Giphy page URLs from message body text when those URLs already
 * render as inline GIFs — avoids showing a clickable link next to the GIF.
 */
export function contentWithoutInlineGifHostUrls(
  content: string,
  embeds: Embed[] | undefined,
): string {
  if (!content || !embeds?.length) return content;
  let out = content;
  for (const embed of embeds) {
    if (!isInlineGifHostEmbed(embed)) continue;
    const pageUrl = embed.url?.trim();
    if (!pageUrl || !isGifHostPageUrl(pageUrl)) continue;
    const re = new RegExp(`(^|\\s)${escapeRegExp(pageUrl)}(?=\\s|$)`, 'g');
    out = out.replace(re, '$1');
  }
  return out
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}
