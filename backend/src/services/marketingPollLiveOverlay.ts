import Redis from 'ioredis';
import { config } from '../config';
import { echoIoredisClientOptions } from '../constants/ioredisEchoClient';

const OVERLAY_KEY = 'echo:marketing-poll:live-overlay';

export type MarketingPollLiveOverlay = {
  imageUrl: string;
  caption: string;
  /** Bumps when the operator changes the overlay so clients re-show it. */
  revision: string;
};

let redisClient: Redis | null = null;

function getRedis(): Redis | null {
  const url = config.redisUrl?.trim();
  if (!url) return null;
  if (!redisClient) {
    redisClient = new Redis(url, echoIoredisClientOptions);
    redisClient.on('error', (err) => {
      console.warn('[marketing-poll-overlay] Redis error:', err);
    });
  }
  return redisClient;
}

function parseOverlay(raw: string | null): MarketingPollLiveOverlay | null {
  if (!raw) return null;
  try {
    const data = JSON.parse(raw) as Partial<MarketingPollLiveOverlay>;
    const imageUrl =
      typeof data.imageUrl === 'string' ? data.imageUrl.trim() : '';
    if (!imageUrl || !/^https?:\/\//i.test(imageUrl)) return null;
    return {
      imageUrl,
      caption: typeof data.caption === 'string' ? data.caption.trim() : '',
      revision:
        typeof data.revision === 'string' && data.revision
          ? data.revision
          : String(Date.now()),
    };
  } catch {
    return null;
  }
}

export async function getMarketingPollLiveOverlay(): Promise<MarketingPollLiveOverlay | null> {
  const redis = getRedis();
  if (!redis) return null;
  try {
    return parseOverlay(await redis.get(OVERLAY_KEY));
  } catch {
    return null;
  }
}

export async function setMarketingPollLiveOverlay(opts: {
  imageUrl: string;
  caption?: string;
  /** Seconds; omit for no expiry. */
  ttlSeconds?: number;
}): Promise<MarketingPollLiveOverlay> {
  const redis = getRedis();
  if (!redis) {
    throw new Error('redis_unavailable');
  }
  const imageUrl = opts.imageUrl.trim();
  if (!imageUrl || !/^https?:\/\//i.test(imageUrl)) {
    throw new Error('invalid_image_url');
  }
  const payload: MarketingPollLiveOverlay = {
    imageUrl,
    caption: (opts.caption ?? '').trim().slice(0, 200),
    revision: String(Date.now()),
  };
  const raw = JSON.stringify(payload);
  if (opts.ttlSeconds && opts.ttlSeconds > 0) {
    await redis.set(OVERLAY_KEY, raw, 'EX', Math.floor(opts.ttlSeconds));
  } else {
    await redis.set(OVERLAY_KEY, raw);
  }
  return payload;
}

export async function clearMarketingPollLiveOverlay(): Promise<void> {
  const redis = getRedis();
  if (!redis) return;
  await redis.del(OVERLAY_KEY);
}
