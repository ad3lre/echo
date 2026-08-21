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

/** Best-effort animated media URL from a link unfurl / Discord embed row. */
export function gifDisplayUrlFromEmbed(embed: Embed): string | null {
  const imageUrl = embed.image?.url?.trim();
  if (imageUrl && isLikelyGifMediaUrl(imageUrl)) return imageUrl;

  const thumbUrl = embed.thumbnail?.url?.trim();
  if (thumbUrl && isLikelyGifMediaUrl(thumbUrl)) return thumbUrl;

  const pageOrMediaUrl = embed.url?.trim();
  if (pageOrMediaUrl && isLikelyGifMediaUrl(pageOrMediaUrl))
    return pageOrMediaUrl;

  return null;
}

/** Whether this embed should be shown as an inline GIF instead of a link preview card. */
export function isGifHostEmbed(embed: Embed): boolean {
  if (embed.echoJump || embed.video) return false;
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
