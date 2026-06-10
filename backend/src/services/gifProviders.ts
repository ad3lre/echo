/**
 * GIF search/trending with Giphy primary and Klipy fallback.
 * API keys stay in backend env (GIPHY_API_KEY, KLIPY_API_KEY).
 */

import type { FastifyBaseLogger } from 'fastify';
import { config } from '../config';
import { GIPHY_FETCH_MS } from '../constants/outboundHttp';

const GIPHY_BASE = 'https://api.giphy.com/v1/gifs';
const KLIPY_BASE = 'https://api.klipy.com/api/v1';
const RATING = 'g';

export class GifProvidersUnavailableError extends Error {
  constructor() {
    super('No GIF provider configured');
    this.name = 'GifProvidersUnavailableError';
  }
}

/** Subset of Giphy payload shape returned by `/api/v1/giphy/*` routes. */
export type GiphyProxyGif = {
  id: string;
  title: string;
  images: {
    original?: { url?: string; webp?: string };
    downsized?: { url?: string; webp?: string };
    downsized_medium?: { url?: string };
    fixed_height?: { url?: string; webp?: string };
    fixed_height_small?: { url?: string; webp?: string };
    fixed_height_small_still?: { url?: string };
    fixed_height_still?: { url?: string };
    downsized_still?: { url?: string };
    downsized_small?: { url?: string };
    preview_gif?: { url?: string };
    preview?: { mp4?: string };
  };
};

type KlipyMedia = { url?: string };
type KlipyTier = {
  gif?: KlipyMedia;
  webp?: KlipyMedia;
  jpg?: KlipyMedia;
  mp4?: KlipyMedia;
};

type KlipyGif = {
  id?: number | string;
  title?: string;
  file?: {
    hd?: KlipyTier;
    md?: KlipyTier;
    sm?: KlipyTier;
    xs?: KlipyTier;
  };
};

type KlipyListResponse = {
  result?: boolean;
  data?: { data?: KlipyGif[] };
};

function tier(
  g: KlipyGif,
  size: keyof NonNullable<KlipyGif['file']>,
): KlipyTier {
  const f = g.file;
  return f?.[size] ?? f?.sm ?? f?.md ?? f?.hd ?? f?.xs ?? {};
}

/** Map Klipy GIF rows into the Giphy-compatible shape the frontend already parses. */
export function klipyGifToGiphyProxyShape(g: KlipyGif): GiphyProxyGif {
  const hd = tier(g, 'hd');
  const md = tier(g, 'md');
  const sm = tier(g, 'sm');
  const xs = tier(g, 'xs');
  return {
    id: String(g.id ?? ''),
    title: g.title?.trim() ?? '',
    images: {
      original: { url: hd.gif?.url ?? md.gif?.url, webp: hd.webp?.url },
      downsized: { url: md.gif?.url, webp: md.webp?.url },
      downsized_medium: { url: md.gif?.url },
      fixed_height: { url: sm.gif?.url, webp: sm.webp?.url },
      fixed_height_small: { url: xs.gif?.url, webp: xs.webp?.url },
      fixed_height_small_still: { url: xs.jpg?.url ?? sm.jpg?.url },
      fixed_height_still: { url: sm.jpg?.url },
      downsized_still: { url: md.jpg?.url },
      downsized_small: { url: xs.gif?.url },
      preview_gif: { url: xs.gif?.url ?? sm.gif?.url },
      preview: { mp4: sm.mp4?.url ?? xs.mp4?.url },
    },
  };
}

async function fetchGiphyList(url: string): Promise<GiphyProxyGif[] | null> {
  const res = await fetch(url, { signal: AbortSignal.timeout(GIPHY_FETCH_MS) });
  if (!res.ok) return null;
  let json: { data?: unknown[] };
  try {
    json = (await res.json()) as { data?: unknown[] };
  } catch {
    return null;
  }
  return (json.data ?? []) as GiphyProxyGif[];
}

async function fetchKlipyList(url: string): Promise<GiphyProxyGif[] | null> {
  const res = await fetch(url, { signal: AbortSignal.timeout(GIPHY_FETCH_MS) });
  if (!res.ok) return null;
  let json: KlipyListResponse;
  try {
    json = (await res.json()) as KlipyListResponse;
  } catch {
    return null;
  }
  if (json.result !== true) return null;
  const rows = json.data?.data ?? [];
  return rows.map(klipyGifToGiphyProxyShape).filter((g) => g.id);
}

function klipyUrl(path: string, limit: number, q?: string): string {
  const key = encodeURIComponent(config.klipyApiKey);
  const params = new URLSearchParams({
    page: '1',
    per_page: String(limit),
  });
  if (q != null) params.set('q', q);
  return `${KLIPY_BASE}/${key}/${path}?${params.toString()}`;
}

export async function fetchTrendingGifs(
  log: FastifyBaseLogger,
  limit: number,
): Promise<GiphyProxyGif[]> {
  if (!config.giphyApiKey && !config.klipyApiKey) {
    throw new GifProvidersUnavailableError();
  }

  if (config.giphyApiKey) {
    const url = `${GIPHY_BASE}/trending?api_key=${encodeURIComponent(config.giphyApiKey)}&limit=${limit}&rating=${RATING}`;
    const giphy = await fetchGiphyList(url);
    if (giphy && giphy.length > 0) return giphy;
    if (giphy && giphy.length === 0 && config.klipyApiKey) {
      log.info('Giphy trending empty; falling back to Klipy');
    } else if (giphy) {
      return giphy;
    } else {
      log.warn('Giphy trending failed; trying Klipy fallback');
    }
  }

  if (config.klipyApiKey) {
    const klipy = await fetchKlipyList(klipyUrl('gifs/trending', limit));
    if (klipy) return klipy;
    log.warn('Klipy trending failed');
  }

  throw new Error('GIF upstream error');
}

export async function searchGifs(
  log: FastifyBaseLogger,
  query: string,
  limit: number,
): Promise<GiphyProxyGif[]> {
  if (!config.giphyApiKey && !config.klipyApiKey) {
    throw new GifProvidersUnavailableError();
  }

  const q = query.trim();

  if (config.giphyApiKey) {
    const url = `${GIPHY_BASE}/search?api_key=${encodeURIComponent(config.giphyApiKey)}&q=${encodeURIComponent(q)}&limit=${limit}&rating=${RATING}`;
    const giphy = await fetchGiphyList(url);
    if (giphy) return giphy;
    log.warn({ q }, 'Giphy search failed; trying Klipy fallback');
  }

  if (config.klipyApiKey) {
    const klipy = await fetchKlipyList(klipyUrl('gifs/search', limit, q));
    if (klipy) return klipy;
    log.warn({ q }, 'Klipy search failed');
  }

  throw new Error('GIF upstream error');
}
