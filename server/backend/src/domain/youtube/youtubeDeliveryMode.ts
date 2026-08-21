import type { Pool } from 'pg';
import { getYoutubeLinkByUserId } from './youtubeUserLinkRepo';
import {
  getYoutubeStreamKeyByUserId,
  getYoutubeStreamKeyRtmpUrl,
} from './youtubeStreamKeyRepo';

export type YoutubeDeliveryMode = 'oauth' | 'stream_key' | 'none';

export type YoutubeDeliveryForStage =
  | {
      mode: 'oauth';
      userId: string;
    }
  | {
      mode: 'stream_key';
      userId: string;
      /** Full RTMP URL — never log. */
      rtmpUrl: string;
    }
  | { mode: 'none' };

/** OAuth channel link takes precedence when both are configured. */
export async function resolveYoutubeDeliveryForUser(
  pool: Pool,
  userId: string,
): Promise<YoutubeDeliveryForStage> {
  const oauth = await getYoutubeLinkByUserId(pool, userId);
  if (oauth) {
    return { mode: 'oauth', userId };
  }
  const keyRow = await getYoutubeStreamKeyByUserId(pool, userId);
  if (!keyRow) {
    return { mode: 'none' };
  }
  const rtmpUrl = await getYoutubeStreamKeyRtmpUrl(pool, userId);
  if (!rtmpUrl?.trim()) {
    return { mode: 'none' };
  }
  return { mode: 'stream_key', userId, rtmpUrl: rtmpUrl.trim() };
}

export async function getYoutubeConnectionModeForSettings(
  pool: Pool,
  userId: string,
): Promise<YoutubeDeliveryMode> {
  const d = await resolveYoutubeDeliveryForUser(pool, userId);
  return d.mode;
}
