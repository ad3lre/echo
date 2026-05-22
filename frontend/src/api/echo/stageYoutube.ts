import { echoFetch } from '@/api/echo/transport';

export type StageYoutubeStreamStatus = {
  active: boolean;
  status: string | null;
  title: string | null;
  privacyStatus: string | null;
  watchUrl: string | null;
  youtubeChannelTitle: string | null;
  streamSource?: 'oauth' | 'stream_key' | null;
  startedByUserId: string | null;
  errorCode: string | null;
};

export async function fetchStageYoutubeStream(
  token: string,
  serverId: string,
  channelId: string,
): Promise<StageYoutubeStreamStatus> {
  const data = await echoFetch<{ stream: StageYoutubeStreamStatus }>(
    token,
    `/servers/${encodeURIComponent(serverId)}/channels/${encodeURIComponent(channelId)}/stage/youtube`,
  );
  return data.stream;
}

export async function startStageYoutubeStream(
  token: string,
  serverId: string,
  channelId: string,
  body?: {
    title?: string;
    description?: string;
    privacyStatus?: 'public' | 'unlisted' | 'private';
  },
): Promise<StageYoutubeStreamStatus> {
  const data = await echoFetch<{ stream: StageYoutubeStreamStatus }>(
    token,
    `/servers/${encodeURIComponent(serverId)}/channels/${encodeURIComponent(channelId)}/stage/youtube/start`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body ?? {}),
    },
  );
  return data.stream;
}

export async function stopStageYoutubeStream(
  token: string,
  serverId: string,
  channelId: string,
): Promise<void> {
  await echoFetch(
    token,
    `/servers/${encodeURIComponent(serverId)}/channels/${encodeURIComponent(channelId)}/stage/youtube/stop`,
    { method: 'POST' },
  );
}
