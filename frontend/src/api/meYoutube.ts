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

export type MeYoutubeProfile = {
  youtubeChannelId: string;
  channelTitle: string;
  channelThumbnailUrl: string | null;
};

export type MeYoutubeResponse = {
  configured: boolean;
  linked: boolean;
  profile: MeYoutubeProfile | null;
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
