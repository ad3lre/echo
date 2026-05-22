/** Sentinel broadcast id when Echo pushes RTMP with a user-supplied stream key (no YouTube Data API). */
export const YOUTUBE_STAGE_STREAM_KEY_BROADCAST_ID = 'echo:stream_key';
export const YOUTUBE_STAGE_STREAM_KEY_STREAM_ID = 'echo:stream_key';

const DEFAULT_YOUTUBE_RTMP_SERVER = 'rtmp://a.rtmp.youtube.com/live2';

/** Hostnames YouTube uses for RTMP ingest (block arbitrary RTMP destinations). */
const ALLOWED_RTMP_HOST_SUFFIXES = [
  'rtmp.youtube.com',
  'rtmp.google.com',
  'googlevideo.com',
] as const;

function isAllowedRtmpHost(hostname: string): boolean {
  const h = hostname.toLowerCase();
  return ALLOWED_RTMP_HOST_SUFFIXES.some(
    (suffix) => h === suffix || h.endsWith(`.${suffix}`),
  );
}

function validateStreamKey(key: string): string | null {
  const k = key.trim();
  if (k.length < 10 || k.length > 128) {
    return 'Stream key length is invalid.';
  }
  if (!/^[A-Za-z0-9_-]+$/.test(k)) {
    return 'Stream key contains invalid characters.';
  }
  return null;
}

function normalizeRtmpUrl(url: string): string {
  return url.replace(/([^:]\/)\/+/g, '$1');
}

/**
 * Builds a full YouTube RTMP ingest URL from a pasted URL or server + stream key.
 * Never log the return value.
 */
export function buildYoutubeRtmpIngestUrl(input: {
  rtmpUrl?: string;
  serverUrl?: string;
  streamKey?: string;
}): { ok: true; rtmpUrl: string } | { ok: false; message: string } {
  const pasted = input.rtmpUrl?.trim() ?? '';
  if (pasted) {
    let u: URL;
    try {
      u = new URL(pasted);
    } catch {
      return { ok: false, message: 'RTMP URL is not valid.' };
    }
    if (u.protocol !== 'rtmp:' && u.protocol !== 'rtmps:') {
      return { ok: false, message: 'URL must use rtmp:// or rtmps://.' };
    }
    if (!isAllowedRtmpHost(u.hostname)) {
      return {
        ok: false,
        message: 'RTMP server must be a YouTube ingest endpoint.',
      };
    }
    const segments = u.pathname.replace(/^\/+/, '').split('/').filter(Boolean);
    const keyFromPath = segments[segments.length - 1] ?? '';
    const keyErr = validateStreamKey(keyFromPath);
    if (keyErr) {
      return { ok: false, message: keyErr };
    }
    return { ok: true, rtmpUrl: normalizeRtmpUrl(pasted) };
  }

  const key = input.streamKey?.trim() ?? '';
  const keyErr = validateStreamKey(key);
  if (keyErr) {
    return { ok: false, message: keyErr };
  }
  const server = (input.serverUrl?.trim() || DEFAULT_YOUTUBE_RTMP_SERVER).replace(
    /\/+$/,
    '',
  );
  let hostPart: string;
  try {
    hostPart = new URL(server).hostname;
  } catch {
    return { ok: false, message: 'RTMP server URL is not valid.' };
  }
  if (!isAllowedRtmpHost(hostPart)) {
    return {
      ok: false,
      message: 'RTMP server must be a YouTube ingest endpoint.',
    };
  }
  if (!server.startsWith('rtmp://') && !server.startsWith('rtmps://')) {
    return { ok: false, message: 'Server must use rtmp:// or rtmps://.' };
  }
  return { ok: true, rtmpUrl: normalizeRtmpUrl(`${server}/${key}`) };
}

export function isYoutubeStreamKeyStageBroadcast(
  youtubeBroadcastId: string,
): boolean {
  return youtubeBroadcastId === YOUTUBE_STAGE_STREAM_KEY_BROADCAST_ID;
}
