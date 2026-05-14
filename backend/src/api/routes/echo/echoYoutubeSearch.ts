import rateLimit from '@fastify/rate-limit';
import { FastifyInstance, FastifyPluginOptions, FastifyRequest } from 'fastify';
import { config } from '../../../config';
import { sendError } from '../../errors';
import { YOUTUBE_SEARCH_FETCH_MS } from '../../../constants/outboundHttp';

export type YoutubeSearchItem = {
  id: string;
  title: string;
  channelTitle: string;
  thumbnailUrl: string | null;
};

function rateKey(req: FastifyRequest): string {
  return req.authUser?.id
    ? `ytsearch:${req.authUser.id}`
    : `ytsearch:ip:${req.ip}`;
}

async function searchYoutubeOfficial(q: string): Promise<YoutubeSearchItem[]> {
  const key = config.youtubeDataApiKey;
  if (!key) return [];
  const url = new URL('https://www.googleapis.com/youtube/v3/search');
  url.searchParams.set('part', 'snippet');
  url.searchParams.set('type', 'video');
  url.searchParams.set('maxResults', '24');
  url.searchParams.set('q', q);
  url.searchParams.set('key', key);
  const res = await fetch(url.toString(), {
    signal: AbortSignal.timeout(YOUTUBE_SEARCH_FETCH_MS),
  });
  if (!res.ok) return [];
  const json = (await res.json()) as {
    items?: Array<{
      id?: { videoId?: string };
      snippet?: {
        title?: string;
        channelTitle?: string;
        thumbnails?: { medium?: { url?: string }; default?: { url?: string } };
      };
    }>;
  };
  const out: YoutubeSearchItem[] = [];
  for (const it of json.items ?? []) {
    const id = it.id?.videoId?.trim();
    if (!id || id.length !== 11) continue;
    const sn = it.snippet;
    const title = (sn?.title ?? 'Video').trim() || 'Video';
    const channelTitle = (sn?.channelTitle ?? '').trim() || 'YouTube';
    const thumbnailUrl =
      sn?.thumbnails?.medium?.url?.trim() ||
      sn?.thumbnails?.default?.url?.trim() ||
      null;
    out.push({ id, title, channelTitle, thumbnailUrl });
  }
  return out;
}

async function searchInvidious(
  q: string,
  log: { warn: (o: Record<string, unknown>) => void },
): Promise<YoutubeSearchItem[]> {
  const enc = encodeURIComponent(q);
  for (const base of config.youtubeInvidiousHosts) {
    const url = `${base}/api/v1/search?q=${enc}&type=video`;
    try {
      const res = await fetch(url, {
        signal: AbortSignal.timeout(YOUTUBE_SEARCH_FETCH_MS),
        headers: { Accept: 'application/json' },
      });
      if (!res.ok) continue;
      const json = (await res.json()) as unknown;
      if (!Array.isArray(json)) continue;
      const out: YoutubeSearchItem[] = [];
      for (const row of json) {
        if (!row || typeof row !== 'object' || Array.isArray(row)) continue;
        const o = row as Record<string, unknown>;
        if (o.type !== 'video') continue;
        const id = typeof o.videoId === 'string' ? o.videoId.trim() : '';
        if (id.length !== 11) continue;
        const title =
          typeof o.title === 'string' ? o.title.trim() || 'Video' : 'Video';
        const channelTitle =
          typeof o.author === 'string'
            ? o.author.trim() || 'YouTube'
            : 'YouTube';
        let thumbnailUrl: string | null = null;
        const thumbs = o.videoThumbnails;
        if (Array.isArray(thumbs)) {
          const medium = thumbs.find(
            (t) =>
              t &&
              typeof t === 'object' &&
              (t as { quality?: string }).quality === 'medium',
          ) as { url?: string } | undefined;
          const first = thumbs[0] as { url?: string } | undefined;
          thumbnailUrl =
            (medium?.url && String(medium.url)) ||
            (first?.url && String(first.url)) ||
            null;
        }
        out.push({ id, title, channelTitle, thumbnailUrl });
      }
      if (out.length) return out;
    } catch (err) {
      log.warn({ err, base, msg: 'Invidious search attempt failed' });
    }
  }
  return [];
}

const RELATED_TITLE_STOPWORDS = new Set([
  'the',
  'a',
  'an',
  'official',
  'video',
  'full',
  'episode',
  'hd',
  '4k',
  'mv',
  'ft',
  'feat',
  'featuring',
  'trailer',
  'visualizer',
  'lyrics',
]);

/** Derive a short search query from a video title for “similar” results (no deprecated relatedToVideoId). */
function relatedSearchQueryFromTitle(title: string): string {
  const words = title
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .map((w) => w.trim())
    .filter(
      (w) => w.length > 1 && !RELATED_TITLE_STOPWORDS.has(w.toLowerCase()),
    );
  return words.slice(0, 8).join(' ');
}

async function relatedYoutubeOfficial(
  seedVideoId: string,
): Promise<YoutubeSearchItem[]> {
  const key = config.youtubeDataApiKey;
  if (!key) return [];
  const vUrl = new URL('https://www.googleapis.com/youtube/v3/videos');
  vUrl.searchParams.set('part', 'snippet');
  vUrl.searchParams.set('id', seedVideoId);
  vUrl.searchParams.set('key', key);
  let vRes: Response;
  try {
    vRes = await fetch(vUrl.toString(), {
      signal: AbortSignal.timeout(YOUTUBE_SEARCH_FETCH_MS),
    });
  } catch {
    return [];
  }
  if (!vRes.ok) return [];
  const vJson = (await vRes.json()) as {
    items?: Array<{ snippet?: { title?: string } }>;
  };
  const title = vJson.items?.[0]?.snippet?.title?.trim() ?? '';
  const q = relatedSearchQueryFromTitle(title);
  if (q.length < 2) return [];
  const raw = await searchYoutubeOfficial(q);
  const seen = new Set<string>([seedVideoId]);
  const out: YoutubeSearchItem[] = [];
  for (const it of raw) {
    if (seen.has(it.id)) continue;
    seen.add(it.id);
    out.push(it);
    if (out.length >= 24) break;
  }
  return out;
}

async function relatedInvidious(
  videoId: string,
  log: { warn: (o: Record<string, unknown>) => void },
): Promise<YoutubeSearchItem[]> {
  for (const base of config.youtubeInvidiousHosts) {
    const url = `${base.replace(/\/$/, '')}/api/v1/videos/${encodeURIComponent(videoId)}`;
    try {
      const res = await fetch(url, {
        signal: AbortSignal.timeout(YOUTUBE_SEARCH_FETCH_MS),
        headers: { Accept: 'application/json' },
      });
      if (!res.ok) continue;
      const json = (await res.json()) as Record<string, unknown> | null;
      if (!json || typeof json !== 'object') continue;
      const rec = json.recommendedVideos;
      if (!Array.isArray(rec)) continue;
      const out: YoutubeSearchItem[] = [];
      for (const row of rec) {
        if (!row || typeof row !== 'object' || Array.isArray(row)) continue;
        const o = row as Record<string, unknown>;
        const id = typeof o.videoId === 'string' ? o.videoId.trim() : '';
        if (id.length !== 11) continue;
        const title =
          typeof o.title === 'string' ? o.title.trim() || 'Video' : 'Video';
        const channelTitle =
          typeof o.author === 'string'
            ? o.author.trim() || 'YouTube'
            : 'YouTube';
        let thumbnailUrl: string | null = null;
        const thumbs = o.videoThumbnails;
        if (Array.isArray(thumbs)) {
          const medium = thumbs.find(
            (t) =>
              t &&
              typeof t === 'object' &&
              (t as { quality?: string }).quality === 'medium',
          ) as { url?: string } | undefined;
          const first = thumbs[0] as { url?: string } | undefined;
          thumbnailUrl =
            (medium?.url && String(medium.url)) ||
            (first?.url && String(first.url)) ||
            null;
        }
        out.push({ id, title, channelTitle, thumbnailUrl });
        if (out.length >= 24) break;
      }
      if (out.length) return out;
    } catch (err) {
      log.warn({ err, base, msg: 'Invidious related attempt failed' });
    }
  }
  return [];
}

async function popularInvidious(
  regionCode: string,
  log: { warn: (o: Record<string, unknown>) => void },
): Promise<YoutubeSearchItem[]> {
  const region = /^[A-Za-z]{2}$/.test(regionCode)
    ? regionCode.toUpperCase()
    : 'US';
  for (const base of config.youtubeInvidiousHosts) {
    const url = `${base.replace(/\/$/, '')}/api/v1/trending?region=${region}&type=music`;
    try {
      const res = await fetch(url, {
        signal: AbortSignal.timeout(YOUTUBE_SEARCH_FETCH_MS),
        headers: { Accept: 'application/json' },
      });
      if (!res.ok) continue;
      const json = (await res.json()) as unknown;
      if (!Array.isArray(json)) continue;
      const out: YoutubeSearchItem[] = [];
      for (const row of json) {
        if (!row || typeof row !== 'object' || Array.isArray(row)) continue;
        const o = row as Record<string, unknown>;
        const id = typeof o.videoId === 'string' ? o.videoId.trim() : '';
        if (id.length !== 11) continue;
        const title =
          typeof o.title === 'string' ? o.title.trim() || 'Video' : 'Video';
        const channelTitle =
          typeof o.author === 'string'
            ? o.author.trim() || 'YouTube'
            : 'YouTube';
        let thumbnailUrl: string | null = null;
        const thumbs = o.videoThumbnails;
        if (Array.isArray(thumbs)) {
          const medium = thumbs.find(
            (t) =>
              t &&
              typeof t === 'object' &&
              (t as { quality?: string }).quality === 'medium',
          ) as { url?: string } | undefined;
          const first = thumbs[0] as { url?: string } | undefined;
          thumbnailUrl =
            (medium?.url && String(medium.url)) ||
            (first?.url && String(first.url)) ||
            null;
        }
        out.push({ id, title, channelTitle, thumbnailUrl });
        if (out.length >= 24) break;
      }
      if (out.length) return out;
    } catch (err) {
      log.warn({ err, base, msg: 'Invidious trending attempt failed' });
    }
  }
  return [];
}

async function popularYoutubeOfficial(
  regionCode: string,
): Promise<YoutubeSearchItem[]> {
  const key = config.youtubeDataApiKey;
  if (!key) return [];
  const region = /^[A-Za-z]{2}$/.test(regionCode)
    ? regionCode.toUpperCase()
    : 'US';
  const url = new URL('https://www.googleapis.com/youtube/v3/videos');
  url.searchParams.set('part', 'snippet');
  url.searchParams.set('chart', 'mostPopular');
  url.searchParams.set('regionCode', region);
  url.searchParams.set('maxResults', '24');
  url.searchParams.set('key', key);
  let res: Response;
  try {
    res = await fetch(url.toString(), {
      signal: AbortSignal.timeout(YOUTUBE_SEARCH_FETCH_MS),
    });
  } catch {
    return [];
  }
  if (!res.ok) return [];
  const json = (await res.json()) as {
    items?: Array<{
      id?: string;
      snippet?: {
        title?: string;
        channelTitle?: string;
        thumbnails?: { medium?: { url?: string }; default?: { url?: string } };
      };
    }>;
  };
  const out: YoutubeSearchItem[] = [];
  for (const it of json.items ?? []) {
    const id = typeof it.id === 'string' ? it.id.trim() : '';
    if (id.length !== 11) continue;
    const sn = it.snippet;
    const title = (sn?.title ?? 'Video').trim() || 'Video';
    const channelTitle = (sn?.channelTitle ?? '').trim() || 'YouTube';
    const thumbnailUrl =
      sn?.thumbnails?.medium?.url?.trim() ||
      sn?.thumbnails?.default?.url?.trim() ||
      null;
    out.push({ id, title, channelTitle, thumbnailUrl });
  }
  return out;
}

export default async function echoYoutubeSearchRoutes(
  fastify: FastifyInstance,
  _opts: FastifyPluginOptions,
): Promise<void> {
  await fastify.register(async (scope) => {
    await scope.register(rateLimit, {
      max: 40,
      timeWindow: '1 minute',
      keyGenerator: rateKey,
      addHeaders: { 'retry-after': true },
    });

    scope.get<{ Querystring: { q?: string } }>(
      '/youtube/search',
      async (request, reply) => {
        const q = (request.query.q ?? '').trim();
        if (q.length < 2) {
          return sendError(
            reply,
            400,
            'INVALID_QUERY',
            'Query must be at least 2 characters',
          );
        }
        if (q.length > 120) {
          return sendError(reply, 400, 'INVALID_QUERY', 'Query too long');
        }

        let items = await searchYoutubeOfficial(q);
        if (!items.length) {
          items = await searchInvidious(q, fastify.log);
        }
        if (!items.length) {
          return reply.send({
            items: [] as YoutubeSearchItem[],
            source:
              config.youtubeDataApiKey.trim() !== '' ? 'youtube' : 'invidious',
            hint:
              config.youtubeDataApiKey.trim() === ''
                ? 'No results from Invidious mirrors; set YOUTUBE_DATA_API_KEY for official search.'
                : undefined,
          });
        }
        return reply.send({
          items,
          source:
            config.youtubeDataApiKey.trim() !== '' ? 'youtube' : 'invidious',
        });
      },
    );

    scope.get<{ Querystring: { regionCode?: string } }>(
      '/youtube/popular',
      async (request, reply) => {
        const raw = (request.query.regionCode ?? 'US').trim();
        const regionCode = /^[A-Za-z]{2}$/.test(raw) ? raw.toUpperCase() : 'US';
        let items = await popularYoutubeOfficial(regionCode);
        if (!items.length) {
          items = await popularInvidious(regionCode, fastify.log);
        }
        if (!items.length) {
          return reply.send({
            items: [] as YoutubeSearchItem[],
            source:
              config.youtubeDataApiKey.trim() !== '' ? 'youtube' : 'invidious',
            hint:
              config.youtubeDataApiKey.trim() === ''
                ? 'No trending videos from Invidious mirrors; set YOUTUBE_DATA_API_KEY for official results.'
                : undefined,
          });
        }
        return reply.send({
          items,
          source:
            config.youtubeDataApiKey.trim() !== '' ? 'youtube' : 'invidious',
        });
      },
    );

    scope.get<{ Querystring: { videoId?: string } }>(
      '/youtube/related',
      async (request, reply) => {
        const raw = (request.query.videoId ?? '').trim();
        if (raw.length !== 11) {
          return sendError(
            reply,
            400,
            'INVALID_QUERY',
            'videoId must be an 11-character YouTube id',
          );
        }

        let items = await relatedYoutubeOfficial(raw);
        if (!items.length) {
          items = await relatedInvidious(raw, fastify.log);
        }
        if (!items.length) {
          return reply.send({
            items: [] as YoutubeSearchItem[],
            source:
              config.youtubeDataApiKey.trim() !== '' ? 'youtube' : 'invidious',
            hint:
              config.youtubeDataApiKey.trim() === ''
                ? 'No related videos from Invidious; set YOUTUBE_DATA_API_KEY for smarter matches.'
                : 'Could not find similar videos for this id.',
          });
        }
        return reply.send({
          items,
          source:
            config.youtubeDataApiKey.trim() !== '' ? 'youtube' : 'invidious',
        });
      },
    );
  });
}
