/**
 * oEmbed lookups for hosts that expose a public JSON endpoint (no API keys).
 * Runs before generic HTML fetch; complements YouTube/Vimeo-specific helpers in linkUnfurl.ts.
 */

import type { Embed } from '../../../../../contracts/types';
import {
  fetchJsonWithTimeout,
  isUrlSafeForOutboundFetch,
} from './linkUnfurlFetch';

function hostIs(h: string, base: string): boolean {
  return h === base || h.endsWith(`.${base}`);
}

function str(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

function positiveInt(v: unknown): number | undefined {
  if (typeof v === 'number' && Number.isFinite(v) && v > 0)
    return Math.floor(v);
  if (typeof v === 'string') {
    const n = Number(v.trim());
    if (Number.isFinite(n) && n > 0) return Math.floor(n);
  }
  return undefined;
}

function oembedToEmbed(
  originalUrl: string,
  data: Record<string, unknown>,
  fallbackColor?: number,
): Embed | null {
  const title = str(data.title);
  if (!title) return null;
  const provider = str(data.provider_name).slice(0, 40) || 'Link';
  const author = str(data.author_name);
  const authorUrl = str(data.author_url);
  const thumb = str(data.thumbnail_url);
  const thumbW = positiveInt(data.thumbnail_width);
  const thumbH = positiveInt(data.thumbnail_height);
  const embed: Embed = {
    url: originalUrl,
    title: title.slice(0, 300),
    provider,
    ...(fallbackColor != null && fallbackColor >= 0
      ? { color: fallbackColor }
      : {}),
  };
  const desc = str(data.description).slice(0, 500);
  if (desc) embed.description = desc;
  if (author) {
    embed.author = {
      name: author.slice(0, 120),
      ...(authorUrl && isUrlSafeForOutboundFetch(authorUrl)
        ? { url: authorUrl }
        : {}),
    };
  }
  if (thumb && isUrlSafeForOutboundFetch(thumb)) {
    embed.image = {
      url: thumb,
      ...(thumbW && thumbH ? { width: thumbW, height: thumbH } : {}),
    };
  }
  return embed;
}

type OembedTry = { endpoint: string; color?: number };

function oembedAttemptsForUrl(originalUrl: string): OembedTry[] {
  let u: URL;
  try {
    u = new URL(originalUrl);
  } catch {
    return [];
  }
  const h = u.hostname.toLowerCase();
  const enc = encodeURIComponent(originalUrl);
  const out: OembedTry[] = [];

  if (hostIs(h, 'twitter.com') || h === 'x.com' || hostIs(h, 'x.com')) {
    out.push({
      endpoint: `https://publish.twitter.com/oembed?omit_script=1&dnt=true&url=${enc}`,
      color: 0x1d9bf0,
    });
  }

  if (hostIs(h, 'spotify.com')) {
    out.push({
      endpoint: `https://open.spotify.com/oembed?url=${enc}`,
      color: 0x1db954,
    });
  }

  if (hostIs(h, 'soundcloud.com')) {
    out.push({
      endpoint: `https://soundcloud.com/oembed?format=json&url=${enc}`,
      color: 0xff5500,
    });
  }

  if (hostIs(h, 'tiktok.com')) {
    out.push({
      endpoint: `https://www.tiktok.com/oembed?url=${enc}`,
      color: 0x000000,
    });
  }

  if (hostIs(h, 'reddit.com') || hostIs(h, 'redd.it')) {
    out.push({
      endpoint: `https://www.reddit.com/oembed?url=${enc}`,
      color: 0xff4500,
    });
  }

  if (hostIs(h, 'dailymotion.com') || hostIs(h, 'dai.ly')) {
    out.push({
      endpoint: `https://www.dailymotion.com/services/oembed?url=${enc}`,
      color: 0x0066dc,
    });
  }

  if (hostIs(h, 'codepen.io')) {
    out.push({
      endpoint: `https://codepen.io/api/oembed?format=json&url=${enc}`,
      color: 0x000000,
    });
  }

  if (hostIs(h, 'mixcloud.com')) {
    out.push({
      endpoint: `https://www.mixcloud.com/oembed/?url=${enc}`,
      color: 0x5000ff,
    });
  }

  if (hostIs(h, 'slideshare.net')) {
    out.push({
      endpoint: `https://www.slideshare.net/api/oembed/2?format=json&url=${enc}`,
      color: 0x0077b5,
    });
  }

  if (hostIs(h, 'pinterest.com') || hostIs(h, 'pin.it')) {
    out.push({
      endpoint: `https://www.pinterest.com/oembed.json?url=${enc}`,
      color: 0xe60023,
    });
  }

  if (hostIs(h, 'tenor.com')) {
    out.push({ endpoint: `https://tenor.com/oembed?url=${enc}` });
  }

  if (hostIs(h, 'giphy.com')) {
    out.push({ endpoint: `https://giphy.com/services/oembed?url=${enc}` });
  }

  if (h.endsWith('bandcamp.com')) {
    out.push({
      endpoint: `https://bandcamp.com/oembed?url=${enc}`,
      color: 0x629aa9,
    });
  }

  if (hostIs(h, 'flickr.com') || h === 'flic.kr' || hostIs(h, 'flic.kr')) {
    out.push({
      endpoint: `https://www.flickr.com/services/oembed?format=json&url=${enc}`,
      color: 0xff0084,
    });
  }

  if (hostIs(h, 'kickstarter.com')) {
    out.push({
      endpoint: `https://www.kickstarter.com/services/oembed?format=json&url=${enc}`,
      color: 0x05ce78,
    });
  }

  if (
    hostIs(h, 'wikipedia.org') ||
    hostIs(h, 'wikimedia.org') ||
    hostIs(h, 'wiktionary.org') ||
    hostIs(h, 'wikisource.org') ||
    hostIs(h, 'wikibooks.org') ||
    hostIs(h, 'wikinews.org') ||
    hostIs(h, 'wikiquote.org') ||
    hostIs(h, 'wikiversity.org') ||
    hostIs(h, 'wikivoyage.org') ||
    hostIs(h, 'mediawiki.org') ||
    hostIs(h, 'species.wikimedia.org') ||
    hostIs(h, 'commons.wikimedia.org') ||
    hostIs(h, 'meta.wikimedia.org')
  ) {
    out.push({
      endpoint: `https://oembed.wikimedia.org/v1/oembed?format=json&url=${enc}`,
      color: 0x000000,
    });
  }

  if (hostIs(h, 'imgur.com') || h === 'i.imgur.com') {
    out.push({
      endpoint: `https://api.imgur.com/oembed.json?url=${enc}`,
      color: 0x1bb76e,
    });
  }

  if (hostIs(h, 'streamable.com')) {
    out.push({
      endpoint: `https://api.streamable.com/oembed.json?url=${enc}`,
      color: 0x0f90f3,
    });
  }

  /** Fediverse (Mastodon / forks): same-origin `/api/oembed` for status URLs like `/@user/123…`. */
  if (/^\/@[^/]+\/\d+(?:\/|[?#]|$)/i.test(u.pathname)) {
    out.push({
      endpoint: `${u.origin}/api/oembed?url=${enc}`,
      color: 0x6364ff,
    });
  }

  return out;
}

export async function tryOembedEmbed(
  originalUrl: string,
): Promise<Embed | null> {
  if (!isUrlSafeForOutboundFetch(originalUrl)) return null;
  const attempts = oembedAttemptsForUrl(originalUrl);
  for (const { endpoint, color } of attempts) {
    const data = await fetchJsonWithTimeout(endpoint);
    if (!data) continue;
    const embed = oembedToEmbed(originalUrl, data, color);
    if (embed) return embed;
  }
  return null;
}
