/**
 * Narrow access to livekit-client / WebRTC surfaces that are not fully reflected
 * in published TypeScript types (sender stats, remote audio volume).
 */

type LiveKitTrackLike = {
  sid?: string;
  setVolume?: (g: number) => void;
  getSenderStats?: () => Promise<SenderStatsLike | null | undefined>;
  getRTCStatsReport?: () => Promise<RTCStatsReport | null | undefined>;
};

import {
  echoPlaybackEnsureTrackElementsWired,
  echoPlaybackGetTrackMediaElements,
  echoPlaybackHasWiredElement,
  echoPlaybackSetLinearGainOnElement,
} from './echoRemotePlaybackWebAudio';
import { vcDebugLog } from '@/utils/vcDebugLog';

export type SenderStatsLike = {
  bytesSent?: number;
  timestamp?: number;
  roundTripTime?: number;
  jitter?: number;
  packetsLost?: number;
  packetsSent?: number;
};

export async function getSenderStatsIfSupported(
  track: object,
): Promise<SenderStatsLike | null> {
  const t = track as LiveKitTrackLike;
  if (typeof t.getSenderStats !== 'function') return null;
  const stats = await t.getSenderStats();
  return stats ?? null;
}

export async function getRtcStatsReportIfSupported(
  track: object,
): Promise<RTCStatsReport | null> {
  const t = track as LiveKitTrackLike;
  if (typeof t.getRTCStatsReport !== 'function') return null;
  const report = await t.getRTCStatsReport();
  return report ?? null;
}

/**
 * Some browsers concatenate the outbound `codecId` with `sdpFmtpLine` pieces;
 * strip that so we can look up the real `codec` stats row by `id`.
 */
export function normalizeWebrtcCodecIdRef(raw: string): string {
  const s = raw.trim();
  if (!s) return s;
  const joinedFmtp = s.search(/_minptime=|_usedtx=|_useinbandfec=/i);
  if (joinedFmtp > 0) return s.slice(0, joinedFmtp);
  const semi = s.indexOf(';minptime=');
  if (semi > 0) return s.slice(0, semi);
  return s;
}

function shortAudioCodecFromMime(mime: string): string {
  const lower = mime.trim().toLowerCase();
  if (lower.includes('opus')) return 'Opus';
  if (lower.includes('audio/red') || lower === 'red') return 'RED';
  if (lower.includes('telephone-event')) return 'DTMF';
  if (lower.includes('pcmu')) return 'PCMU';
  if (lower.includes('pcma')) return 'PCMA';
  if (lower.includes('g722')) return 'G.722';
  const m = /^audio\/([^;\s]+)/i.exec(mime);
  return m ? m[1] : mime.trim();
}

/** Map outbound-rtp `codecId` → short label (e.g. Opus), never raw SDP fmtp. */
export function resolveVoiceCodecDisplayLabel(
  report: RTCStatsReport,
  codecIdRef: string,
  fallback = 'Opus',
): string {
  const id = normalizeWebrtcCodecIdRef(codecIdRef);
  if (!id) return fallback;
  let mime: string | undefined;
  report.forEach((s) => {
    const stat = s as unknown as Record<string, unknown>;
    if (String(stat.type ?? '') !== 'codec') return;
    if (stat.id !== id) return;
    const m = stat.mimeType;
    if (typeof m === 'string' && m.trim()) mime = m;
  });
  if (mime) return shortAudioCodecFromMime(mime);
  return fallback;
}

export function parseRtcStatsReport(
  report: RTCStatsReport,
  prevBytesSent: number,
  prevTimestamp: number,
): {
  latencyMs: number;
  jitterMs: number;
  packetLossPct: number;
  bitrateKbps: number;
  codec: string;
} {
  let latencyMs = 0;
  let jitterMs = 0;
  let packetLossPct = 0;
  let bitrateKbps = 0;
  /** Outbound audio `codecId` from stats — resolved to a short label at return. */
  let audioOutboundCodecId: string | undefined;

  let bytesSent = 0;
  let ts = 0;
  let packetsLost = 0;

  report.forEach((s) => {
    const stat = s as unknown as Record<string, unknown>;
    const t = String(stat.type ?? '');
    if (t === 'candidate-pair' && stat.state === 'succeeded') {
      const crt = stat.currentRoundTripTime;
      if (typeof crt === 'number' && crt > 0) {
        latencyMs = crt * 1000;
      }
    }
    if (t === 'outbound-rtp') {
      const k = stat.kind;
      if (k === 'audio' || stat.mediaType === 'audio') {
        if (typeof stat.bytesSent === 'number') bytesSent = stat.bytesSent;
        if (typeof stat.timestamp === 'number') ts = stat.timestamp;
        const codecId = stat.codecId;
        if (typeof codecId === 'string' && codecId.trim()) {
          audioOutboundCodecId = codecId.trim();
        }
      }
    }
    if (t === 'remote-inbound-rtp') {
      const k = stat.kind;
      if (k === 'audio' || stat.mediaType === 'audio') {
        if (typeof stat.jitter === 'number') jitterMs = stat.jitter * 1000;
        if (typeof stat.roundTripTime === 'number' && stat.roundTripTime > 0) {
          latencyMs = stat.roundTripTime * 1000;
        }
        if (typeof stat.packetsLost === 'number')
          packetsLost = stat.packetsLost;
        const recv = stat.packetsReceived;
        if (typeof recv === 'number' && recv + packetsLost > 0) {
          packetLossPct = (packetsLost / (recv + packetsLost)) * 100;
        }
      }
    }
  });

  if (prevTimestamp > 0 && ts > prevTimestamp && bytesSent >= prevBytesSent) {
    const dtSec = (ts - prevTimestamp) / 1000;
    if (dtSec > 0) {
      bitrateKbps = ((bytesSent - prevBytesSent) * 8) / dtSec / 1000;
    }
  }

  return {
    latencyMs,
    jitterMs,
    packetLossPct,
    bitrateKbps: Math.max(0, bitrateKbps),
    codec: audioOutboundCodecId
      ? resolveVoiceCodecDisplayLabel(report, audioOutboundCodecId)
      : 'Opus',
  };
}

/** Sender-side video stats from outbound-rtp (screen share / camera). */
export function parseOutboundVideoRtpStats(report: RTCStatsReport): {
  videoFramesPerSecond?: number;
  videoNackCount?: number;
  videoFirCount?: number;
  videoPliCount?: number;
  videoQualityLimitationReason?: string;
} {
  let videoFramesPerSecond: number | undefined;
  let videoNackCount: number | undefined;
  let videoFirCount: number | undefined;
  let videoPliCount: number | undefined;
  let videoQualityLimitationReason: string | undefined;

  report.forEach((s) => {
    const stat = s as unknown as Record<string, unknown>;
    if (String(stat.type ?? '') !== 'outbound-rtp') return;
    const k = stat.kind;
    if (k !== 'video' && stat.mediaType !== 'video') return;

    if (typeof stat.framesPerSecond === 'number') {
      videoFramesPerSecond = stat.framesPerSecond;
    }
    if (typeof stat.nackCount === 'number') {
      videoNackCount = stat.nackCount;
    }
    if (typeof stat.firCount === 'number') {
      videoFirCount = stat.firCount;
    }
    if (typeof stat.pliCount === 'number') {
      videoPliCount = stat.pliCount;
    }
    if (typeof stat.qualityLimitationReason === 'string') {
      videoQualityLimitationReason = stat.qualityLimitationReason;
    }
  });

  const out: {
    videoFramesPerSecond?: number;
    videoNackCount?: number;
    videoFirCount?: number;
    videoPliCount?: number;
    videoQualityLimitationReason?: string;
  } = {};
  if (videoFramesPerSecond != null)
    out.videoFramesPerSecond = videoFramesPerSecond;
  if (videoNackCount != null) out.videoNackCount = videoNackCount;
  if (videoFirCount != null) out.videoFirCount = videoFirCount;
  if (videoPliCount != null) out.videoPliCount = videoPliCount;
  if (videoQualityLimitationReason != null) {
    out.videoQualityLimitationReason = videoQualityLimitationReason;
  }
  return out;
}

/**
 * LiveKit maps `Track.setVolume` to `HTMLMediaElement.volume`, which is only [0, 1].
 * Remote playback registered via {@link echoPlaybackRegisterTrackElement} uses a GainNode so
 * values above 1 apply without `IndexSizeError`. Paths without that wiring still clamp here.
 */
export const ECHO_LIVEKIT_AUDIO_ELEMENT_VOLUME_MAX = 1;

/** Applies LiveKit playback volume when `setVolume` exists (local or remote audio). */
export function setAudioTrackVolumeIfSupported(
  track: object,
  gain: number,
): void {
  /*
   * Always attempt Web Audio wiring before applying gain. Boost-only wiring meant
   * sub-unity volume often stayed on LiveKit's HTMLMediaElement path while playback
   * was actually routed through a GainNode after attach, so the slider had no effect.
   */
  echoPlaybackEnsureTrackElementsWired(track);

  const elements = echoPlaybackGetTrackMediaElements(track);
  const finiteGain = Number.isFinite(gain) ? gain : 1;
  /** HTMLMediaElement.volume is always [0, 1]; GainNode handles boosts above unity. */
  const elementVolume = Math.max(
    0,
    Math.min(ECHO_LIVEKIT_AUDIO_ELEMENT_VOLUME_MAX, finiteGain),
  );

  const t = track as LiveKitTrackLike;
  const trackSid = t.sid ?? 'unknown';

  vcDebugLog('[Echo:VC:Volume] setAudioTrackVolumeIfSupported called', {
    trackSid,
    gain,
    finiteGain,
    elementVolume,
    elementCount: elements.length,
    hasSetVolume: typeof t.setVolume === 'function',
  });

  let usedWebAudio = false;
  for (const el of elements) {
    const isWired = echoPlaybackHasWiredElement(el);
    vcDebugLog('[Echo:VC:Volume] processing element', {
      trackSid,
      isWired,
      elementId: el.id || 'no-id',
      currentVolume: el.volume,
      paused: el.paused,
    });
    if (isWired) {
      echoPlaybackSetLinearGainOnElement(el, finiteGain);
      usedWebAudio = true;
    } else {
      /*
       * Some builds route playback to attached elements without completing Web Audio
       * registration; LiveKit's Track.setVolume then does not affect what you hear.
       * Drive element.volume directly so per-user sliders always change audible level.
       */
      el.volume = elementVolume;
    }
  }

  if (elements.length === 0) {
    vcDebugLog('[Echo:VC:Volume] NO ELEMENTS found for track', {
      trackSid,
      trackAttachedElements: Array.isArray(
        (track as { attachedElements?: unknown[] }).attachedElements,
      )
        ? (track as { attachedElements?: unknown[] }).attachedElements?.length
        : 'not-array',
    });
  }

  if (usedWebAudio) {
    if (typeof t.setVolume === 'function') {
      t.setVolume(ECHO_LIVEKIT_AUDIO_ELEMENT_VOLUME_MAX);
    }
    return;
  }

  if (typeof t.setVolume === 'function') {
    t.setVolume(elementVolume);
  }
}

/** @deprecated Use {@link setAudioTrackVolumeIfSupported} */
export const setRemoteAudioTrackVolumeIfSupported =
  setAudioTrackVolumeIfSupported;
