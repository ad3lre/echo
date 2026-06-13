/**
 * Open Graph / basic HTML unfurl for chat link previews.
 * Fetch uses manual redirects with per-hop URL validation to reduce SSRF risk.
 */

import type pg from 'pg';
import { YOUTUBE_INTEGRATION_ENABLED } from '../../../../shared/integrationKillSwitches';
import type { Embed } from '../../../../shared/types';
import {
  tryParseYoutubeVideoId,
  tryParseVimeoId,
  youtubeIframeEmbedUrl,
  vimeoIframeEmbedUrl,
} from '../../../../shared/videoEmbedIds';
import {
  buildEchoJumpEmbedFromUrl,
  buildEchoJumpErrorEmbedFromUrl,
  parseEchoMessageJumpPath,
} from '../../domain/echoMessageLinkEmbed';
import {
  fetchJsonWithTimeout,
  isUrlSafeForOutboundFetch,
  ssrfSafeFetch,
} from './linkUnfurlFetch';
import { tryOembedEmbed } from './linkUnfurlOembed';
import { unfurlWithCoalescedCache } from './unfurlCache';
import { safeFetchAgent } from './safeFetchAgent';
import {
  shouldSkipHttpUnfurlForUrl,
  stubEmbedFromUrlWhenUnfurlFails,
} from './linkUnfurlUrlStubs';
import {
  collectLinkEmbedCandidateUrls,
  extractHttpUrlsFromPlainText,
} from '../../../../shared/linkEmbedCandidates';

export { extractHttpUrlsFromPlainText } from '../../../../shared/linkEmbedCandidates';

const MAX_BODY_BYTES = 512 * 1024;
const MAX_REDIRECTS = 4;
const FETCH_TIMEOUT_MS = 8000;

function decodeBasicEntities(s: string): string {
  return s
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/gi, "'");
}

function escapePropRe(prop: string): string {
  return prop.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function readMetaContent(html: string, prop: string): string | undefined {
  const p = escapePropRe(prop);
  const patterns = [
    new RegExp(
      `<meta[^>]+(?:property|name)=["']${p}["'][^>]+content=["']([^"']*)["']`,
      'i',
    ),
    new RegExp(
      `<meta[^>]+content=["']([^"']*)["'][^>]+(?:property|name)=["']${p}["']`,
      'i',
    ),
  ];
  for (const re of patterns) {
    const m = html.match(re);
    if (m?.[1]) return decodeBasicEntities(m[1].trim());
  }
  return undefined;
}

function readTitleTag(html: string): string | undefined {
  const m = html.match(/<title[^>]*>([^<]{1,500})<\/title>/i);
  return m?.[1] ? decodeBasicEntities(m[1].trim()) : undefined;
}

function absolutize(
  base: string,
  relative: string | undefined,
): string | undefined {
  if (!relative?.trim()) return undefined;
  try {
    return new URL(relative.trim(), base).href;
  } catch {
    return undefined;
  }
}

function isSafeImageUrlForEmbed(url: string): boolean {
  return isUrlSafeForOutboundFetch(url);
}

async function readResponseBodyLimited(res: Response): Promise<string> {
  const reader = res.body?.getReader();
  if (!reader) return '';
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        total += value.byteLength;
        if (total > MAX_BODY_BYTES) {
          await reader.cancel();
          break;
        }
        chunks.push(value);
      }
    }
  } finally {
    reader.releaseLock();
  }
  const buf = Buffer.concat(chunks.map((c) => Buffer.from(c)));
  return buf.toString('utf8', 0, Math.min(buf.length, MAX_BODY_BYTES));
}

async function unfurlYoutubeViaOembed(
  originalUrl: string,
  pageUrlForApi: string,
): Promise<Embed | null> {
  const endpoint = `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(pageUrlForApi)}`;
  const data = await fetchJsonWithTimeout(endpoint);
  if (!data || typeof data.title !== 'string' || !data.title.trim())
    return null;
  const thumb =
    typeof data.thumbnail_url === 'string' ? data.thumbnail_url.trim() : '';
  const author =
    typeof data.author_name === 'string' ? data.author_name.trim() : '';
  const authorPage =
    typeof data.author_url === 'string' ? data.author_url.trim() : '';
  const provider =
    typeof data.provider_name === 'string' && data.provider_name.trim()
      ? data.provider_name.trim().slice(0, 40)
      : 'YouTube';
  const embed: Embed = {
    url: originalUrl,
    title: data.title.slice(0, 300),
    color: 0xff0000,
    provider,
    ...(author
      ? {
          author: {
            name: author.slice(0, 120),
            ...(authorPage && isUrlSafeForOutboundFetch(authorPage)
              ? { url: authorPage }
              : {}),
          },
        }
      : {}),
  };
  if (thumb && isSafeImageUrlForEmbed(thumb)) {
    embed.image = { url: thumb };
  }
  return embed;
}

/**
 * Rich preview when YouTube oEmbed fails (datacenter blocks, DNS, timeouts).
 * Uses public thumbnail + nocookie embed URL derived only from the video id — no crawl bypass.
 */
function youtubeEmbedFallbackFromVideoId(
  originalUrl: string,
  ytId: string,
): Embed {
  const embedUrl = youtubeIframeEmbedUrl(ytId);
  const thumb = `https://i.ytimg.com/vi/${ytId}/hqdefault.jpg`;
  const embed: Embed = {
    url: originalUrl,
    title: 'YouTube video',
    provider: 'YouTube',
    color: 0xff0000,
  };
  if (thumb && isSafeImageUrlForEmbed(thumb)) {
    embed.image = { url: thumb };
  }
  if (embedUrl) {
    embed.video = { kind: 'youtube', embedUrl };
  }
  return embed;
}

async function unfurlVimeoViaOembed(
  originalUrl: string,
  pageUrlForApi: string,
): Promise<Embed | null> {
  const endpoint = `https://vimeo.com/api/oembed.json?url=${encodeURIComponent(pageUrlForApi)}`;
  const data = await fetchJsonWithTimeout(endpoint);
  if (!data || typeof data.title !== 'string' || !data.title.trim())
    return null;
  const thumb =
    typeof data.thumbnail_url === 'string' ? data.thumbnail_url.trim() : '';
  const author =
    typeof data.author_name === 'string' ? data.author_name.trim() : '';
  const provider =
    typeof data.provider_name === 'string' && data.provider_name.trim()
      ? data.provider_name.trim().slice(0, 40)
      : 'Vimeo';
  const embed: Embed = {
    url: originalUrl,
    title: data.title.slice(0, 300),
    color: 0x1ab7ea,
    provider,
    ...(author ? { author: { name: author.slice(0, 120) } } : {}),
  };
  const desc =
    typeof data.description === 'string'
      ? data.description.trim().slice(0, 500)
      : '';
  if (desc) embed.description = desc;
  if (thumb && isSafeImageUrlForEmbed(thumb)) {
    embed.image = { url: thumb };
  }
  const vmId = tryParseVimeoId(originalUrl) ?? tryParseVimeoId(pageUrlForApi);
  if (vmId) {
    const embedUrl = vimeoIframeEmbedUrl(vmId);
    if (embedUrl) embed.video = { kind: 'vimeo', embedUrl };
  }
  return embed;
}

async function fetchHtmlWithRedirects(
  startUrl: string,
): Promise<{ finalUrl: string; html: string; contentType: string } | null> {
  let current = startUrl;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), FETCH_TIMEOUT_MS);
    let res: Response;
    try {
      res = await ssrfSafeFetch(current, {
        method: 'GET',
        redirect: 'manual',
        signal: ac.signal,
        // @ts-expect-error Node 18+ undici dispatcher
        dispatcher: safeFetchAgent,
        headers: {
          Accept: 'text/html, application/xhtml+xml, */*;q=0.8',
          'User-Agent': 'EchoLinkEmbed/1.0 (+https://echo.local)',
        },
      });
    } catch {
      clearTimeout(t);
      return null;
    } finally {
      clearTimeout(t);
    }
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get('location');
      if (!loc) return null;
      try {
        current = new URL(loc, current).href;
      } catch {
        return null;
      }
      continue;
    }
    if (!res.ok) return null;
    const ct = res.headers.get('content-type') ?? '';
    const html = await readResponseBodyLimited(res);
    return { finalUrl: current, html, contentType: ct };
  }
  return null;
}

export async function unfurlUrlToEmbed(url: string): Promise<Embed | null> {
  if (!isUrlSafeForOutboundFetch(url)) return null;

  const ytId = YOUTUBE_INTEGRATION_ENABLED ? tryParseYoutubeVideoId(url) : null;
  if (ytId) {
    const canonical = `https://www.youtube.com/watch?v=${ytId}`;
    const fromYt = await unfurlYoutubeViaOembed(url, canonical);
    if (fromYt) {
      const eu = youtubeIframeEmbedUrl(ytId);
      if (eu && !fromYt.video) {
        fromYt.video = { kind: 'youtube', embedUrl: eu };
      }
      return fromYt;
    }
    return youtubeEmbedFallbackFromVideoId(url, ytId);
  }

  const vimeoId = tryParseVimeoId(url);
  if (vimeoId) {
    const canonical = `https://vimeo.com/${vimeoId}`;
    const fromVm = await unfurlVimeoViaOembed(url, canonical);
    if (fromVm) return fromVm;
  }

  const fromGenericOembed = await tryOembedEmbed(url);
  if (fromGenericOembed) return fromGenericOembed;

  if (shouldSkipHttpUnfurlForUrl(url)) {
    return stubEmbedFromUrlWhenUnfurlFails(url);
  }

  const fetched = await fetchHtmlWithRedirects(url);
  if (!fetched) return stubEmbedFromUrlWhenUnfurlFails(url);

  const { finalUrl, html, contentType } = fetched;
  const ctLower = contentType.toLowerCase();
  if (ctLower.startsWith('image/')) {
    const name = (() => {
      try {
        return decodeURIComponent(
          new URL(finalUrl).pathname.split('/').pop() || 'Image',
        );
      } catch {
        return 'Image';
      }
    })();
    return {
      url: finalUrl,
      title: name.slice(0, 200),
      image: { url: finalUrl },
    };
  }

  if (
    !ctLower.includes('text/html') &&
    !ctLower.includes('application/xhtml')
  ) {
    return {
      url: finalUrl,
      title: finalUrl.length > 120 ? `${finalUrl.slice(0, 117)}…` : finalUrl,
      description: 'Linked content',
    };
  }

  const ogTitle = readMetaContent(html, 'og:title');
  const ogDesc = readMetaContent(html, 'og:description');
  const ogSite = readMetaContent(html, 'og:site_name');
  const twTitle = readMetaContent(html, 'twitter:title');
  const twDesc = readMetaContent(html, 'twitter:description');
  const title = (
    ogTitle ||
    twTitle ||
    readTitleTag(html) ||
    ogSite ||
    finalUrl
  ).slice(0, 300);
  const description = (ogDesc || twDesc || '').slice(0, 500);
  const ogImage = readMetaContent(html, 'og:image');
  const ogImageSecure = readMetaContent(html, 'og:image:secure_url');
  const twImage = readMetaContent(html, 'twitter:image');
  const imageHref = absolutize(finalUrl, ogImage || ogImageSecure || twImage);
  const ogIwRaw = readMetaContent(html, 'og:image:width');
  const ogIhRaw = readMetaContent(html, 'og:image:height');
  const ogIw =
    ogIwRaw && /^\d+$/.test(ogIwRaw.trim())
      ? Math.min(8192, parseInt(ogIwRaw.trim(), 10))
      : undefined;
  const ogIh =
    ogIhRaw && /^\d+$/.test(ogIhRaw.trim())
      ? Math.min(8192, parseInt(ogIhRaw.trim(), 10))
      : undefined;
  const embed: Embed = {
    url: finalUrl,
    title: title || finalUrl,
    ...(description ? { description } : {}),
    ...(ogSite ? { provider: ogSite.slice(0, 40) } : {}),
  };
  if (imageHref && isSafeImageUrlForEmbed(imageHref)) {
    /** Use hero `image` (not `thumbnail`) so chat renders the large link-preview card. */
    embed.image = {
      url: imageHref,
      ...(ogIw && ogIh && ogIw > 0 && ogIh > 0
        ? { width: ogIw, height: ogIh }
        : {}),
    };
  }
  return embed;
}

export async function buildLinkEmbedsFromPlainText(
  content: string,
  opts: {
    allow: boolean;
    maxUrls?: number;
    budgetMs?: number;
    pool?: pg.Pool | null;
    /** User whose access is checked for in-app message link previews (message author). */
    embedViewerUserId?: string | null;
    /** TipTap doc (v2): also unfurl `href` on link marks when plain text omits the URL. */
    contentJson?: unknown;
  },
): Promise<Embed[]> {
  const urls = collectLinkEmbedCandidateUrls(content, opts.contentJson, 12);
  if (!urls.length) return [];
  const maxEmbeds = Math.min(Math.max(opts.maxUrls ?? 2, 1), 4);
  const deadline = Date.now() + (opts.budgetMs ?? 5000);
  const pool = opts.pool ?? null;
  const viewerId = opts.embedViewerUserId ?? null;
  const allow = opts.allow;
  const out: Embed[] = [];

  for (const u of urls) {
    if (out.length >= maxEmbeds) break;
    if (Date.now() > deadline) break;

    const looksLikeEchoChannelPath = parseEchoMessageJumpPath(u) != null;
    if (looksLikeEchoChannelPath) {
      if (!allow) {
        const denied = buildEchoJumpErrorEmbedFromUrl(u, 'embed_links_denied');
        if (denied) out.push(denied);
        continue;
      }
      if (pool && viewerId) {
        const jump = await buildEchoJumpEmbedFromUrl(pool, viewerId, u);
        if (jump) {
          out.push(jump);
          continue;
        }
      }
      continue;
    }

    if (!allow) continue;

    /** Hosts that never get an HTTP fetch (e.g. 403 from datacenter) — card is URL-shape only, no network. */
    if (shouldSkipHttpUnfurlForUrl(u)) {
      const stub = stubEmbedFromUrlWhenUnfurlFails(u);
      if (stub) {
        out.push(stub);
        continue;
      }
    }

    const e = await unfurlWithCoalescedCache(u, () => unfurlUrlToEmbed(u));
    if (e) out.push(e);
  }
  return out;
}
