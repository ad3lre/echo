import { OAUTH_UPSTREAM_FETCH_MS } from '../../constants/outboundHttp';
import { config } from '../../config';
import type { GoogleTokenResponse } from './googleApiClient';

export type FetchLike = (
  input: Request | string | URL,
  init?: RequestInit,
) => Promise<Response>;

function oauthFetchInit(init?: RequestInit): RequestInit {
  return {
    ...init,
    signal: init?.signal ?? AbortSignal.timeout(OAUTH_UPSTREAM_FETCH_MS),
  };
}

function youtubeFetchInit(init?: RequestInit): RequestInit {
  return {
    ...init,
    signal: init?.signal ?? AbortSignal.timeout(30_000),
  };
}

export type YoutubeChannelSummary = {
  channelId: string;
  title: string;
  thumbnailUrl: string | null;
};

export function buildYoutubeAuthorizeUrl(
  state: string,
  codeChallenge: string,
): string {
  const u = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  u.searchParams.set('client_id', config.googleOauthClientId);
  u.searchParams.set('redirect_uri', config.youtubeOauthRedirectUri);
  u.searchParams.set('response_type', 'code');
  u.searchParams.set('scope', config.youtubeOauthScopes);
  u.searchParams.set('state', state);
  u.searchParams.set('access_type', 'offline');
  u.searchParams.set('prompt', 'consent');
  u.searchParams.set('code_challenge', codeChallenge.trim());
  u.searchParams.set('code_challenge_method', 'S256');
  return u.toString();
}

export async function exchangeYoutubeOAuthCode(
  code: string,
  codeVerifier: string,
  fetchImpl: FetchLike = fetch,
): Promise<GoogleTokenResponse> {
  const body = new URLSearchParams({
    client_id: config.googleOauthClientId,
    client_secret: config.googleOauthClientSecret,
    grant_type: 'authorization_code',
    code,
    redirect_uri: config.youtubeOauthRedirectUri,
    code_verifier: codeVerifier.trim(),
  });
  const res = await fetchImpl(
    'https://oauth2.googleapis.com/token',
    oauthFetchInit({
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    }),
  );
  const data = (await res.json()) as GoogleTokenResponse & { error?: string };
  if (!res.ok) {
    throw new Error(
      `youtube_token_exchange_failed:${data?.error ?? res.status}`,
    );
  }
  if (!data.access_token) throw new Error('youtube_token_missing');
  return data;
}

export async function refreshYoutubeOAuthToken(
  refreshToken: string,
  fetchImpl: FetchLike = fetch,
): Promise<GoogleTokenResponse> {
  const body = new URLSearchParams({
    client_id: config.googleOauthClientId,
    client_secret: config.googleOauthClientSecret,
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
  });
  const res = await fetchImpl(
    'https://oauth2.googleapis.com/token',
    oauthFetchInit({
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    }),
  );
  const data = (await res.json()) as GoogleTokenResponse & { error?: string };
  if (!res.ok) {
    throw new Error(
      `youtube_token_refresh_failed:${data?.error ?? res.status}`,
    );
  }
  if (!data.access_token) throw new Error('youtube_token_refresh_missing');
  return data;
}

export async function fetchYoutubeMineChannel(
  accessToken: string,
  fetchImpl: FetchLike = fetch,
): Promise<YoutubeChannelSummary> {
  const u = new URL('https://www.googleapis.com/youtube/v3/channels');
  u.searchParams.set('part', 'snippet');
  u.searchParams.set('mine', 'true');
  const res = await fetchImpl(
    u.toString(),
    youtubeFetchInit({
      headers: { Authorization: `Bearer ${accessToken}` },
    }),
  );
  const data = (await res.json()) as {
    items?: Array<{
      id?: string;
      snippet?: {
        title?: string;
        thumbnails?: { default?: { url?: string }; medium?: { url?: string } };
      };
    }>;
    error?: { message?: string };
  };
  if (!res.ok) {
    throw new Error(
      `youtube_channels_failed:${data?.error?.message ?? res.status}`,
    );
  }
  const item = data.items?.[0];
  const channelId = item?.id?.trim();
  if (!channelId) throw new Error('youtube_channel_missing');
  const thumbs = item?.snippet?.thumbnails;
  const thumbnailUrl =
    thumbs?.medium?.url?.trim() || thumbs?.default?.url?.trim() || null;
  return {
    channelId,
    title: item?.snippet?.title?.trim() || 'YouTube channel',
    thumbnailUrl,
  };
}

export type YoutubeLivePrivacy = 'public' | 'unlisted' | 'private';

export type YoutubeLiveSession = {
  broadcastId: string;
  streamId: string;
  ingestionAddress: string;
  streamName: string;
  watchUrl: string;
};

function youtubeRtmpUrl(ingestionAddress: string, streamName: string): string {
  const base = ingestionAddress.replace(/\/$/, '');
  const key = streamName.replace(/^\//, '');
  return `${base}/${key}`;
}

export async function deleteYoutubeLiveBroadcast(
  accessToken: string,
  broadcastId: string,
  fetchImpl: FetchLike = fetch,
): Promise<void> {
  const u = new URL('https://www.googleapis.com/youtube/v3/liveBroadcasts');
  u.searchParams.set('id', broadcastId);
  const res = await fetchImpl(
    u.toString(),
    youtubeFetchInit({
      method: 'DELETE',
      headers: { Authorization: `Bearer ${accessToken}` },
    }),
  );
  if (!res.ok && res.status !== 404) {
    const data = (await res.json()) as { error?: { message?: string } };
    throw new Error(
      `youtube_broadcast_delete_failed:${data?.error?.message ?? res.status}`,
    );
  }
}

export async function deleteYoutubeLiveStream(
  accessToken: string,
  streamId: string,
  fetchImpl: FetchLike = fetch,
): Promise<void> {
  const u = new URL('https://www.googleapis.com/youtube/v3/liveStreams');
  u.searchParams.set('id', streamId);
  const res = await fetchImpl(
    u.toString(),
    youtubeFetchInit({
      method: 'DELETE',
      headers: { Authorization: `Bearer ${accessToken}` },
    }),
  );
  if (!res.ok && res.status !== 404) {
    const data = (await res.json()) as { error?: { message?: string } };
    throw new Error(
      `youtube_stream_delete_failed:${data?.error?.message ?? res.status}`,
    );
  }
}

export async function createYoutubeLiveSession(
  accessToken: string,
  opts: { title: string; privacyStatus: YoutubeLivePrivacy; description?: string },
  fetchImpl: FetchLike = fetch,
): Promise<YoutubeLiveSession> {
  const title = opts.title.trim().slice(0, 100) || 'Echo stage live';
  const description = (opts.description ?? '').trim().slice(0, 5000);

  let broadcastId: string | null = null;
  let streamId: string | null = null;

  const broadcastRes = await fetchImpl(
    'https://www.googleapis.com/youtube/v3/liveBroadcasts?part=snippet,status,contentDetails',
    youtubeFetchInit({
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        snippet: {
          title,
          description,
          scheduledStartTime: new Date().toISOString(),
        },
        status: {
          privacyStatus: opts.privacyStatus,
          selfDeclaredMadeForKids: false,
        },
        contentDetails: {
          enableAutoStart: true,
          enableAutoStop: true,
        },
      }),
    }),
  );
  const broadcast = (await broadcastRes.json()) as {
    id?: string;
    error?: { message?: string };
  };
  if (!broadcastRes.ok || !broadcast.id) {
    throw new Error(
      `youtube_broadcast_create_failed:${broadcast?.error?.message ?? broadcastRes.status}`,
    );
  }
  broadcastId = broadcast.id;

  const streamRes = await fetchImpl(
    'https://www.googleapis.com/youtube/v3/liveStreams?part=snippet,cdn',
    youtubeFetchInit({
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        snippet: { title: `${title} — Echo ingest` },
        cdn: {
          frameRate: '30fps',
          ingestionType: 'rtmp',
          resolution: '1080p',
        },
      }),
    }),
  );
  const stream = (await streamRes.json()) as {
    id?: string;
    cdn?: { ingestionInfo?: { ingestionAddress?: string; streamName?: string } };
    error?: { message?: string };
  };
  if (!streamRes.ok || !stream.id) {
    try {
      await deleteYoutubeLiveBroadcast(accessToken, broadcastId, fetchImpl);
    } catch {
      /* best effort */
    }
    throw new Error(
      `youtube_stream_create_failed:${stream?.error?.message ?? streamRes.status}`,
    );
  }
  streamId = stream.id;
  const ingestionAddress = stream.cdn?.ingestionInfo?.ingestionAddress?.trim();
  const streamName = stream.cdn?.ingestionInfo?.streamName?.trim();
  if (!ingestionAddress || !streamName) {
    try {
      await deleteYoutubeLiveStream(accessToken, streamId, fetchImpl);
      await deleteYoutubeLiveBroadcast(accessToken, broadcastId, fetchImpl);
    } catch {
      /* best effort */
    }
    throw new Error('youtube_stream_ingestion_missing');
  }

  const bindRes = await fetchImpl(
    `https://www.googleapis.com/youtube/v3/liveBroadcasts/bind?id=${encodeURIComponent(broadcastId)}&part=id,contentDetails`,
    youtubeFetchInit({
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ id: broadcastId, streamId }),
    }),
  );
  if (!bindRes.ok) {
    const bindErr = (await bindRes.json()) as { error?: { message?: string } };
    try {
      await deleteYoutubeLiveStream(accessToken, streamId, fetchImpl);
      await deleteYoutubeLiveBroadcast(accessToken, broadcastId, fetchImpl);
    } catch {
      /* best effort */
    }
    throw new Error(
      `youtube_broadcast_bind_failed:${bindErr?.error?.message ?? bindRes.status}`,
    );
  }

  const watchUrl = `https://www.youtube.com/watch?v=${broadcastId}`;
  return {
    broadcastId,
    streamId,
    ingestionAddress,
    streamName,
    watchUrl,
  };
}

export async function transitionYoutubeBroadcast(
  accessToken: string,
  broadcastId: string,
  status: 'testing' | 'live' | 'complete',
  fetchImpl: FetchLike = fetch,
): Promise<void> {
  const u = new URL(
    'https://www.googleapis.com/youtube/v3/liveBroadcasts/transition',
  );
  u.searchParams.set('broadcastStatus', status);
  u.searchParams.set('id', broadcastId);
  u.searchParams.set('part', 'status');
  const res = await fetchImpl(
    u.toString(),
    youtubeFetchInit({
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}` },
    }),
  );
  if (!res.ok) {
    const data = (await res.json()) as { error?: { message?: string } };
    throw new Error(
      `youtube_broadcast_transition_failed:${data?.error?.message ?? res.status}`,
    );
  }
}

export function youtubeLiveRtmpIngestUrl(session: YoutubeLiveSession): string {
  return youtubeRtmpUrl(session.ingestionAddress, session.streamName);
}
