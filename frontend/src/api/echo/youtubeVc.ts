import { echoFetch } from '@/api/echo/transport';

export type EchoYoutubeSearchItem = {
  id: string;
  title: string;
  channelTitle: string;
  thumbnailUrl: string | null;
};

export type EchoYoutubeSearchResponse = {
  items: EchoYoutubeSearchItem[];
  source?: string;
  hint?: string;
};

export function fetchEchoYoutubeVcSearch(
  token: string | null,
  q: string,
): Promise<EchoYoutubeSearchResponse> {
  const trimmed = q.trim();
  const qs = new URLSearchParams({ q: trimmed });
  return echoFetch<EchoYoutubeSearchResponse>(
    token,
    `/youtube/search?${qs.toString()}`,
    { method: 'GET' },
  );
}

export function fetchEchoYoutubePopular(
  token: string | null,
  regionCode = 'US',
): Promise<EchoYoutubeSearchResponse> {
  const qs = new URLSearchParams({ regionCode: regionCode.trim() || 'US' });
  return echoFetch<EchoYoutubeSearchResponse>(
    token,
    `/youtube/popular?${qs.toString()}`,
    { method: 'GET' },
  );
}

/** Queue-aware recommendations: similar to a seed video (server uses title / Invidious related). */
export function fetchEchoYoutubeRelated(
  token: string | null,
  videoId: string,
): Promise<EchoYoutubeSearchResponse> {
  const qs = new URLSearchParams({ videoId: videoId.trim() });
  return echoFetch<EchoYoutubeSearchResponse>(
    token,
    `/youtube/related?${qs.toString()}`,
    { method: 'GET' },
  );
}
