import { API_BASE } from '@/config';
import type { ApiErrorBody } from '@shared/types/api';
import { AuthApiError, echoAuthLogRequestFailure } from '@/api/authClient';
import { echoCsrfHeaders } from '@/utils/echoCsrf';

const API_ROOT = `${API_BASE.replace(/\/$/, '')}/api/v1`;

async function parseJson(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!text) return {};
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return {};
  }
}

function throwIfError(res: Response, data: unknown, operation: string): void {
  if (res.ok) return;
  echoAuthLogRequestFailure(operation, res, data);
  const body = data as ApiErrorBody;
  throw new AuthApiError(res.status, {
    code: typeof body?.code === 'string' ? body.code : 'UNKNOWN',
    message: typeof body?.message === 'string' ? body.message : res.statusText,
    ...(typeof body?.detail === 'string' ? { detail: body.detail } : {}),
  });
}

export type YoutubeConnectionMode = 'none' | 'oauth' | 'stream_key';

export type MeYoutubeProfile = {
  youtubeChannelId: string;
  channelTitle: string;
  channelThumbnailUrl: string | null;
};

export type MeYoutubeStreamKeyMeta = {
  savedAt: string;
};

export type MeYoutubeResponse = {
  configured: boolean;
  oauthRedirectUri?: string | null;
  googleLinked: boolean;
  connectionMode: YoutubeConnectionMode;
  linked: boolean;
  profile: MeYoutubeProfile | null;
  streamKey: MeYoutubeStreamKeyMeta | null;
};

export async function fetchMeYoutube(): Promise<MeYoutubeResponse> {
  const res = await fetch(`${API_ROOT}/me/youtube`, {
    method: 'GET',
    credentials: 'include',
  });
  const data = (await parseJson(res)) as Record<string, unknown>;
  throwIfError(res, data, 'GET /api/v1/me/youtube');
  return data as MeYoutubeResponse;
}

export async function saveMeYoutubeStreamKey(body: {
  streamKey?: string;
  serverUrl?: string;
  rtmpUrl?: string;
}): Promise<{ ok: boolean; streamKey: MeYoutubeStreamKeyMeta }> {
  const res = await fetch(`${API_ROOT}/me/youtube/stream-key`, {
    method: 'PUT',
    headers: {
      ...echoCsrfHeaders(),
      'Content-Type': 'application/json',
    },
    credentials: 'include',
    body: JSON.stringify(body),
  });
  const data = (await parseJson(res)) as Record<string, unknown>;
  throwIfError(res, data, 'PUT /api/v1/me/youtube/stream-key');
  const sk = data.streamKey as MeYoutubeStreamKeyMeta | undefined;
  return {
    ok: true,
    streamKey: sk ?? { savedAt: new Date().toISOString() },
  };
}

export async function revokeMeYoutubeStreamKey(): Promise<void> {
  const res = await fetch(`${API_ROOT}/me/youtube/stream-key`, {
    method: 'DELETE',
    headers: echoCsrfHeaders(),
    credentials: 'include',
  });
  if (res.status === 204 || res.ok) return;
  const data = (await parseJson(res)) as Record<string, unknown>;
  throwIfError(res, data, 'DELETE /api/v1/me/youtube/stream-key');
}

export async function unlinkMeYoutube(): Promise<void> {
  const res = await fetch(`${API_ROOT}/me/youtube`, {
    method: 'DELETE',
    headers: echoCsrfHeaders(),
    credentials: 'include',
  });
  if (res.status === 204 || res.ok) return;
  const data = (await parseJson(res)) as Record<string, unknown>;
  throwIfError(res, data, 'DELETE /api/v1/me/youtube');
}
