import { toRaw } from 'vue';
import type {
  TrackPublishOptions,
  VideoCaptureOptions,
  VideoEncoding,
} from 'livekit-client';
import type {
  DesktopStreamingPreferences,
  VideoQualityPreset,
} from '@/composables/livekitVoiceRoom.types';

export const STATS_FAILURE_LOG_MAX = 5;

/** Dedup streamer “viewer left” sound from ParticipantDisconnected vs targeted data. */
export const VIEWER_LEAVE_SOUND_DEDUP_MS = 2500;

export function formatVoiceClientError(e: unknown): string {
  if (e instanceof Error && e.message.trim()) return e.message;
  if (typeof DOMException !== 'undefined' && e instanceof DOMException) {
    const m = e.message?.trim();
    if (m) return `${e.name}: ${m}`;
    if (e.name) return e.name;
  }
  const s = String(e ?? '');
  if (s.trim()) return s;
  try {
    const j = JSON.stringify(e);
    if (j && j !== '{}' && j !== 'null') return j;
  } catch {
    /* ignore */
  }
  return 'Unknown error';
}

/**
 * Detect "user dismissed the picker / denied permission" errors so we can stop the
 * start flow cleanly instead of retrying — re-prompting after a cancel feels coercive
 * (browsers throw `NotAllowedError` for both denial and explicit cancel; `AbortError`
 * is also used by some browsers when the user closes the picker; `NotFoundError`
 * shows up in Firefox if no source was selected before the picker closed).
 */
export function isUserCancelledMediaError(e: unknown): boolean {
  const name =
    e instanceof Error ||
    (typeof DOMException !== 'undefined' && e instanceof DOMException)
      ? (e as Error).name
      : '';
  if (
    name === 'NotAllowedError' ||
    name === 'AbortError' ||
    name === 'NotFoundError'
  ) {
    return true;
  }
  const msg = e instanceof Error ? e.message : String(e ?? '');
  if (!msg) return false;
  return /permission denied by user|user (cancel|abort)|cancell?ed by user|dismissed by user/i.test(
    msg,
  );
}

export type ScreenSharePublishQualityOpts = {
  quality: '1080p60' | '720p30' | '720p15' | 'auto';
  contentHint: 'motion' | 'detail';
};

const DESKTOP_STREAMING_PREFS_STORAGE_KEY = 'echo-desktop-streaming-prefs-v1';
const REMOTE_PARTICIPANT_VOLUME_STORAGE_KEY =
  'echo-remote-participant-volume-v1';
const REMOTE_PARTICIPANT_VOLUME_MAX_ENTRIES = 250;

export function defaultDesktopStreamingPreferences(): DesktopStreamingPreferences {
  return {
    screenQuality: '720p30',
    screenContentHint: 'detail',
    screenIncludeAudio: true,
    cameraQuality: '720p',
  };
}

export function loadDesktopStreamingPreferences(): DesktopStreamingPreferences {
  const defaults = defaultDesktopStreamingPreferences();
  if (typeof localStorage === 'undefined') return defaults;
  try {
    const raw = localStorage.getItem(DESKTOP_STREAMING_PREFS_STORAGE_KEY);
    if (!raw) return defaults;
    const parsed = JSON.parse(raw) as Partial<DesktopStreamingPreferences>;
    return {
      screenQuality:
        parsed.screenQuality === '1080p60' ||
        parsed.screenQuality === '720p30' ||
        parsed.screenQuality === '720p15' ||
        parsed.screenQuality === 'auto'
          ? parsed.screenQuality
          : defaults.screenQuality,
      screenContentHint:
        parsed.screenContentHint === 'motion' ||
        parsed.screenContentHint === 'detail'
          ? parsed.screenContentHint
          : defaults.screenContentHint,
      screenIncludeAudio:
        typeof parsed.screenIncludeAudio === 'boolean'
          ? parsed.screenIncludeAudio
          : defaults.screenIncludeAudio,
      cameraQuality:
        parsed.cameraQuality === '720p' ||
        parsed.cameraQuality === '480p' ||
        parsed.cameraQuality === '360p' ||
        parsed.cameraQuality === '180p'
          ? parsed.cameraQuality
          : defaults.cameraQuality,
    };
  } catch {
    return defaults;
  }
}

export function persistDesktopStreamingPreferences(
  prefs: DesktopStreamingPreferences,
): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(
      DESKTOP_STREAMING_PREFS_STORAGE_KEY,
      JSON.stringify(prefs),
    );
  } catch {
    /* ignore quota/private mode failures */
  }
}

export function sanitizeRemoteParticipantVolumePercent(
  volumePercent: number,
): number | null {
  if (!Number.isFinite(volumePercent)) return null;
  const normalized = Math.max(0, Math.min(200, Math.round(volumePercent)));
  /**
   * 100 is the default multiplier (1x), so we avoid persisting it and treat as
   * "no explicit per-participant override".
   */
  if (normalized === 100) return null;
  return normalized;
}

export function loadRemoteParticipantVolumeOverrides(): Map<string, number> {
  if (typeof localStorage === 'undefined') return new Map();
  try {
    const raw = localStorage.getItem(REMOTE_PARTICIPANT_VOLUME_STORAGE_KEY);
    if (!raw) return new Map();
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const entries: [string, number][] = [];
    for (const [identityRaw, volumeRaw] of Object.entries(parsed)) {
      const identity = identityRaw.trim();
      if (!identity) continue;
      if (typeof volumeRaw !== 'number') continue;
      const normalized = sanitizeRemoteParticipantVolumePercent(volumeRaw);
      if (normalized == null) continue;
      entries.push([identity, normalized]);
      if (entries.length >= REMOTE_PARTICIPANT_VOLUME_MAX_ENTRIES) break;
    }
    return new Map(entries);
  } catch {
    return new Map();
  }
}

export function persistRemoteParticipantVolumeOverrides(
  source: ReadonlyMap<string, number>,
): void {
  if (typeof localStorage === 'undefined') return;
  try {
    const entries = [...source.entries()]
      .filter(([identity, volume]) => {
        return (
          !!identity.trim() &&
          sanitizeRemoteParticipantVolumePercent(volume) != null
        );
      })
      .slice(0, REMOTE_PARTICIPANT_VOLUME_MAX_ENTRIES);
    const payload = Object.fromEntries(entries);
    localStorage.setItem(
      REMOTE_PARTICIPANT_VOLUME_STORAGE_KEY,
      JSON.stringify(payload),
    );
  } catch {
    /* ignore quota/private mode failures */
  }
}

export function gainFromVolumePercent(volumePercent: number): number {
  return Math.max(0, Math.min(6, volumePercent / 100));
}

/**
 * VP9 SVC for screen share: one encode with spatial/temporal layers (see LiveKit
 * `scalabilityMode`). Per-quality bitrates and degradation track contentHint.
 */
export function buildScreenSharePublishOptions(
  opts: ScreenSharePublishQualityOpts,
): TrackPublishOptions {
  const hint = opts.contentHint;
  const degradationPreference: RTCDegradationPreference =
    hint === 'motion' ? 'maintain-framerate' : 'maintain-resolution';

  let videoEncoding: VideoEncoding;
  if (opts.quality === '1080p60') {
    if (hint === 'motion') {
      videoEncoding = {
        maxBitrate: 8_000_000,
        maxFramerate: 60,
        priority: 'high',
      };
    } else {
      videoEncoding = { maxBitrate: 5_000_000, maxFramerate: 60 };
    }
  } else if (opts.quality === '720p30') {
    videoEncoding =
      hint === 'motion'
        ? { maxBitrate: 2_500_000, maxFramerate: 30, priority: 'high' }
        : { maxBitrate: 2_500_000, maxFramerate: 30 };
  } else if (opts.quality === '720p15') {
    videoEncoding = { maxBitrate: 1_000_000, maxFramerate: 15 };
  } else {
    videoEncoding = { maxBitrate: 4_000_000, maxFramerate: 30 };
  }

  return {
    videoCodec: 'vp9',
    simulcast: false,
    scalabilityMode: 'L3T3_KEY',
    videoEncoding,
    degradationPreference,
  };
}

/**
 * iPadOS / iOS WebKit: hardware encoder path expects H.264 for screen capture;
 * VP9 + SVC often fails to publish or perform poorly. Keep simulcast/SVC off.
 */
export function buildScreenSharePublishOptionsIosLike(
  opts: ScreenSharePublishQualityOpts,
): TrackPublishOptions {
  const hint = opts.contentHint;
  const degradationPreference: RTCDegradationPreference =
    hint === 'motion' ? 'maintain-framerate' : 'maintain-resolution';

  let maxBitrate = 2_500_000;
  let maxFramerate = 30;
  if (opts.quality === '1080p60') {
    maxBitrate = 5_000_000;
    maxFramerate = 60;
  } else if (opts.quality === '720p15') {
    maxBitrate = 1_000_000;
    maxFramerate = 15;
  } else if (opts.quality === 'auto') {
    maxBitrate = 3_500_000;
    maxFramerate = 30;
  }

  const videoEncoding: VideoEncoding = {
    maxBitrate,
    maxFramerate,
    ...(hint === 'motion' ? { priority: 'high' as const } : {}),
  };

  return {
    videoCodec: 'h264',
    simulcast: false,
    videoEncoding,
    degradationPreference,
  };
}

export const VIDEO_CAPTURE_PRESETS: Record<
  VideoQualityPreset,
  { width: number; height: number; frameRate: number }
> = {
  '720p': { width: 1280, height: 720, frameRate: 30 },
  '480p': { width: 854, height: 480, frameRate: 30 },
  '360p': { width: 640, height: 360, frameRate: 30 },
  /** 30fps keeps motion smooth at low res; 15fps looked visibly choppy. */
  '180p': { width: 320, height: 180, frameRate: 30 },
};

/**
 * LiveKit's `cloneDeep` uses `structuredClone` on capture / room option trees.
 * Vue proxies (or accidental non-JSON values) must not reach it — strip via JSON round-trip.
 */
export function jsonPlainClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/**
 * Default video capture on the Room must be plain JSON data. LiveKit's built-in
 * `videoDefaults` use `VideoPresets.h720.resolution` (class/getter); that object can
 * break `structuredClone` inside `extractProcessorsFromOptions` when enabling camera.
 */
export const LIVEKIT_ROOM_VIDEO_CAPTURE_DEFAULTS_PLAIN: VideoCaptureOptions =
  jsonPlainClone({
    deviceId: { ideal: 'default' },
    resolution: {
      width: 1280,
      height: 720,
      frameRate: 30,
    },
  });

/**
 * LiveKit merges capture options with `structuredClone` (see `cloneDeep` in livekit-client).
 * Vue proxies or other non-cloneable values on the options object throw
 * `Failed to execute 'structuredClone' on 'Window': #<Object> could not be cloned`.
 */
export function plainVideoCaptureOptionsForLiveKit(
  preset: { width: number; height: number; frameRate: number },
  deviceIdRaw: string | undefined,
): VideoCaptureOptions {
  const p = toRaw(preset);
  const width = Math.max(2, Math.min(7680, Math.floor(Number(p.width)) || 640));
  const height = Math.max(
    2,
    Math.min(4320, Math.floor(Number(p.height)) || 480),
  );
  const frameRate = Math.max(
    1,
    Math.min(120, Math.floor(Number(p.frameRate)) || 30),
  );
  const o: VideoCaptureOptions = {
    resolution: {
      width,
      height,
      frameRate,
    },
  };
  const id =
    typeof deviceIdRaw === 'string'
      ? deviceIdRaw.trim()
      : String(deviceIdRaw ?? '').trim();
  if (id && id !== 'default') {
    o.deviceId = id;
  }
  return JSON.parse(JSON.stringify(o)) as VideoCaptureOptions;
}
