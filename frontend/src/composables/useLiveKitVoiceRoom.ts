import {
  computed,
  onUnmounted,
  ref,
  shallowRef,
  toRaw,
  watch,
  type ComputedRef,
  type Ref,
} from 'vue';
import {
  AudioPresets,
  ConnectionState,
  DisconnectReason,
  ExternalE2EEKeyProvider,
  ParticipantEvent,
  Room,
  RoomEvent,
  type AudioCaptureOptions,
  type LocalParticipant,
  type LocalTrackPublication,
  type LocalAudioTrack,
  type RemoteParticipant,
  type RemoteTrackPublication,
  type RemoteTrack,
  type Room as LKRoom,
  type ScreenShareCaptureOptions,
  type TrackPublishDefaults,
  type TrackPublishOptions,
  type VideoCaptureOptions,
  type VideoEncoding,
} from 'livekit-client';
import {
  voiceClientDiag,
  voiceClientTrace,
} from '@/observability/voiceClientTrace';
import { vcDebugLog } from '@/utils/vcDebugLog';
import {
  getRtcStatsReportIfSupported,
  getSenderStatsIfSupported,
  parseOutboundVideoRtpStats,
  parseRtcStatsReport,
  setAudioTrackVolumeIfSupported,
  type SenderStatsLike,
} from '@/services/livekit/livekitTrackAdapter';
import {
  echoPlaybackCleanupForRemoteTrack,
  echoPlaybackEnsureAudioContextRunning,
  echoPlaybackEnsureTrackElementsWired,
  echoPlaybackRegisterTrackElement,
} from '@/services/livekit/echoRemotePlaybackWebAudio';
import {
  liveKitRemoteParticipantByIdentity,
  resolveLiveKitRemoteParticipantIdentity,
} from '@/services/livekit/liveKitRoomParticipants';
import { ensureKrispNoiseFilterEnabled } from '@/services/livekit/krispNoiseFilter';
import type { VoiceProcessingPreferencesV2 } from '@/composables/voiceProcessingPreferences';
import {
  buildAudioCaptureOptionsForSession,
  buildKrispFailureFallbackCaptureOptions,
  buildKrispNoiseFilterOptions,
  effectiveCaptureMode,
  loadVoiceProcessingPreferences,
} from '@/composables/voiceProcessingPreferences';
import { useAudioLevelMonitor } from '@/composables/useAudioLevelMonitor';
import {
  gateMultiplierForDbfs,
  thresholdPercentToRms,
} from '@/composables/voiceGate';
import { useVoiceLevelsStore } from '@/stores/voiceLevels';
import {
  decodeEchoVcData,
  decodeEchoVcPrivateViewer,
  decodeEchoYoutubeActivity,
  decodeEchoVcActivityPresence,
  decodeEchoHangmanActivity,
  decodeEchoHangmanGuessIntent,
  decodeEchoHangmanNextRound,
  decodeEchoHangmanRoundSecret,
  encodeEchoVcData,
  encodeEchoVcPrivateViewer,
  encodeEchoYoutubeActivity,
  encodeEchoVcActivityPresence,
  encodeEchoHangmanActivity,
  encodeEchoHangmanGuessIntent,
  encodeEchoHangmanNextRound,
  encodeEchoHangmanRoundSecret,
  type EchoVcDataV1,
  type EchoVcPrivateViewerV1,
  type EchoYoutubeActivityV1,
  type EchoVcActivityPresenceV1,
  type EchoHangmanActivityV1,
  type EchoHangmanGuessIntentV1,
  type EchoHangmanNextRoundV1,
  type EchoHangmanRoundSecretV1,
} from '@/audio/voiceEchoLiveKitData';
import {
  announceVoiceChannelPublic,
  playEchoSound,
} from '@/composables/useEchoSounds';
import { echoSyncCapabilities } from '@/platform/syncCapabilities';
import {
  assertCameraCaptureReady,
  VoiceJoinMediaPreflightError,
} from '@/features/voice/voiceJoinMediaPreflight';
import { DESKTOP_NATIVE_AUDIO_ENABLED } from '@/config';
import {
  initDesktopNativeAudio,
  isDesktop,
  setDesktopAudioInputDevice,
  setDesktopAudioOutputDevice,
  setDesktopAudioOutputVolume,
} from '@/platform/desktopBridge';
import { UIErrorBus } from '@/utils/uiErrorBus';

const LK_KIND_AUDIO = 'audio';
const LK_KIND_VIDEO = 'video';
/** `getTrackPublication` expects `Track.Source` (string enum); derive without importing `Track` value. */
type LiveKitTrackPublicationSource = Parameters<
  LocalParticipant['getTrackPublication']
>[0];
const LK_SOURCE_MICROPHONE = 'microphone' as LiveKitTrackPublicationSource;
const LK_SOURCE_CAMERA = 'camera' as LiveKitTrackPublicationSource;
const LK_SOURCE_SCREEN_SHARE = 'screen_share' as LiveKitTrackPublicationSource;
const LK_SOURCE_SCREEN_SHARE_AUDIO =
  'screen_share_audio' as LiveKitTrackPublicationSource;

/** Tab / screen-share mux: apply gain if the video MediaStream still has usable audio. */
function mediaStreamHasMuxedAudioForRemoteGain(
  ms: Pick<MediaStream, 'getAudioTracks'>,
): boolean {
  return ms.getAudioTracks().some((t) => t.readyState !== 'ended');
}

function isLikelyMediaStream(
  ms: unknown,
): ms is Pick<MediaStream, 'getAudioTracks'> {
  return (
    !!ms &&
    typeof (ms as { getAudioTracks?: unknown }).getAudioTracks === 'function'
  );
}

type TrackLike = {
  kind?: string;
  attach?: () => HTMLMediaElement;
  detach?: () => HTMLMediaElement[];
  mediaStreamTrack?: MediaStreamTrack;
  /** Present on some RemoteVideoTrack wrappers when the publisher muxes audio (e.g. tab capture). */
  mediaStream?: MediaStream;
  sid?: string;
  setVolume?: (g: number) => void;
};

type PublicationLike = {
  source?: string;
  kind?: string;
  isSubscribed?: boolean;
  isMuted?: boolean;
  trackSid?: string;
  track?: TrackLike | null;
  setSubscribed?: (value: boolean) => void | Promise<void>;
};

type RemoteTrackAccumulator = {
  cameraTrack: RemoteTrack | null;
  screenTrack: RemoteTrack | null;
  screenAudioTrack: RemoteTrack | null;
  hasCameraPublication: boolean;
  hasScreenSharePublication: boolean;
  isMicEnabled: boolean;
};

export function buildRemoteParticipantTrackInfoFromPublications(
  publications: Iterable<RemoteTrackPublication & PublicationLike>,
): RemoteParticipantTrackInfo {
  const isTrackActive = (
    track: RemoteTrack | TrackLike | null | undefined,
  ): boolean => {
    if (!track) return false;
    const mst = (track as TrackLike).mediaStreamTrack;
    if (!mst) return true;
    return mst.readyState !== 'ended';
  };
  const acc: RemoteTrackAccumulator = {
    cameraTrack: null,
    screenTrack: null,
    screenAudioTrack: null,
    hasCameraPublication: false,
    hasScreenSharePublication: false,
    isMicEnabled: false,
  };
  for (const rp of publications) {
    if (rp.source === LK_SOURCE_MICROPHONE) {
      // `track` is null while remote audio is unsubscribed (local deafen). Still read
      // publication mute state so other users do not all appear mic-muted in the UI.
      acc.isMicEnabled = !rp.isMuted;
      continue;
    }
    if (rp.source === LK_SOURCE_CAMERA) {
      acc.hasCameraPublication = true;
      if (rp.track && isTrackActive(rp.track)) {
        acc.cameraTrack = rp.track;
      }
    } else if (rp.source === LK_SOURCE_SCREEN_SHARE) {
      acc.hasScreenSharePublication = true;
      if (rp.track && isTrackActive(rp.track)) {
        acc.screenTrack = rp.track;
      }
    } else if (rp.source === LK_SOURCE_SCREEN_SHARE_AUDIO) {
      acc.screenAudioTrack = rp.track ?? null;
    }
  }
  return {
    // Source publication presence reflects remote intent even when adaptive
    // subscriptions temporarily drop a concrete track object.
    isCameraEnabled: acc.hasCameraPublication,
    isScreenShareEnabled: acc.hasScreenSharePublication,
    isMicEnabled: acc.isMicEnabled,
    cameraTrack: acc.cameraTrack,
    screenTrack: acc.screenTrack,
    screenAudioTrack: acc.screenAudioTrack,
  };
}

export type LiveKitRoomState = 'idle' | 'connecting' | 'connected' | 'error';

export type LiveKitNetworkStats = {
  latencyMs: number;
  jitterMs: number;
  packetLossPct: number;
  bitrateKbps: number;
  codec: string;
  /** When unknown (e.g. SFU region not exposed), omitted. */
  serverRegion?: string;
  /** Outbound video (screen share / camera) — from getRTCStatsReport when available. */
  videoFramesPerSecond?: number;
  videoNackCount?: number;
  videoFirCount?: number;
  videoPliCount?: number;
  videoQualityLimitationReason?: string;
};

export type VideoQualityPreset = '720p' | '480p' | '360p' | '180p';

export type ParticipantAudioLevel = {
  level: number;
  speaking: boolean;
};

export type RemoteParticipantTrackInfo = {
  isCameraEnabled: boolean;
  isScreenShareEnabled: boolean;
  isMicEnabled: boolean;
  cameraTrack: RemoteTrack | null;
  screenTrack: RemoteTrack | null;
  screenAudioTrack: RemoteTrack | null;
};

const STATS_FAILURE_LOG_MAX = 5;

/** Dedup streamer “viewer left” sound from ParticipantDisconnected vs targeted data. */
const VIEWER_LEAVE_SOUND_DEDUP_MS = 2500;

function formatVoiceClientError(e: unknown): string {
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
function isUserCancelledMediaError(e: unknown): boolean {
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

type ScreenSharePublishQualityOpts = {
  quality: '1080p60' | '720p30' | '720p15' | 'auto';
  contentHint: 'motion' | 'detail';
};

export type DesktopStreamingControlMode = 'screen' | 'camera';

export type DesktopStreamingPreferences = {
  screenQuality: ScreenSharePublishQualityOpts['quality'];
  screenContentHint: ScreenSharePublishQualityOpts['contentHint'];
  screenIncludeAudio: boolean;
  cameraQuality: VideoQualityPreset;
};

const DESKTOP_STREAMING_PREFS_STORAGE_KEY = 'echo-desktop-streaming-prefs-v1';
const REMOTE_PARTICIPANT_VOLUME_STORAGE_KEY =
  'echo-remote-participant-volume-v1';
const REMOTE_PARTICIPANT_VOLUME_MAX_ENTRIES = 250;

function defaultDesktopStreamingPreferences(): DesktopStreamingPreferences {
  return {
    screenQuality: '720p30',
    screenContentHint: 'detail',
    screenIncludeAudio: true,
    cameraQuality: '720p',
  };
}

function loadDesktopStreamingPreferences(): DesktopStreamingPreferences {
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

function persistDesktopStreamingPreferences(
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

function sanitizeRemoteParticipantVolumePercent(
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

function loadRemoteParticipantVolumeOverrides(): Map<string, number> {
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

function persistRemoteParticipantVolumeOverrides(
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

/**
 * VP9 SVC for screen share: one encode with spatial/temporal layers (see LiveKit
 * `scalabilityMode`). Per-quality bitrates and degradation track contentHint.
 */
function buildScreenSharePublishOptions(
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
function buildScreenSharePublishOptionsIosLike(
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

const VIDEO_CAPTURE_PRESETS: Record<
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
function jsonPlainClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/**
 * Default video capture on the Room must be plain JSON data. LiveKit's built-in
 * `videoDefaults` use `VideoPresets.h720.resolution` (class/getter); that object can
 * break `structuredClone` inside `extractProcessorsFromOptions` when enabling camera.
 */
const LIVEKIT_ROOM_VIDEO_CAPTURE_DEFAULTS_PLAIN: VideoCaptureOptions =
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
function plainVideoCaptureOptionsForLiveKit(
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

export type UseLiveKitVoiceRoomOptions = {
  /**
   * When set, quality restarts and camera-switch fallbacks only call
   * `setCameraEnabled(true)` if this is true — matches in-call / DM video toggles
   * so we never re-acquire the camera (laptop LED) after the user turned video off.
   */
  getUserWantsLocalCamera?: () => boolean;
  /** Guild VC YouTube “watch together” — incoming playlist snapshots from peers. */
  onYoutubeActivity?: (
    msg: EchoYoutubeActivityV1,
    senderIdentity: string,
  ) => void;
  /** Guild VC Hangman — authoritative snapshots from the current setter. */
  onHangmanActivity?: (
    msg: EchoHangmanActivityV1,
    fromIdentity: string,
  ) => void;
  onHangmanGuessIntent?: (
    msg: EchoHangmanGuessIntentV1,
    fromIdentity: string,
  ) => void;
  onHangmanNextRound?: (
    msg: EchoHangmanNextRoundV1,
    fromIdentity: string,
  ) => void;
  /** Setter → orchestrator: phrase for the current round (private data channel). */
  onHangmanRoundSecret?: (
    msg: EchoHangmanRoundSecretV1,
    fromIdentity: string,
  ) => void;
  /** Guild VC activity picker / YouTube — who has which activity open. */
  onVcActivityPresence?: (
    msg: EchoVcActivityPresenceV1,
    fromIdentity: string,
  ) => void;
  /** LiveKit peer left — drop stale activity presence. */
  onRemoteParticipantDisconnected?: (identity: string) => void;
};

export type LiveKitVoiceRoomApi = {
  roomState: Ref<LiveKitRoomState>;
  lkRoom: Ref<LKRoom | null>;
  networkStats: Ref<LiveKitNetworkStats | null>;
  connect: (
    url: string,
    token: string,
    bitrateBps?: number | null,
    e2eeMediaKey?: ArrayBuffer | null,
  ) => Promise<void>;
  disconnect: () => void;
  applyVcAudioState: (opts: {
    muted: boolean;
    deafened: boolean;
  }) => Promise<void>;
  isCameraEnabled: Ref<boolean>;
  isScreenShareEnabled: Ref<boolean>;
  selectedCameraDeviceId: Ref<string>;
  videoQuality: Ref<VideoQualityPreset>;
  remoteParticipants: ComputedRef<Map<string, RemoteParticipantTrackInfo>>;
  speakingMap: Ref<Record<string, ParticipantAudioLevel>>;
  localSpeaking: Ref<boolean>;
  localAudioLevel: Ref<number>;
  setCameraEnabled: (enabled: boolean) => Promise<void>;
  setScreenShareEnabled: (enabled: boolean) => Promise<void>;
  startScreenShare: (opts: {
    quality: '1080p60' | '720p30' | '720p15' | 'auto';
    audio: boolean;
    contentHint: 'motion' | 'detail';
  }) => Promise<void>;
  stopScreenShare: () => Promise<void>;
  getLocalScreenTrack: () => unknown | null;
  getLocalCameraTrack: () => unknown | null;
  switchCamera: (deviceId: string) => void;
  setVideoQuality: (preset: VideoQualityPreset) => Promise<void>;
  desktopStreamingPreferences: Ref<DesktopStreamingPreferences>;
  setDesktopStreamingPreferences: (
    patch: Partial<DesktopStreamingPreferences>,
  ) => void;
  startDesktopScreenShare: (
    patch?: Partial<DesktopStreamingPreferences>,
  ) => Promise<void>;
  startDesktopCameraStream: (
    patch?: Partial<DesktopStreamingPreferences>,
  ) => Promise<void>;
  switchMicDevice: (deviceId: string) => Promise<void>;
  switchSpeakerDevice: (deviceId: string) => Promise<void>;
  setOutputVolume: (volumePercent: number) => void;
  setLocalInputVolume: (volumePercent: number) => void;
  /** Per-remote-user playback level (0–200, default 100), multiplied with global output gain. */
  getRemoteParticipantVolume: (userId: string) => number;
  setRemoteParticipantVolume: (userId: string, volumePercent: number) => void;
  reapplyVoiceProcessing: () => Promise<void>;
  /** Publish guild VC YouTube activity state to peers (reliable data channel). */
  publishYoutubeActivity: (payload: EchoYoutubeActivityV1) => void;
  publishVcActivityPresence: (payload: EchoVcActivityPresenceV1) => void;
  publishHangmanActivity: (payload: EchoHangmanActivityV1) => void;
  publishHangmanGuessIntent: (payload: EchoHangmanGuessIntentV1) => void;
  publishHangmanNextRound: (payload: EchoHangmanNextRoundV1) => void;
  publishHangmanRoundSecret: (
    payload: EchoHangmanRoundSecretV1,
    destinationIdentities: string[],
  ) => void;
};

export function useLiveKitVoiceRoom(
  opts?: UseLiveKitVoiceRoomOptions,
): LiveKitVoiceRoomApi {
  const getUserWantsLocalCamera = opts?.getUserWantsLocalCamera ?? (() => true);
  const onYoutubeActivity = opts?.onYoutubeActivity;
  const onHangmanActivity = opts?.onHangmanActivity;
  const onHangmanGuessIntent = opts?.onHangmanGuessIntent;
  const onHangmanNextRound = opts?.onHangmanNextRound;
  const onHangmanRoundSecret = opts?.onHangmanRoundSecret;
  const onVcActivityPresence = opts?.onVcActivityPresence;
  const onRemoteParticipantDisconnected = opts?.onRemoteParticipantDisconnected;
  const viewerLeaveSoundAt = new Map<string, number>();

  function shouldPlayViewerLeaveSound(identity: string): boolean {
    const now = Date.now();
    const last = viewerLeaveSoundAt.get(identity);
    if (last != null && now - last < VIEWER_LEAVE_SOUND_DEDUP_MS) return false;
    viewerLeaveSoundAt.set(identity, now);
    return true;
  }

  const roomState = ref<LiveKitRoomState>('idle');
  /**
   * Must use `shallowRef`: a plain `ref()` deep-wraps objects with `reactive()`,
   * so the LiveKit `Room` becomes a Proxy. LiveKit then hits `structuredClone`
   * inside camera (and similar) paths and throws
   * `Failed to execute 'structuredClone' on 'Window': #<Object> could not be cloned`.
   */
  const lkRoom = shallowRef<LKRoom | null>(null);
  const networkStats = ref<LiveKitNetworkStats | null>(null);

  /** 0–600 effective percent from UI/store → gain up to 6.0 where supported. */
  const lastOutputVolumePercent = ref(100);
  const lastInputVolumePercent = ref(100);
  /** Echo user id → 0–200; multiplied with {@link lastOutputVolumePercent} for that user's remote audio. */
  const remoteParticipantOutputVolume = shallowRef(
    loadRemoteParticipantVolumeOverrides(),
  );
  const voiceLevels = useVoiceLevelsStore();

  function gainFromVolumePercent(volumePercent: number): number {
    return Math.max(0, Math.min(6, volumePercent / 100));
  }

  function remoteParticipantVolumeMultiplier(identity: string): number {
    const pct = remoteParticipantOutputVolume.value.get(identity) ?? 100;
    return Math.max(0, Math.min(2, pct / 100));
  }

  function gateMultiplierFromDbfs(dbfs: number): number {
    return gateMultiplierForDbfs(
      dbfs,
      voiceLevels.voiceActivationThresholdPercent,
      voiceLevels.outboundGateMode,
    );
  }

  function applyRemoteOutputGainToTrack(
    track: object,
    participantIdentity: string,
  ) {
    const base = gainFromVolumePercent(lastOutputVolumePercent.value);
    const gain = base * remoteParticipantVolumeMultiplier(participantIdentity);
    const t = track as TrackLike;
    const hasSetVolume = typeof t.setVolume === 'function';
    voiceClientDiag('info', 'voice.client:apply_remote_gain', {
      trackSid: t.sid ?? 'unknown',
      gain,
      hasSetVolume,
    });
    setAudioTrackVolumeIfSupported(track, gain);
  }

  /** Remote mic + screen-share audio publications, plus video publications that mux live audio into MediaStream. */
  function applyRemoteOutputGainToParticipantTracks(
    p: RemoteParticipant,
    gain: number,
  ) {
    vcDebugLog(
      '[Echo:VC:Volume] applyRemoteOutputGainToParticipantTracks called',
      {
        identity: p.identity,
        gain,
        audioTrackCount: p.audioTrackPublications.size,
      },
    );
    for (const pub of p.audioTrackPublications.values()) {
      const t = pub.track;
      const trackSid =
        (t as TrackLike | null)?.sid ?? pub.trackSid ?? 'unknown';
      vcDebugLog('[Echo:VC:Volume] processing audio publication', {
        identity: p.identity,
        trackSid,
        hasTrack: !!t,
        pubTrackSid: pub.trackSid,
        isMuted: pub.isMuted,
        isSubscribed: pub.isSubscribed,
      });
      if (t) {
        echoPlaybackEnsureTrackElementsWired(t);
        setAudioTrackVolumeIfSupported(t, gain);
      }
    }
    const allPubs = p.trackPublications;
    if (allPubs) {
      for (const pub of allPubs.values()) {
        const pl = pub as PublicationLike;
        if (pl.kind !== LK_KIND_VIDEO) continue;
        const t = pl.track;
        if (!t) continue;
        const ms = (t as TrackLike).mediaStream;
        if (!isLikelyMediaStream(ms)) continue;
        if (!mediaStreamHasMuxedAudioForRemoteGain(ms)) continue;
        echoPlaybackEnsureTrackElementsWired(t);
        setAudioTrackVolumeIfSupported(t, gain);
      }
    }
  }

  function applyRemoteOutputGainToRoom(room: LKRoom) {
    const base = gainFromVolumePercent(lastOutputVolumePercent.value);
    for (const p of room.remoteParticipants.values()) {
      const mul = remoteParticipantVolumeMultiplier(p.identity);
      const g = base * mul;
      applyRemoteOutputGainToParticipantTracks(p, g);
    }
  }

  function applyRemoteOutputGainToParticipant(
    room: LKRoom,
    participantKey: string,
  ) {
    const resolvedIdentity =
      resolveLiveKitRemoteParticipantIdentity(room, participantKey) ??
      participantKey.trim();
    const p = liveKitRemoteParticipantByIdentity(room, resolvedIdentity);

    vcDebugLog('[Echo:VC:Volume] applyRemoteOutputGainToParticipant', {
      participantKey,
      resolvedIdentity,
      participantFound: !!p,
      baseVolume: lastOutputVolumePercent.value,
      participantMultiplier:
        remoteParticipantVolumeMultiplier(resolvedIdentity),
    });

    if (!p) {
      vcDebugLog('[Echo:VC:Volume] PARTICIPANT NOT FOUND', {
        participantKey,
        resolvedIdentity,
        remoteParticipants: Array.from(room.remoteParticipants.values()).map(
          (rp) => ({
            identity: rp.identity,
            sid: rp.sid,
          }),
        ),
      });
      return;
    }
    const base = gainFromVolumePercent(lastOutputVolumePercent.value);
    const g = base * remoteParticipantVolumeMultiplier(resolvedIdentity);
    applyRemoteOutputGainToParticipantTracks(p, g);
  }

  /** Re-wires hidden audio elements and reapplies gains (iOS unlock, reconnect). */
  function reapplyRemotePlaybackGains(room: LKRoom) {
    void echoPlaybackEnsureAudioContextRunning();
    for (const p of room.remoteParticipants.values()) {
      for (const pub of p.audioTrackPublications.values()) {
        const pl = pub as unknown as PublicationLike;
        if (pl.kind !== LK_KIND_AUDIO) continue;
        const t = pub.track;
        if (t) echoPlaybackEnsureTrackElementsWired(t);
      }
      if (p.trackPublications) {
        for (const pub of p.trackPublications.values()) {
          const pl = pub as PublicationLike;
          if (pl.kind !== LK_KIND_VIDEO) continue;
          const t = pl.track;
          if (!t) continue;
          const ms = (t as TrackLike).mediaStream;
          if (!isLikelyMediaStream(ms)) continue;
          if (!mediaStreamHasMuxedAudioForRemoteGain(ms)) continue;
          echoPlaybackEnsureTrackElementsWired(t);
        }
      }
    }
    applyRemoteOutputGainToRoom(room);
  }

  function getRemoteParticipantVolume(userId: string): number {
    const key = userId.trim();
    if (!key) return 100;
    const room = lkRoom.value;
    const resolvedIdentity = room
      ? resolveLiveKitRemoteParticipantIdentity(room, key)
      : undefined;
    return (
      remoteParticipantOutputVolume.value.get(resolvedIdentity ?? key) ?? 100
    );
  }

  function setRemoteParticipantVolume(userId: string, volumePercent: number) {
    const key = userId.trim();
    if (!key) return;
    const v = Math.max(0, Math.min(200, Math.round(volumePercent)));
    const next = new Map(remoteParticipantOutputVolume.value);
    const room = lkRoom.value;
    const resolvedIdentity = room
      ? resolveLiveKitRemoteParticipantIdentity(room, key)
      : undefined;
    const identity = resolvedIdentity ?? key;

    vcDebugLog('[Echo:VC:Volume] setRemoteParticipantVolume called', {
      userId,
      volumePercent,
      key,
      resolvedIdentity,
      identity,
      hasRoom: !!room,
      remoteParticipantCount: room?.remoteParticipants.size ?? 0,
    });

    if (identity !== key) {
      next.delete(key);
    }
    const persisted = sanitizeRemoteParticipantVolumePercent(v);
    if (persisted == null) {
      next.delete(identity);
    } else {
      next.set(identity, persisted);
    }
    remoteParticipantOutputVolume.value = next;
    persistRemoteParticipantVolumeOverrides(next);
    if (room) applyRemoteOutputGainToParticipant(room, identity);
  }

  function applyLocalMicGain(room: LKRoom) {
    const base = gainFromVolumePercent(lastInputVolumePercent.value);
    const gateMultiplier = gateMultiplierFromDbfs(localMicMonitor.dbfs.value);
    const gated = base * gateMultiplier;
    const pub = room.localParticipant.getTrackPublication(LK_SOURCE_MICROPHONE);
    const t = pub?.track;
    if (t) setAudioTrackVolumeIfSupported(t, gated);
    if (micGainZeroLogs < MIC_GAIN_ZERO_LOG_MAX && !!t && base <= 0) {
      micGainZeroLogs++;
      voiceClientDiag('warn', 'voice.client:mic_gain_zero_input_volume', {
        roomName: room.name,
        inputEffectivePercent: lastInputVolumePercent.value,
      });
    }
    if (
      micGainDiagLogs < MIC_GAIN_LOG_MAX &&
      roomState.value === 'connected' &&
      !!t &&
      base > 0 &&
      gated <= 0.05
    ) {
      micGainDiagLogs++;
      voiceClientDiag('warn', 'voice.client:mic_gain_low', {
        roomName: room.name,
        inputEffectivePercent: lastInputVolumePercent.value,
        baseGain: base,
        gateMultiplier,
        gatedGain: gated,
        dbfs: localMicMonitor.dbfs.value,
        gateMode: voiceLevels.outboundGateMode,
        thresholdPercent: voiceLevels.voiceActivationThresholdPercent,
        audioCtx:
          (localMicMonitor as any).audioContextState?.value ?? 'unknown',
        audioCtxSampleRate:
          (localMicMonitor as any).audioContextSampleRate?.value ?? 0,
      });
    }
  }

  const isCameraEnabled = ref(false);
  const isScreenShareEnabled = ref(false);
  const selectedCameraDeviceId = ref<string>('');
  const videoQuality = ref<VideoQualityPreset>('720p');
  const desktopStreamingPreferences = ref<DesktopStreamingPreferences>(
    loadDesktopStreamingPreferences(),
  );

  const speakingMap = ref<Record<string, ParticipantAudioLevel>>({});
  const localSpeaking = ref(false);
  const localAudioLevel = ref(0);

  /** Direct mic RMS (same path as Settings mic test) — lower latency than LiveKit active-speaker for self. */
  const localMicMonitor = useAudioLevelMonitor();
  watch(
    () => voiceLevels.voiceActivationThresholdPercent,
    (pct) => {
      localMicMonitor.setSpeakingThreshold(thresholdPercentToRms(pct));
    },
    { immediate: true },
  );
  watch(
    () =>
      [localMicMonitor.level.value, localMicMonitor.speaking.value] as const,
    ([lvl, spk]) => {
      localAudioLevel.value = lvl;
      localSpeaking.value = spk;
      const room = lkRoom.value;
      if (room && roomState.value === 'connected') {
        const localId = room.localParticipant.identity;
        speakingMap.value = {
          ...speakingMap.value,
          [localId]: { level: lvl, speaking: spk },
        };
      }
    },
  );
  watch(
    () =>
      [
        localMicMonitor.dbfs.value,
        voiceLevels.voiceActivationThresholdPercent,
        voiceLevels.outboundGateMode,
        roomState.value,
      ] as const,
    () => {
      const room = lkRoom.value;
      if (!room || roomState.value !== 'connected') return;
      applyLocalMicGain(room);
    },
  );

  const remoteParticipantsVersion = ref(0);
  const _remoteParticipants = shallowRef<
    Map<string, RemoteParticipantTrackInfo>
  >(new Map());

  const remoteParticipants: ComputedRef<
    Map<string, RemoteParticipantTrackInfo>
  > = computed(() => {
    void remoteParticipantsVersion.value;
    return _remoteParticipants.value;
  });

  let connectInFlight = false;
  /** Invalidates in-flight `connect()` after `await` when user disconnects or unmounts. */
  let connectGeneration = 0;
  /** `Room` instance created during connect but not yet assigned to `lkRoom` (await in progress). */
  let connectAbortTarget: LKRoom | null = null;
  let liveKitE2eeWorker: Worker | null = null;

  let statsInterval: ReturnType<typeof setInterval> | null = null;
  let prevBytesSent = 0;
  let prevTimestamp = 0;
  let statsSuccessLogged = false;
  let statsFailureLogs = 0;
  let statsTickInFlight = false;

  const vcDeafenedInternal = ref(false);
  /** Krisp init failed this session — use browser capture row until disconnect. */
  const krispSessionFailed = ref(false);
  /** Clears `unhandledrejection` watch after Krisp `setProcessor` (async publish can throw). */
  let krispAsyncRejectionCleanup: (() => void) | null = null;
  let tabCleanup: (() => void) | null = null;
  let activeSpeakerCleanup: (() => void) | null = null;
  let audioHealthInterval: ReturnType<typeof setInterval> | null = null;

  /** Serializes mute/deafen + mic republish so concurrent calls do not race LiveKit. */
  let applyVcAudioQueued: Promise<void> = Promise.resolve();

  let micAttachDiagLogs = 0;
  const MIC_ATTACH_LOG_MAX = 6;
  let micGainDiagLogs = 0;
  const MIC_GAIN_LOG_MAX = 12;
  let micGainZeroLogs = 0;
  const MIC_GAIN_ZERO_LOG_MAX = 3;

  function getMicCaptureOptions() {
    const prefs = loadVoiceProcessingPreferences();
    return buildAudioCaptureOptionsForSession(prefs, krispSessionFailed.value);
  }

  function clearKrispAsyncRejectionWatch() {
    if (krispAsyncRejectionCleanup) {
      krispAsyncRejectionCleanup();
      krispAsyncRejectionCleanup = null;
    }
  }

  async function applyKrispFailureFallback(
    room: LKRoom,
    localAudio: LocalAudioTrack,
    prefs: VoiceProcessingPreferencesV2,
    kind: 'sync' | 'async',
  ) {
    if (krispSessionFailed.value) return;
    if (lkRoom.value !== room) return;
    clearKrispAsyncRejectionWatch();
    if (kind === 'async') {
      voiceClientDiag('error', 'voice.client:krisp_processor_failed_async', {});
    }
    voiceClientTrace('voice.client:krisp_processor_recover', { kind });
    krispSessionFailed.value = true;
    try {
      await localAudio.stopProcessor();
    } catch {
      /* ignore */
    }
    const fallback = jsonPlainClone(
      buildKrispFailureFallbackCaptureOptions(prefs),
    ) as AudioCaptureOptions;
    try {
      await room.localParticipant.setMicrophoneEnabled(false);
      await room.localParticipant.setMicrophoneEnabled(true, fallback);
      voiceClientDiag(
        'info',
        'voice.client:krisp_fallback_mic_republished',
        {},
      );
    } catch (e2) {
      voiceClientDiag('error', 'voice.client:krisp_fallback_mic_failed', {
        err: e2 instanceof Error ? e2.message : String(e2),
      });
    }
  }

  function registerKrispAsyncFailureWatch(
    room: LKRoom,
    localAudio: LocalAudioTrack,
  ) {
    clearKrispAsyncRejectionWatch();
    const prefs = loadVoiceProcessingPreferences();
    const handler = (ev: PromiseRejectionEvent) => {
      const r = ev.reason;
      const msg = r instanceof Error ? r.message : String(r ?? '');
      const stack = r instanceof Error ? (r.stack ?? '') : '';
      const fromKrisp =
        stack.includes('krisp-noise-filter') ||
        stack.includes('@livekit/krisp-noise-filter');
      /** LiveKit + Krisp: private field access on proxied track can reject after `setProcessor` resolves. */
      const krispPrivateFieldBug =
        msg.includes('private field') &&
        (stack.includes('livekit') || stack.includes('Krisp'));
      if (!fromKrisp && !krispPrivateFieldBug) return;
      ev.preventDefault();
      void applyKrispFailureFallback(room, localAudio, prefs, 'async');
    };
    if (typeof window === 'undefined') return;
    window.addEventListener('unhandledrejection', handler);
    const tid = window.setTimeout(() => {
      clearKrispAsyncRejectionWatch();
    }, 25_000);
    krispAsyncRejectionCleanup = () => {
      window.removeEventListener('unhandledrejection', handler);
      window.clearTimeout(tid);
    };
  }

  async function stopMicProcessorIfAny(room: LKRoom) {
    clearKrispAsyncRejectionWatch();
    const pub = room.localParticipant.getTrackPublication(LK_SOURCE_MICROPHONE);
    const t = pub?.track;
    if (!t || (t as TrackLike).kind !== LK_KIND_AUDIO) return;
    const lat = t as LocalAudioTrack;
    try {
      await lat.stopProcessor();
    } catch {
      /* ignore */
    }
  }

  async function attachKrispProcessorIfNeeded(room: LKRoom) {
    const prefs = loadVoiceProcessingPreferences();
    const capMode = effectiveCaptureMode(prefs, krispSessionFailed.value);
    if (capMode !== 'krisp') return;

    const pub = room.localParticipant.getTrackPublication(LK_SOURCE_MICROPHONE);
    const track = pub?.track;
    if (!track || (track as TrackLike).kind !== LK_KIND_AUDIO) {
      voiceClientDiag('warn', 'voice.client:krisp_no_local_audio_track', {});
      return;
    }
    const localAudio = track as LocalAudioTrack;
    try {
      const result = await ensureKrispNoiseFilterEnabled(
        localAudio,
        buildKrispNoiseFilterOptions(prefs),
      );
      if (result.status === 'unsupported') {
        voiceClientDiag('warn', 'voice.client:krisp_unsupported_browser', {});
        voiceClientTrace('voice.client:krisp_unsupported_browser', {});
        await applyKrispFailureFallback(room, localAudio, prefs, 'sync');
        return;
      }
      voiceClientTrace('voice.client:krisp_processor_attached', {
        reused: result.reused,
      });
      voiceClientDiag('info', 'voice.client:krisp_processor_attached', {
        reused: result.reused,
      });
      registerKrispAsyncFailureWatch(room, localAudio);
    } catch (e) {
      voiceClientDiag('error', 'voice.client:krisp_processor_failed', {
        err: e instanceof Error ? e.message : String(e),
      });
      voiceClientTrace('voice.client:krisp_processor_failed', {
        err: e instanceof Error ? e.message : String(e),
      });
      await applyKrispFailureFallback(room, localAudio, prefs, 'sync');
    }
  }

  async function reapplyVoiceProcessing() {
    const room = lkRoom.value;
    if (!room || roomState.value !== 'connected') return;
    try {
      await stopMicProcessorIfAny(room);
      await room.localParticipant.setMicrophoneEnabled(false);
      const prefs = loadVoiceProcessingPreferences();
      const opts = jsonPlainClone(
        buildAudioCaptureOptionsForSession(prefs, krispSessionFailed.value),
      ) as AudioCaptureOptions;
      await room.localParticipant.setMicrophoneEnabled(true, opts);
      await attachKrispProcessorIfNeeded(room);
      refreshLocalMicLevelMonitor(room);
    } catch (e) {
      voiceClientDiag('error', 'voice.client:reapplyVoiceProcessing_failed', {
        err: formatVoiceClientError(e),
      });
    }
  }

  function clearTabCleanup() {
    tabCleanup?.();
    tabCleanup = null;
  }

  function registerTabCleanup() {
    clearTabCleanup();
    const onLeave = () => {
      disconnect();
    };
    if (typeof window === 'undefined') return;
    window.addEventListener('beforeunload', onLeave);
    window.addEventListener('pagehide', onLeave);
    tabCleanup = () => {
      window.removeEventListener('beforeunload', onLeave);
      window.removeEventListener('pagehide', onLeave);
    };
  }

  function _teardownSpeakerTracking() {
    activeSpeakerCleanup?.();
    activeSpeakerCleanup = null;
    localMicMonitor.stop();
    speakingMap.value = {};
    localSpeaking.value = false;
    localAudioLevel.value = 0;
  }

  function stopAudioHealthPolling() {
    if (audioHealthInterval !== null) {
      clearInterval(audioHealthInterval);
      audioHealthInterval = null;
    }
  }

  function dumpRemoteAudioTrackState(
    room: LKRoom,
    label: string,
  ): Record<string, unknown>[] {
    const tracks: Record<string, unknown>[] = [];
    for (const rp of room.remoteParticipants.values()) {
      for (const pub of rp.audioTrackPublications.values()) {
        const p = pub as PublicationLike;
        const t = p.track as
          | (RemoteTrack & { mediaStreamTrack?: MediaStreamTrack })
          | undefined;
        const mst = t?.mediaStreamTrack;
        tracks.push({
          identity: rp.identity,
          trackSid: p.trackSid,
          source: String(p.source),
          isSubscribed: p.isSubscribed,
          isMuted: p.isMuted,
          hasTrack: !!t,
          mstReadyState: mst?.readyState ?? 'none',
          mstEnabled: mst?.enabled ?? null,
          mstMuted: mst
            ? (mst as unknown as { muted?: boolean }).muted === true
            : null,
        });
      }
    }
    const canPlaybackAudio = (room as unknown as { canPlaybackAudio?: boolean })
      .canPlaybackAudio;
    vcDebugLog('[Echo:VC:Audio] ' + label, {
      canPlaybackAudio: canPlaybackAudio ?? '(unavailable)',
      deafened: vcDeafenedInternal.value,
      outputVolume: lastOutputVolumePercent.value,
      remoteParticipants: room.remoteParticipants.size,
      audioTracks: tracks.length,
      tracks,
    });
    voiceClientDiag('info', 'voice.client:audio_track_state', {
      label,
      canPlaybackAudio: canPlaybackAudio ?? null,
      deafened: vcDeafenedInternal.value,
      outputVolume: lastOutputVolumePercent.value,
      remoteParticipants: room.remoteParticipants.size,
      audioTracks: tracks.length,
      tracks,
    });
    return tracks;
  }

  function dumpLiveKitDomAudioElements(): void {
    if (typeof document === 'undefined') return;
    const audioEls = Array.from(document.querySelectorAll('audio'));
    const elDetails = audioEls.map((el) => ({
      id: el.id || null,
      src: el.src ? el.src.slice(0, 60) : null,
      hasSrcObject: !!el.srcObject,
      paused: el.paused,
      muted: el.muted,
      volume: el.volume,
      readyState: el.readyState,
      autoplay: el.autoplay,
    }));
    vcDebugLog('[Echo:VC:Audio] dom_audio_elements', {
      count: audioEls.length,
      elements: elDetails,
    });
    voiceClientDiag('info', 'voice.client:dom_audio_elements', {
      count: audioEls.length,
      tracks: elDetails,
    });
  }

  function startAudioHealthPolling(room: LKRoom) {
    stopAudioHealthPolling();
    audioHealthInterval = setInterval(() => {
      if (!lkRoom.value || lkRoom.value !== room) {
        stopAudioHealthPolling();
        return;
      }
      dumpRemoteAudioTrackState(room, 'health_poll');
      dumpLiveKitDomAudioElements();
    }, 5000);
  }

  function refreshLocalMicLevelMonitor(room: LKRoom | null) {
    if (!room || lkRoom.value !== room || roomState.value !== 'connected') {
      localMicMonitor.stop();
      return;
    }
    const pub = room.localParticipant.getTrackPublication(LK_SOURCE_MICROPHONE);
    const track = pub?.track;
    if (!track || (track as TrackLike).kind !== LK_KIND_AUDIO) {
      localMicMonitor.stop();
      return;
    }
    const lat = track as LocalAudioTrack;
    const mst = lat.mediaStreamTrack;
    if (!mst || mst.readyState === 'ended') {
      localMicMonitor.stop();
      return;
    }
    localMicMonitor.attachStream(new MediaStream([mst]));
    if (micAttachDiagLogs < MIC_ATTACH_LOG_MAX) {
      micAttachDiagLogs++;
      voiceClientDiag('info', 'voice.client:mic_monitor_attached', {
        roomName: room.name,
        mstReadyState: mst.readyState,
        mstEnabled: mst.enabled,
        mstMuted: (mst as any).muted === true,
        audioCtx:
          (localMicMonitor as any).audioContextState?.value ?? 'unknown',
        audioCtxSampleRate:
          (localMicMonitor as any).audioContextSampleRate?.value ?? 0,
      });
    }
  }

  function _setupActiveSpeakerTracking(room: LKRoom) {
    _teardownSpeakerTracking();
    /**
     * Drive UI rings from each `RemoteParticipant`'s `audioLevel` / `isSpeaking`, not only
     * `room.activeSpeakers` (that list can omit speakers or lag behind participant state).
     * Also listen to `ParticipantEvent.IsSpeakingChanged` because `ActiveSpeakersChanged`
     * is not guaranteed to fire on every speaking edge (e.g. ordering-only server updates).
     */
    const remoteSpeakingUnsubs = new Map<RemoteParticipant, () => void>();

    function syncSpeakingMapFromRoom() {
      if (lkRoom.value !== room || roomState.value !== 'connected') return;
      const newMap: Record<string, ParticipantAudioLevel> = {};
      const localId = room.localParticipant.identity;
      for (const p of room.remoteParticipants.values()) {
        const id = p.identity;
        const lvl = p.audioLevel ?? 0;
        const isSpeaking = p.isSpeaking || lvl > 0.01;
        newMap[id] = { level: lvl, speaking: isSpeaking };
      }
      newMap[localId] = {
        level: localAudioLevel.value,
        speaking: localSpeaking.value,
      };
      speakingMap.value = newMap;
    }

    function attachRemoteSpeakingWatch(p: RemoteParticipant) {
      if (remoteSpeakingUnsubs.has(p)) return;
      const onChange = () => syncSpeakingMapFromRoom();
      p.on(ParticipantEvent.IsSpeakingChanged, onChange);
      remoteSpeakingUnsubs.set(p, () => {
        p.off(ParticipantEvent.IsSpeakingChanged, onChange);
      });
    }

    function detachRemoteSpeakingWatch(p: RemoteParticipant) {
      remoteSpeakingUnsubs.get(p)?.();
      remoteSpeakingUnsubs.delete(p);
    }

    const onActiveSpeakersChanged = () => syncSpeakingMapFromRoom();
    room.on(RoomEvent.ActiveSpeakersChanged, onActiveSpeakersChanged);

    const onParticipantConnectedSpeaking = (p: RemoteParticipant) => {
      attachRemoteSpeakingWatch(p);
      syncSpeakingMapFromRoom();
    };
    room.on(RoomEvent.ParticipantConnected, onParticipantConnectedSpeaking);

    const onParticipantDisconnectedSpeaking = (p: RemoteParticipant) => {
      detachRemoteSpeakingWatch(p);
      syncSpeakingMapFromRoom();
    };
    room.on(
      RoomEvent.ParticipantDisconnected,
      onParticipantDisconnectedSpeaking,
    );

    for (const p of room.remoteParticipants.values()) {
      attachRemoteSpeakingWatch(p);
    }

    activeSpeakerCleanup = () => {
      room.off(RoomEvent.ActiveSpeakersChanged, onActiveSpeakersChanged);
      room.off(RoomEvent.ParticipantConnected, onParticipantConnectedSpeaking);
      room.off(
        RoomEvent.ParticipantDisconnected,
        onParticipantDisconnectedSpeaking,
      );
      for (const off of remoteSpeakingUnsubs.values()) {
        off();
      }
      remoteSpeakingUnsubs.clear();
    };

    syncSpeakingMapFromRoom();
  }

  function isRemoteVideoTrackActive(
    track: RemoteTrack | TrackLike | null | undefined,
  ): boolean {
    if (!track) return false;
    const mst = (track as TrackLike).mediaStreamTrack;
    if (!mst) return true;
    return mst.readyState !== 'ended';
  }

  function _rebuildRemoteParticipant(
    p: RemoteParticipant,
  ): RemoteParticipantTrackInfo {
    return buildRemoteParticipantTrackInfoFromPublications(
      p.trackPublications.values() as Iterable<
        RemoteTrackPublication & PublicationLike
      >,
    );
  }

  function _syncRemoteParticipants(room: LKRoom) {
    const next = new Map<string, RemoteParticipantTrackInfo>();
    for (const p of room.remoteParticipants.values()) {
      next.set(p.identity, _rebuildRemoteParticipant(p));
    }
    _remoteParticipants.value = next;
    remoteParticipantsVersion.value++;
  }

  /** Clears tab listeners, stats, speaker UI, moderation/camera flags, and remote map (no Room SDK). */
  function clearLocalVoiceUiState() {
    clearTabCleanup();
    clearKrispAsyncRejectionWatch();
    stopStatsPolling();
    stopAudioHealthPolling();
    _teardownSpeakerTracking();
    krispSessionFailed.value = false;
    vcDeafenedInternal.value = false;
    isCameraEnabled.value = false;
    isScreenShareEnabled.value = false;
    viewerLeaveSoundAt.clear();
    remoteParticipantOutputVolume.value = new Map();
    _remoteParticipants.value = new Map();
    remoteParticipantsVersion.value++;
  }

  function abortConnectInProgress() {
    const target = connectAbortTarget;
    connectAbortTarget = null;
    if (target) {
      void target.disconnect().catch((e) => {
        voiceClientTrace('voice.client:lk_connect_abort_disconnect_err', {
          err: e instanceof Error ? e.message : String(e),
        });
        voiceClientDiag('warn', 'voice.client:abort_connect_disconnect', {
          err: e instanceof Error ? e.message : String(e),
        });
      });
    }
  }

  function releaseLiveKitE2eeWorker(): void {
    if (!liveKitE2eeWorker) return;
    liveKitE2eeWorker.terminate();
    liveKitE2eeWorker = null;
  }

  function disconnect() {
    applyVcAudioQueued = Promise.resolve();
    connectGeneration += 1;
    abortConnectInProgress();
    releaseLiveKitE2eeWorker();
    voiceClientTrace('voice.client:lk_disconnect_called', {
      hadRoom: !!lkRoom.value,
    });
    const room = lkRoom.value;
    clearLocalVoiceUiState();
    if (room) {
      voiceClientDiag('info', 'voice.client:disconnect_room', {
        roomName: room.name,
        state: String(room.state),
      });
      void room.disconnect().catch((e) => {
        voiceClientTrace('voice.client:lk_room_disconnect_err', {
          err: e instanceof Error ? e.message : String(e),
        });
        voiceClientDiag('warn', 'voice.client:disconnect_room_failed', {
          err: e instanceof Error ? e.message : String(e),
        });
      });
      lkRoom.value = null;
    }
    roomState.value = 'idle';
    voiceClientDiag('info', 'voice.client:state_idle', {});
  }

  function teardownRoomSession(reason: unknown, setError: boolean) {
    voiceClientTrace('voice.client:lk_teardown', {
      setError,
      reason:
        typeof reason === 'number' || typeof reason === 'string'
          ? String(reason)
          : reason instanceof Error
            ? reason.message
            : 'object',
    });
    clearLocalVoiceUiState();
    lkRoom.value = null;
    roomState.value = setError ? 'error' : 'idle';
    voiceClientDiag('info', 'voice.client:session_torn_down', {
      state: roomState.value,
      reason:
        typeof reason === 'number' || typeof reason === 'string'
          ? String(reason)
          : reason instanceof Error
            ? reason.message
            : 'object',
    });
  }

  async function muteRemoteParticipantsForDeafen(room: LKRoom) {
    for (const rp of room.remoteParticipants.values()) {
      for (const pub of rp.audioTrackPublications.values()) {
        try {
          await pub.setSubscribed(false);
        } catch (e) {
          voiceClientTrace('voice.client:deafen_mute_pub_best_effort', {
            err: e instanceof Error ? e.message : String(e),
          });
        }
      }
    }
  }

  async function unmuteRemoteParticipantsAfterDeafen(room: LKRoom) {
    for (const rp of room.remoteParticipants.values()) {
      for (const pub of rp.audioTrackPublications.values()) {
        try {
          await pub.setSubscribed(true);
        } catch (e) {
          voiceClientTrace('voice.client:deafen_unmute_pub_best_effort', {
            err: e instanceof Error ? e.message : String(e),
          });
        }
      }
    }
  }

  function onParticipantConnectedWhileDeafened(p: RemoteParticipant) {
    if (!vcDeafenedInternal.value) return;
    for (const pub of p.audioTrackPublications.values()) {
      void pub.setSubscribed(false);
    }
  }

  function applyVcAudioState(opts: { muted: boolean; deafened: boolean }) {
    applyVcAudioQueued = applyVcAudioQueued
      .catch(() => {})
      .then(() => runApplyVcAudioState(opts));
    return applyVcAudioQueued;
  }

  async function runApplyVcAudioState(opts: {
    muted: boolean;
    deafened: boolean;
  }) {
    const room = lkRoom.value;
    if (!room || roomState.value !== 'connected') return;
    voiceClientTrace('voice.client:applyVcAudioState', {
      roomName: room.name,
      ...opts,
    });
    vcDeafenedInternal.value = opts.deafened;
    try {
      if (opts.deafened) {
        await room.localParticipant.setMicrophoneEnabled(false);
        await muteRemoteParticipantsForDeafen(room);
      } else {
        await unmuteRemoteParticipantsAfterDeafen(room);
        await room.localParticipant.setMicrophoneEnabled(
          !opts.muted,
          jsonPlainClone(getMicCaptureOptions()) as AudioCaptureOptions,
        );
        if (!opts.muted) {
          void attachKrispProcessorIfNeeded(room);
        }
      }
      voiceClientTrace('voice.client:applyVcAudioState_ok', {
        roomName: room.name,
      });
      refreshLocalMicLevelMonitor(room);
    } catch (e) {
      const err = formatVoiceClientError(e);
      voiceClientTrace('voice.client:applyVcAudioState_error', { err });
      voiceClientDiag('error', 'voice.client:applyVcAudioState_failed', {
        err,
      });
    }
  }

  function buildStatsFromSenderStats(
    stats: SenderStatsLike,
  ): LiveKitNetworkStats {
    let bitrateKbps = 0;
    if (stats.bytesSent != null && stats.timestamp) {
      if (prevTimestamp > 0) {
        const dtSec = (stats.timestamp - prevTimestamp) / 1000;
        if (dtSec > 0) {
          bitrateKbps = ((stats.bytesSent - prevBytesSent) * 8) / dtSec / 1000;
        }
      }
      prevBytesSent = stats.bytesSent;
      prevTimestamp = stats.timestamp;
    }

    const rtt = stats.roundTripTime ?? 0;
    const jitter = stats.jitter ?? 0;
    const lost = stats.packetsLost ?? 0;
    const sent = stats.packetsSent ?? 0;
    const lossPct = sent + lost > 0 ? (lost / (sent + lost)) * 100 : 0;

    return {
      latencyMs: rtt * 1000,
      jitterMs: jitter * 1000,
      packetLossPct: lossPct,
      bitrateKbps: Math.max(0, bitrateKbps),
      codec: 'Opus',
    };
  }

  async function sampleNetworkStatsTick(room: LKRoom): Promise<boolean> {
    const lp = room.localParticipant;
    let gotStatsThisTick = false;

    for (const pub of lp.audioTrackPublications.values()) {
      const track = pub.track;
      if (!track) continue;

      /**
       * Prefer full `getRTCStatsReport` + `parseRtcStatsReport` for uplink metrics.
       * LiveKit's `getSenderStats()` mirrors outbound-rtp only; Chrome does not
       * populate roundTripTime / jitter / packetsLost there (they live on
       * remote-inbound-rtp and candidate-pair), so that path showed bitrate but
       * zeros for everything else.
       */
      const report = await getRtcStatsReportIfSupported(track);
      if (report && typeof report.forEach === 'function') {
        let nextBytes = prevBytesSent;
        let nextTs = prevTimestamp;
        report.forEach((s: RTCStats) => {
          const st = s as unknown as Record<string, unknown>;
          if (
            String(st.type) === 'outbound-rtp' &&
            (st.kind === 'audio' || st.mediaType === 'audio')
          ) {
            if (typeof st.bytesSent === 'number') nextBytes = st.bytesSent;
            if (typeof st.timestamp === 'number') nextTs = st.timestamp;
          }
        });
        const parsed = parseRtcStatsReport(
          report as RTCStatsReport,
          prevBytesSent,
          prevTimestamp,
        );
        prevBytesSent = nextBytes;
        prevTimestamp = nextTs;

        networkStats.value = {
          latencyMs: parsed.latencyMs,
          jitterMs: parsed.jitterMs,
          packetLossPct: parsed.packetLossPct,
          bitrateKbps: parsed.bitrateKbps,
          codec: parsed.codec,
        };
        gotStatsThisTick = true;
        if (!statsSuccessLogged) {
          statsSuccessLogged = true;
          voiceClientDiag('info', 'voice.client:stats_first_ok', {
            path: 'getRTCStatsReport',
            stats: networkStats.value,
          });
        }
        break;
      }

      const senderStats = await getSenderStatsIfSupported(track);
      if (senderStats) {
        networkStats.value = buildStatsFromSenderStats(senderStats);
        gotStatsThisTick = true;
        if (!statsSuccessLogged) {
          statsSuccessLogged = true;
          voiceClientDiag('info', 'voice.client:stats_first_ok', {
            path: 'getSenderStats',
            stats: networkStats.value,
          });
        }
        break;
      }
    }

    if (gotStatsThisTick && networkStats.value) {
      const screenPub = lp.getTrackPublication(LK_SOURCE_SCREEN_SHARE);
      const camPub = lp.getTrackPublication(LK_SOURCE_CAMERA);
      const vPub = screenPub?.track ? screenPub : camPub;
      const vt = vPub?.track;
      if (vt) {
        const vr = await getRtcStatsReportIfSupported(vt);
        if (vr) {
          networkStats.value = {
            ...networkStats.value,
            ...parseOutboundVideoRtpStats(vr),
          };
        }
      }
    }

    if (!gotStatsThisTick && statsFailureLogs < STATS_FAILURE_LOG_MAX) {
      statsFailureLogs += 1;
      voiceClientDiag('warn', 'voice.client:stats_sample_failed', {
        attempt: statsFailureLogs,
        max: STATS_FAILURE_LOG_MAX,
      });
    }
    return gotStatsThisTick;
  }

  function startStatsPolling() {
    stopStatsPolling();
    prevBytesSent = 0;
    prevTimestamp = 0;
    statsSuccessLogged = false;
    statsFailureLogs = 0;

    statsInterval = setInterval(() => {
      const room = lkRoom.value;
      if (!room || roomState.value !== 'connected') return;
      if (statsTickInFlight) return;
      statsTickInFlight = true;
      void (async () => {
        try {
          await sampleNetworkStatsTick(room);
        } catch (e) {
          if (statsFailureLogs < STATS_FAILURE_LOG_MAX) {
            statsFailureLogs += 1;
            voiceClientDiag('warn', 'voice.client:stats_tick_error', {
              attempt: statsFailureLogs,
              max: STATS_FAILURE_LOG_MAX,
              err: e instanceof Error ? e.message : String(e),
            });
          }
        } finally {
          statsTickInFlight = false;
        }
      })();
    }, 2000);
  }

  function stopStatsPolling() {
    if (statsInterval) {
      clearInterval(statsInterval);
      statsInterval = null;
    }
    networkStats.value = null;
  }

  onUnmounted(() => {
    disconnect();
  });

  function publishVcPublicMedia(room: LKRoom, msg: EchoVcDataV1) {
    void room.localParticipant.publishData(encodeEchoVcData(msg), {
      reliable: true,
    });
  }

  function localIdentityPayload(
    room: LKRoom,
    kind: EchoVcDataV1['kind'],
  ): EchoVcDataV1 {
    const uid = room.localParticipant.identity;
    const name = room.localParticipant.name?.trim() || undefined;
    return { v: 1, t: 'public_media', kind, userId: uid, name };
  }

  function notifyStreamerViewerLeftStream(
    room: LKRoom,
    streamerIdentity: string,
  ) {
    if (
      !streamerIdentity ||
      streamerIdentity === room.localParticipant.identity
    ) {
      return;
    }
    const payload: EchoVcPrivateViewerV1 = {
      v: 1,
      t: 'viewer_stream',
      kind: 'viewer_left_stream',
      viewerId: room.localParticipant.identity,
    };
    void room.localParticipant.publishData(encodeEchoVcPrivateViewer(payload), {
      reliable: true,
      destinationIdentities: [streamerIdentity],
    });
  }

  function announceLocalVcPublic(room: LKRoom, kind: EchoVcDataV1['kind']) {
    publishVcPublicMedia(room, localIdentityPayload(room, kind));
    switch (kind) {
      case 'stream_start':
        announceVoiceChannelPublic({
          title: 'You started streaming',
          sound: 'streamStart',
        });
        break;
      case 'stream_end':
        announceVoiceChannelPublic({
          title: 'You stopped streaming',
          sound: 'streamEnd',
        });
        break;
      case 'video_start':
        announceVoiceChannelPublic({
          title: 'You turned on your camera',
          sound: 'videoStart',
        });
        break;
      case 'video_end':
        announceVoiceChannelPublic({
          title: 'You turned off your camera',
          sound: 'videoEnd',
        });
        break;
    }
  }

  function attachRoomEventHandlers(room: LKRoom) {
    room.on(RoomEvent.Reconnecting, () => {
      voiceClientTrace('voice.client:lk_room_reconnecting', {});
      voiceClientDiag('info', 'voice.client:room_reconnecting', {});
      stopStatsPolling();
      roomState.value = 'connecting';
    });

    room.on(RoomEvent.Reconnected, () => {
      voiceClientTrace('voice.client:lk_room_reconnected', {});
      voiceClientDiag('info', 'voice.client:room_reconnected', {});
      roomState.value = 'connected';
      startStatsPolling();
      reapplyRemotePlaybackGains(room);
      void attachKrispProcessorIfNeeded(room).then(() => {
        refreshLocalMicLevelMonitor(room);
      });
    });

    room.on(RoomEvent.Connected, () => {
      voiceClientTrace('voice.client:lk_room_connected_event', {});
      voiceClientDiag('info', 'voice.client:room_connected_event', {});
    });

    room.on(RoomEvent.Disconnected, (reason) => {
      voiceClientTrace('voice.client:lk_room_disconnected', {
        reason: String(reason),
      });
      voiceClientDiag('info', 'voice.client:room_disconnected', {
        reason: String(reason),
      });
      const clientInitiated =
        DisconnectReason != null &&
        reason === DisconnectReason.CLIENT_INITIATED;
      teardownRoomSession(reason, !clientInitiated);
    });

    room.on(RoomEvent.DataReceived, (payload, participant) => {
      if (!participant?.identity) return;
      if (participant.identity === room.localParticipant.identity) return;

      const msg = decodeEchoVcData(payload);
      if (msg) {
        const label =
          msg.name?.trim() || participant.name?.trim() || participant.identity;
        switch (msg.kind) {
          case 'stream_start':
            announceVoiceChannelPublic({
              title: `${label} started streaming`,
              sound: 'streamStart',
            });
            break;
          case 'stream_end':
            announceVoiceChannelPublic({
              title: `${label} stopped streaming`,
              sound: 'streamEnd',
            });
            break;
          case 'video_start':
            announceVoiceChannelPublic({
              title: `${label} turned on their camera`,
              sound: 'videoStart',
            });
            break;
          case 'video_end':
            announceVoiceChannelPublic({
              title: `${label} turned off their camera`,
              sound: 'videoEnd',
            });
            break;
        }
        return;
      }

      const ytPayload =
        payload instanceof Uint8Array
          ? payload
          : new Uint8Array(payload as ArrayBufferLike);
      const yt = decodeEchoYoutubeActivity(ytPayload);
      if (yt) {
        onYoutubeActivity?.(yt, participant.identity);
        return;
      }

      const hmSecret = decodeEchoHangmanRoundSecret(ytPayload);
      if (hmSecret) {
        onHangmanRoundSecret?.(hmSecret, participant.identity);
        return;
      }

      const hm = decodeEchoHangmanActivity(ytPayload);
      if (hm) {
        onHangmanActivity?.(hm, participant.identity);
        return;
      }

      const hGuess = decodeEchoHangmanGuessIntent(ytPayload);
      if (hGuess) {
        onHangmanGuessIntent?.(hGuess, participant.identity);
        return;
      }

      const hNext = decodeEchoHangmanNextRound(ytPayload);
      if (hNext) {
        onHangmanNextRound?.(hNext, participant.identity);
        return;
      }

      const pres = decodeEchoVcActivityPresence(ytPayload);
      if (pres) {
        onVcActivityPresence?.(pres, participant.identity);
        return;
      }

      const priv = decodeEchoVcPrivateViewer(payload);
      if (priv?.kind === 'viewer_left_stream') {
        if (priv.viewerId !== participant.identity) return;
        if (!isScreenShareEnabled.value) return;
        if (shouldPlayViewerLeaveSound(priv.viewerId)) {
          playEchoSound('streamViewerLeave');
        }
      }
    });

    room.on(RoomEvent.ParticipantConnected, (p) => {
      voiceClientTrace('voice.client:lk_participant_connected', {
        identity: p.identity,
      });
      voiceClientDiag('info', 'voice.client:participant_joined', {
        identity: p.identity,
      });
      onParticipantConnectedWhileDeafened(p);
      if (isScreenShareEnabled.value) {
        playEchoSound('streamViewerArrive');
      } else {
        /** Same asset family as self “joined VC”; only when not streaming (see above). */
        playEchoSound('joinVoiceChannel');
      }
      _syncRemoteParticipants(room);
    });

    room.on(RoomEvent.ParticipantDisconnected, (p) => {
      voiceClientTrace('voice.client:lk_participant_disconnected', {
        identity: p.identity,
      });
      voiceClientDiag('info', 'voice.client:participant_left', {
        identity: p.identity,
      });
      if (isScreenShareEnabled.value) {
        if (shouldPlayViewerLeaveSound(p.identity)) {
          playEchoSound('streamViewerLeave');
        }
      } else {
        playEchoSound('leaveVc');
      }
      onRemoteParticipantDisconnected?.(p.identity);
      _syncRemoteParticipants(room);
    });

    room.on(RoomEvent.TrackSubscribed, (track, publication, participant) => {
      if (
        !participant.isLocal &&
        (publication as PublicationLike).source === LK_SOURCE_SCREEN_SHARE &&
        (track as TrackLike).kind === LK_KIND_VIDEO
      ) {
        playEchoSound('streamJoinSelf');
      }
      if (!participant.isLocal && (track as TrackLike).kind === LK_KIND_AUDIO) {
        const mst = (
          track as unknown as { mediaStreamTrack?: MediaStreamTrack }
        ).mediaStreamTrack;
        const canPlaybackAudio = (
          room as unknown as { canPlaybackAudio?: boolean }
        ).canPlaybackAudio;
        const detail = {
          identity: participant.identity,
          trackSid: (publication as PublicationLike).trackSid,
          source: String((publication as PublicationLike).source),
          isSubscribed: (publication as PublicationLike).isSubscribed,
          isMuted: (publication as PublicationLike).isMuted,
          deafened: vcDeafenedInternal.value,
          hasMediaStreamTrack: !!mst,
          mstReadyState: mst?.readyState ?? 'none',
          mstEnabled: mst?.enabled ?? null,
          mstMuted: mst
            ? (mst as unknown as { muted?: boolean }).muted === true
            : null,
          canPlaybackAudio: canPlaybackAudio ?? null,
          outputVolume: lastOutputVolumePercent.value,
        };
        vcDebugLog('[Echo:VC:Audio] remote_audio_track_subscribed', detail);
        voiceClientDiag(
          'info',
          'voice.client:remote_audio_track_subscribed',
          detail,
        );

        if (mst) {
          mst.onmute = () => {
            const canPlay = (room as unknown as { canPlaybackAudio?: boolean })
              .canPlaybackAudio;
            const ev = {
              identity: participant.identity,
              trackSid: (publication as PublicationLike).trackSid,
              mstReadyState: mst.readyState,
              canPlaybackAudio: canPlay ?? null,
            };
            vcDebugLog('[Echo:VC:Audio] mst_mute_event (RTP stopped)', ev);
            voiceClientDiag('warn', 'voice.client:mst_mute_event', ev);
          };
          mst.onunmute = () => {
            const canPlay = (room as unknown as { canPlaybackAudio?: boolean })
              .canPlaybackAudio;
            const ev = {
              identity: participant.identity,
              trackSid: (publication as PublicationLike).trackSid,
              mstReadyState: mst.readyState,
              canPlaybackAudio: canPlay ?? null,
            };
            vcDebugLog('[Echo:VC:Audio] mst_unmute_event (RTP flowing!)', ev);
            voiceClientDiag('info', 'voice.client:mst_unmute_event', ev);
          };
        }
      }
      if (
        vcDeafenedInternal.value &&
        !participant.isLocal &&
        (track as TrackLike).kind === LK_KIND_AUDIO
      ) {
        vcDebugLog('[Echo:VC:Audio] unsubscribing_due_to_deafen', {
          identity: participant.identity,
          trackSid: (publication as PublicationLike).trackSid,
        });
        void (publication as PublicationLike).setSubscribed?.(false);
      }
      if (!participant.isLocal && (track as TrackLike).kind === LK_KIND_AUDIO) {
        const audioEl = (track as TrackLike).attach?.();
        if (!audioEl) {
          _syncRemoteParticipants(room);
          return;
        }
        audioEl.style.display = 'none';
        document.body.appendChild(audioEl);
        void echoPlaybackEnsureAudioContextRunning();
        echoPlaybackRegisterTrackElement(track, audioEl);
        vcDebugLog('[Echo:VC:Audio] track_attached_to_dom', {
          identity: participant.identity,
          trackSid: (publication as PublicationLike).trackSid,
          elementPaused: audioEl.paused,
        });
        applyRemoteOutputGainToTrack(track, participant.identity);
        queueMicrotask(() => dumpLiveKitDomAudioElements());
      }
      _syncRemoteParticipants(room);
    });

    room.on(RoomEvent.TrackUnsubscribed, (track, publication, participant) => {
      if (
        !participant?.isLocal &&
        (track as TrackLike).kind === LK_KIND_AUDIO
      ) {
        const detached = (track as TrackLike).detach?.() ?? [];
        echoPlaybackCleanupForRemoteTrack(track, detached);
        detached.forEach((el: HTMLMediaElement) => el.remove());
        vcDebugLog('[Echo:VC:Audio] track_detached_from_dom', {
          identity: participant?.identity ?? null,
          trackSid: (publication as PublicationLike).trackSid,
          removedCount: detached.length,
        });
      }
      if (
        participant &&
        !participant.isLocal &&
        (publication as PublicationLike).source === LK_SOURCE_SCREEN_SHARE &&
        (track as TrackLike).kind === LK_KIND_VIDEO
      ) {
        const streamerIdentity = participant.identity;
        const trackSid = (publication as PublicationLike).trackSid ?? '';
        queueMicrotask(() => {
          if (room.state !== ConnectionState.Connected) return;
          const remote = liveKitRemoteParticipantByIdentity(
            room,
            streamerIdentity,
          );
          if (!remote) return;
          const pubStill = remote.getTrackPublicationBySid(trackSid);
          if (!pubStill) {
            return;
          }
          notifyStreamerViewerLeftStream(room, streamerIdentity);
        });
      }
      _syncRemoteParticipants(room);
    });

    room.on(RoomEvent.TrackPublished, (_publication, participant) => {
      if (!participant?.isLocal) {
        _syncRemoteParticipants(room);
      }
    });

    room.on(RoomEvent.TrackUnpublished, (_publication, participant) => {
      if (!participant?.isLocal) {
        _syncRemoteParticipants(room);
      }
    });

    room.on(RoomEvent.TrackMuted, (pub, participant) => {
      if (
        !participant?.isLocal &&
        (pub as PublicationLike).kind === LK_KIND_AUDIO
      ) {
        const mst = pub.track
          ? (pub.track as unknown as { mediaStreamTrack?: MediaStreamTrack })
              .mediaStreamTrack
          : undefined;
        const ev = {
          identity: participant?.identity ?? null,
          trackSid: pub.trackSid,
          source: String((pub as PublicationLike).source),
          isSubscribed: (pub as PublicationLike).isSubscribed ?? null,
          mstReadyState: mst?.readyState ?? 'none',
          mstMuted: mst
            ? (mst as unknown as { muted?: boolean }).muted === true
            : null,
        };
        vcDebugLog('[Echo:VC:Audio] track_muted_event', ev);
        voiceClientDiag('warn', 'voice.client:track_muted_event', ev);
      }
      _syncRemoteParticipants(room);
    });

    room.on(RoomEvent.TrackUnmuted, (pub, participant) => {
      if (
        !participant?.isLocal &&
        (pub as PublicationLike).kind === LK_KIND_AUDIO
      ) {
        const mst = pub.track
          ? (pub.track as unknown as { mediaStreamTrack?: MediaStreamTrack })
              .mediaStreamTrack
          : undefined;
        const ev = {
          identity: participant?.identity ?? null,
          trackSid: pub.trackSid,
          source: String((pub as PublicationLike).source),
          isSubscribed: (pub as PublicationLike).isSubscribed ?? null,
          mstReadyState: mst?.readyState ?? 'none',
          mstMuted: mst
            ? (mst as unknown as { muted?: boolean }).muted === true
            : null,
        };
        vcDebugLog('[Echo:VC:Audio] track_unmuted_event', ev);
        voiceClientDiag('info', 'voice.client:track_unmuted_event', ev);
      }
      _syncRemoteParticipants(room);
    });

    if (RoomEvent.AudioPlaybackStatusChanged) {
      room.on(RoomEvent.AudioPlaybackStatusChanged, () => {
        const canPlay = (room as unknown as { canPlaybackAudio?: boolean })
          .canPlaybackAudio;
        voiceClientDiag('info', 'voice.client:audio_playback_status_changed', {
          canPlaybackAudio: canPlay ?? null,
        });
        reapplyRemotePlaybackGains(room);
      });
    }

    room.on(RoomEvent.ConnectionStateChanged, (state) => {
      const canPlay = (room as unknown as { canPlaybackAudio?: boolean })
        .canPlaybackAudio;
      const ev = {
        connectionState: String(state),
        canPlaybackAudio: canPlay ?? null,
      };
      vcDebugLog('[Echo:VC:Audio] connection_state_changed', ev);
      voiceClientDiag('info', 'voice.client:connection_state_changed', ev);
    });

    room.on(RoomEvent.LocalTrackPublished, (pub) => {
      const p = pub as LocalTrackPublication & PublicationLike;
      if (p.source === LK_SOURCE_CAMERA) {
        isCameraEnabled.value = true;
        if (p.kind === LK_KIND_VIDEO) {
          announceLocalVcPublic(room, 'video_start');
        }
      } else if (p.source === LK_SOURCE_SCREEN_SHARE) {
        isScreenShareEnabled.value = true;
        if (p.kind === LK_KIND_VIDEO) {
          announceLocalVcPublic(room, 'stream_start');
        }
      } else if (p.source === LK_SOURCE_MICROPHONE) {
        refreshLocalMicLevelMonitor(room);
        applyLocalMicGain(room);
      }
    });

    room.on(RoomEvent.LocalTrackUnpublished, (pub) => {
      const p = pub as LocalTrackPublication & PublicationLike;
      if (p.source === LK_SOURCE_CAMERA) {
        isCameraEnabled.value = false;
        if (p.kind === LK_KIND_VIDEO) {
          announceLocalVcPublic(room, 'video_end');
        }
      } else if (p.source === LK_SOURCE_SCREEN_SHARE) {
        isScreenShareEnabled.value = false;
        if (p.kind === LK_KIND_VIDEO) {
          announceLocalVcPublic(room, 'stream_end');
        }
      } else if (p.source === LK_SOURCE_MICROPHONE) {
        refreshLocalMicLevelMonitor(room);
      }
    });

    _setupActiveSpeakerTracking(room);
  }

  async function connect(
    url: string,
    token: string,
    bitrateBps?: number | null,
    e2eeMediaKey?: ArrayBuffer | null,
  ) {
    const urlForLog = (() => {
      try {
        return new URL(url).host;
      } catch {
        return 'invalid_url';
      }
    })();
    voiceClientTrace('voice.client:lk_connect_start', {
      urlHost: urlForLog,
      tokenChars: token.length,
      jwtParts: token.split('.').length,
    });
    if (connectInFlight || roomState.value === 'connecting') {
      voiceClientTrace('voice.client:lk_connect_duplicate_ignored', {});
      voiceClientDiag('info', 'voice.client:connect_duplicate_ignored', {});
      return;
    }
    voiceClientDiag('info', 'voice.client:connect_requested', {
      urlHost: urlForLog,
    });
    connectInFlight = true;

    if (lkRoom.value) {
      voiceClientTrace('voice.client:lk_teardown_before_reconnect', {});
      voiceClientDiag('info', 'voice.client:teardown_before_reconnect', {});
      const prev = lkRoom.value;
      lkRoom.value = null;
      releaseLiveKitE2eeWorker();
      void prev.disconnect().catch(() => {
        /* ignore */
      });
    }
    const myGen = ++connectGeneration;
    roomState.value = 'connecting';
    try {
      if (isDesktop() && DESKTOP_NATIVE_AUDIO_ENABLED) {
        void initDesktopNativeAudio().catch(() => {});
      }
      if (myGen !== connectGeneration) {
        voiceClientTrace('voice.client:lk_connect_stale_after_import', {});
        return;
      }
      const prefsForRoom = loadVoiceProcessingPreferences();
      const captureDefaultsRaw = buildAudioCaptureOptionsForSession(
        prefsForRoom,
        krispSessionFailed.value,
      );
      const captureDefaults = jsonPlainClone(
        captureDefaultsRaw,
      ) as AudioCaptureOptions;
      const audioPreset =
        bitrateBps != null
          ? { maxBitrate: Number(bitrateBps) }
          : { ...AudioPresets.musicHighQuality };
      const publishDefaultsPlain = jsonPlainClone({
        audioPreset,
        degradationPreference: 'maintain-resolution' as const,
        simulcast: true,
      }) as TrackPublishDefaults;
      let encryption:
        | { keyProvider: ExternalE2EEKeyProvider; worker: Worker }
        | undefined;
      if (e2eeMediaKey && e2eeMediaKey.byteLength > 0) {
        const keyProvider = new ExternalE2EEKeyProvider();
        await keyProvider.setKey(e2eeMediaKey);
        const worker = new Worker(
          new URL('livekit-client/e2ee-worker', import.meta.url),
          { type: 'module' },
        );
        liveKitE2eeWorker = worker;
        encryption = { keyProvider, worker };
        voiceClientDiag('info', 'voice.client:lk_e2ee_enabled', {});
      }
      const room = new Room({
        /**
         * Playback: AdaptiveStream picks an appropriate subscribed layer from
         * simulcast/SVC based on visible video size and pauses when off-screen.
         * Publish: Dynacast stops sending layers nobody is subscribing to (CPU/bw).
         * Screen share: VP9 SVC + publish options on desktop; iPadOS/iOS uses H.264
         * without SVC in `startScreenShare` (WebKit capture + encoder path).
         */
        adaptiveStream: true,
        dynacast: true,
        audioCaptureDefaults: captureDefaults,
        videoCaptureDefaults: LIVEKIT_ROOM_VIDEO_CAPTURE_DEFAULTS_PLAIN,
        publishDefaults: publishDefaultsPlain,
        ...(encryption ? { encryption } : {}),
      });
      connectAbortTarget = room;

      attachRoomEventHandlers(room);

      voiceClientDiag('info', 'voice.client:room_connect_calling', {
        urlHost: urlForLog,
      });
      await room.connect(url, token);
      void echoPlaybackEnsureAudioContextRunning();
      if (myGen !== connectGeneration) {
        voiceClientTrace('voice.client:lk_connect_stale_after_connect', {});
        connectAbortTarget = null;
        void room.disconnect().catch(() => {
          /* ignore */
        });
        releaseLiveKitE2eeWorker();
        return;
      }

      voiceClientTrace('voice.client:lk_connect_await_ok', {
        roomName: room.name,
        localIdentity: room.localParticipant.identity,
        remoteCount: room.remoteParticipants.size,
      });
      voiceClientDiag('info', 'voice.client:connected', {
        roomName: room.name,
        localIdentity: room.localParticipant.identity,
      });

      const micOptsRaw = buildAudioCaptureOptionsForSession(
        loadVoiceProcessingPreferences(),
        krispSessionFailed.value,
      );
      const micOpts = jsonPlainClone(micOptsRaw) as AudioCaptureOptions;
      await room.localParticipant.setMicrophoneEnabled(true, micOpts);
      if (myGen !== connectGeneration) {
        voiceClientTrace('voice.client:lk_connect_stale_after_mic', {});
        connectAbortTarget = null;
        void room.disconnect().catch(() => {
          /* ignore */
        });
        releaseLiveKitE2eeWorker();
        return;
      }

      /** Browsers often block remote audio until this runs (see Room.startAudio in livekit-client). */
      const canPlayBefore = (room as unknown as { canPlaybackAudio?: boolean })
        .canPlaybackAudio;
      vcDebugLog('[Echo:VC:Audio] startAudio_before', {
        canPlaybackAudio: canPlayBefore ?? '(unavailable)',
      });
      try {
        await room.startAudio();
        const canPlayAfter = (room as unknown as { canPlaybackAudio?: boolean })
          .canPlaybackAudio;
        vcDebugLog('[Echo:VC:Audio] startAudio_ok', {
          canPlaybackAudio: canPlayAfter ?? '(unavailable)',
        });
        voiceClientDiag('info', 'voice.client:startAudio_ok', {
          canPlaybackAudio: canPlayAfter ?? null,
        });
      } catch (e) {
        const canPlayAfter = (room as unknown as { canPlaybackAudio?: boolean })
          .canPlaybackAudio;
        vcDebugLog('[Echo:VC:Audio] startAudio_FAILED', {
          err: e instanceof Error ? e.message : String(e),
          canPlaybackAudio: canPlayAfter ?? '(unavailable)',
        });
        voiceClientDiag('warn', 'voice.client:startAudio_failed', {
          err: e instanceof Error ? e.message : String(e),
          canPlaybackAudio: canPlayAfter ?? null,
        });
      }
      if (myGen !== connectGeneration) {
        voiceClientTrace('voice.client:lk_connect_stale_after_startAudio', {});
        connectAbortTarget = null;
        void room.disconnect().catch(() => {
          /* ignore */
        });
        releaseLiveKitE2eeWorker();
        return;
      }

      reapplyRemotePlaybackGains(room);

      await attachKrispProcessorIfNeeded(room);
      if (myGen !== connectGeneration) {
        voiceClientTrace('voice.client:lk_connect_stale_after_krisp', {});
        connectAbortTarget = null;
        void room.disconnect().catch(() => {
          /* ignore */
        });
        releaseLiveKitE2eeWorker();
        return;
      }

      voiceClientTrace('voice.client:lk_mic_enabled_after_connect', {});
      {
        const pub =
          room.localParticipant.getTrackPublication(LK_SOURCE_MICROPHONE);
        const t = pub?.track as LocalAudioTrack | undefined;
        const mst = t?.mediaStreamTrack;
        voiceClientDiag('info', 'voice.client:mic_enabled', {
          pub: !!pub,
          track: !!t,
          trackMuted: pub ? !!pub.isMuted : null,
          mst: !!mst,
          mstReadyState: mst?.readyState ?? 'missing',
          mstEnabled: mst ? mst.enabled : null,
          mstMuted: mst ? (mst as any).muted === true : null,
          settings: mst?.getSettings ? mst.getSettings() : null,
        });
      }

      connectAbortTarget = null;
      lkRoom.value = room;
      roomState.value = 'connected';
      refreshLocalMicLevelMonitor(room);
      _syncRemoteParticipants(room);
      registerTabCleanup();
      startStatsPolling();
      dumpRemoteAudioTrackState(room, 'post_connect');
      dumpLiveKitDomAudioElements();
      startAudioHealthPolling(room);
    } catch (e) {
      voiceClientTrace('voice.client:lk_connect_failed', {
        err: e instanceof Error ? e.message : String(e),
      });
      connectGeneration += 1;
      abortConnectInProgress();
      roomState.value = 'error';
      lkRoom.value = null;
      clearLocalVoiceUiState();
      releaseLiveKitE2eeWorker();
      voiceClientDiag('error', 'voice.client:connect_failed', {
        err: e instanceof Error ? e.message : String(e),
      });
    } finally {
      connectInFlight = false;
    }
  }

  async function setCameraEnabled(enabled: boolean) {
    const room = lkRoom.value;
    if (!room) return;
    if (!enabled) {
      try {
        await room.localParticipant.setCameraEnabled(false);
      } catch (e) {
        voiceClientDiag('error', 'voice.client:setCameraEnabled_failed', {
          err: e instanceof Error ? e.message : String(e),
        });
      }
      return;
    }

    const dev = selectedCameraDeviceId.value;
    try {
      await assertCameraCaptureReady(
        dev && dev !== 'default' ? String(dev) : undefined,
      );
    } catch (e) {
      const msg =
        e instanceof VoiceJoinMediaPreflightError
          ? e.message
          : e instanceof Error && e.message.trim()
            ? e.message.trim()
            : 'Could not access the camera.';
      voiceClientDiag('warn', 'voice.client:camera_preflight_failed', {
        err: msg,
      });
      UIErrorBus.emit({
        context: 'voice.camera_preflight',
        severity: 'warning',
        userMessage: msg,
        retryAction: () => {
          void setCameraEnabled(true);
        },
      });
      return;
    }

    try {
      const q = videoQuality.value;
      const preset = VIDEO_CAPTURE_PRESETS[q] ?? VIDEO_CAPTURE_PRESETS['480p'];
      const devStr = typeof dev === 'string' ? dev : String(dev ?? '');
      const captureOpts = plainVideoCaptureOptionsForLiveKit(
        preset,
        devStr || undefined,
      );
      await room.localParticipant.setCameraEnabled(true, captureOpts);
    } catch (e) {
      const detail = formatVoiceClientError(e);
      voiceClientDiag('error', 'voice.client:setCameraEnabled_failed', {
        err: detail,
      });
      UIErrorBus.emit({
        context: 'voice.camera_publish',
        severity: 'warning',
        userMessage: `Could not start camera: ${detail}`,
        retryAction: () => {
          void setCameraEnabled(true);
        },
      });
    }
  }

  async function setScreenShareEnabled(enabled: boolean) {
    const room = lkRoom.value;
    if (!room) return;
    try {
      await room.localParticipant.setScreenShareEnabled(enabled);
    } catch (e) {
      voiceClientDiag('error', 'voice.client:setScreenShareEnabled_failed', {
        err: e instanceof Error ? e.message : String(e),
      });
    }
  }

  async function startScreenShare(opts: {
    quality: '1080p60' | '720p30' | '720p15' | 'auto';
    audio: boolean;
    contentHint: 'motion' | 'detail';
  }) {
    const room = lkRoom.value;
    if (!room) return;
    if (!echoSyncCapabilities.browser.supportsScreenShare) {
      UIErrorBus.emit({
        context: 'voice.screen_share_unsupported',
        severity: 'warning',
        userMessage:
          'Screen sharing is not available in this browser yet. On iPad or iPhone, update to the latest Safari (or install the Echo web app) and use HTTPS.',
      });
      return;
    }

    /**
     * Desktop Safari: `getDisplayMedia` often rejects over-constrained video presets
     * (width/height/frameRate) that LiveKit maps for Chrome. Use minimal capture first;
     * LiveKit applies its own Safari-safe defaults when `resolution` is omitted.
     */
    const safariDesktop =
      echoSyncCapabilities.browser.isSafariLike &&
      !echoSyncCapabilities.browser.isIosLike;

    /**
     * iPadOS / iOS (all browsers use WebKit): same as desktop Safari — never lead with
     * hard width/height/frameRate; system capture picker is picky. Publish with H.264
     * instead of VP9 SVC (see `buildScreenSharePublishOptionsIosLike`).
     */
    const iosLike = echoSyncCapabilities.browser.isIosLike;

    function buildFullScreenShareCapture(): ScreenShareCaptureOptions {
      let resolution: ScreenShareCaptureOptions['resolution'];
      if (opts.quality === '1080p60') {
        resolution = { width: 1920, height: 1080, frameRate: 60 };
      } else if (opts.quality === '720p15') {
        resolution = { width: 1280, height: 720, frameRate: 15 };
      } else if (opts.quality === '720p30') {
        resolution = { width: 1280, height: 720, frameRate: 30 };
      } else if (opts.quality === 'auto') {
        resolution = { width: 1920, height: 1080, frameRate: 30 };
      }
      return {
        audio: opts.audio,
        resolution: resolution
          ? {
              width: resolution.width,
              height: resolution.height,
              frameRate: resolution.frameRate,
            }
          : undefined,
        contentHint: opts.contentHint,
      };
    }

    const minimalCapture = (): ScreenShareCaptureOptions =>
      jsonPlainClone({ audio: opts.audio }) as ScreenShareCaptureOptions;

    const attempts: ScreenShareCaptureOptions[] = [];
    if (safariDesktop || iosLike) {
      attempts.push(minimalCapture());
      if (opts.audio) {
        attempts.push(
          jsonPlainClone({ audio: false }) as ScreenShareCaptureOptions,
        );
      }
    } else {
      attempts.push(
        jsonPlainClone(
          buildFullScreenShareCapture(),
        ) as ScreenShareCaptureOptions,
      );
      attempts.push(minimalCapture());
      if (opts.audio) {
        attempts.push(
          jsonPlainClone({ audio: false }) as ScreenShareCaptureOptions,
        );
      }
    }

    const publishOptsPlain = jsonPlainClone(
      iosLike
        ? buildScreenSharePublishOptionsIosLike(opts)
        : buildScreenSharePublishOptions(opts),
    ) as TrackPublishOptions;

    let lastErr: unknown;
    for (const capPlain of attempts) {
      try {
        await room.localParticipant.setScreenShareEnabled(
          true,
          capPlain,
          publishOptsPlain,
        );
        return;
      } catch (e) {
        lastErr = e;
        /* Don't re-prompt the OS picker after the user explicitly cancels / denies —
         * each retry attempt would open another picker and feel like we're forcing
         * them to share. Bail out silently. */
        if (isUserCancelledMediaError(e)) {
          voiceClientDiag('info', 'voice.client:startScreenShare_cancelled', {
            err: formatVoiceClientError(e),
          });
          return;
        }
      }
    }

    const detail = formatVoiceClientError(lastErr);
    voiceClientDiag('error', 'voice.client:startScreenShare_failed', {
      err: detail,
    });
    UIErrorBus.emit({
      context: 'voice.screen_share_start',
      severity: 'warning',
      userMessage: `Could not start screen share: ${detail}`,
      retryAction: () => {
        void startScreenShare(opts);
      },
    });
  }

  async function stopScreenShare() {
    await setScreenShareEnabled(false);
  }

  function getLocalScreenTrack() {
    const room = lkRoom.value;
    if (!room) return null;
    const pub = room.localParticipant.getTrackPublication(
      LK_SOURCE_SCREEN_SHARE,
    );
    return pub?.track ?? null;
  }

  function getLocalCameraTrack() {
    const room = lkRoom.value;
    if (!room) return null;
    const pub = room.localParticipant.getTrackPublication(LK_SOURCE_CAMERA);
    return pub?.track ?? null;
  }

  function switchCamera(deviceId: string) {
    selectedCameraDeviceId.value =
      !deviceId || deviceId === 'default' ? '' : deviceId;
    const room = lkRoom.value;
    if (!room || !isCameraEnabled.value) return;
    void (async () => {
      try {
        await room.switchActiveDevice('videoinput', deviceId);
      } catch (e) {
        voiceClientTrace('voice.client:switch_camera_videoinput_fallback', {
          err: e instanceof Error ? e.message : String(e),
        });
        voiceClientDiag('warn', 'voice.client:switch_camera_fallback_toggle', {
          err: e instanceof Error ? e.message : String(e),
        });
        await setCameraEnabled(false);
        if (getUserWantsLocalCamera()) {
          await setCameraEnabled(true);
        }
      }
    })();
  }

  async function setVideoQuality(preset: VideoQualityPreset) {
    videoQuality.value = preset;
    const room = lkRoom.value;
    if (!room) return;
    if (!getUserWantsLocalCamera()) return;
    if (!isCameraEnabled.value) return;
    try {
      await setCameraEnabled(false);
    } catch (e) {
      voiceClientDiag(
        'error',
        'voice.client:setVideoQuality_stopCamera_failed',
        {
          err: formatVoiceClientError(e),
        },
      );
      return;
    }
    if (!getUserWantsLocalCamera()) return;
    await setCameraEnabled(true);
  }

  function setDesktopStreamingPreferences(
    patch: Partial<DesktopStreamingPreferences>,
  ) {
    desktopStreamingPreferences.value = {
      ...desktopStreamingPreferences.value,
      ...patch,
    };
    persistDesktopStreamingPreferences(desktopStreamingPreferences.value);
  }

  async function startDesktopScreenShare(
    patch?: Partial<DesktopStreamingPreferences>,
  ): Promise<void> {
    if (patch) setDesktopStreamingPreferences(patch);
    const prefs = desktopStreamingPreferences.value;
    await startScreenShare({
      quality: prefs.screenQuality,
      audio: prefs.screenIncludeAudio,
      contentHint: prefs.screenContentHint,
    });
  }

  async function startDesktopCameraStream(
    patch?: Partial<DesktopStreamingPreferences>,
  ): Promise<void> {
    if (patch) setDesktopStreamingPreferences(patch);
    const prefs = desktopStreamingPreferences.value;
    await setVideoQuality(prefs.cameraQuality);
    await setCameraEnabled(true);
  }

  async function switchMicDevice(deviceId: string) {
    const room = lkRoom.value;
    if (!room) return;
    if (isDesktop() && DESKTOP_NATIVE_AUDIO_ENABLED) {
      const normalized =
        !deviceId?.trim() || deviceId === 'default' ? null : deviceId;
      try {
        await setDesktopAudioInputDevice(normalized);
      } catch (e) {
        voiceClientDiag('warn', 'voice.client:desktop_switchMicDevice_failed', {
          err: formatVoiceClientError(e),
        });
      }
    }
    /**
     * LiveKit maps `''` to `{ exact: '' }` for `setDeviceId`, which fails on many
     * browsers. Default capture is already applied at connect — skip switching.
     */
    if (!deviceId?.trim() || deviceId === 'default') {
      refreshLocalMicLevelMonitor(room);
      applyLocalMicGain(room);
      return;
    }
    try {
      await room.switchActiveDevice('audioinput', deviceId);
      await attachKrispProcessorIfNeeded(room);
      refreshLocalMicLevelMonitor(room);
      applyLocalMicGain(room);
    } catch (e) {
      voiceClientDiag('error', 'voice.client:switchMicDevice_failed', {
        err: formatVoiceClientError(e),
      });
    }
  }

  async function switchSpeakerDevice(deviceId: string) {
    const room = lkRoom.value;
    if (!room) return;
    if (isDesktop() && DESKTOP_NATIVE_AUDIO_ENABLED) {
      const normalized =
        !deviceId?.trim() || deviceId === 'default' ? null : deviceId;
      try {
        await setDesktopAudioOutputDevice(normalized);
      } catch (e) {
        voiceClientDiag(
          'warn',
          'voice.client:desktop_switchSpeakerDevice_failed',
          {
            err: formatVoiceClientError(e),
          },
        );
      }
    }
    if (!echoSyncCapabilities.browser.supportsAudioOutputSelection) return;
    try {
      await room.switchActiveDevice('audiooutput', deviceId);
    } catch (e) {
      voiceClientDiag('error', 'voice.client:switchSpeakerDevice_failed', {
        err: e instanceof Error ? e.message : String(e),
      });
    }
  }

  function setOutputVolume(volumePercent: number) {
    const room = lkRoom.value;
    if (!room) return;
    lastOutputVolumePercent.value = Math.max(0, Math.min(600, volumePercent));
    if (isDesktop() && DESKTOP_NATIVE_AUDIO_ENABLED) {
      void setDesktopAudioOutputVolume(
        lastOutputVolumePercent.value / 100,
      ).catch((e) => {
        voiceClientDiag('warn', 'voice.client:desktop_setOutputVolume_failed', {
          err: formatVoiceClientError(e),
        });
      });
    }
    applyRemoteOutputGainToRoom(room);
  }

  function setLocalInputVolume(volumePercent: number) {
    const room = lkRoom.value;
    if (!room) return;
    lastInputVolumePercent.value = Math.max(0, Math.min(600, volumePercent));
    applyLocalMicGain(room);
  }

  function publishYoutubeActivity(payload: EchoYoutubeActivityV1) {
    const room = lkRoom.value;
    if (!room || room.state !== ConnectionState.Connected) return;
    void room.localParticipant.publishData(encodeEchoYoutubeActivity(payload), {
      reliable: true,
    });
  }

  function publishVcActivityPresence(payload: EchoVcActivityPresenceV1) {
    const room = lkRoom.value;
    if (!room || room.state !== ConnectionState.Connected) return;
    void room.localParticipant.publishData(
      encodeEchoVcActivityPresence(payload),
      {
        reliable: true,
      },
    );
  }

  function publishHangmanActivity(payload: EchoHangmanActivityV1) {
    const room = lkRoom.value;
    if (!room || room.state !== ConnectionState.Connected) return;
    void room.localParticipant.publishData(encodeEchoHangmanActivity(payload), {
      reliable: true,
    });
  }

  function publishHangmanGuessIntent(payload: EchoHangmanGuessIntentV1) {
    const room = lkRoom.value;
    if (!room || room.state !== ConnectionState.Connected) return;
    void room.localParticipant.publishData(
      encodeEchoHangmanGuessIntent(payload),
      { reliable: true },
    );
  }

  function publishHangmanNextRound(payload: EchoHangmanNextRoundV1) {
    const room = lkRoom.value;
    if (!room || room.state !== ConnectionState.Connected) return;
    void room.localParticipant.publishData(
      encodeEchoHangmanNextRound(payload),
      { reliable: true },
    );
  }

  function publishHangmanRoundSecret(
    payload: EchoHangmanRoundSecretV1,
    destinationIdentities: string[],
  ) {
    const room = lkRoom.value;
    if (!room || room.state !== ConnectionState.Connected) return;
    const dest = destinationIdentities.map((x) => x.trim()).filter(Boolean);
    if (!dest.length) return;
    void room.localParticipant.publishData(encodeEchoHangmanRoundSecret(payload), {
      reliable: true,
      destinationIdentities: dest,
    });
  }

  const api: LiveKitVoiceRoomApi = {
    roomState,
    lkRoom,
    networkStats,
    connect,
    disconnect,
    applyVcAudioState,
    isCameraEnabled,
    isScreenShareEnabled,
    selectedCameraDeviceId,
    videoQuality,
    remoteParticipants,
    speakingMap,
    localSpeaking,
    localAudioLevel,
    setCameraEnabled,
    setScreenShareEnabled,
    startScreenShare,
    stopScreenShare,
    getLocalScreenTrack,
    getLocalCameraTrack,
    switchCamera,
    setVideoQuality,
    desktopStreamingPreferences,
    setDesktopStreamingPreferences,
    startDesktopScreenShare,
    startDesktopCameraStream,
    switchMicDevice,
    switchSpeakerDevice,
    setOutputVolume,
    setLocalInputVolume,
    getRemoteParticipantVolume,
    setRemoteParticipantVolume,
    reapplyVoiceProcessing,
    publishYoutubeActivity,
    publishVcActivityPresence,
    publishHangmanActivity,
    publishHangmanGuessIntent,
    publishHangmanNextRound,
    publishHangmanRoundSecret,
  };
  return api;
}
